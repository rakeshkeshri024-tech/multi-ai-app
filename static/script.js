document.addEventListener('DOMContentLoaded', () => {
    const promptInput = document.getElementById('prompt-input');
    const submitBtn = document.getElementById('submit-btn');
    const geminiOutput = document.getElementById('gemini-output');
    const copyBtn = document.querySelector('.copy-btn');
    
    let currentResponse = "";

    submitBtn.addEventListener('click', () => {
        const prompt = promptInput.value;
        if (!prompt) {
            alert('कृपया कोई सवाल लिखें।');
            return;
        }

        submitBtn.setAttribute('aria-busy', 'true');
        submitBtn.disabled = true;
        geminiOutput.innerHTML = '';
        currentResponse = "";

        const url = `/stream?prompt=${encodeURIComponent(prompt)}`;
        const eventSource = new EventSource(url);

        eventSource.onmessage = function(event) {
            const data = JSON.parse(event.data);
            if (data.gemini_chunk) {
                currentResponse += data.gemini_chunk;
                geminiOutput.innerHTML = marked.parse(currentResponse);
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

    copyBtn.addEventListener('click', () => {
        const textToCopy = geminiOutput.innerText;
        navigator.clipboard.writeText(textToCopy).then(() => {
            const originalText = copyBtn.textContent;
            copyBtn.textContent = 'कॉपी हो गया!';
            setTimeout(() => {
                copyBtn.textContent = originalText;
            }, 2000);
        });
    });
});