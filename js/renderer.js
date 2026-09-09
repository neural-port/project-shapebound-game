/**
 * ShapeBound — Renderer
 *
 * Pure DOM rendering functions. Takes a GameState and renders the board,
 * status, score, move log, etc. No game logic here — just projection of
 * state onto the DOM. The controller (main.js) owns state and calls these.
 */

(function (global) {
  'use strict';

  const GameState = global.GameState;
  const SYMBOL = GameState.SYMBOL;

  // ---- Board -------------------------------------------------------------

  /**
   * Render the main board. Options:
   *   interactive: bool — attach data-row/col for click handling
   *   winningCells: [[r,c]...] — highlight
   *   hoverPlayer: 1|2|null — which symbol to preview on hover
   *   onCellClick: fn(row,col)
   *   onCellHover: fn(row,col|null)
   */
  function renderBoard(boardEl, state, options) {
    options = options || {};
    const size = state.boardSize;
    boardEl.innerHTML = '';
    boardEl.style.gridTemplateColumns = 'repeat(' + size + ', 1fr)';
    boardEl.style.gridTemplateRows = 'repeat(' + size + ', 1fr)';

    const winningSet = new Set(
      (state.winInfo ? state.winInfo.cells : []).map(function (c) { return c[0] + ',' + c[1]; })
    );

    // Build age map: oldest piece of each player gets age-oldest, rest by index.
    const ageMap = {};
    [1, 2].forEach(function (player) {
      const pieces = state.activePieces[player];
      const n = pieces.length;
      pieces.forEach(function (p, idx) {
        const key = p.row + ',' + p.col;
        if (n > 1 && idx === 0) ageMap[key] = 'oldest';
        else ageMap[key] = String(Math.min(idx, 3));
      });
    });

    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const cell = document.createElement('div');
        cell.className = 'cell';
        cell.setAttribute('role', 'gridcell');
        cell.dataset.row = r;
        cell.dataset.col = c;
        const v = state.board[r][c];
        const key = r + ',' + c;

        if (v === 0) {
          cell.classList.add('empty');
          cell.setAttribute('aria-label', 'Empty cell row ' + (r + 1) + ' column ' + (c + 1));
          if (options.threats) {
            if (options.threats.opp && options.threats.opp.has(key)) {
              cell.classList.add('threat-opp');
              cell.title = 'Defensive alert: Opponent threat!';
            } else if (options.threats.self && options.threats.self.has(key)) {
              cell.classList.add('threat-self');
              cell.title = 'Winning move available!';
            }
          }
          if (options.interactive) {
            cell.tabIndex = 0;
          }
        } else {
          cell.classList.add(v === 1 ? 'x' : 'o');
          const mark = document.createElement('span');
          mark.className = 'mark';
          mark.textContent = SYMBOL[v];
          mark.setAttribute('aria-hidden', 'true');
          cell.appendChild(mark);
          cell.setAttribute('aria-label', SYMBOL[v] + ' at row ' + (r + 1) + ' column ' + (c + 1));

          if (ageMap[key] === 'oldest') cell.classList.add('age-oldest');
          else cell.classList.add('age-' + ageMap[key]);
        }

        if (winningSet.has(key)) cell.classList.add('winning');

        if (options.interactive) {
          cell.addEventListener('click', function () {
            if (options.onCellClick) options.onCellClick(r, c);
          });
          cell.addEventListener('mouseenter', function () {
            if (options.onCellHover) options.onCellHover(r, c);
          });
          cell.addEventListener('mouseleave', function () {
            if (options.onCellHover) options.onCellHover(null, null);
          });
          cell.addEventListener('keydown', function (e) {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              if (options.onCellClick) options.onCellClick(r, c);
            }
          });
        }

        boardEl.appendChild(cell);
      }
    }
  }

  function clearPreview(boardEl) {
    const cells = boardEl.querySelectorAll('.cell');
    for (let i = 0; i < cells.length; i++) {
      cells[i].classList.remove('preview-x', 'preview-o');
    }
  }

  function showPreview(boardEl, row, col, player) {
    clearPreview(boardEl);
    if (row === null || col === null) return;
    const cell = boardEl.querySelector('.cell[data-row="' + row + '"][data-col="' + col + '"]');
    if (cell && cell.classList.contains('empty')) {
      cell.classList.add(player === 1 ? 'preview-x' : 'preview-o');
    }
  }

  // ---- Status ------------------------------------------------------------

  function renderStatus(statusEl, turnEl, state) {
    const S = GameState.STATUS;
    let text = '';
    const isAIMode = (state.mode === 'HUMAN_VS_AI' || state.mode === 'PRACTICE');
    const isAITurn = isAIMode && state.currentPlayer === state.aiPlayer;
    switch (state.status) {
      case S.READY: text = 'Ready to play'; break;
      case S.PLAYING:
        if (isAITurn) {
          text = 'AI is thinking…';
        } else if (isAIMode) {
          text = 'Your turn (' + SYMBOL[state.currentPlayer] + ')';
        } else {
          text = SYMBOL[state.currentPlayer] + "'s turn";
        }
        break;
      case S.X_WON:
        if (isAIMode) {
          text = (state.aiPlayer === GameState.PLAYER_X) ? 'AI (X) wins!' : 'You (X) win!';
        } else {
          text = 'X wins!';
        }
        break;
      case S.O_WON:
        if (isAIMode) {
          text = (state.aiPlayer === GameState.PLAYER_O) ? 'AI (O) wins!' : 'You (O) win!';
        } else {
          text = 'O wins!';
        }
        break;
      case S.DRAW: text = 'Draw'; break;
      default: text = '';
    }
    statusEl.textContent = text;
    turnEl.textContent = 'Turn ' + state.turn;
  }

  // ---- Score -------------------------------------------------------------

  function renderScore(scoreXEl, scoreOEl, scoreDrawEl, stats) {
    scoreXEl.textContent = stats.x;
    scoreOEl.textContent = stats.o;
    scoreDrawEl.textContent = stats.draw;
  }

  // ---- Move log ----------------------------------------------------------

  function renderMoveLog(logEl, state, options) {
    options = options || {};
    logEl.innerHTML = '';
    const moves = state.moveHistory;
    for (let i = 0; i < moves.length; i++) {
      const m = moves[i];
      const li = document.createElement('li');
      li.dataset.index = i;
      const turn = document.createElement('span');
      turn.className = 'move-turn';
      turn.textContent = '#' + m.turn;
      const player = document.createElement('span');
      player.className = 'move-player ' + (m.player === 1 ? 'x' : 'o');
      player.textContent = SYMBOL[m.player];
      const pos = document.createElement('span');
      pos.className = 'move-pos';
      pos.textContent = colLetter(m.col) + (m.row + 1);
      li.appendChild(turn); li.appendChild(player); li.appendChild(pos);
      if (m.expired) {
        const note = document.createElement('span');
        note.className = 'move-note';
        note.textContent = 'expired ' + SYMBOL[m.expired.player];
        li.appendChild(note);
      }
      if (m.winInfo) {
        const note = document.createElement('span');
        note.className = 'move-note';
        note.textContent = '★ ' + m.winInfo.shape;
        li.appendChild(note);
      }
      if (options.onMoveClick) {
        li.tabIndex = 0;
        li.setAttribute('role', 'button');
        li.addEventListener('click', function () { options.onMoveClick(i); });
        li.addEventListener('keydown', function (e) {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); options.onMoveClick(i); }
        });
      }
      if (options.selectedIndex === i) li.classList.add('selected');
      logEl.appendChild(li);
    }
    logEl.scrollTop = logEl.scrollHeight;
  }

  function colLetter(c) {
    return String.fromCharCode(65 + c);
  }

  // ---- Win banner --------------------------------------------------------

  function renderWinBanner(bannerEl, state) {
    if (!state.winInfo) { bannerEl.classList.add('hidden'); bannerEl.textContent = ''; return; }
    bannerEl.classList.remove('hidden');
    const winnerSym = SYMBOL[state.winner];
    bannerEl.textContent = '';
    bannerEl.appendChild(document.createTextNode(winnerSym + ' wins with the '));
    const shapeEl = document.createElement('span');
    shapeEl.className = 'win-shape';
    shapeEl.textContent = String(state.winInfo.shape || '');
    bannerEl.appendChild(shapeEl);
    bannerEl.appendChild(document.createTextNode(' hexomino!'));
    // Show the winning shape as a mini SVG so the user can see the actual
    // formation (which may be rotated/reflected from the canonical letter).
    if (state.winInfo.cells && (state.winInfo.cells.length === 6 || state.winInfo.cells.length === 5)) {
      const previewWrap = document.createElement('span');
      previewWrap.className = 'win-shape-preview';
      previewWrap.setAttribute('aria-hidden', 'true');
      const svg = shapeToSVG(state.winInfo.cells, '#DAC0A3', 16);
      previewWrap.appendChild(svg);
      bannerEl.appendChild(previewWrap);
    }
  }

  // ---- Shape guide -------------------------------------------------------

  function renderShapeGuide(gridEl, detailEl, shapeEngine, boardSize) {
    gridEl.innerHTML = '';
    const names = shapeEngine.SHAPE_NAMES;
    const lib = shapeEngine.buildLibrary(boardSize || 6);
    names.forEach(function (name) {
      const card = document.createElement('div');
      card.className = 'shape-card';
      card.dataset.shape = name;
      card.setAttribute('role', 'button');
      card.setAttribute('tabindex', '0');
      card.setAttribute('aria-label', 'Hexomino ' + name);
      const label = document.createElement('div');
      label.className = 'shape-name';
      label.textContent = name;
      card.appendChild(label);
      const svg = shapeToSVG(lib.shapes[name].base, '#0F2C59');
      card.appendChild(svg);
      card.addEventListener('click', function () {
        showShapeDetail(detailEl, name, lib, shapeEngine);
        gridEl.querySelectorAll('.shape-card').forEach(function (c) { c.classList.remove('active'); });
        card.classList.add('active');
      });
      card.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); card.click(); }
      });
      gridEl.appendChild(card);
    });
    // default detail
    if (names.length) showShapeDetail(detailEl, names[0], lib, shapeEngine);
  }

  function showShapeDetail(detailEl, name, lib, shapeEngine) {
    const shape = lib.shapes[name];
    const orientCount = shape.orientations.length;
    const placeCount = shape.placements.length;
    detailEl.textContent = '';
    const title = document.createElement('div');
    title.className = 'detail-name';
    title.textContent = name + ' hexomino';
    const orients = document.createElement('div');
    orients.className = 'detail-orientations';
    orients.textContent = orientCount + ' unique orientation(s) (rotations + reflections counted as one). ' +
      placeCount + ' legal placements on a ' + lib.size + '×' + lib.size + ' board.';
    detailEl.appendChild(title);
    detailEl.appendChild(orients);
    // show all orientations as small svgs
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;margin-top:10px;';
    shape.orientations.forEach(function (cells) {
      const svg = shapeToSVG(cells, '#DAC0A3', 22);
      row.appendChild(svg);
    });
    detailEl.appendChild(row);
  }

  function shapeToSVG(cells, color, cellSize) {
    cellSize = cellSize || 28;
    const pad = 2;
    let maxR = 0, maxC = 0;
    cells.forEach(function (p) {
      if (p[0] > maxR) maxR = p[0];
      if (p[1] > maxC) maxC = p[1];
    });
    const w = (maxC + 1) * cellSize + pad * 2;
    const h = (maxR + 1) * cellSize + pad * 2;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', w);
    svg.setAttribute('height', h);
    svg.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
    cells.forEach(function (p) {
      const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      rect.setAttribute('x', pad + p[1] * cellSize + 1);
      rect.setAttribute('y', pad + p[0] * cellSize + 1);
      rect.setAttribute('width', cellSize - 2);
      rect.setAttribute('height', cellSize - 2);
      rect.setAttribute('rx', 3);
      rect.setAttribute('fill', color);
      rect.setAttribute('opacity', '0.85');
      svg.appendChild(rect);
    });
    return svg;
  }

  // ---- Debug -------------------------------------------------------------

  function renderDebug(outputEl, state, extra) {
    const lines = [];
    lines.push('STATUS: ' + state.status);
    lines.push('TURN: ' + state.turn);
    lines.push('CURRENT: ' + SYMBOL[state.currentPlayer]);
    lines.push('ACTIVE X: ' + state.activePieces[1].length);
    lines.push('ACTIVE O: ' + state.activePieces[2].length);
    lines.push('LEGAL MOVES: ' + (global.GameEngine ? global.GameEngine.getLegalMoves(state).length : '?'));
    if (state.winInfo) lines.push('WIN: ' + state.winInfo.shape + ' orient ' + state.winInfo.orientation);
    if (extra) lines.push(extra);
    outputEl.textContent = lines.join('\n');
  }

  // ---- Shape Codex ------------------------------------------------------

  function renderCodex(containerEl, codexModule, shapeEngine) {
    containerEl.innerHTML = '';
    const shapes = codexModule.getAllShapesWithProgress();
    shapes.forEach(function (s) {
      const card = document.createElement('div');
      card.className = 'codex-card' + (s.unlocked ? ' unlocked' : ' locked');

      const header = document.createElement('div');
      header.className = 'codex-card-header';
      const codeSpan = document.createElement('span');
      codeSpan.className = 'codex-code';
      codeSpan.textContent = s.code;
      const typeSpan = document.createElement('span');
      typeSpan.className = 'codex-type';
      typeSpan.textContent = s.type;
      header.appendChild(codeSpan);
      header.appendChild(typeSpan);
      card.appendChild(header);

      const preview = document.createElement('div');
      preview.className = 'codex-preview';
      const baseCells = shapeEngine.BASE_HEXOMINOES[s.code] || [[0,0]];
      const svg = shapeToSVG(baseCells, s.unlocked ? '#DAC0A3' : 'rgba(218,192,163,0.22)', 18);
      preview.appendChild(svg);
      card.appendChild(preview);

      const nameEl = document.createElement('div');
      nameEl.className = 'codex-name';
      nameEl.textContent = s.unlocked ? s.name : 'Unknown Shape';
      card.appendChild(nameEl);

      const aliasEl = document.createElement('div');
      aliasEl.className = 'codex-alias';
      aliasEl.textContent = s.unlocked ? '“' + s.alias + '”' : 'Undiscovered';
      card.appendChild(aliasEl);

      const statsEl = document.createElement('div');
      statsEl.className = 'codex-stats';
      statsEl.textContent = s.unlocked ? (s.wins + ' Win' + (s.wins === 1 ? '' : 's')) : 'Complete in match to unlock';
      card.appendChild(statsEl);

      containerEl.appendChild(card);
    });
  }

  // ---- Daily Puzzle Board ------------------------------------------------

  function renderDailyPuzzle(boardEl, puzzle, onCellClick) {
    boardEl.innerHTML = '';
    boardEl.style.gridTemplateColumns = 'repeat(6, 1fr)';
    boardEl.style.gridTemplateRows = 'repeat(6, 1fr)';

    const xSet = new Set(puzzle.xCells.map(function (c) { return c[0] + ',' + c[1]; }));
    const oSet = new Set(puzzle.oCells.map(function (c) { return c[0] + ',' + c[1]; }));

    for (let r = 0; r < 6; r++) {
      for (let c = 0; c < 6; c++) {
        const cell = document.createElement('div');
        cell.className = 'cell';
        cell.dataset.row = r;
        cell.dataset.col = c;
        const key = r + ',' + c;

        if (xSet.has(key)) {
          cell.classList.add('x');
          const mark = document.createElement('span');
          mark.className = 'mark';
          mark.textContent = 'X';
          cell.appendChild(mark);
        } else if (oSet.has(key)) {
          cell.classList.add('o');
          const mark = document.createElement('span');
          mark.className = 'mark';
          mark.textContent = 'O';
          cell.appendChild(mark);
        } else {
          cell.classList.add('empty');
          cell.tabIndex = 0;
          cell.addEventListener('click', function () {
            if (onCellClick) onCellClick(r, c);
          });
        }
        boardEl.appendChild(cell);
      }
    }
  }

  // ---- Victory Particles -------------------------------------------------

  function spawnVictoryParticles(containerEl) {
    const canvas = document.createElement('canvas');
    canvas.className = 'victory-particles-canvas';
    canvas.style.position = 'absolute';
    canvas.style.inset = '0';
    canvas.style.pointerEvents = 'none';
    canvas.style.zIndex = '50';
    containerEl.style.position = 'relative';
    containerEl.appendChild(canvas);

    const rect = containerEl.getBoundingClientRect();
    canvas.width = rect.width || 400;
    canvas.height = rect.height || 400;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const colors = ['#DAC0A3', '#EADBC8', '#F8F0E5', '#4A90E2', '#50E3C2'];
    const particles = [];
    for (let i = 0; i < 60; i++) {
      particles.push({
        x: canvas.width / 2,
        y: canvas.height / 2,
        vx: (Math.random() - 0.5) * 8,
        vy: (Math.random() - 0.5) * 8 - 2,
        radius: Math.random() * 3 + 2,
        color: colors[Math.floor(Math.random() * colors.length)],
        alpha: 1,
        life: 0.95
      });
    }

    let animId;
    function animate() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      let alive = false;
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.12; // gravity
        p.alpha *= p.life;
        if (p.alpha > 0.01) {
          alive = true;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
          ctx.fillStyle = p.color;
          ctx.globalAlpha = p.alpha;
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
      if (alive) {
        animId = requestAnimationFrame(animate);
      } else {
        cancelAnimationFrame(animId);
        if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
      }
    }
    animate();
  }

  const Renderer = {
    renderBoard: renderBoard,
    clearPreview: clearPreview,
    showPreview: showPreview,
    renderStatus: renderStatus,
    renderScore: renderScore,
    renderMoveLog: renderMoveLog,
    renderWinBanner: renderWinBanner,
    renderShapeGuide: renderShapeGuide,
    renderCodex: renderCodex,
    renderDailyPuzzle: renderDailyPuzzle,
    spawnVictoryParticles: spawnVictoryParticles,
    renderDebug: renderDebug,
    colLetter: colLetter,
    shapeToSVG: shapeToSVG
  };

  global.Renderer = Renderer;
})(typeof window !== 'undefined' ? window : globalThis);
