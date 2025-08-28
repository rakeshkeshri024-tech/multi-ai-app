document.addEventListener('DOMContentLoaded', () => {
    const modelSelect = document.getElementById('hf-model-select');
    const promptInput = document.getElementById('prompt-input');
    const submitBtn = document.getElementById('submit-btn');
    const historyContainer = document.getElementById('history-container');
    const responseGrid = document.getElementById('response-grid');
    const geminiOutput = document.getElementById('gemini-output');
    const hfOutput = document.getElementById('hf-output');
    const copyBtns = document.querySelectorAll('.copy-btn');
    const clearBtn = document.getElementById('clear-btn');
    
    let conversationHistory = []; // इतिहास अब ब्राउज़र में स्टोर होगा
    let eventSource = null; // EventSource ऑब्जेक्ट के लिए

    clearBtn.addEventListener('click', () => {
        location.reload();
    });

    submitBtn.addEventListener('click', () => {
        const prompt = promptInput.value;
        const selectedModel = modelSelect.value;
        if (!prompt) {
            alert('कृपया कोई सवाल लिखें।');
            return;
        }

        // UI को अपडेट करें और लोडिंग स्टेट दिखाएं
        submitBtn.setAttribute('aria-busy', 'true');
        submitBtn.disabled = true;
        geminiOutput.innerHTML = '';
        hfOutput.innerHTML = '';
        responseGrid.style.display = 'grid';

        // पुरानी बातचीत के साथ नया प्रॉम्प्ट जोड़ें
        const currentTurn = { prompt: prompt, gemini: '', huggingface: '' };
        conversationHistory.push(currentTurn);
        updateHistory(conversationHistory);

        // सर्वर से कनेक्शन शुरू करें
        const url = `/stream?prompt=${encodeURIComponent(prompt)}&hf_model=${encodeURIComponent(selectedModel)}`;
        eventSource = new EventSource(url);

        eventSource.onmessage = function(event) {
            const data = JSON.parse(event.data);

            if (data.gemini_chunk) {
                // Gemini के हर टुकड़े को जोड़ते जाएं
                currentTurn.gemini += data.gemini_chunk;
                geminiOutput.innerHTML = marked.parse(currentTurn.gemini);
            }
            
            if (data.huggingface) {
                // Hugging Face का पूरा जवाब एक बार में दिखाएं
                currentTurn.huggingface = data.huggingface;
                hfOutput.innerHTML = marked.parse(currentTurn.huggingface);
            }
            
            if (data.event && data.event === 'end') {
                // जब स्ट्रीम खत्म हो जाए, तो कनेक्शन बंद कर दें
                eventSource.close();
                submitBtn.setAttribute('aria-busy', 'false');
                submitBtn.disabled = false;
                // इतिहास को अंतिम जवाब के साथ अपडेट करें
                updateHistory(conversationHistory);
            }

            if (data.error) {
                geminiOutput.innerHTML = `<p>Error: ${data.error}</p>`;
                eventSource.close();
                submitBtn.setAttribute('aria-busy', 'false');
                submitBtn.disabled = false;
            }
        };

        eventSource.onerror = function(err) {
            console.error("EventSource failed:", err);
            eventSource.close();
            submitBtn.setAttribute('aria-busy', 'false');
            submitBtn.disabled = false;
        };

        promptInput.value = '';
    });

    function updateHistory(history) {
        historyContainer.innerHTML = ''; 
        history.forEach(item => {
            if (!item.prompt) return; // खाली आइटम को न दिखाएं
            
            const historyItem = document.createElement('div');
            historyItem.className = 'history-item';

            const userPrompt = document.createElement('div');
            userPrompt.className = 'prompt';
            userPrompt.innerText = `You: ${item.prompt}`;

            const aiResponse = document.createElement('div');
            aiResponse.className = 'response';
            aiResponse.innerHTML = `
                <strong>AI (Gemini):</strong> ${marked.parse(item.gemini)}
                <hr style="border-color: #374151; margin: 1rem 0;">
                <strong>AI (Selected Model):</strong> ${marked.parse(item.huggingface)}
            `;

            historyItem.appendChild(userPrompt);
            historyItem.appendChild(aiResponse);
            historyContainer.appendChild(historyItem);
        });
        historyContainer.scrollTop = historyContainer.scrollHeight;
    }
    
    copyBtns.forEach(btn => { /* ... कॉपी वाला कोड वैसा ही रहेगा ... */ });
});