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

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app)

TEMP_AUDIO_DIR = 'temp_audio'
if not os.path.exists(TEMP_AUDIO_DIR):
    os.makedirs(TEMP_AUDIO_DIR)

try:
    whisper_model = whisper.load_model("base")
    logger.info("Whisper model loaded successfully")
except Exception as e:
    logger.error(f"Failed to load Whisper model: {e}")
    whisper_model = None

def text_to_speech(text, message_id):
    try:
        audio_path = os.path.join(TEMP_AUDIO_DIR, f"{message_id}.mp3")
        tts = gTTS(text=text, lang='en')
        tts.save(audio_path)
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
        logger.info(f"Saved audio file to {temp_path}")
        
        logger.info("Transcribing audio with Whisper...")
        result = whisper_model.transcribe(temp_path)
        transcribed_text = result["text"]
        logger.info(f"Transcribed text: {transcribed_text}")
        
        os.remove(temp_path)
        
        response = ollama.chat(model="llama3.2", messages=[{
            "role": "user",
            "content": transcribed_text
        }])
        
        response_text = response['message']['content']
        
        message_id = str(uuid.uuid4())
        audio_path = text_to_speech(response_text, message_id)
        
        return jsonify({
            "transcribed": transcribed_text,
            "response": response_text,
            "has_audio": audio_path is not None,
            "message_id": message_id
        })
        
    except Exception as e:
        logger.error(f"Error in voice chat endpoint: {str(e)}", exc_info=True)
        return jsonify({"error": str(e)}), 500

def cleanup_old_files():
    try:
        for file in os.listdir(TEMP_AUDIO_DIR):
            file_path = os.path.join(TEMP_AUDIO_DIR, file)
            if os.path.getmtime(file_path) < time.time() - 3600:
                os.remove(file_path)
    except Exception as e:
        logger.error(f"Cleanup error: {e}")

if __name__ == '__main__':
    logger.info("Starting Flask server...")
    app.run(port=5000, debug=True)