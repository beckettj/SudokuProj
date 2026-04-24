/**
 * THEME SUDOKU — sudoku.js
 *
 * Architecture:
 *  1. SudokuGenerator  — pure puzzle math
 *  2. AITheme          — Anthropic API call → 9 emojis for a theme
 *  3. Game             — state + board rendering + interactions
 *  4. UI               — screen transitions, timer, win condition
 */

// ─────────────────────────────────────────────
// 1. SUDOKU GENERATOR
// ─────────────────────────────────────────────
const SudokuGenerator = (() => {
  const DIFFICULTY = {
    easy:   { clues: 46 },
    medium: { clues: 36 },
    hard:   { clues: 28 },
    expert: { clues: 22 },
  };

  function emptyGrid() {
    return Array.from({ length: 9 }, () => Array(9).fill(0));
  }

  function isValid(grid, row, col, num) {
    for (let i = 0; i < 9; i++) {
      if (grid[row][i] === num) return false;
      if (grid[i][col] === num) return false;
    }
    const br = Math.floor(row / 3) * 3;
    const bc = Math.floor(col / 3) * 3;
    for (let r = br; r < br + 3; r++)
      for (let c = bc; c < bc + 3; c++)
        if (grid[r][c] === num) return false;
    return true;
  }

  function fillGrid(grid) {
    for (let row = 0; row < 9; row++) {
      for (let col = 0; col < 9; col++) {
        if (grid[row][col] === 0) {
          const nums = shuffle([1,2,3,4,5,6,7,8,9]);
          for (const num of nums) {
            if (isValid(grid, row, col, num)) {
              grid[row][col] = num;
              if (fillGrid(grid)) return true;
              grid[row][col] = 0;
            }
          }
          return false;
        }
      }
    }
    return true;
  }

  function countSolutions(grid, limit = 2) {
    let count = 0;
    function solve(g) {
      for (let row = 0; row < 9; row++) {
        for (let col = 0; col < 9; col++) {
          if (g[row][col] === 0) {
            for (let num = 1; num <= 9; num++) {
              if (isValid(g, row, col, num)) {
                g[row][col] = num;
                solve(g);
                if (count >= limit) return;
                g[row][col] = 0;
              }
            }
            return;
          }
        }
      }
      count++;
    }
    const copy = grid.map(r => [...r]);
    solve(copy);
    return count;
  }

  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function generate(difficulty = 'medium') {
    const solution = emptyGrid();
    fillGrid(solution);

    const puzzle = solution.map(r => [...r]);
    const target = DIFFICULTY[difficulty]?.clues ?? 36;
    const cells = shuffle([...Array(81).keys()]);
    let removed = 0;

    for (const idx of cells) {
      if (81 - removed <= target) break;
      const row = Math.floor(idx / 9);
      const col = idx % 9;
      const backup = puzzle[row][col];
      puzzle[row][col] = 0;
      // Ensure unique solution
      if (countSolutions(puzzle) !== 1) {
        puzzle[row][col] = backup;
      } else {
        removed++;
      }
    }

    return { puzzle, solution };
  }

  function solve(grid) {
    const g = grid.map(r => [...r]);
    function backtrack() {
      for (let row = 0; row < 9; row++) {
        for (let col = 0; col < 9; col++) {
          if (g[row][col] === 0) {
            for (let num = 1; num <= 9; num++) {
              if (isValid(g, row, col, num)) {
                g[row][col] = num;
                if (backtrack()) return true;
                g[row][col] = 0;
              }
            }
            return false;
          }
        }
      }
      return true;
    }
    backtrack();
    return g;
  }

  return { generate, solve };
})();

