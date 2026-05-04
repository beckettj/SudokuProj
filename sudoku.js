/**
 * THEME SUDOKU — sudoku.js
 * Modules: SudokuGenerator | AITheme | Game | UI
 */

// ═══════════════════════════════════════════════
// 1. SUDOKU GENERATOR
// ═══════════════════════════════════════════════
const SudokuGenerator = (() => {
  const CLUES = { easy: 46, medium: 36, hard: 28, expert: 22 };
  const empty = () => Array.from({ length: 9 }, () => Array(9).fill(0));

  function valid(g, r, c, n) {
    for (let i = 0; i < 9; i++) {
      if (g[r][i] === n || g[i][c] === n) return false;
    }
    const br = Math.floor(r / 3) * 3, bc = Math.floor(c / 3) * 3;
    for (let dr = 0; dr < 3; dr++)
      for (let dc = 0; dc < 3; dc++)
        if (g[br+dr][bc+dc] === n) return false;
    return true;
  }

  function shuffle(a) {
    for (let i = a.length-1; i > 0; i--) {
      const j = Math.floor(Math.random()*(i+1));
      [a[i],a[j]] = [a[j],a[i]];
    }
    return a;
  }

  function fill(g) {
    for (let r = 0; r < 9; r++)
      for (let c = 0; c < 9; c++)
        if (g[r][c] === 0) {
          for (const n of shuffle([1,2,3,4,5,6,7,8,9])) {
            if (valid(g,r,c,n)) {
              g[r][c] = n;
              if (fill(g)) return true;
              g[r][c] = 0;
            }
          }
          return false;
        }
    return true;
  }

  function countSols(g, limit=2) {
    let count = 0;
    function bt(grid) {
      for (let r=0; r<9; r++)
        for (let c=0; c<9; c++)
          if (grid[r][c] === 0) {
            for (let n=1; n<=9; n++) {
              if (valid(grid,r,c,n)) {
                grid[r][c] = n;
                bt(grid);
                if (count >= limit) return;
                grid[r][c] = 0;
              }
            }
            return;
          }
      count++;
    }
    bt(g.map(row=>[...row]));
    return count;
  }

  function generate(difficulty='medium') {
    const solution = empty();
    fill(solution);
    const puzzle = solution.map(r=>[...r]);
    const target = CLUES[difficulty] ?? 36;
    const cells = shuffle([...Array(81).keys()]);
    let removed = 0;
    for (const idx of cells) {
      if (81-removed <= target) break;
      const r = Math.floor(idx/9), c = idx%9;
      const bak = puzzle[r][c];
      puzzle[r][c] = 0;
      if (countSols(puzzle) !== 1) puzzle[r][c] = bak;
      else removed++;
    }
    return { puzzle, solution };
  }

  return { generate };
})();

