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
    const isAITurn = (state.mode === 'HUMAN_VS_AI' || state.mode === 'PRACTICE') &&
      state.currentPlayer === state.aiPlayer;
    switch (state.status) {
      case S.READY: text = 'Ready to play'; break;
      case S.PLAYING:
        text = isAITurn
          ? 'AI is thinking…'
          : SYMBOL[state.currentPlayer] + "'s turn";
        break;
      case S.X_WON: text = 'X wins!'; break;
      case S.O_WON:
        text = state.mode === 'HUMAN_VS_AI' || state.mode === 'PRACTICE' ? 'AI (O) wins!' : 'O wins!';
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
    if (state.winInfo.cells && state.winInfo.cells.length === 5) {
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

  const Renderer = {
    renderBoard: renderBoard,
    clearPreview: clearPreview,
    showPreview: showPreview,
    renderStatus: renderStatus,
    renderScore: renderScore,
    renderMoveLog: renderMoveLog,
    renderWinBanner: renderWinBanner,
    renderShapeGuide: renderShapeGuide,
    renderDebug: renderDebug,
    colLetter: colLetter,
    shapeToSVG: shapeToSVG
  };

  global.Renderer = Renderer;
})(typeof window !== 'undefined' ? window : globalThis);
