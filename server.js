require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

app.post('/api/get-theme', async (req, res) => {
  const { theme } = req.body;

  const prompt = `You are helping build a custom Sudoku game where each of the 9 numbers is replaced by a distinctive image.

Theme: "${theme}"

Generate exactly 9 specific Unsplash search terms — one per symbol in the puzzle. Each term should:
- Be a real, concrete, searchable thing (not abstract)
- Be visually distinct from the other 8 (easy to tell apart at a glance)
- Relate clearly to the theme
- Be 1–4 words, specific enough to find a good photo

Return ONLY a JSON array of 9 strings. No markdown, no explanation, no code fences.
Example for "ocean life": ["clownfish","blue whale","octopus","seahorse","manta ray","jellyfish","sea turtle","coral reef","great white shark"]`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5-20250929', // Updated to a valid model
        max_tokens: 1000,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      const err = await response.json();
      return res.status(response.status).json(err);
    }

    const data = await response.json();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const PORT = 3000;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));