// ─────────────────────────────────────────────
// 2. AI THEME — Anthropic API
// ─────────────────────────────────────────────
const AITheme = (() => {
  // Fallback emoji sets if API call fails or theme is blank
  const FALLBACKS = {
    default:  ['🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐨'],
    space:    ['🪐','⭐','🌙','☄️','🚀','👽','🌌','🌠','🌟'],
    food:     ['🍕','🍣','🍜','🌮','🍔','🍩','🎂','🍦','🍓'],
    animals:  ['🦁','🐯','🦊','🐺','🐗','🦌','🦝','🦨','🦡'],
    ocean:    ['🐋','🦈','🐙','🦑','🐠','🦞','🦀','🐡','🐬'],
  };

  async function fetchEmojis(theme) {
    if (!theme || theme.trim().length < 2) {
      return FALLBACKS.default;
    }

    const prompt = `You are a creative emoji curator. The user wants to play Sudoku using a custom theme.

Theme: "${theme}"

Return EXACTLY 9 distinct emojis that represent this theme. Rules:
- Each emoji must be visually distinct (no near-duplicates)
- Prefer single-character emojis, not combos
- Make them fun and recognizable
- Do NOT include numbers or letters
- Output ONLY a JSON array of 9 emoji strings, nothing else, no markdown, no explanation.

Example output: ["🐶","🐱","🐭","🐹","🐰","🦊","🐻","🐼","🐨"]`;

    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1000,
          messages: [{ role: 'user', content: prompt }],
        }),
      });

      if (!response.ok) throw new Error('API error ' + response.status);

      const data = await response.json();
      const text = data.content.find(b => b.type === 'text')?.text ?? '';

      // Parse JSON from response (strip any accidental markdown fences)
      const clean = text.replace(/```[a-z]*\n?|```/g, '').trim();
      const emojis = JSON.parse(clean);

      if (Array.isArray(emojis) && emojis.length >= 9) {
        return emojis.slice(0, 9);
      }
      throw new Error('Bad emoji array');
    } catch (err) {
      console.warn('AI emoji fetch failed, using fallback:', err);
      // Pick a fallback based on keyword
      const t = theme.toLowerCase();
      if (t.includes('space') || t.includes('planet') || t.includes('star')) return FALLBACKS.space;
      if (t.includes('food') || t.includes('eat') || t.includes('sushi')) return FALLBACKS.food;
      if (t.includes('ocean') || t.includes('sea') || t.includes('fish')) return FALLBACKS.ocean;
      if (t.includes('animal') || t.includes('jungle') || t.includes('wild')) return FALLBACKS.animals;
      return FALLBACKS.default;
    }
  }

  return { fetchEmojis };
})();

// ─────────────────────────────────────────────
// 3. GAME STATE
// ─────────────────────────────────────────────
const Game = (() => {
  let state = {
    puzzle: null,       // 9x9 grid (0 = empty)
    solution: null,     // 9x9 grid (complete)
    userGrid: null,     // 9x9 grid (user progress)
    emojis: [],         // index 0-8 → emoji (represents numbers 1-9)
    selected: null,     // { row, col }
    selectedSymbol: null, // 1-9 (palette selection)
    errors: new Set(),  // "row,col" strings
    difficulty: 'medium',
    theme: '',
  };

  function init(puzzle, solution, emojis, difficulty, theme) {
    state.puzzle = puzzle;
    state.solution = solution;
    state.userGrid = puzzle.map(r => [...r]);
    state.emojis = emojis;
    state.selected = null;
    state.selectedSymbol = null;
    state.errors = new Set();
    state.difficulty = difficulty;
    state.theme = theme;
  }

  function selectCell(row, col) {
    state.selected = { row, col };
  }

  function selectSymbol(num) {
    state.selectedSymbol = (state.selectedSymbol === num) ? null : num;
  }

  function placeSymbol(num) {
    if (!state.selected) return false;
    const { row, col } = state.selected;
    if (state.puzzle[row][col] !== 0) return false; // given cell, immutable

    if (num === 0) {
      state.userGrid[row][col] = 0;
      state.errors.delete(`${row},${col}`);
    } else {
      state.userGrid[row][col] = num;
      // Validate immediately
      if (num !== state.solution[row][col]) {
        state.errors.add(`${row},${col}`);
      } else {
        state.errors.delete(`${row},${col}`);
      }
    }
    return true;
  }

  function getHint() {
    // Find a random empty or wrong cell and fill it
    const candidates = [];
    for (let r = 0; r < 9; r++)
      for (let c = 0; c < 9; c++)
        if (state.puzzle[r][c] === 0 && state.userGrid[r][c] !== state.solution[r][c])
          candidates.push({ r, c });

    if (candidates.length === 0) return null;
    const { r, c } = candidates[Math.floor(Math.random() * candidates.length)];
    state.userGrid[r][c] = state.solution[r][c];
    state.errors.delete(`${r},${c}`);
    return { row: r, col: c, value: state.solution[r][c] };
  }

  function revealAll() {
    state.userGrid = state.solution.map(r => [...r]);
    state.errors.clear();
  }

  function checkComplete() {
    for (let r = 0; r < 9; r++)
      for (let c = 0; c < 9; c++)
        if (state.userGrid[r][c] !== state.solution[r][c]) return false;
    return true;
  }

  function symbolCounts() {
    // How many times each number (1-9) appears in userGrid
    const counts = Array(10).fill(0);
    for (let r = 0; r < 9; r++)
      for (let c = 0; c < 9; c++)
        if (state.userGrid[r][c] > 0) counts[state.userGrid[r][c]]++;
    return counts;
  }

  function getState() { return state; }

  return { init, selectCell, selectSymbol, placeSymbol, getHint, revealAll, checkComplete, symbolCounts, getState };
})();