// ═══════════════════════════════════════════════
// 2. AI THEME
// ═══════════════════════════════════════════════
const AITheme = (() => {

  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  // POST to the local server with up to `retries` attempts
  async function postWithRetry(url, body, retries = 2, timeoutMs = 25000) {
    for (let attempt = 1; attempt <= retries; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
        clearTimeout(timer);
        if (res.ok) return res;
        // Server returned an error status — parse and throw immediately, no retry
        const err = await res.json().catch(() => ({}));
        throw new Error(`Server error ${res.status}: ${err?.error || 'unknown'}`);
      } catch (e) {
        clearTimeout(timer);
        // Network-level failure (server down, timeout) → retry
        if (e.name === 'AbortError') {
          if (attempt === retries) throw new Error('Request timed out. Is node server.js running?');
          await sleep(800 * attempt);
          continue;
        }
        if (e instanceof TypeError && e.message.includes('fetch')) {
          throw new Error('Cannot reach server. Make sure you ran: node server.js');
        }
        throw e; // application-level error, don't retry
      }
    }
  }

  // Preload one image, resolving true/false
  function preloadOne(url) {
    return new Promise(resolve => {
      const img = new Image();
      const timer = setTimeout(() => { img.src = ''; resolve(false); }, 20000);
      img.onload  = () => { clearTimeout(timer); resolve(true); };
      img.onerror = () => { clearTimeout(timer); resolve(false); };
      img.src = url;
    });
  }

  async function fetchImages(theme, onProgress) {
    if (!theme || theme.trim().length < 2) {
      throw new Error('Please enter a theme before starting.');
    }

    // Step 1: POST to local server → Claude returns 9 search terms
    const res = await postWithRetry('http://localhost:3000/api/get-theme', { theme });
    const data = await res.json();
    const text = data.content?.find(b => b.type === 'text')?.text ?? '';
    const clean = text.replace(/```[a-z]*\n?|```/g, '').trim();

    let terms;
    try {
      terms = JSON.parse(clean);
    } catch {
      throw new Error('AI response was not valid JSON. Try again.');
    }
    if (!Array.isArray(terms) || terms.length < 9) {
      throw new Error('AI returned fewer than 9 terms. Try again.');
    }

    // Step 2: Build image URLs (served by local proxy → Pollinations)
    const imageData = terms.slice(0, 9).map((term, i) => ({
      label: term,
      url: `http://localhost:3000/api/image/${encodeURIComponent(term)}?seed=${i}`,
      loaded: false,
      failed: false,
      isClassic: false,
    }));

    onProgress && onProgress(imageData, 0);

    // Step 3: Preload all 9 in parallel, each with its own retry
    let done = 0;
    await Promise.all(imageData.map(async (item) => {
      for (let attempt = 0; attempt < 3; attempt++) {
        if (attempt > 0) await sleep(1000 * attempt);
        const ok = await preloadOne(item.url);
        if (ok) { item.loaded = true; break; }
      }
      item.failed = !item.loaded;
      done++;
      onProgress && onProgress(imageData, done);
    }));

    return imageData;
  }

  return { fetchImages };
})();


// ═══════════════════════════════════════════════
// 3. GAME STATE
// ═══════════════════════════════════════════════
const Game = (() => {
  let state = {
    puzzle: null, solution: null, userGrid: null,
    images: [], selected: null, selectedSymbol: null,
    errors: new Set(), difficulty: 'medium', theme: '',
  };

  function init(puzzle, solution, images, difficulty, theme) {
    Object.assign(state, {
      puzzle, solution,
      userGrid: puzzle.map(r=>[...r]),
      images, difficulty, theme,
      selected: null, selectedSymbol: null,
      errors: new Set(),
    });
  }

  function selectCell(r,c) { state.selected = {row:r,col:c}; }
  function selectSymbol(n) { state.selectedSymbol = state.selectedSymbol===n ? null : n; }

  function placeSymbol(n) {
    if (!state.selected) return false;
    const {row,col} = state.selected;
    if (state.puzzle[row][col] !== 0) return false;
    state.userGrid[row][col] = n;
    if (n === 0) state.errors.delete(`${row},${col}`);
    else state.solution[row][col]===n ? state.errors.delete(`${row},${col}`) : state.errors.add(`${row},${col}`);
    return true;
  }

  function getHint() {
    const cands = [];
    for (let r=0;r<9;r++)
      for (let c=0;c<9;c++)
        if (state.puzzle[r][c]===0 && state.userGrid[r][c]!==state.solution[r][c])
          cands.push({r,c});
    if (!cands.length) return null;
    const {r,c} = cands[Math.floor(Math.random()*cands.length)];
    state.userGrid[r][c] = state.solution[r][c];
    state.errors.delete(`${r},${c}`);
    return {row:r,col:c,value:state.solution[r][c]};
  }

  function revealAll() {
    state.userGrid = state.solution.map(r=>[...r]);
    state.errors.clear();
  }

  function checkComplete() {
    for (let r=0;r<9;r++)
      for (let c=0;c<9;c++)
        if (state.userGrid[r][c]!==state.solution[r][c]) return false;
    return true;
  }

  function symbolCounts() {
    const counts = Array(10).fill(0);
    for (let r=0;r<9;r++)
      for (let c=0;c<9;c++)
        if (state.userGrid[r][c]>0) counts[state.userGrid[r][c]]++;
    return counts;
  }

  function getState() { return state; }
  return { init, selectCell, selectSymbol, placeSymbol, getHint, revealAll, checkComplete, symbolCounts, getState };
})();

