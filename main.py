import ollama
import json
from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
import logging
from gtts import gTTS
import tempfile
import os
import uuid
import time
import whisper
from queue import Queue
import threading
import torch

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app)

TEMP_AUDIO_DIR = 'temp_audio'
if not os.path.exists(TEMP_AUDIO_DIR):
    os.makedirs(TEMP_AUDIO_DIR)

try:
    DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
    whisper_model = whisper.load_model("base").to(DEVICE)
    whisper_model.eval()
    logger.info(f"Whisper model loaded successfully on {DEVICE}")
except Exception as e:
    logger.error(f"Failed to load Whisper model: {e}")
    whisper_model = None

conversation_history = []
MAX_HISTORY = 10

ollama_client = ollama.Client(host='http://localhost:11434')

tts_cache = {}
MAX_CACHE_SIZE = 100

def text_to_speech(text, message_id):
    try:
        cache_key = hash(text)
        if cache_key in tts_cache:
            logger.info("Using cached TTS audio")
            cached_path = tts_cache[cache_key]
            if os.path.exists(cached_path):
                new_path = os.path.join(TEMP_AUDIO_DIR, f"{message_id}.mp3")
                os.symlink(cached_path, new_path)
                return new_path

        audio_path = os.path.join(TEMP_AUDIO_DIR, f"{message_id}.mp3")
        tts = gTTS(text=text, lang='en', tld='co.uk', slow=False)
        tts.save(audio_path)

        if len(tts_cache) >= MAX_CACHE_SIZE:
            oldest_key = next(iter(tts_cache))
            del tts_cache[oldest_key]
        tts_cache[cache_key] = audio_path

        return audio_path
    except Exception as e:
        logger.error(f"TTS Error: {e}")
        return None

@app.route('/health', methods=['GET'])
def health():
    return jsonify({"status": "healthy"})

@app.route('/chat', methods=['POST'])
def chat():
    try:
        data = request.json
        if not data:
            return jsonify({"error": "No data provided"}), 400
        
        prompt = data.get('message')
        if not prompt:
            return jsonify({"error": "No message provided"}), 400

        logger.info(f"Received message: {prompt}")
        
        response = ollama.chat(model="llama3.2", messages=[{
            "role": "user",
            "content": prompt
        }])
        
        response_text = response['message']['content']
        logger.info(f"Got response from Ollama: {response_text[:100]}...")

        return jsonify({
            "response": response_text,
            "has_audio": False,
            "message_id": None
        })
    
    except Exception as e:
        logger.error(f"Error in chat endpoint: {str(e)}", exc_info=True)
        return jsonify({"error": str(e)}), 500

@app.route('/audio/<message_id>', methods=['GET'])
def get_audio(message_id):
    try:
        audio_path = os.path.join(TEMP_AUDIO_DIR, f"{message_id}.mp3")
        logger.info(f"Requested audio file: {audio_path}")
        
        if os.path.exists(audio_path):
            logger.info(f"Serving audio file: {audio_path}")
            return send_file(audio_path, mimetype='audio/mp3')
        else:
            logger.error(f"Audio file not found: {audio_path}")
            return jsonify({"error": "Audio not found"}), 404
    except Exception as e:
        logger.error(f"Error serving audio: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500

@app.route('/voice-chat', methods=['POST'])
def voice_chat():
    try:
        if 'audio' not in request.files:
            logger.error("No audio file in request")
            return jsonify({"error": "No audio file provided"}), 400

        audio_file = request.files['audio']
        logger.info(f"Received audio file: {audio_file.filename}")
        
        temp_path = os.path.join(TEMP_AUDIO_DIR, f"input_{uuid.uuid4()}.webm")
        audio_file.save(temp_path)
        
        with torch.no_grad():
            logger.info("Transcribing audio with Whisper...")
            result = whisper_model.transcribe(
                temp_path,
                fp16=torch.cuda.is_available(),
                language='en',
                initial_prompt="This is a conversation with an AI assistant."
            )
            transcribed_text = result["text"].strip()
            logger.info(f"Transcribed text: {transcribed_text}")
        
        os.remove(temp_path)
        
        if len(transcribed_text) < 2:
            return jsonify({
                "transcribed": transcribed_text,
                "response": "I didn't catch that. Could you please speak again?",
                "has_audio": False,
                "message_id": None,
                "should_restart": True
            })

        recent_context = []
        if conversation_history:
            recent_history = conversation_history[-2:]
            for hist in recent_history:
                recent_context.extend([
                    {"role": "user", "content": hist["user"]},
                    {"role": "assistant", "content": hist["assistant"]}
                ])
        recent_context.append({"role": "user", "content": transcribed_text})
        
        response = ollama_client.chat(
            model="llama3.2",
            messages=recent_context,
            options={
                "temperature": 0.7,
                "top_p": 0.9,
                "num_predict": 100,
            }
        )
        
        response_text = response['message']['content']
        
        conversation_history.append({
            "user": transcribed_text,
            "assistant": response_text
        })
        if len(conversation_history) > MAX_HISTORY:
            conversation_history.pop(0)
        
        message_id = str(uuid.uuid4())
        audio_path = text_to_speech(response_text, message_id)
        
        return jsonify({
            "transcribed": transcribed_text,
            "response": response_text,
            "has_audio": audio_path is not None,
            "message_id": message_id,
            "should_restart": True
        })
        
    except Exception as e:
        logger.error(f"Error in voice chat endpoint: {str(e)}", exc_info=True)
        return jsonify({
            "error": str(e),
            "should_restart": True
        }), 500

def cleanup_old_files():
    while True:
        try:
            current_time = time.time()
            for file in os.listdir(TEMP_AUDIO_DIR):
                file_path = os.path.join(TEMP_AUDIO_DIR, file)
                if os.path.getmtime(file_path) < current_time - 3600:
                    os.remove(file_path)
            
            for key in list(tts_cache.keys()):
                path = tts_cache[key]
                if not os.path.exists(path) or os.path.getmtime(path) < current_time - 3600:
                    del tts_cache[key]
                    
            time.sleep(300)
        except Exception as e:
            logger.error(f"Cleanup error: {e}")

if __name__ == '__main__':
    cleanup_thread = threading.Thread(target=cleanup_old_files, daemon=True)
    cleanup_thread.start()
    
    logger.info("Starting Flask server...")
    app.run(port=5000, debug=True, threaded=True)