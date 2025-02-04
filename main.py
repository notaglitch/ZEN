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

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app)

TEMP_AUDIO_DIR = 'temp_audio'
if not os.path.exists(TEMP_AUDIO_DIR):
    os.makedirs(TEMP_AUDIO_DIR)

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
        logger.info(f"Got response from Ollama")

        message_id = str(uuid.uuid4())
        audio_path = text_to_speech(response_text, message_id)
        
        return jsonify({
            "response": response_text,
            "has_audio": audio_path is not None,
            "message_id": message_id
        })
    
    except Exception as e:
        logger.error(f"Error in chat endpoint: {str(e)}", exc_info=True)
        return jsonify({"error": str(e)}), 500

@app.route('/audio/<message_id>', methods=['GET'])
def get_audio(message_id):
    try:
        audio_path = os.path.join(TEMP_AUDIO_DIR, f"{message_id}.mp3")
        if os.path.exists(audio_path):
            return send_file(audio_path, mimetype='audio/mp3')
        else:
            return jsonify({"error": "Audio not found"}), 404
    except Exception as e:
        logger.error(f"Error serving audio: {e}")
        return jsonify({"error": "Audio not found"}), 404

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