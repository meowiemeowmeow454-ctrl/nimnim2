app.post('/api/v1/chat/completions', async (req, res) => {
  try {
    const { messages, temperature, max_tokens } = req.body;

    const response = await axios.post(
      `${NIM_API_BASE}/chat/completions`,
      {
        model: NIM_MODEL,
        messages: messages,
        temperature: temperature || 0.7,
        max_tokens: max_tokens ?? 8192,
        stream: true, // stream from NVIDIA to keep connection alive
        extra_body: {
          chat_template_kwargs: { thinking: true }
        }
      },
      {
        headers: {
          'Authorization': `Bearer ${NIM_API_KEY}`,
          'Content-Type': 'application/json'
        },
        responseType: 'stream',
        timeout: 280000 // ~4.5 min, safely under Vercel's 5 min cap
      }
    );

    // Collect all streamed chunks
    let fullContent = '';
    let finishReason = 'stop';
    let promptTokens = 0;
    let completionTokens = 0;

    await new Promise((resolve, reject) => {
      response.data.on('data', (chunk) => {
        const lines = chunk.toString().split('\n').filter(l => l.trim());
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6);
          if (data === '[DONE]') return;
          try {
            const parsed = JSON.parse(data);
            const delta = parsed.choices?.[0]?.delta?.content;
            if (delta) fullContent += delta;
            if (parsed.choices?.[0]?.finish_reason) {
              finishReason = parsed.choices[0].finish_reason;
            }
            if (parsed.usage) {
              promptTokens = parsed.usage.prompt_tokens || 0;
              completionTokens = parsed.usage.completion_tokens || 0;
            }
          } catch {}
        }
      });
      response.data.on('end', resolve);
      response.data.on('error', reject);
    });

    // Send back as normal non-streamed response (what Janitor expects)
    res.json({
      id: `chatcmpl-${Date.now()}`,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: NIM_MODEL,
      choices: [{
        index: 0,
        message: { role: 'assistant', content: fullContent },
        finish_reason: finishReason
      }],
      usage: {
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        total_tokens: promptTokens + completionTokens
      }
    });

  } catch (error) {
    // ... your existing error handling stays the same
  }
});
