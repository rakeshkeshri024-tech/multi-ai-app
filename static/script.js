document.addEventListener('DOMContentLoaded', () => {
    const promptInput = document.getElementById('prompt-input');
    const submitBtn = document.getElementById('submit-btn');
    const historyContainer = document.getElementById('history-container');
    const responseGrid = document.getElementById('response-grid');
    const geminiOutput = document.getElementById('gemini-output');
    const perplexityOutput = document.getElementById('perplexity-output'); // hfOutput को बदला गया
    const copyBtns = document.querySelectorAll('.copy-btn');
    const clearBtn = document.getElementById('clear-btn');
    
    let currentTurn = null; 

    clearBtn.addEventListener('click', () => {
        location.reload();
    });

    submitBtn.addEventListener('click', () => {
        const prompt = promptInput.value;
        if (!prompt) {
            alert('कृपया कोई सवाल लिखें।');
            return;
        }

        submitBtn.setAttribute('aria-busy', 'true');
        submitBtn.disabled = true;
        geminiOutput.innerHTML = '';
        perplexityOutput.innerHTML = '';
        responseGrid.style.display = 'grid';

        // एक नया बातचीत का दौर शुरू करें
        currentTurn = { prompt: prompt, gemini: '', perplexity: '' };
        
        // यूज़र के प्रॉम्प्ट को तुरंत इतिहास में दिखाएं
        appendHistoryItem(currentTurn);

        const url = `/stream?prompt=${encodeURIComponent(prompt)}`;
        const eventSource = new EventSource(url);

        eventSource.onmessage = function(event) {
            const data = JSON.parse(event.data);

            if (data.gemini_chunk) {
                currentTurn.gemini += data.gemini_chunk;
                geminiOutput.innerHTML = marked.parse(currentTurn.gemini);
                updateLatestHistoryItem();
            }
            
            if (data.perplexity) {
                currentTurn.perplexity = data.perplexity;
                perplexityOutput.innerHTML = marked.parse(currentTurn.perplexity);
                updateLatestHistoryItem();
            }
            
            if (data.event && data.event === 'end') {
                eventSource.close();
                submitBtn.setAttribute('aria-busy', 'false');
                submitBtn.disabled = false;
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
    
    function appendHistoryItem(item) {
        const historyItem = document.createElement('div');
        historyItem.className = 'history-item';
        historyItem.id = 'latest-history-item';

        const userPrompt = document.createElement('div');
        userPrompt.className = 'prompt';
        userPrompt.innerText = `You: ${item.prompt}`;

        const aiResponse = document.createElement('div');
        aiResponse.className = 'response';
        aiResponse.innerHTML = `
            <strong>AI (Gemini):</strong> ${marked.parse(item.gemini)}
            <hr style="border-color: #374151; margin: 1rem 0;">
            <strong>AI (Perplexity):</strong> ${marked.parse(item.perplexity)}
        `;

        historyItem.appendChild(userPrompt);
        historyItem.appendChild(aiResponse);
        historyContainer.appendChild(historyItem);
        historyContainer.scrollTop = historyContainer.scrollHeight;
    }

    function updateLatestHistoryItem() {
        const latestItem = document.getElementById('latest-history-item');
        if (latestItem) {
            const aiResponse = latestItem.querySelector('.response');
            aiResponse.innerHTML = `
                <strong>AI (Gemini):</strong> ${marked.parse(currentTurn.gemini)}
                <hr style="border-color: #374151; margin: 1rem 0;">
                <strong>AI (Perplexity):</strong> ${marked.parse(currentTurn.perplexity)}
            `;
        }
        historyContainer.scrollTop = historyContainer.scrollHeight;
    }

    copyBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetId = btn.dataset.target;
            const targetElement = document.getElementById(targetId);
            const textToCopy = targetElement.innerText;
            
            navigator.clipboard.writeText(textToCopy).then(() => {
                const originalText = btn.textContent;
                btn.textContent = 'कॉपी हो गया!';
                setTimeout(() => {
                    btn.textContent = originalText;
                }, 2000);
            }).catch(err => {
                console.error('Copy failed:', err);
                alert('कॉपी करने में विफल!');
            });
        });
    });
});