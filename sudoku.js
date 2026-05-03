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
  async function fetchImages(theme) {
    if (!theme || theme.trim().length < 2) {
      throw new Error('Please enter a theme before starting.');
    }

    const prompt = `You are helping build a custom Sudoku game where each of the 9 numbers is replaced by a distinctive image.

Theme: "${theme}"

Generate exactly 9 specific Unsplash search terms — one per symbol in the puzzle. Each term should:
- Be a real, concrete, searchable thing (not abstract)
- Be visually distinct from the other 8 (easy to tell apart at a glance)
- Relate clearly to the theme
- Be 1–4 words, specific enough to find a good photo

Return ONLY a JSON array of 9 strings. No markdown, no explanation, no code fences.
Example for "ocean life": ["clownfish","blue whale","octopus","seahorse","manta ray","jellyfish","sea turtle","coral reef","great white shark"]`;

    const response = await fetch('http://localhost:3000/api/get-theme', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ theme }),
    });

    if (!response.ok) {
      const err = await response.json().catch(()=>({}));
      throw new Error(`Server error ${response.status}: ${err.error?.message || 'unknown'}`);
    }

    const data = await response.json();
    
    // Anthropic's response structure is parsed here
    const text = data.content.find(b => b.type === 'text')?.text ?? '';
    const clean = text.replace(/```[a-z]*\n?|```/g,'').trim();
    const terms = JSON.parse(clean);

    if (!Array.isArray(terms) || terms.length < 9) {
      throw new Error('AI returned an invalid list of search terms.');
    }

    const SIZE = 200;
    const imageData = terms.slice(0,9).map((term, i) => ({
      label: term,
      // Using Pollinations AI to generate images on the fly based on the term
      url: `https://image.pollinations.ai/prompt/${encodeURIComponent(term)}?width=${SIZE}&height=${SIZE}&nologo=true&seed=${i}`,
      isClassic: false,
    }));

    await Promise.all(imageData.map(d => new Promise(resolve => {
      const img = new Image();
      img.onload = img.onerror = resolve;
      img.src = d.url;
    })));

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

    showScreen(loadingScreen);
    cycleLoadingText(theme);

    try {
      const [{puzzle,solution}, images] = await Promise.all([
        Promise.resolve(SudokuGenerator.generate(currentDifficulty)),
        AITheme.fetchImages(theme),
      ]);
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
  function cycleLoadingText(theme) {
    clearInterval(loadingCycleInterval);
    const msgs = [
      `Finding images for "${theme}"…`,
      'Asking AI for search terms…',
      'Loading photos…',
      'Building your puzzle…',
      'Almost there…',
    ];
    let i = 0;
    loadingText.textContent = msgs[0];
    loadingCycleInterval = setInterval(()=>{
      i = (i+1) % msgs.length;
      loadingText.textContent = msgs[i];
    }, 1200);
    setTimeout(()=>clearInterval(loadingCycleInterval), 15000);
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

  function mkImg(url, alt) {
    const img = document.createElement('img');
    img.src = url; img.alt = alt||''; img.loading='eager';
    return img;
  }

  function renderBoard() {
    const {puzzle,userGrid,images,selected,errors} = Game.getState();
    boardEl.innerHTML = '';
    for (let row=0;row<9;row++) {
      for (let col=0;col<9;col++) {
        const cell = document.createElement('div');
        cell.className='cell';
        cell.dataset.row=row; cell.dataset.col=col;
        cell.setAttribute('role','gridcell');

        const val = userGrid[row][col];
        if (val > 0) {
          const sym = images[val-1];
          if (sym.isClassic) {
            const span = document.createElement('span');
            span.className='cell-number';
            span.textContent = val;
            cell.appendChild(span);
          } else {
            cell.appendChild(mkImg(sym.url, sym.label));
          }
        }

        if (puzzle[row][col]!==0) cell.classList.add('given');
        if (errors.has(`${row},${col}`)) cell.classList.add('error');

        if (selected) {
          const {row:sr,col:sc} = selected;
          if (sr===row&&sc===col) {
            cell.classList.add('selected');
          } else if (sr===row||sc===col||
            (Math.floor(sr/3)===Math.floor(row/3)&&Math.floor(sc/3)===Math.floor(col/3))) {
            cell.classList.add('highlight');
          }
          if (val>0&&val===userGrid[sr][sc]) cell.classList.add('highlight');
        }

        cell.addEventListener('click', ()=>onCellClick(row,col));
        boardEl.appendChild(cell);
      }
    }
  }

  function renderPalette() {
    const {images,selectedSymbol} = Game.getState();
    const counts = Game.symbolCounts();
    paletteEl.innerHTML='';
    images.forEach(({label,url,isClassic},i)=>{
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
        btn.appendChild(mkImg(url,label));
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
    renderBoard(); renderPalette();
  }

  function onPaletteClick(num) {
    Game.selectSymbol(num);
    const {selected,puzzle} = Game.getState();
    if (selected&&puzzle[selected.row][selected.col]===0) {
      Game.placeSymbol(num);
      if (Game.checkComplete()) onWin();
    }
    renderBoard(); renderPalette();
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