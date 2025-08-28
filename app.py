import os
import json
import requests
from flask import Flask, request, Response, render_template, stream_with_context
from flask_sqlalchemy import SQLAlchemy
import google.generativeai as genai
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
    perplexity = db.Column(db.String, nullable=False)

try:
    genai.configure(api_key=os.getenv("GOOGLE_API_KEY"))
    pplx_api_key = os.getenv("PERPLEXITY_API_KEY")
except Exception as e:
    print(f"API Key कॉन्फ़िगरेशन में त्रुटि: {e}")

# --- बदलाव सिर्फ इस फंक्शन में है ---
def get_perplexity_response(prompt):
    url = "https://api.perplexity.ai/chat/completions"
    payload = {
        "model": "llama-3-sonar-small-32k-online",
        "messages": [{"role": "user", "content": prompt}],
        "stream": False  # यह नई लाइन जोड़ी गई है
    }
    headers = {
        "accept": "application/json",
        "content-type": "application/json",
        "authorization": f"Bearer {pplx_api_key}"
    }
    try:
        response = requests.post(url, json=payload, headers=headers)
        response.raise_for_status()
        data = response.json()
        return data['choices'][0]['message']['content']
    except Exception as e:
        print(f"Perplexity Error: {e}")
        return f"Perplexity Error: {e}"

@app.route('/')
def index():
    history = History.query.order_by(History.id).all()
    return render_template('index.html', history=history)

@app.route('/stream')
def stream():
    prompt = request.args.get('prompt', '')
    if not prompt:
        return Response("Prompt is required", status=400)

    def generate():
        gemini_full_response = ""
        perplexity_full_response = ""
        try:
            pplx_res = get_perplexity_response(prompt)
            perplexity_full_response = pplx_res
            pplx_data = json.dumps({"perplexity": pplx_res})
            yield f"data: {pplx_data}\n\n"

            model = genai.GenerativeModel('gemini-1.5-flash-latest')
            stream = model.generate_content(prompt, stream=True)
            for chunk in stream:
                if chunk.text:
                    gemini_full_response += chunk.text
                    chunk_data = json.dumps({"gemini_chunk": chunk.text})
                    yield f"data: {chunk_data}\n\n"
            
            new_entry = History(prompt=prompt, gemini=gemini_full_response, perplexity=perplexity_full_response)
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