// ─────────────────────────────────────────────
// 4. UI & RENDERING
// ─────────────────────────────────────────────
const UI = (() => {
  // ── element refs ──
  const setupScreen  = document.getElementById('setup-screen');
  const loadingScreen = document.getElementById('loading-screen');
  const gameScreen   = document.getElementById('game-screen');
  const themeInput   = document.getElementById('theme-input');
  const startBtn     = document.getElementById('start-btn');
  const backBtn      = document.getElementById('back-btn');
  const hintBtn      = document.getElementById('hint-btn');
  const eraseBtn     = document.getElementById('erase-btn');
  const checkBtn     = document.getElementById('check-btn');
  const solveBtn     = document.getElementById('solve-btn');
  const playAgainBtn = document.getElementById('play-again-btn');
  const boardEl      = document.getElementById('board');
  const paletteEl    = document.getElementById('palette');
  const legendEl     = document.getElementById('legend');
  const timerEl      = document.getElementById('timer');
  const winBanner    = document.getElementById('win-banner');
  const winEmoji     = document.getElementById('win-emoji');
  const winTime      = document.getElementById('win-time');
  const spinnerGrid  = document.getElementById('spinner-grid');
  const loadingText  = document.getElementById('loading-text');
  const gameThemeLabel = document.getElementById('game-theme-label');
  const difficultyLabel = document.getElementById('difficulty-label');

  let currentDifficulty = 'medium';
  let timerInterval = null;
  let secondsElapsed = 0;

  // Build spinner cells
  for (let i = 0; i < 9; i++) {
    const cell = document.createElement('div');
    cell.className = 'sg-cell';
    spinnerGrid.appendChild(cell);
  }

  // ── Screen management ──
  function showScreen(el) {
    [setupScreen, loadingScreen, gameScreen].forEach(s => s.classList.remove('active'));
    el.classList.add('active');
  }

  // ── Difficulty pills ──
  document.querySelectorAll('.pill').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.pill').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      currentDifficulty = btn.dataset.diff;
    });
  });

  // ── Start button ──
  startBtn.addEventListener('click', async () => {
    const theme = themeInput.value.trim();
    showScreen(loadingScreen);
    updateLoadingText(theme);

    const [{ puzzle, solution }, emojis] = await Promise.all([
      Promise.resolve(SudokuGenerator.generate(currentDifficulty)),
      AITheme.fetchEmojis(theme),
    ]);

    Game.init(puzzle, solution, emojis, currentDifficulty, theme || 'Default');
    renderGame();
    showScreen(gameScreen);
    startTimer();
    winBanner.classList.add('hidden');
  });

  function updateLoadingText(theme) {
    const messages = theme
      ? [`Picking emojis for "${theme}"…`, 'Generating puzzle…', 'Almost ready…']
      : ['Generating puzzle…', 'Setting up board…', 'Almost ready…'];
    let i = 0;
    loadingText.textContent = messages[0];
    const iv = setInterval(() => {
      i = (i + 1) % messages.length;
      loadingText.textContent = messages[i];
    }, 900);
    // Clear after 6s max
    setTimeout(() => clearInterval(iv), 6000);
  }

  // ── Back button ──
  backBtn.addEventListener('click', () => {
    stopTimer();
    winBanner.classList.add('hidden');
    showScreen(setupScreen);
  });

  playAgainBtn.addEventListener('click', () => {
    winBanner.classList.add('hidden');
    showScreen(setupScreen);
    stopTimer();
  });

  // ── Render full game ──
  function renderGame() {
    const { puzzle, emojis, difficulty, theme } = Game.getState();
    gameThemeLabel.textContent = theme || 'Default';
    difficultyLabel.textContent = difficulty;
    renderLegend(emojis);
    renderBoard();
    renderPalette();
  }

  function renderLegend(emojis) {
    legendEl.innerHTML = '';
    emojis.forEach((emoji, i) => {
      const item = document.createElement('div');
      item.className = 'legend-item';
      item.innerHTML = `<span class="legend-symbol">${emoji}</span><span class="legend-num">${i + 1}</span>`;
      legendEl.appendChild(item);
    });
  }

  function renderBoard() {
    const { puzzle, userGrid, emojis, selected, errors } = Game.getState();
    boardEl.innerHTML = '';

    for (let row = 0; row < 9; row++) {
      for (let col = 0; col < 9; col++) {
        const cell = document.createElement('div');
        cell.className = 'cell';
        cell.dataset.row = row;
        cell.dataset.col = col;
        cell.setAttribute('role', 'gridcell');

        const value = userGrid[row][col];
        if (value > 0) {
          cell.textContent = emojis[value - 1];
          cell.setAttribute('aria-label', `${emojis[value - 1]}`);
        }

        if (puzzle[row][col] !== 0) cell.classList.add('given');
        if (errors.has(`${row},${col}`)) cell.classList.add('error');

        if (selected) {
          if (selected.row === row && selected.col === col) {
            cell.classList.add('selected');
          } else if (selected.row === row || selected.col === col ||
            (Math.floor(selected.row / 3) === Math.floor(row / 3) &&
             Math.floor(selected.col / 3) === Math.floor(col / 3))) {
            cell.classList.add('highlight');
          }
          // Same emoji highlight
          if (value > 0 && value === userGrid[selected.row][selected.col]) {
            cell.classList.add('highlight');
          }
        }

        cell.addEventListener('click', () => onCellClick(row, col));
        boardEl.appendChild(cell);
      }
    }
  }

  function renderPalette() {
    const { emojis, selectedSymbol } = Game.getState();
    const counts = Game.symbolCounts();
    paletteEl.innerHTML = '';

    emojis.forEach((emoji, i) => {
      const num = i + 1;
      const remaining = 9 - counts[num];
      const btn = document.createElement('button');
      btn.className = 'palette-btn' + (selectedSymbol === num ? ' selected-palette' : '');
      btn.setAttribute('aria-label', `Place ${emoji}`);
      btn.setAttribute('title', `${emoji} (${remaining} left)`);
      btn.innerHTML = `${emoji}<span class="p-count">${remaining}</span>`;
      if (remaining === 0) btn.style.opacity = '0.35';
      btn.addEventListener('click', () => onPaletteClick(num));
      paletteEl.appendChild(btn);
    });
  }

  // ── Cell interaction ──
  function onCellClick(row, col) {
    const { selectedSymbol, puzzle } = Game.getState();
    Game.selectCell(row, col);

    if (selectedSymbol !== null && puzzle[row][col] === 0) {
      Game.placeSymbol(selectedSymbol);
      if (Game.checkComplete()) onWin();
    }

    renderBoard();
    renderPalette();
  }

  // ── Palette interaction ──
  function onPaletteClick(num) {
    Game.selectSymbol(num);
    const { selected, puzzle } = Game.getState();

    if (selected && puzzle[selected.row][selected.col] === 0) {
      Game.placeSymbol(num);
      if (Game.checkComplete()) onWin();
    }

    renderBoard();
    renderPalette();
  }

  // ── Keyboard support ──
  document.addEventListener('keydown', (e) => {
    if (!gameScreen.classList.contains('active')) return;
    const { selected, puzzle, emojis } = Game.getState();

    // Arrow navigation
    if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key) && selected) {
      e.preventDefault();
      let { row, col } = selected;
      if (e.key === 'ArrowUp') row = Math.max(0, row - 1);
      if (e.key === 'ArrowDown') row = Math.min(8, row + 1);
      if (e.key === 'ArrowLeft') col = Math.max(0, col - 1);
      if (e.key === 'ArrowRight') col = Math.min(8, col + 1);
      Game.selectCell(row, col);
      renderBoard();
      return;
    }

    // Number keys 1-9
    if (e.key >= '1' && e.key <= '9') {
      const num = parseInt(e.key);
      if (num <= emojis.length) {
        Game.selectSymbol(num);
        if (selected && puzzle[selected.row][selected.col] === 0) {
          Game.placeSymbol(num);
          if (Game.checkComplete()) onWin();
        }
        renderBoard();
        renderPalette();
      }
      return;
    }

    // Backspace/Delete = erase
    if (e.key === 'Backspace' || e.key === 'Delete' || e.key === '0') {
      if (selected) {
        Game.placeSymbol(0);
        renderBoard();
        renderPalette();
      }
    }
  });

  // ── Control buttons ──
  eraseBtn.addEventListener('click', () => {
    const { selected, puzzle } = Game.getState();
    if (selected && puzzle[selected.row][selected.col] === 0) {
      Game.placeSymbol(0);
      renderBoard();
      renderPalette();
    }
  });

  checkBtn.addEventListener('click', () => {
    // Flash all errors red, correct cells teal
    const { userGrid, solution, puzzle } = Game.getState();
    const cells = boardEl.querySelectorAll('.cell');
    cells.forEach(cell => {
      const r = parseInt(cell.dataset.row);
      const c = parseInt(cell.dataset.col);
      if (puzzle[r][c] !== 0) return;
      if (userGrid[r][c] === 0) return;
      if (userGrid[r][c] === solution[r][c]) {
        cell.classList.add('correct-flash');
        cell.addEventListener('animationend', () => cell.classList.remove('correct-flash'), { once: true });
      }
    });
    renderBoard(); // redraws errors
  });

  hintBtn.addEventListener('click', () => {
    const hint = Game.getHint();
    if (!hint) return;
    // Select the hinted cell so user sees it
    Game.selectCell(hint.row, hint.col);
    if (Game.checkComplete()) onWin();
    renderBoard();
    renderPalette();
  });

  solveBtn.addEventListener('click', () => {
    if (!confirm('Reveal the full solution?')) return;
    Game.revealAll();
    renderBoard();
    renderPalette();
    stopTimer();
  });

  // ── Timer ──
  function startTimer() {
    stopTimer();
    secondsElapsed = 0;
    timerEl.textContent = '00:00';
    timerInterval = setInterval(() => {
      secondsElapsed++;
      const m = Math.floor(secondsElapsed / 60).toString().padStart(2, '0');
      const s = (secondsElapsed % 60).toString().padStart(2, '0');
      timerEl.textContent = `${m}:${s}`;
    }, 1000);
  }

  function stopTimer() {
    clearInterval(timerInterval);
    timerInterval = null;
  }

  // ── Win ──
  function onWin() {
    stopTimer();
    const { emojis } = Game.getState();
    const m = Math.floor(secondsElapsed / 60).toString().padStart(2, '0');
    const s = (secondsElapsed % 60).toString().padStart(2, '0');
    winEmoji.textContent = emojis[Math.floor(Math.random() * emojis.length)];
    winTime.textContent = `Solved in ${m}:${s}`;
    winBanner.classList.remove('hidden');
  }

})();
