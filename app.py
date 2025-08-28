import os
import json
import sqlite3
import google.generativeai as genai
from huggingface_hub import InferenceClient
from flask import Flask, request, Response, render_template, stream_with_context
from dotenv import load_dotenv

load_dotenv()
app = Flask(__name__)

# --- बदलाव यहाँ है ---
# Render पर डेटा सेव करने के लिए एक सुरक्षित डायरेक्टरी का उपयोग करें
DATA_DIR = '/var/data'
if not os.path.exists(DATA_DIR):
    os.makedirs(DATA_DIR)
DATABASE = os.path.join(DATA_DIR, 'database.db')
# --- बदलाव समाप्त ---

def get_db():
    db = sqlite3.connect(DATABASE)
    db.row_factory = sqlite3.Row
    return db

def init_db():
    with app.app_context():
        db = get_db()
        cursor = db.cursor()
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                prompt TEXT NOT NULL,
                gemini TEXT NOT NULL,
                huggingface TEXT NOT NULL
            )
        ''')
        db.commit()
        cursor.close()
        db.close()

try:
    genai.configure(api_key=os.getenv("GOOGLE_API_KEY"))
    hf_token = os.getenv("HUGGINGFACE_API_TOKEN")
    hf_client = InferenceClient(token=hf_token)
except Exception as e:
    print(f"API Key कॉन्फ़िगरेशन में त्रुटि: {e}")

def get_huggingface_response(prompt, model_name):
    try:
        messages = [{"role": "user", "content": prompt}]
        response_obj = hf_client.chat_completion(messages, model=model_name, max_tokens=250)
        if response_obj.choices and len(response_obj.choices) > 0:
            return response_obj.choices[0].message.content
        return "Hugging Face से जवाब आया, लेकिन वह खाली था।"
    except Exception as e:
        print(f"Hugging Face Error: {e}")
        return "Hugging Face से जवाब प्राप्त करने में त्रुटि हुई।"

@app.route('/')
def index():
    db = get_db()
    cursor = db.cursor()
    cursor.execute('SELECT * FROM history ORDER BY id ASC')
    history = cursor.fetchall()
    cursor.close()
    db.close()
    return render_template('index.html', history=history)

@app.route('/stream')
def stream():
    prompt = request.args.get('prompt', '')
    hf_model = request.args.get('hf_model', 'HuggingFaceH4/zephyr-7b-beta')
    
    if not prompt:
        return Response("Prompt is required", status=400)

    def generate():
        gemini_full_response = ""
        hf_full_response = ""
        try:
            hf_res = get_huggingface_response(prompt, hf_model)
            hf_full_response = hf_res
            hf_data = json.dumps({"huggingface": hf_res})
            yield f"data: {hf_data}\n\n"

            model = genai.GenerativeModel('gemini-1.5-flash-latest')
            stream = model.generate_content(prompt, stream=True)
            for chunk in stream:
                if chunk.text:
                    gemini_full_response += chunk.text
                    chunk_data = json.dumps({"gemini_chunk": chunk.text})
                    yield f"data: {chunk_data}\n\n"
            
            db = get_db()
            cursor = db.cursor()
            cursor.execute(
                'INSERT INTO history (prompt, gemini, huggingface) VALUES (?, ?, ?)',
                (prompt, gemini_full_response, hf_full_response)
            )
            db.commit()
            cursor.close()
            db.close()

            end_data = json.dumps({"event": "end"})
            yield f"data: {end_data}\n\n"

        except Exception as e:
            print(f"Streaming Error: {e}")
            error_data = json.dumps({"error": str(e)})
            yield f"data: {error_data}\n\n"

    return Response(stream_with_context(generate()), mimetype='text/event-stream')

init_db()

if __name__ == '__main__':
    app.run(debug=True)