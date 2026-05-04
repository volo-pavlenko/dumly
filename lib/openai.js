(function () {
  window.Dumly = window.Dumly || {};

  async function chat(messages, settings) {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + settings.apiKey,
      },
      body: JSON.stringify({
        model: settings.model,
        messages,
        max_completion_tokens: 512,
      }),
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      const msg = err.error?.message || 'API error: ' + response.status;
      throw new Error(msg);
    }
    const data = await response.json();
    return data.choices[0].message.content.trim();
  }

  window.Dumly.openai = { chat };
})();
