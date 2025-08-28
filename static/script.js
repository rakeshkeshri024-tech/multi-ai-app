document.addEventListener('DOMContentLoaded', () => {
    // --- 1. Element Selection ---
    const promptInput = document.getElementById('prompt-input');
    const submitBtn = document.getElementById('submit-btn');
    const historyContainer = document.getElementById('history-container');
    const themeToggle = document.getElementById('theme-toggle');
    const examplePrompts = document.querySelectorAll('.example-prompt');
    const micBtn = document.getElementById('mic-btn');

    // --- 2. State Management ---
    let conversationHistory = [];

    // --- 3. Event Listeners & Logic ---

    // Theme Switcher Logic
    if (themeToggle) {
        const savedTheme = localStorage.getItem('theme') || 'dark';
        document.documentElement.setAttribute('data-theme', savedTheme);
        if (savedTheme === 'light') { themeToggle.checked = true; }
        themeToggle.addEventListener('change', (e) => {
            const theme = e.target.checked ? 'light' : 'dark';
            document.documentElement.setAttribute('data-theme', theme);
            localStorage.setItem('theme', theme);
        });
    }

    // Example Prompts Logic
    examplePrompts.forEach(button => {
        button.addEventListener('click', (e) => {
            promptInput.value = e.target.innerText;
            submitBtn.click();
        });
    });
    
    // Submit Prompt Button Logic
    if (submitBtn) {
        submitBtn.addEventListener('click', () => {
            const prompt = promptInput.value;
            if (!prompt) {
                alert('कृपया कोई सवाल लिखें।');
                return;
            }
            conversationHistory.push({ role: 'user', content: prompt });
            conversationHistory.push({ role: 'ai', content: '' });
            renderHistory();
            submitBtn.setAttribute('aria-busy', 'true');
            submitBtn.disabled = true;
            
            // Contextual conversation logic
            const historyForApi = conversationHistory.slice(0, -1);
            streamResponse(historyForApi);
            promptInput.value = '';
        });
    }
    
    // Web Speech API (Voice Input) Logic
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    let recognition;
    if (SpeechRecognition && micBtn) {
        recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.lang = 'hi-IN';
        recognition.interimResults = false;

        micBtn.addEventListener('click', () => {
            if (micBtn.classList.contains('is-listening')) {
                recognition.stop();
            } else {
                try { recognition.start(); } catch(e) { alert("आवाज़ पहचानना पहले से ही सक्रिय है।"); }
            }
        });
        recognition.onstart = () => { micBtn.classList.add('is-listening'); promptInput.placeholder = 'अब बोलें...'; };
        recognition.onresult = (event) => { promptInput.value = event.results[0][0].transcript; };
        recognition.onerror = (event) => { console.error('Speech recognition error:', event.error); alert('आवाज़ पहचानने में त्रुटि हुई: ' + event.error); };
        recognition.onend = () => { micBtn.classList.remove('is-listening'); promptInput.placeholder = 'जैसे: भारत के बारे में 3 रोचक तथ्य बताएं।'; };
    } else if (micBtn) {
        micBtn.style.display = 'none';
    }

    // Text-to-Speech (Voice Output) Logic
    historyContainer.addEventListener('click', (e) => {
        const speakerBtn = e.target.closest('.speaker-btn');
        if (speakerBtn) {
            const textToSpeak = speakerBtn.closest('.history-item.ai').querySelector('.ai-content').innerText;
            speakText(textToSpeak);
        }
    });

    // --- 4. Helper Functions ---

    function speakText(text) {
        if ('speechSynthesis' in window) {
            window.speechSynthesis.cancel();
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.lang = 'hi-IN';
            window.speechSynthesis.speak(utterance);
        } else {
            alert('आपका ब्राउज़र Text-to-Speech को सपोर्ट नहीं करता।');
        }
    }

    async function streamResponse(history) {
        const latestMessageIndex = conversationHistory.length - 1;
        try {
            const response = await fetch('/stream', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ history: history }),
            });

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            while (true) {
                const { value, done } = await reader.read();
                if (done) break;
                const chunk = decoder.decode(value, { stream: true });
                const lines = chunk.split('\n\n');
                lines.forEach(line => {
                    if (line.startsWith('data:')) {
                        const jsonStr = line.substring(5);
                        if (jsonStr.trim()) {
                            try {
                                const data = JSON.parse(jsonStr);
                                if (data.gemini_chunk) {
                                    conversationHistory[latestMessageIndex].content += data.gemini_chunk;
                                    renderHistory();
                                }
                                if (data.event && data.event === 'end') { return; }
                            } catch (e) { console.error("Error parsing JSON:", jsonStr); }
                        }
                    }
                });
            }
        } catch (error) {
            console.error("Streaming failed:", error);
            conversationHistory[latestMessageIndex].content = "Connection error.";
            renderHistory();
        } finally {
            submitBtn.setAttribute('aria-busy', 'false');
            submitBtn.disabled = false;
        }
    }

    function renderHistory() {
        historyContainer.innerHTML = ''; 
        conversationHistory.forEach((item, index) => {
            const historyItem = document.createElement('div');
            historyItem.className = `history-item ${item.role}`;
            if (item.role === 'user') {
                historyItem.innerHTML = `<strong>You</strong><p>${item.content}</p>`;
            } else {
                let aiContent;
                if (index === conversationHistory.length - 1 && item.content === '') {
                    aiContent = `<div class="typing-indicator"><span></span><span></span><span></span></div>`;
                } else {
                    aiContent = `<div class="ai-content">${marked.parse(item.content)}</div>`;
                }
                historyItem.innerHTML = `
                    <div class="ai-message-header">
                        <strong>Gemini AI</strong>
                        <button class="icon-btn speaker-btn">🔊</button>
                    </div>
                    ${aiContent}
                `;
            }
            historyContainer.appendChild(historyItem);
        });
        window.scrollTo(0, document.body.scrollHeight);
    }
});