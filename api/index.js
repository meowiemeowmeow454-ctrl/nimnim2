const express = require('express');
const cors = require('cors');
const axios = require('axios');
const app = express();
app.use(cors());
app.use(express.json());

const NIM_API_KEY = process.env.NIM_API_KEY;
const NIM_MODEL = process.env.NIM_MODEL || 'deepseek-ai/deepseek-v4-pro'; // 🔥 DEEPSEEK V4!
const NIM_API_BASE = 'https://integrate.api.nvidia.com/v1';

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    service: 'NVIDIA NIM Proxy - DeepSeek V4 Edition',
    model: NIM_MODEL,
    api_base: NIM_API_BASE
  });
});

// List models
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

// Chat completions
app.post('/api/v1/chat/completions', async (req, res) => {
  try {
    const { messages, temperature, max_tokens, stream } = req.body;
    
    const response = await axios.post(
      `${NIM_API_BASE}/chat/completions`,
      {
        model: NIM_MODEL,
        messages: messages,
        temperature: temperature || 0.7,
        max_tokens: max_tokens !== undefined && max_tokens !== null ? max_tokens : 8192,
        stream: stream || false,
        extra_body: {
          chat_template_kwargs: {
            thinking: true  // 🔥 THINKING MODE ENABLED!
          }
        }
      },
      {
        headers: {
          'Authorization': `Bearer ${NIM_API_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: 600000  // 10 minutes
      }
    );
    
    res.json(response.data);
    
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
   
