require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// ── POST /api/get-theme ──────────────────────────────────────────────────────
// Calls Anthropic to get 9 image search terms for a given theme.
app.post('/api/get-theme', async (req, res) => {
  const { theme } = req.body;
  if (!theme || theme.trim().length < 2) {
    return res.status(400).json({ error: 'Theme is required' });
  }

  const prompt = `You are helping build a custom Sudoku game where each of the 9 numbers is replaced by a distinctive image.

Theme: "${theme}"

Generate exactly 9 specific image search terms — one per symbol in the puzzle. Each term should:
- Be a real, concrete, recognizable subject (not abstract)
- Be visually distinct from the other 8 (easy to tell apart at a glance as small thumbnails)
- Relate clearly to the theme
- Be 2–5 words, descriptive enough to generate a clear illustration

Return ONLY a JSON array of 9 strings. No markdown, no explanation, no code fences.
Example for "ocean life": ["clownfish underwater","blue whale ocean","octopus tentacles","seahorse coral","manta ray swimming","jellyfish glowing","sea turtle reef","coral reef colorful","great white shark"]`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001', // fast + cheap for this task
        max_tokens: 300,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      const err = await response.json();
      console.error('Anthropic error:', err);
      return res.status(response.status).json({ error: err.error?.message || 'Anthropic API error' });
    }

    const data = await response.json();
    res.json(data); // pass raw Anthropic response to frontend
  } catch (error) {
    console.error('Server error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ── GET /api/image/:prompt ───────────────────────────────────────────────────
// Proxies to Pollinations AI image generation (free, no key needed).
// ── GET /api/image/:prompt ───────────────────────────────────────────────────
// ── GET /api/image/:prompt ───────────────────────────────────────────────────
// ── GET /api/image/:prompt ───────────────────────────────────────────────────
app.get('/api/image/:prompt', async (req, res) => {
  const prompt = req.params.prompt;
  const seed = parseInt(req.query.seed) || 0;

  // The CORRECT API URL from the documentation
  const imageUrl = `https://gen.pollinations.ai/image/${encodeURIComponent(prompt)}?width=200&height=200&nologo=true&seed=${seed}&model=flux`;

  const MAX_ATTEMPTS = 2; 
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 60000); 
    
    try {
      const response = await fetch(imageUrl, {
  headers: { 
    'Authorization': `Bearer ${process.env.POLLINATIONS_API_KEY}`,
    'User-Agent': 'ThemeSudoku/1.0' 
  },
  signal: controller.signal,
});
      
      clearTimeout(timer);

      if (!response.ok) {
        if (attempt < MAX_ATTEMPTS) { await sleep(2000); continue; }
        return res.status(502).send('Image generation failed');
      }

      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      res.set('Content-Type', 'image/jpeg');
      res.set('Cache-Control', 'public, max-age=3600');
      return res.send(buffer);
      
    } catch (error) {
      clearTimeout(timer);
      console.error(`Image attempt ${attempt} failed:`, error.message);
      if (attempt === MAX_ATTEMPTS) return res.status(500).send('Image error');
      await sleep(2000);
    }
  }
});

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n🎮 Theme Sudoku server running at http://localhost:${PORT}`);
  console.log(`\n--- 🕵️ DIAGNOSTICS ---`);
  console.log(`Anthropic Key:    ${process.env.ANTHROPIC_API_KEY ? "✅ LOADED" : "❌ MISSING"}`);
  console.log(`Pollinations Key: ${process.env.POLLINATIONS_API_KEY ? "✅ LOADED" : "❌ MISSING"}`);
  console.log(`----------------------\n`);
});