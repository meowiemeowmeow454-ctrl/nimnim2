const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
app.use(cors());
app.use(express.json());

const NIM_API_KEY = process.env.NIM_API_KEY;
const NIM_MODEL = process.env.NIM_MODEL || 'deepseek-ai/deepseek-v4-pro';
const NIM_API_BASE = 'https://integrate.api.nvidia.com/v1';

app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    service: 'NVIDIA NIM Proxy - DeepSeek V4 Edition',
    model: NIM_MODEL,
    api_base: NIM_API_BASE
  });
});

app.get('/api/v1/models', (req, res) => {
  res.json({
    object: 'list',
    data: [{
      id: 'deepseek-v4-pro',
      object: 'model',
      created: Date.now(),
      owned_by: 'deepseek-ai'
    }]
  });
});

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
        stream: true,
      },
      {
        headers: {
          'Authorization': `Bearer ${NIM_API_KEY}`,
          'Content-Type': 'application/json'
        },
        responseType: 'stream',
        timeout: 300000
      }
    );

    let fullContent = '';
    let finishReason = 'stop';
    let promptTokens = 0;
    let completionTokens = 0;

    await new Promise((resolve, reject) => {
      response.data.on('data', (chunk) => {
        console.log('RAW CHUNK:', chunk.toString());
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
    console.error('NVIDIA API error:', error.response?.data || error.message);

    if (error.response?.status === 429) {
      return res.status(429).json({
        error: {
          message: 'Rate limit exceeded. Please wait.',
          type: 'rate_limit_error',
          code: 429
        }
      });
    }

    if (error.response?.status === 401 || error.response?.status === 403) {
      return res.status(error.response.status).json({
        error: {
          message: 'Invalid API key or unauthorized.',
          type: 'auth_error',
          code: error.response.status
        }
      });
    }

    res.status(error.response?.status || 500).json({
      error: {
        message: error.response?.data?.error?.message || error.message || 'NVIDIA API error',
        type: 'api_error',
        code: error.response?.status || 500
      }
    });
  }
});

module.exports = app;
