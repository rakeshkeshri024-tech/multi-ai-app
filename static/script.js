document.addEventListener('DOMContentLoaded', () => {
    // --- 1. Element Selection ---
    const promptInput = document.getElementById('prompt-input');
    const submitBtn = document.getElementById('submit-btn');
    const historyContainer = document.getElementById('history-container');
    const themeToggle = document.getElementById('theme-toggle');
    const examplePrompts = document.querySelectorAll('.example-prompt');

    // --- 2. State Management ---
    let conversationHistory = [];

    // --- 3. Event Listeners ---
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
    examplePrompts.forEach(button => {
        button.addEventListener('click', (e) => {
            promptInput.value = e.target.innerText;
            submitBtn.click();
        });
    });
    
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
            
            // अब हम सिर्फ यूज़र के प्रॉम्प्ट तक की हिस्ट्री भेज रहे हैं
            const historyForApi = conversationHistory.slice(0, -1);
            streamResponse(historyForApi);
            promptInput.value = '';
        });
    }
    
    // --- 4. Helper Functions ---
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
                    aiContent = `<div>${marked.parse(item.content)}</div>`;
                }
                historyItem.innerHTML = `<strong>Gemini AI</strong>${aiContent}`;
            }
            historyContainer.appendChild(historyItem);
        });
        window.scrollTo(0, document.body.scrollHeight);
    }
});