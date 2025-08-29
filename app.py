import os
import json
from flask import Flask, request, Response, render_template, stream_with_context, redirect, url_for, flash
from flask_sqlalchemy import SQLAlchemy
from werkzeug.security import generate_password_hash, check_password_hash
from flask_login import LoginManager, UserMixin, login_user, logout_user, login_required, current_user
import google.generativeai as genai
from dotenv import load_dotenv

load_dotenv()
app = Flask(__name__)
app.config['SECRET_KEY'] = os.getenv('SECRET_KEY', 'a-very-secret-key-that-is-hard-to-guess')
app.config['SQLALCHEMY_DATABASE_URI'] = os.getenv('DATABASE_URL', 'sqlite:///local_database.db')
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
db = SQLAlchemy(app)

login_manager = LoginManager()
login_manager.init_app(app)
login_manager.login_view = 'login'

class User(UserMixin, db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(150), unique=True, nullable=False)
    password_hash = db.Column(db.String(256), nullable=False)
    histories = db.relationship('History', backref='author', lazy=True)
    def set_password(self, password): self.password_hash = generate_password_hash(password)
    def check_password(self, password): return check_password_hash(self.password_hash, password)

class History(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    prompt = db.Column(db.String, nullable=False)
    gemini = db.Column(db.String, nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)

@login_manager.user_loader
def load_user(user_id):
    return User.query.get(int(user_id))

try:
    genai.configure(api_key=os.getenv("GOOGLE_API_KEY"))
except Exception as e:
    print(f"API Key कॉन्फ़िगरेशन में त्रुटि: {e}")

@app.route('/')
@login_required
def index():
    history = History.query.filter_by(author=current_user).order_by(History.id).all()
    return render_template('index.html', history=history)

@app.route('/register', methods=['GET', 'POST'])
def register():
    # ... (इस फंक्शन में कोई बदलाव नहीं) ...
    if current_user.is_authenticated: return redirect(url_for('index'))
    if request.method == 'POST':
        username = request.form.get('username')
        password = request.form.get('password')
        user = User.query.filter_by(username=username).first()
        if user:
            flash('Username already exists.', 'error')
            return redirect(url_for('register'))
        new_user = User(username=username)
        new_user.set_password(password)
        db.session.add(new_user)
        db.session.commit()
        flash('Account created successfully! Please log in.', 'success')
        return redirect(url_for('login'))
    return render_template('register.html')

@app.route('/login', methods=['GET', 'POST'])
def login():
    # ... (इस फंक्शन में कोई बदलाव नहीं) ...
    if current_user.is_authenticated: return redirect(url_for('index'))
    if request.method == 'POST':
        username = request.form.get('username')
        password = request.form.get('password')
        user = User.query.filter_by(username=username).first()
        if user and user.check_password(password):
            login_user(user)
            return redirect(url_for('index'))
        else:
            flash('Invalid username or password.', 'error')
            return redirect(url_for('login'))
    return render_template('login.html')

@app.route('/logout')
@login_required
def logout():
    # ... (इस फंक्शन में कोई बदलाव नहीं) ...
    logout_user()
    return redirect(url_for('login'))

# --- नया: Stream रूट जो अब current_user का उपयोग करता है ---
@app.route('/stream', methods=['POST'])
@login_required
def stream():
    data = request.json
    history_from_js = data.get('history', [])
    
    if not history_from_js:
        return Response("History is required", status=400)

    def generate():
        gemini_full_response = ""
        try:
            model = genai.GenerativeModel('gemini-1.5-flash-latest')
            
            gemini_history = []
            for message in history_from_js:
                role = 'model' if message['role'] == 'ai' else 'user'
                gemini_history.append({'role': role, 'parts': [{'text': message['content']}]})
            
            last_prompt_text = history_from_js[-1]['content']
            chat = model.start_chat(history=gemini_history[:-1])
            stream = chat.send_message(gemini_history[-1]['parts'], stream=True)
            
            for chunk in stream:
                if chunk.text:
                    gemini_full_response += chunk.text
                    chunk_data = json.dumps({"gemini_chunk": chunk.text})
                    yield f"data: {chunk_data}\n\n"
            
            # नई बातचीत को डेटाबेस में सही यूज़र के साथ सेव करें
            new_entry = History(prompt=last_prompt_text, gemini=gemini_full_response, author=current_user)
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