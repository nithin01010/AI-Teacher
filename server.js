require('dotenv').config();
const express = require('express');
const fetch = require('node-fetch');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(bodyParser.json());
app.use(cors());

// Serve static files from the React app build directory
app.use(express.static(path.join(__dirname, 'frontend/build')));

const PORT = 3000;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!GEMINI_API_KEY) {
  console.warn('GEMINI_API_KEY not set in env!');
}

// Streaming endpoint for real-time generation
app.post('/api/gemini', async (req, res) => {
  const userPrompt = req.body.prompt || '';

  // SYSTEM instructions to GEMINI: ask it to return ONLY valid JSON array of commands
  const systemPrompt = `You are an assistant that must output ONLY a JSON array of drawing commands for a 1200x800 whiteboard.

Each command must be one of:
1) {"type":"text","text":"...","x":number,"y":number,"fontSize":number}
2) {"type":"equation","latex":"...","x":number,"y":number,"fontSize":number}
3) {"type":"line","points":[x1,y1,x2,y2,...],"strokeWidth":number}
4) {"type":"rect","x":number,"y":number,"width":number,"height":number}
5) {"type":"group","x":num,"y":num,"children":[...] }

Return coordinates and sizes appropriate for a 1200x800 canvas. Start text at x=20 for left alignment. Do not include any explanation or prose outside the JSON array.`;

  // Build the prompt we send to Gemini - combine system + user
  const fullPrompt = systemPrompt + "\n\nUser prompt:\n" + userPrompt;

  try {
    // Using Google's Gemini API streaming endpoint
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:streamGenerateContent?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: fullPrompt
          }]
        }],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 8000,
        }
      }),
    });

    if (!response.ok) {
      const txt = await response.text();
      console.error('Gemini API error', response.status, txt);
      return res.status(500).json({ error: 'Upstream API error', details: txt });
    }

    // Set up streaming headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');

    let buffer = '';
    let commandBuffer = '';
    
    response.body.on('data', (chunk) => {
      const chunkStr = chunk.toString();
      buffer += chunkStr;
      
      // Process complete lines
      const lines = buffer.split('\n');
      buffer = lines.pop(); // Keep incomplete line in buffer
      
      for (const line of lines) {
        if (line.trim()) {
          try {
            // Parse SSE format
            if (line.startsWith('data: ')) {
              const data = line.substring(6);
              if (data === '[DONE]') {
                res.end();
                return;
              }
              
              const parsed = JSON.parse(data);
              if (parsed.candidates && parsed.candidates[0] && parsed.candidates[0].content) {
                const text = parsed.candidates[0].content.parts[0].text;
                commandBuffer += text;
                
                // Try to extract complete JSON commands
                const commands = extractCommands(commandBuffer);
                if (commands.length > 0) {
                  commands.forEach(command => {
                    res.write(`data: ${JSON.stringify(command)}\n\n`);
                  });
                  commandBuffer = '';
                }
              }
            }
          } catch (e) {
            console.warn('Failed to parse streaming chunk:', line);
          }
        }
      }
    });

    response.body.on('end', () => {
      res.end();
    });

    response.body.on('error', (err) => {
      console.error('Streaming error:', err);
      res.status(500).json({ error: 'Streaming error', details: err.message });
    });

  } catch (err) {
    console.error('Server error', err);
    return res.status(500).json({ error: 'server error', details: err.message });
  }
});

// Helper function to extract commands from streaming text
function extractCommands(text) {
  const commands = [];
  
  // Try to find complete JSON objects
  const jsonMatches = text.match(/\{[^{}]*\}/g);
  if (jsonMatches) {
    jsonMatches.forEach(match => {
      try {
        const command = JSON.parse(match);
        if (command.type) {
          commands.push(command);
        }
      } catch (e) {
        // Ignore invalid JSON
      }
    });
  }
  
  return commands;
}

// Original non-streaming endpoint (fallback)
app.post('/api/generate', async (req, res) => {
  const userPrompt = req.body.prompt || '';

  // SYSTEM instructions to GEMINI: ask it to return ONLY valid JSON array of commands
  const systemPrompt = `You are an assistant that must output ONLY a JSON array of drawing commands for a whiteboard.

Each command must be one of:
1) {"type":"text","text":"...","x":number,"y":number,"fontSize":number}
2) {"type":"equation","latex":"...","x":number,"y":number,"fontSize":number}
3) {"type":"line","points":[x1,y1,x2,y2,...],"strokeWidth":number}
4) {"type":"rect","x":number,"y":number,"width":number,"height":number}
5) {"type":"group","x":num,"y":num,"children":[...] }

IMPORTANT: Use coordinates that work well on a typical screen:
- For text: start around x=100, y=100 for good margins
- Center text horizontally by using x=500-600 for main content
- Use y coordinates with proper spacing: y=100, y=150, y=200, y=250, etc. (50px spacing between lines)
- Use fontSize between 20-28 for readability
- For multiple text lines, space them 50-60 pixels apart vertically
- Do not include any explanation or prose outside the JSON array.`;

  // Build the prompt we send to Gemini - combine system + user
  const fullPrompt = systemPrompt + "\n\nUser prompt:\n" + userPrompt;

  try {
    // Using Google's Gemini API endpoint
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: fullPrompt
          }]
        }],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 8000,
        }
      }),
    });

    if (!response.ok) {
      const txt = await response.text();
      console.error('Gemini API error', response.status, txt);
      return res.status(500).json({ error: 'Upstream API error', details: txt });
    }

    const body = await response.json();

    // Extract text from Gemini response
    let rawText = null;
    if (body.candidates && body.candidates[0] && body.candidates[0].content && body.candidates[0].content.parts) {
      rawText = body.candidates[0].content.parts[0].text;
    } else {
      rawText = JSON.stringify(body);
    }

    // if rawText is object, convert to string
    if (typeof rawText !== 'string') rawText = JSON.stringify(rawText);

    // sanitize: some models wrap json in ``` or ``json`` blocks. Strip code fences.
    rawText = rawText.trim();
    rawText = rawText.replace(/^```json\s*/i, '');
    rawText = rawText.replace(/^```\s*/i, '');
    rawText = rawText.replace(/```\s*$/i, '');

    // parse
    let commands = null;
    try {
      commands = JSON.parse(rawText);
    } catch (e) {
      // fallback: try to extract the first JSON array inside the text
      const match = rawText.match(/\[.*\]/s);
      if (match) {
        try {
          commands = JSON.parse(match[0]);
        } catch (e2) {
          console.error('Failed to parse inner JSON', e2);
        }
      }
    }

    if (!commands) {
      // last resort: return the raw text so frontend can show it as plain text
      return res.json(rawText);
    }

    return res.json({ commands });
  } catch (err) {
    console.error('Server error', err);
    return res.status(500).json({ error: 'server error', details: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Backend server listening on ${PORT}`);
  console.log(`API available at http://localhost:${PORT}/api/generate`);
});
