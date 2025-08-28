import os
import json
from flask import Flask, request, Response, render_template, stream_with_context
import google.generativeai as genai
from dotenv import load_dotenv

load_dotenv()
app = Flask(__name__)

# API Key कॉन्फ़िगर करें
try:
    genai.configure(api_key=os.getenv("GOOGLE_API_KEY"))
except Exception as e:
    print(f"API Key कॉन्फ़िगरेशन में त्रुटि: {e}")

@app.route('/')
def index():
    return render_template('index.html')

# --- मुख्य बदलाव यहाँ है ---
@app.route('/stream', methods=['POST']) # अब यह सिर्फ POST रिक्वेस्ट लेता है
def stream():
    data = request.json
    history = data.get('history', [])
    
    if not history:
        return Response("History is required", status=400)

    def generate():
        try:
            model = genai.GenerativeModel('gemini-1.5-flash-latest')
            
            # Gemini API के लिए बातचीत का प्रारूप तैयार करें
            gemini_history = []
            for message in history:
                # Gemini API 'ai' role को 'model' कहता है
                role = 'model' if message['role'] == 'ai' else 'user'
                gemini_history.append({'role': role, 'parts': [{'text': message['content']}]})
            
            # Gemini को पूरी हिस्ट्री के साथ शुरू करें
            chat = model.start_chat(history=gemini_history)
            
            # आखिरी प्रॉम्प्ट को भेजें
            last_prompt = history[-1]['content']
            stream = chat.send_message(last_prompt, stream=True)
            
            for chunk in stream:
                if chunk.text:
                    chunk_data = json.dumps({"gemini_chunk": chunk.text})
                    yield f"data: {chunk_data}\n\n"
            
            end_data = json.dumps({"event": "end"})
            yield f"data: {end_data}\n\n"
        except Exception as e:
            print(f"Streaming Error: {e}")
            error_data = json.dumps({"error": str(e)})
            yield f"data: {error_data}\n\n"
    
    return Response(stream_with_context(generate()), mimetype='text/event-stream')

if __name__ == '__main__':
    app.run(debug=True)