// ═══════════════════════════════════════════════
// 4. UI
// ═══════════════════════════════════════════════
const UI = (() => {
  const $ = id => document.getElementById(id);

  const setupScreen    = $('setup-screen');
  const loadingScreen  = $('loading-screen');
  const gameScreen     = $('game-screen');
  const themeInput     = $('theme-input');
  const themeField     = $('theme-field');
  const startBtn       = $('start-btn');
  const backBtn        = $('back-btn');
  const hintBtn        = $('hint-btn');
  const eraseBtn       = $('erase-btn');
  const checkBtn       = $('check-btn');
  const solveBtn       = $('solve-btn');
  const playAgainBtn   = $('play-again-btn');
  const boardEl        = $('board');
  const paletteEl      = $('palette');
  const paletteLabel   = $('palette-label');
  const timerEl        = $('timer');
  const winBanner      = $('win-banner');
  const winImgWrap     = $('win-img-wrap');
  const winTime        = $('win-time');
  const loadingGrid    = $('loading-grid');
  const loadingText    = $('loading-text');
  const gameThemeLabel = $('game-theme-label');
  const difficultyLabel = $('difficulty-label');

  let currentDifficulty = 'medium';
  let currentMode = 'theme';
  let timerInterval = null;
  let secondsElapsed = 0;

  // Build loading cells
  for (let i=0;i<9;i++) {
    const c = document.createElement('div');
    c.className = 'lg-cell';
    loadingGrid.appendChild(c);
  }

  function showScreen(el) {
    [setupScreen,loadingScreen,gameScreen].forEach(s=>s.classList.remove('active'));
    el.classList.add('active');
  }

  // ── Mode toggle ──
  document.querySelectorAll('.mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.mode-btn').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      currentMode = btn.dataset.mode;
      if (currentMode === 'classic') {
        themeField.classList.add('hidden-field');
        startBtn.textContent = 'Play Classic →';
      } else {
        themeField.classList.remove('hidden-field');
        startBtn.textContent = 'Generate & Play →';
      }
      setupScreen.querySelector('.error-msg')?.remove();
    });
  });

  // ── Difficulty pills ──
  document.querySelectorAll('.pill').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.pill').forEach(p=>p.classList.remove('active'));
      btn.classList.add('active');
      currentDifficulty = btn.dataset.diff;
    });
  });

  // ── Start ──
  startBtn.addEventListener('click', async () => {
    setupScreen.querySelector('.error-msg')?.remove();

    if (currentMode === 'classic') {
      const {puzzle, solution} = SudokuGenerator.generate(currentDifficulty);
      const classicSymbols = Array.from({length:9}, (_,i) => ({
        label: String(i+1), url: null, isClassic: true,
      }));
      Game.init(puzzle, solution, classicSymbols, currentDifficulty, 'Classic');
      renderGame();
      showScreen(gameScreen);
      startTimer();
      winBanner.classList.add('hidden');
      return;
    }

    const theme = themeInput.value.trim();
    if (!theme) {
      themeInput.focus();
      themeInput.style.borderColor = 'var(--danger)';
      setTimeout(()=>{ themeInput.style.borderColor=''; }, 1800);
      return;
    }

    resetLoadingGrid();
    showScreen(loadingScreen);
    setLoadingPhase('ai', theme);

    try {
      const { puzzle, solution } = SudokuGenerator.generate(currentDifficulty);

      const images = await AITheme.fetchImages(theme, (imageData, doneCount) => {
        setLoadingPhase('images', theme, doneCount, imageData.length);
        updateLoadingGrid(imageData);
      });

      Game.init(puzzle, solution, images, currentDifficulty, theme);
      renderGame();
      showScreen(gameScreen);
      startTimer();
      winBanner.classList.add('hidden');
    } catch(err) {
      showScreen(setupScreen);
      const msg = document.createElement('p');
      msg.style.cssText = 'color:var(--danger);font-family:var(--font-mono);font-size:.8rem;margin-top:8px;';
      msg.textContent = err.message || 'Something went wrong. Check your connection and try again.';
      msg.className = 'error-msg';
      startBtn.parentNode.insertBefore(msg, startBtn.nextSibling);
      console.error(err);
    }
  });

  let loadingCycleInterval = null;
  function setLoadingPhase(phase, theme, done, total) {
    clearInterval(loadingCycleInterval);
    if (phase === 'ai') {
      const msgs = [
        `Asking AI about "${theme}"…`,
        'Picking 9 distinct subjects…',
        'Generating search terms…',
      ];
      let i = 0;
      loadingText.textContent = msgs[0];
      loadingCycleInterval = setInterval(() => {
        i = (i + 1) % msgs.length;
        loadingText.textContent = msgs[i];
      }, 1100);
    } else if (phase === 'images') {
      loadingText.textContent = `Loading images… ${done}/${total}`;
    }
  }

  // Update the 3×3 loading grid cells to reflect per-image state
  function updateLoadingGrid(imageData) {
    const cells = loadingGrid.querySelectorAll('.lg-cell');
    imageData.forEach((item, i) => {
      if (!cells[i]) return;
      if (item.failed) {
        cells[i].classList.add('lg-failed');
        cells[i].classList.remove('lg-done');
      } else if (item.loaded) {
        cells[i].classList.add('lg-done');
        cells[i].classList.remove('lg-failed');
        // Show a tiny thumbnail if we have the URL
        if (!cells[i].style.backgroundImage) {
          cells[i].style.backgroundImage = `url(${item.url})`;
          cells[i].style.backgroundSize = 'cover';
          cells[i].style.backgroundPosition = 'center';
        }
      }
    });
  }

  // Reset loading grid back to pulsing blue squares
  function resetLoadingGrid() {
    const cells = loadingGrid.querySelectorAll('.lg-cell');
    cells.forEach(cell => {
      cell.classList.remove('lg-done', 'lg-failed');
      cell.style.backgroundImage = '';
      cell.style.backgroundSize = '';
      cell.style.backgroundPosition = '';
    });
  }

  backBtn.addEventListener('click', ()=>{ stopTimer(); winBanner.classList.add('hidden'); showScreen(setupScreen); });
  playAgainBtn.addEventListener('click', ()=>{ stopTimer(); winBanner.classList.add('hidden'); showScreen(setupScreen); });

  // ── Render ──
  function isClassic() { return Game.getState().images[0]?.isClassic === true; }

  function renderGame() {
    const {difficulty,theme} = Game.getState();
    gameThemeLabel.textContent = theme;
    difficultyLabel.textContent = difficulty.toUpperCase();
    paletteLabel.textContent = isClassic() ? 'Numbers' : 'Symbols';
    renderBoard();
    renderPalette();
  }

  function mkImg(url, alt, failed) {
    if (failed) {
      // Show a styled placeholder instead of a broken image icon
      const div = document.createElement('div');
      div.className = 'img-failed';
      div.title = alt || '';
      // Use first letter(s) of the label as a monogram
      const words = (alt || '?').split(' ');
      div.textContent = words.length > 1
        ? (words[0][0] + words[1][0]).toUpperCase()
        : (alt || '?')[0].toUpperCase();
      return div;
    }
    const img = document.createElement('img');
    img.src = url;
    img.alt = alt || '';
    img.loading = 'eager';
    // If it errors at render time, swap to placeholder
    img.onerror = () => {
      const ph = document.createElement('div');
      ph.className = 'img-failed';
      const words = (alt || '?').split(' ');
      ph.textContent = words.length > 1
        ? (words[0][0] + words[1][0]).toUpperCase()
        : (alt || '?')[0].toUpperCase();
      img.replaceWith(ph);
    };
    return img;
  }

  function renderBoard() {
    const {puzzle,userGrid,images,selected,errors} = Game.getState();
    boardEl.innerHTML = '';

    // The CSS grid has 11 columns/rows: 3 cells, 1 spacer, 3 cells, 1 spacer, 3 cells
    // We need to inject spacer divs at the right positions.
    // Grid positions (0-indexed col): 0,1,2 = box col 0 | 3 = spacer | 4,5,6 = box col 1 | 7 = spacer | 8,9,10 = box col 2

    for (let row = 0; row < 11; row++) {
      const isRowSpacer = (row === 3 || row === 7);

      if (isRowSpacer) {
        // Full-width spacer row spanning all 11 columns
        const sp = document.createElement('div');
        sp.className = 'board-spacer';
        sp.style.gridColumn = '1 / -1';
        boardEl.appendChild(sp);
        continue;
      }

      // Map visual row index to actual data row (skip spacer rows 3 and 7)
      const dataRow = row < 3 ? row : row < 7 ? row - 1 : row - 2;

      for (let col = 0; col < 11; col++) {
        const isColSpacer = (col === 3 || col === 7);

        if (isColSpacer) {
          const sp = document.createElement('div');
          sp.className = 'board-spacer';
          boardEl.appendChild(sp);
          continue;
        }

        // Map visual col index to data col
        const dataCol = col < 3 ? col : col < 7 ? col - 1 : col - 2;

        const cell = document.createElement('div');
        cell.className = 'cell';
        cell.dataset.row = dataRow;
        cell.dataset.col = dataCol;
        cell.setAttribute('role', 'gridcell');

        const val = userGrid[dataRow][dataCol];
        if (val > 0) {
          const sym = images[val - 1];
          if (sym.isClassic) {
            const span = document.createElement('span');
            span.className = 'cell-number';
            span.textContent = val;
            cell.appendChild(span);
          } else {
            cell.appendChild(mkImg(sym.url, sym.label, sym.failed));
          }
        }

        if (puzzle[dataRow][dataCol] !== 0) cell.classList.add('given');
        if (errors.has(`${dataRow},${dataCol}`)) cell.classList.add('error');

        if (selected) {
          const {row: sr, col: sc} = selected;
          if (sr === dataRow && sc === dataCol) {
            cell.classList.add('selected');
          } else if (sr === dataRow || sc === dataCol ||
            (Math.floor(sr/3) === Math.floor(dataRow/3) && Math.floor(sc/3) === Math.floor(dataCol/3))) {
            cell.classList.add('highlight');
          }
          if (val > 0 && val === userGrid[sr][sc] && !(sr === dataRow && sc === dataCol)) {
            cell.classList.add('same-val');
          }
        }

        cell.addEventListener('click', () => onCellClick(dataRow, dataCol));
        boardEl.appendChild(cell);
      }
    }
  }

  function renderPalette() {
    const {images,selectedSymbol} = Game.getState();
    const counts = Game.symbolCounts();
    paletteEl.innerHTML='';
    images.forEach((item, i) => {
      const { label, url, isClassic } = item;
      const num = i+1;
      const remaining = 9-counts[num];
      const btn = document.createElement('button');
      btn.className='palette-btn'+(selectedSymbol===num?' selected-palette':'');
      if (remaining===0) btn.classList.add('used');
      btn.title=`${label} · ${remaining} left`;

      if (isClassic) {
        btn.classList.add('classic-num');
        btn.textContent = num;
      } else {
        btn.appendChild(mkImg(url, label, item.failed));
      }

      const cnt = document.createElement('span');
      cnt.className='p-count'; cnt.textContent=remaining;
      btn.appendChild(cnt);
      btn.addEventListener('click',()=>onPaletteClick(num));
      paletteEl.appendChild(btn);
    });
  }

  function onCellClick(row,col) {
    const {selectedSymbol,puzzle} = Game.getState();
    Game.selectCell(row,col);
    if (selectedSymbol!==null&&puzzle[row][col]===0) {
      Game.placeSymbol(selectedSymbol);
      if (Game.checkComplete()) onWin();
    }
    renderBoard();
    renderPalette();
    // Pop animation on the cell that just received a symbol
    if (selectedSymbol!==null&&puzzle[row][col]===0) {
      const placedCell = boardEl.querySelector(`[data-row="${row}"][data-col="${col}"]`);
      if (placedCell) {
        placedCell.classList.add('just-placed');
        placedCell.addEventListener('animationend', () => placedCell.classList.remove('just-placed'), {once:true});
      }
    }
  }

  function onPaletteClick(num) {
    Game.selectSymbol(num);
    const {selected,puzzle} = Game.getState();
    const didPlace = selected&&puzzle[selected.row][selected.col]===0;
    if (didPlace) {
      Game.placeSymbol(num);
      if (Game.checkComplete()) onWin();
    }
    renderBoard();
    renderPalette();
    if (didPlace&&selected) {
      const placedCell = boardEl.querySelector(`[data-row="${selected.row}"][data-col="${selected.col}"]`);
      if (placedCell) {
        placedCell.classList.add('just-placed');
        placedCell.addEventListener('animationend', () => placedCell.classList.remove('just-placed'), {once:true});
      }
    }
  }

  document.addEventListener('keydown', e=>{
    if (!gameScreen.classList.contains('active')) return;
    const {selected,puzzle,images} = Game.getState();

    if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)&&selected) {
      e.preventDefault();
      let {row,col} = selected;
      if (e.key==='ArrowUp')    row=Math.max(0,row-1);
      if (e.key==='ArrowDown')  row=Math.min(8,row+1);
      if (e.key==='ArrowLeft')  col=Math.max(0,col-1);
      if (e.key==='ArrowRight') col=Math.min(8,col+1);
      Game.selectCell(row,col); renderBoard();
      return;
    }

    if (e.key>='1'&&e.key<='9') {
      const num=parseInt(e.key);
      if (num<=images.length) {
        Game.selectSymbol(num);
        if (selected&&puzzle[selected.row][selected.col]===0) {
          Game.placeSymbol(num);
          if (Game.checkComplete()) onWin();
        }
        renderBoard(); renderPalette();
      }
      return;
    }

    if (['Backspace','Delete','0'].includes(e.key)&&selected) {
      Game.placeSymbol(0); renderBoard(); renderPalette();
    }
  });

  eraseBtn.addEventListener('click',()=>{
    const {selected,puzzle}=Game.getState();
    if (selected&&puzzle[selected.row][selected.col]===0) {
      Game.placeSymbol(0); renderBoard(); renderPalette();
    }
  });

  checkBtn.addEventListener('click',()=>{
    const {userGrid,solution,puzzle}=Game.getState();
    boardEl.querySelectorAll('.cell').forEach(cell=>{
      const r=+cell.dataset.row,c=+cell.dataset.col;
      if (puzzle[r][c]!==0||userGrid[r][c]===0) return;
      if (userGrid[r][c]===solution[r][c]) {
        cell.classList.add('correct-flash');
        cell.addEventListener('animationend',()=>cell.classList.remove('correct-flash'),{once:true});
      }
    });
    renderBoard();
  });

  hintBtn.addEventListener('click',()=>{
    const hint=Game.getHint();
    if (!hint) return;
    Game.selectCell(hint.row,hint.col);
    if (Game.checkComplete()) onWin();
    renderBoard(); renderPalette();
  });

  solveBtn.addEventListener('click',()=>{
    if (!confirm('Reveal the full solution?')) return;
    Game.revealAll(); renderBoard(); renderPalette(); stopTimer();
  });

  function startTimer() {
    stopTimer(); secondsElapsed=0; timerEl.textContent='00:00';
    timerInterval=setInterval(()=>{
      secondsElapsed++;
      const m=String(Math.floor(secondsElapsed/60)).padStart(2,'0');
      const s=String(secondsElapsed%60).padStart(2,'0');
      timerEl.textContent=`${m}:${s}`;
    },1000);
  }
  function stopTimer() { clearInterval(timerInterval); timerInterval=null; }

  function onWin() {
    stopTimer();
    const {images}=Game.getState();
    const m=String(Math.floor(secondsElapsed/60)).padStart(2,'0');
    const s=String(secondsElapsed%60).padStart(2,'0');
    winImgWrap.innerHTML='';
    if (isClassic()) {
      winImgWrap.textContent='✓';
    } else {
      const picked=images[Math.floor(Math.random()*images.length)];
      winImgWrap.appendChild(mkImg(picked.url,picked.label));
    }
    winTime.textContent=`Solved in ${m}:${s}`;
    winBanner.classList.remove('hidden');
  }
})();