import ollama
import json
from flask import Flask, request, jsonify
from flask_cors import CORS
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app)

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
        
        response = ollama.chat(model="llama2:3.2", messages=[{
            "role": "user",
            "content": prompt
        }])
        
        logger.info(f"Got response from Ollama")
        return jsonify({"response": response['message']['content']})
    
    except Exception as e:
        logger.error(f"Error in chat endpoint: {str(e)}", exc_info=True)
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    logger.info("Starting Flask server...")
    app.run(port=5000, debug=True)