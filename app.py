import os
import json
from flask import Flask, request, Response, render_template, stream_with_context
from flask_sqlalchemy import SQLAlchemy
import google.generativeai as genai
from huggingface_hub import InferenceClient
from dotenv import load_dotenv

load_dotenv()
app = Flask(__name__)

app.config['SQLALCHEMY_DATABASE_URI'] = os.getenv('DATABASE_URL', 'sqlite:///local_database.db')
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
db = SQLAlchemy(app)

class History(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    prompt = db.Column(db.String, nullable=False)
    gemini = db.Column(db.String, nullable=False)
    huggingface = db.Column(db.String, nullable=False)

try:
    genai.configure(api_key=os.getenv("GOOGLE_API_KEY"))
    hf_token = os.getenv("HUGGINGFACE_API_TOKEN")
    hf_client = InferenceClient(token=hf_token)
except Exception as e:
    print(f"API Key कॉन्फ़िगरेशन में त्रुटि: {e}")

# --- Hugging Face फंक्शन को वापस पुराने और स्थिर तरीके पर बदला गया है ---
def get_huggingface_response(prompt, model_name):
    try:
        # text_generation का उपयोग करें
        response_text = hf_client.text_generation(prompt, model=model_name, max_new_tokens=250)
        return response_text
    except Exception as e:
        print(f"Hugging Face Error: {e}")
        # असली एरर दिखाएं ताकि डीबग करना आसान हो
        return f"Hugging Face Error: {e}"

@app.route('/')
def index():
    history = History.query.order_by(History.id).all()
    return render_template('index.html', history=history)

@app.route('/stream')
def stream():
    prompt = request.args.get('prompt', '')
    # --- डिफ़ॉल्ट मॉडल को बदला गया है ---
    hf_model = request.args.get('hf_model', 'google/flan-t5-xxl')
    
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
            
            new_entry = History(prompt=prompt, gemini=gemini_full_response, huggingface=hf_full_response)
            db.session.add(new_entry)
            db.session.commit()

            end_data = json.dumps({"event": "end"})
            yield f"data: {end_data}\n\n"
        except Exception as e:
            print(f"Streaming Error: {e}")
            error_data = json.dumps({"error": str(e)})
            yield f"data: {error_data}\n\n"

    return Response(stream_with_context(generate()), mimetype='text/event-stream')

with app.app_context():
    db.create_all()

if __name__ == '__main__':
    app.run(debug=True)