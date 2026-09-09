/**
 * ShapeBound — Main Controller
 *
 * Owns the GameState, wires UI events to the engine/AI/renderer, and
 * orchestrates replay, analyzer, what-if, game lab, and persistence.
 * All game logic flows through GameEngine; this file only coordinates.
 */

(function () {
  'use strict';

  const GS = window.GameState;
  const GE = window.GameEngine;
  const AI = window.AI;
  const SE = window.ShapeEngine;
  const R = window.Renderer;
  const Tests = window.Tests;
  const Audio = window.AudioEngine;
  const Codex = window.Codex;
  const DailyPuzzle = window.DailyPuzzle;
  const Notation = window.Notation;

  // ---- DOM refs ----------------------------------------------------------
  const $ = function (id) { return document.getElementById(id); };
  const boardEl = $('board');
  const statusEl = $('status-text');
  const turnEl = $('turn-info');
  const scoreXEl = $('score-x');
  const scoreOEl = $('score-o');
  const scoreDrawEl = $('score-draw');
  const moveLogEl = $('move-log');
  const winBannerEl = $('win-banner');
  const postGameCard = $('post-game-card');
  const undoBtn = $('btn-undo');
  const debugPanel = $('debug-panel');
  const debugOutput = $('debug-output');
  const debugBtn = $('btn-debug');

  // ---- App state ---------------------------------------------------------
  let state = null;
  let undoStack = [];
  let stats = loadStats();
  let aiThinking = false;
  let aiToken = 0;  // increments on new game/undo/lab to invalidate stale AI callbacks
  let debugMode = new URLSearchParams(window.location.search).has('debug');
  let replayState = null;   // { history, index, timer }
  let whatifState = null;   // { branch: GameState, baseIndex }
  let activePuzzle = null;
  let threatRadarEnabled = true;
  let clockLimit = 0;
  let clockRemaining = 0;
  let clockInterval = null;
  const THEME_KEY = 'shapebound_theme_v1';

  // ---- Stats persistence -------------------------------------------------
  const STATS_KEY = 'shapebound_stats_v1';
  function emptyStats() {
    return { x: 0, o: 0, draw: 0 };
  }
  function loadStats() {
    try {
      const raw = localStorage.getItem(STATS_KEY);
      if (!raw) return emptyStats();
      const parsed = JSON.parse(raw);
      const x = Number(parsed && parsed.x);
      const o = Number(parsed && parsed.o);
      const draw = Number(parsed && parsed.draw);
      if (!Number.isFinite(x) || !Number.isFinite(o) || !Number.isFinite(draw)) return emptyStats();
      return {
        x: Math.max(0, Math.floor(x)),
        o: Math.max(0, Math.floor(o)),
        draw: Math.max(0, Math.floor(draw))
      };
    } catch (e) { /* ignore */ }
    return emptyStats();
  }
  function saveStats() {
    try { localStorage.setItem(STATS_KEY, JSON.stringify(stats)); } catch (e) {}
  }
  function bumpStats() {
    if (!state) return;
    if (state.mode === 'PRACTICE') return; // practice never touches the score
    const S = GS.STATUS;
    if (state.status === S.X_WON) stats.x++;
    else if (state.status === S.O_WON) stats.o++;
    else if (state.status === S.DRAW) stats.draw++;
    saveStats();
    renderScore();
  }
  function renderScore() {
    R.renderScore(scoreXEl, scoreOEl, scoreDrawEl, stats);
    renderScoreLabels();
  }

  function renderScoreLabels() {
    const labelX = $('score-label-x');
    const labelO = $('score-label-o');
    if (!labelX || !labelO) return;
    const isAIMode = state && (state.mode === 'HUMAN_VS_AI' || state.mode === 'PRACTICE');
    if (isAIMode) {
      if (state.aiPlayer === GS.PLAYER_X) {
        labelX.textContent = 'Player X (AI)';
        labelO.textContent = 'Player O (You)';
      } else {
        labelX.textContent = 'Player X (You)';
        labelO.textContent = 'Player O (AI)';
      }
    } else {
      labelX.textContent = 'Player X';
      labelO.textContent = 'Player O';
    }
  }

  // ---- Core render -------------------------------------------------------
  function isAITurn() {
    return (state.mode === 'HUMAN_VS_AI' || state.mode === 'PRACTICE') &&
      state.currentPlayer === state.aiPlayer;
  }

  function renderAll() {
    let threats = null;
    if (threatRadarEnabled && state.status === GS.STATUS.PLAYING) {
      const opp = state.currentPlayer === GS.PLAYER_X ? GS.PLAYER_O : GS.PLAYER_X;
      const occSelf = GS.occupiedCells(state, state.currentPlayer);
      const occOpp = GS.occupiedCells(state, opp);
      const legal = GE.getLegalMoves(state);
      const lib = GE.getLibrary(state.boardSize);
      const tSelf = SE.findThreats(lib, occSelf, legal);
      const tOpp = SE.findThreats(lib, occOpp, legal);
      threats = {
        self: new Set(tSelf.map(function (t) { return t.row + ',' + t.col; })),
        opp: new Set(tOpp.map(function (t) { return t.row + ',' + t.col; }))
      };
    }

    R.renderBoard(boardEl, state, {
      interactive: state.status === GS.STATUS.PLAYING && !aiThinking && !isAITurn(),
      threats: threats,
      onCellClick: onCellClick,
      onCellHover: onCellHover
    });
    R.renderStatus(statusEl, turnEl, state);
    R.renderMoveLog(moveLogEl, state, { onMoveClick: onMoveLogClick });
    R.renderWinBanner(winBannerEl, state);
    undoBtn.disabled = undoStack.length === 0 || state.status === GS.STATUS.READY;
    if (state.status === GS.STATUS.X_WON || state.status === GS.STATUS.O_WON || state.status === GS.STATUS.DRAW) {
      postGameCard.classList.remove('hidden');
    } else {
      postGameCard.classList.add('hidden');
    }
    updateCodexBadge();
    if (debugMode) renderDebug();
  }

  function renderDebug() {
    let extra = '';
    if (isAITurn() && state.status === GS.STATUS.PLAYING) {
      try { extra = 'AI EVAL: ' + AI.evaluateBoard(state, state.aiPlayer).toFixed(0); } catch (e) {}
    }
    R.renderDebug(debugOutput, state, extra);
  }

  // ---- Move handling -----------------------------------------------------
  function onCellClick(row, col) {
    if (aiThinking) return;
    if (state.status !== GS.STATUS.PLAYING) return;
    // In AI mode, ignore clicks during AI's turn.
    if (isAITurn()) return;
    playMove(row, col);
  }

  function onCellHover(row, col) {
    if (row === null) { R.clearPreview(boardEl); return; }
    if (state.status !== GS.STATUS.PLAYING) return;
    if (isAITurn()) return;
    R.showPreview(boardEl, row, col, state.currentPlayer);
  }

  function playMove(row, col) {
    if (!GE.isLegalMove(state, row, col)) return;
    const movingPlayer = state.currentPlayer;
    undoStack.push(GS.snapshot(state));
    const res = GE.applyMove(state, row, col);
    if (!res.ok) { undoStack.pop(); return; }
    if (Audio) Audio.playPlace(movingPlayer, row, col);
    if (res.expired && Audio) Audio.playExpire();
    if (res.ended && res.winInfo && res.winInfo.won) {
      if (Audio) Audio.playWin();
      if (Codex) {
        Codex.registerWin(res.winInfo.shape, state.mode, state.aiDifficulty);
        updateCodexBadge();
      }
      R.spawnVictoryParticles(boardEl);
      stopClock();
    }
    resetTurnClock();
    renderAll();
    if (res.ended) { bumpStats(); return; }
    maybeAIMove();
  }

  function maybeAIMove() {
    if (state.mode !== 'HUMAN_VS_AI' && state.mode !== 'PRACTICE') return;
    if (state.status !== GS.STATUS.PLAYING) return;
    if (state.currentPlayer !== state.aiPlayer) return;
    if (aiThinking) return;
    aiThinking = true;
    aiToken++;
    const token = aiToken;
    renderAll();
    AI.chooseMoveAsync(state, state.aiDifficulty, function (err, move) {
      aiThinking = false;
      if (token !== aiToken) { renderAll(); return; }  // stale callback
      if (err) { renderAll(); return; }
      if (!move) { renderAll(); return; }
      if (state.status !== GS.STATUS.PLAYING) { renderAll(); return; }
      const movingPlayer = state.currentPlayer;
      const res = GE.applyMove(state, move[0], move[1]);
      if (Audio) Audio.playPlace(movingPlayer, move[0], move[1]);
      if (res.expired && Audio) Audio.playExpire();
      if (res.ended && res.winInfo && res.winInfo.won) {
        if (Audio) Audio.playWin();
        if (Codex) {
          Codex.registerWin(res.winInfo.shape, state.mode, state.aiDifficulty);
          updateCodexBadge();
        }
        R.spawnVictoryParticles(boardEl);
        stopClock();
      }
      resetTurnClock();
      renderAll();
      if (res.ended) bumpStats();
    });
  }

  // ---- Undo (AI mode: pop two plies) ------------------------------------
  function doUndo() {
    if (!undoStack.length) return;
    if (aiThinking) return;  // don't undo while AI is thinking
    const hasAI = state.mode === 'HUMAN_VS_AI' || state.mode === 'PRACTICE';
    if (hasAI && undoStack.length >= 2 &&
        state.moveHistory.length >= 2 &&
        state.moveHistory[state.moveHistory.length - 1].player === state.aiPlayer) {
      GE.undo(state, undoStack);
      GE.undo(state, undoStack);
    } else {
      GE.undo(state, undoStack);
    }
    if (Audio) Audio.playUndo();
    aiToken++;  // invalidate any pending AI callback
    resetTurnClock();
    renderAll();
  }

  // ---- New game / restart ------------------------------------------------
  function newGame() {
    aiToken++;  // invalidate any pending AI callback
    stopClock();
    const mode = $('select-mode').value;
    const difficulty = $('select-difficulty').value;
    const playerSelect = $('select-player');
    const playerChoice = playerSelect ? Number(playerSelect.value) : 1;
    const humanPlayer = (playerChoice === 2) ? GS.PLAYER_O : GS.PLAYER_X;
    const aiPlayer = (mode === 'HUMAN_VS_AI' || mode === 'PRACTICE')
      ? (humanPlayer === GS.PLAYER_X ? GS.PLAYER_O : GS.PLAYER_X)
      : null;

    threatRadarEnabled = $('select-threat-radar') ? $('select-threat-radar').value === 'ON' : true;

    state = GS.createInitialState({
      mode: mode,
      aiDifficulty: (mode === 'HUMAN_VS_AI' || mode === 'PRACTICE') ? difficulty : null,
      aiPlayer: aiPlayer,
      humanPlayer: humanPlayer
    });
    undoStack = [];
    replayState = null;
    whatifState = null;
    GE.startGame(state);
    renderScoreLabels();
    renderAll();
    startClock();
    maybeAIMove();
  }

  function startPractice() {
    $('select-mode').value = 'PRACTICE';
    $('select-difficulty').disabled = false;
    if ($('select-player')) $('select-player').disabled = false;
    newGame();
  }

  function restartMatch() {
    confirmDialog('Restart match? This resets the board but keeps score.', function () {
      newGame();
    });
  }

  function resetStats() {
    confirmDialog('Reset all match statistics?', function () {
      stats = { x: 0, o: 0, draw: 0 };
      saveStats();
      renderScore();
    });
  }

  // ---- Move log click (what-if branching) -------------------------------
  function onMoveLogClick(index) {
    // Highlight selected.
    R.renderMoveLog(moveLogEl, state, { onMoveClick: onMoveLogClick, selectedIndex: index });
    // If What-If panel is open, branch from the clicked move.
    if (whatifState) {
      whatifState.baseIndex = index;
      renderWhatIfBranch(index);
      $('whatif-info').textContent = 'Branching after move ' + (index + 1) + '. Click any cell to play an alternate move.';
    }
  }

  // ---- Shape guide -------------------------------------------------------
  function openShapeGuide() {
    const panel = $('shape-guide-panel');
    panel.classList.remove('hidden');
    panel.setAttribute('aria-hidden', 'false');
    $('btn-shape-guide').setAttribute('aria-expanded', 'true');
    R.renderShapeGuide($('shape-guide-grid'), $('shape-guide-detail'), SE, state ? state.boardSize : 6);
  }
  function closeShapeGuide() {
    const panel = $('shape-guide-panel');
    panel.classList.add('hidden');
    panel.setAttribute('aria-hidden', 'true');
    $('btn-shape-guide').setAttribute('aria-expanded', 'false');
  }

  // ---- How to Play -------------------------------------------------------
  function openHowToPlay() {
    const panel = $('how-to-play-panel');
    panel.classList.remove('hidden');
    panel.setAttribute('aria-hidden', 'false');
    $('btn-how-to-play').setAttribute('aria-expanded', 'true');
  }
  function closeHowToPlay() {
    const panel = $('how-to-play-panel');
    panel.classList.add('hidden');
    panel.setAttribute('aria-hidden', 'true');
    $('btn-how-to-play').setAttribute('aria-expanded', 'false');
  }

  // ---- Game Lab ----------------------------------------------------------
  function openGameLab() {
    const panel = $('game-lab-panel');
    panel.classList.remove('hidden');
    panel.setAttribute('aria-hidden', 'false');
    $('btn-game-lab').setAttribute('aria-expanded', 'true');
  }
  function closeGameLab() {
    const panel = $('game-lab-panel');
    panel.classList.add('hidden');
    panel.setAttribute('aria-hidden', 'true');
    $('btn-game-lab').setAttribute('aria-expanded', 'false');
  }
  function applyLab() {
    aiToken++;  // invalidate any pending AI callback
    const size = parseInt($('lab-board-size').value, 10);
    const maxPieces = Math.max(6, parseInt($('lab-max-pieces').value, 10));
    const strategy = $('lab-ai-strategy').value;
    state = GS.createInitialState({
      boardSize: size,
      maxActivePieces: maxPieces,
      mode: 'HUMAN_VS_AI',
      aiDifficulty: strategy
    });
    undoStack = [];
    GE.startGame(state);
    closeGameLab();
    renderAll();
    maybeAIMove();
  }
  function runLabSimulations() {
    let count = parseInt($('lab-sim-count').value, 10);
    if (!Number.isFinite(count)) count = 1000;
    count = Math.max(100, Math.min(10000, Math.floor(count)));
    $('lab-sim-count').value = String(count);
    const out = $('lab-output');
    out.textContent = 'Running ' + count + ' simulations…';
    setTimeout(function () {
      const r = Tests.runRandomGames(count);
      out.textContent = JSON.stringify(r, null, 2);
    }, 10);
  }

  // ---- Replay ------------------------------------------------------------
  function openReplay() {
    if (!state.moveHistory.length) return;
    const panel = $('replay-panel');
    panel.classList.remove('hidden');
    panel.setAttribute('aria-hidden', 'false');
    replayState = { history: state.moveHistory.slice(), index: -1, timer: null };
    renderReplayStep();
  }
  function closeReplay() {
    if (replayState && replayState.timer) { clearInterval(replayState.timer); replayState.timer = null; }
    replayState = null;
    const panel = $('replay-panel');
    panel.classList.add('hidden');
    panel.setAttribute('aria-hidden', 'true');
  }
  function buildReplayBoard(upToIndex) {
    const s = GS.createInitialState({
      boardSize: state.boardSize,
      maxActivePieces: state.maxActivePieces,
      mode: state.mode,
      aiDifficulty: state.aiDifficulty
    });
    GE.startGame(s);
    for (let i = 0; i <= upToIndex && i < replayState.history.length; i++) {
      GE.applyMove(s, replayState.history[i].row, replayState.history[i].col);
    }
    return s;
  }
  function renderReplayStep() {
    if (!replayState) return;
    const idx = replayState.index;
    const replayBoard = $('replay-board');
    if (idx < 0) {
      const s = GS.createInitialState({ boardSize: state.boardSize, maxActivePieces: state.maxActivePieces });
      R.renderBoard(replayBoard, s, { interactive: false });
      $('replay-info').textContent = 'Start — move 0 of ' + replayState.history.length;
      return;
    }
    const s = buildReplayBoard(idx);
    R.renderBoard(replayBoard, s, { interactive: false });
    const m = replayState.history[idx];
    const sym = GS.SYMBOL[m.player];
    let info = 'Move ' + m.turn + ': ' + sym + ' at ' + R.colLetter(m.col) + (m.row + 1);
    if (m.expired) info += ' (expired ' + GS.SYMBOL[m.expired.player] + ')';
    if (m.winInfo) info += ' — WIN with ' + m.winInfo.shape + '!';
    $('replay-info').textContent = info + '  (' + (idx + 1) + '/' + replayState.history.length + ')';
  }
  function replayPrev() {
    if (!replayState) return;
    if (replayState.timer) { clearInterval(replayState.timer); replayState.timer = null; toggleReplayPlayBtn(true); }
    if (replayState.index > -1) { replayState.index--; renderReplayStep(); }
  }
  function replayNext() {
    if (!replayState) return;
    if (replayState.timer) { clearInterval(replayState.timer); replayState.timer = null; toggleReplayPlayBtn(true); }
    if (replayState.index < replayState.history.length - 1) { replayState.index++; renderReplayStep(); }
  }
  function toggleReplayPlayBtn(showPlay) {
    $('replay-play').classList.toggle('hidden', !showPlay);
    $('replay-pause').classList.toggle('hidden', showPlay);
  }
  function replayPlay() {
    if (!replayState) return;
    if (replayState.timer) return;
    toggleReplayPlayBtn(false);
    replayState.timer = setInterval(function () {
      if (replayState.index >= replayState.history.length - 1) {
        clearInterval(replayState.timer); replayState.timer = null; toggleReplayPlayBtn(true);
        return;
      }
      replayState.index++;
      renderReplayStep();
    }, 700);
  }
  function replayPause() {
    if (replayState && replayState.timer) { clearInterval(replayState.timer); replayState.timer = null; }
    toggleReplayPlayBtn(true);
  }
  function replayRestart() {
    if (!replayState) return;
    if (replayState.timer) { clearInterval(replayState.timer); replayState.timer = null; }
    toggleReplayPlayBtn(true);
    replayState.index = -1;
    renderReplayStep();
  }

  // ---- Analyzer ----------------------------------------------------------
  function openAnalyzer() {
    const panel = $('analyzer-panel');
    panel.classList.remove('hidden');
    panel.setAttribute('aria-hidden', 'false');
    const out = $('analyzer-output');
    out.innerHTML = '';
    const moves = state.moveHistory;
    if (!moves.length) { out.textContent = 'No moves to analyze.'; return; }

    moves.forEach(function (m, i) {
      // Rebuild state up to (but not including) this move.
      const before = GS.createInitialState({ boardSize: state.boardSize, maxActivePieces: state.maxActivePieces, mode: state.mode, aiDifficulty: state.aiDifficulty });
      GE.startGame(before);
      for (let j = 0; j < i; j++) GE.applyMove(before, moves[j].row, moves[j].col);

      const player = m.player;
      const opp = player === GS.PLAYER_X ? GS.PLAYER_O : GS.PLAYER_X;

      // Did this move win?
      const wasWin = !!m.winInfo;
      // Was there an alternative winning move available?
      const winMove = AI.findImmediateWin(before, player);
      // Did this move allow opponent an immediate win next? (dangerous)
      // Simulate the move, then check if opp has an immediate win.
      const after = GS.cloneState(before);
      GE.applyMove(after, m.row, m.col);
      const lib = GE.getLibrary(after.boardSize);
      const oppWin = (after.status === GS.STATUS.PLAYING) ? AI.findImmediateWin(after, opp) : null;
      // Did the player miss a win?
      const missedWin = !wasWin && winMove !== null;
      // Was it a good block? (opp had a win threat before, and player blocked it)
      const oppThreatBefore = AI.findImmediateWin(before, opp);
      const blockedThreat = oppThreatBefore && !oppWin && m.row === oppThreatBefore[0] && m.col === oppThreatBefore[1];

      const div = document.createElement('div');
      div.className = 'analyzer-move';
      const head = document.createElement('div');
      head.className = 'am-head';
      head.textContent = 'Turn ' + m.turn + ': ' + GS.SYMBOL[player] + ' at ' + R.colLetter(m.col) + (m.row + 1);
      div.appendChild(head);
      const note = document.createElement('div');
      note.className = 'am-note';
      if (wasWin) {
        note.className = 'am-note good';
        note.textContent = 'Winning move — completed the ' + m.winInfo.shape + ' hexomino.';
      } else if (missedWin) {
        note.className = 'am-note bad';
        note.textContent = 'Missed a winning move at ' + R.colLetter(winMove[1]) + (winMove[0] + 1) + '.';
      } else if (blockedThreat) {
        note.className = 'am-note good';
        note.textContent = 'Strong defensive move — blocked opponent winning threat.';
      } else if (oppWin) {
        note.className = 'am-note bad';
        note.textContent = 'Dangerous move — opponent can now win at ' + R.colLetter(oppWin[1]) + (oppWin[0] + 1) + '.';
      } else if (m.expired) {
        note.className = 'am-note warn';
        note.textContent = 'Caused ' + GS.SYMBOL[m.expired.player] + ' piece at ' + R.colLetter(m.expired.col) + (m.expired.row + 1) + ' to expire.';
      } else {
        // Check potential shape creation: count near-complete shapes for player after move.
        let near = 0;
        const aiSet = new Set(after.activePieces[player].map(function (p) { return p.row + ',' + p.col; }));
        lib.allPlacements.forEach(function (pl) {
          let cnt = 0, blocked = false;
          pl.cells.forEach(function (c) {
            const k = c[0] + ',' + c[1];
            if (aiSet.has(k)) cnt++;
            else if (after.board[c[0]][c[1]] !== 0) blocked = true;
          });
          if (!blocked && cnt === 5) near++;
        });
        if (near > 0) {
          note.className = 'am-note good';
          note.textContent = 'Created ' + near + ' near-complete shape' + (near > 1 ? 's' : '') + ' (5 of 6 cells).';
        } else {
          note.textContent = 'Neutral move.';
        }
      }
      div.appendChild(note);
      out.appendChild(div);
    });
  }
  function closeAnalyzer() {
    const panel = $('analyzer-panel');
    panel.classList.add('hidden');
    panel.setAttribute('aria-hidden', 'true');
  }

  // ---- What-If -----------------------------------------------------------
  function openWhatIf() {
    const panel = $('whatif-panel');
    panel.classList.remove('hidden');
    panel.setAttribute('aria-hidden', 'false');
    // Default: branch from the last move (or start if no moves).
    const baseIndex = state.moveHistory.length - 1;
    whatifState = { baseIndex: baseIndex, branch: null };
    renderWhatIfBranch(baseIndex);
    $('whatif-info').textContent = 'Branching after move ' + (baseIndex + 1) + '. Click any cell to play an alternate move.';
  }
  function closeWhatIf() {
    whatifState = null;
    const panel = $('whatif-panel');
    panel.classList.add('hidden');
    panel.setAttribute('aria-hidden', 'true');
  }
  function renderWhatIfBranch(upToIndex) {
    const s = GS.createInitialState({ boardSize: state.boardSize, maxActivePieces: state.maxActivePieces, mode: 'HUMAN_VS_HUMAN' });
    GE.startGame(s);
    for (let i = 0; i <= upToIndex && i < state.moveHistory.length; i++) {
      GE.applyMove(s, state.moveHistory[i].row, state.moveHistory[i].col);
    }
    whatifState.branch = s;
    R.renderBoard($('whatif-board'), s, {
      interactive: s.status === GS.STATUS.PLAYING,
      onCellClick: onWhatIfCellClick
    });
  }
  function onWhatIfCellClick(row, col) {
    if (!whatifState || !whatifState.branch) return;
    if (whatifState.branch.status !== GS.STATUS.PLAYING) return;
    const res = GE.applyMove(whatifState.branch, row, col);
    if (!res.ok) return;
    R.renderBoard($('whatif-board'), whatifState.branch, {
      interactive: whatifState.branch.status === GS.STATUS.PLAYING,
      onCellClick: onWhatIfCellClick
    });
    if (res.ended) {
      $('whatif-info').textContent = 'Alternate timeline ended: ' + whatifState.branch.status;
    } else {
      $('whatif-info').textContent = 'Alternate move played. Continue exploring.';
    }
  }

  // ---- Confirm dialog ----------------------------------------------------
  let confirmCb = null;
  function confirmDialog(message, onYes) {
    $('confirm-message').textContent = message;
    $('confirm-dialog').classList.remove('hidden');
    confirmCb = onYes;
  }
  function closeConfirm() {
    $('confirm-dialog').classList.add('hidden');
    confirmCb = null;
  }

  // ---- Debug mode --------------------------------------------------------
  function toggleDebug() {
    debugMode = !debugMode;
    debugBtn.setAttribute('aria-pressed', String(debugMode));
    if (debugMode) {
      debugPanel.classList.remove('hidden');
      debugPanel.setAttribute('aria-hidden', 'false');
      debugBtn.classList.remove('hidden');
      renderDebug();
    } else {
      debugPanel.classList.add('hidden');
      debugPanel.setAttribute('aria-hidden', 'true');
    }
  }

  // ---- Chess Clock ------------------------------------------------------

  function startClock() {
    stopClock();
    const select = $('select-clock');
    clockLimit = select && select.value !== 'OFF' ? Number(select.value) : 0;
    const container = $('clock-bar-container');
    if (!clockLimit || state.status !== GS.STATUS.PLAYING) {
      if (container) container.classList.add('hidden');
      return;
    }
    if (container) container.classList.remove('hidden');
    clockRemaining = clockLimit;
    updateClockDisplay();
    clockInterval = setInterval(tickClock, 1000);
  }

  function stopClock() {
    if (clockInterval) { clearInterval(clockInterval); clockInterval = null; }
  }

  function resetTurnClock() {
    if (!clockLimit || state.status !== GS.STATUS.PLAYING) return;
    clockRemaining = clockLimit;
    updateClockDisplay();
  }

  function tickClock() {
    if (state.status !== GS.STATUS.PLAYING) { stopClock(); return; }
    clockRemaining--;
    updateClockDisplay();
    if (clockRemaining <= 3 && clockRemaining > 0 && Audio) {
      Audio.playTick();
    }
    if (clockRemaining <= 0) {
      stopClock();
      state.status = state.currentPlayer === GS.PLAYER_X ? GS.STATUS.O_WON : GS.STATUS.X_WON;
      state.winner = state.currentPlayer === GS.PLAYER_X ? GS.PLAYER_O : GS.PLAYER_X;
      statusEl.textContent = (state.winner === GS.PLAYER_X ? 'Player X' : 'Player O') + ' wins on time!';
      bumpStats();
      renderAll();
    }
  }

  function updateClockDisplay() {
    const fill = $('clock-bar-fill');
    if (!fill || !clockLimit) return;
    const pct = Math.max(0, Math.min(100, (clockRemaining / clockLimit) * 100));
    fill.style.width = pct + '%';
    fill.className = 'clock-bar-fill';
    if (pct <= 25) fill.classList.add('critical');
    else if (pct <= 50) fill.classList.add('warning');
  }

  // ---- Themes ------------------------------------------------------------

  function initTheme() {
    let savedTheme = 'tactical';
    try { savedTheme = localStorage.getItem(THEME_KEY) || 'tactical'; } catch (e) {}
    applyTheme(savedTheme);
    if ($('select-theme')) $('select-theme').value = savedTheme;
  }
  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    try { localStorage.setItem(THEME_KEY, theme); } catch (e) {}
  }

  // ---- Shape Codex -------------------------------------------------------

  function openCodex() {
    const panel = $('codex-panel');
    panel.classList.remove('hidden');
    panel.setAttribute('aria-hidden', 'false');
    R.renderCodex($('codex-grid'), Codex, SE);
  }
  function closeCodex() {
    const panel = $('codex-panel');
    panel.classList.add('hidden');
    panel.setAttribute('aria-hidden', 'true');
  }
  function updateCodexBadge() {
    const badge = $('codex-badge');
    if (badge && Codex) badge.textContent = '(' + Codex.getUnlockedCount() + '/35)';
  }

  // ---- Daily Puzzle ------------------------------------------------------

  function openDailyPuzzle() {
    const panel = $('daily-puzzle-panel');
    panel.classList.remove('hidden');
    panel.setAttribute('aria-hidden', 'false');
    loadDailyPuzzle();
  }
  function closeDailyPuzzle() {
    const panel = $('daily-puzzle-panel');
    panel.classList.add('hidden');
    panel.setAttribute('aria-hidden', 'true');
  }
  function loadDailyPuzzle() {
    if (!DailyPuzzle) return;
    activePuzzle = DailyPuzzle.generateDailyPuzzle(SE);
    const title = $('daily-puzzle-title');
    const desc = $('daily-puzzle-desc');
    const status = $('daily-puzzle-status');
    const shareBtn = $('btn-daily-share');
    if (title) title.textContent = 'Daily Puzzle (' + activePuzzle.dateKey + ')';
    if (desc) desc.textContent = 'Target: ' + activePuzzle.shapeName + '. Click the winning square for X!';
    if (status) {
      if (activePuzzle.isSolved) {
        status.className = 'daily-banner success';
        status.textContent = 'Already solved today! Streak: ' + activePuzzle.streak + ' 🔥';
        status.classList.remove('hidden');
        if (shareBtn) shareBtn.classList.remove('hidden');
      } else {
        status.classList.add('hidden');
        if (shareBtn) shareBtn.classList.add('hidden');
      }
    }
    R.renderDailyPuzzle($('daily-puzzle-board'), activePuzzle, onDailyCellClick);
  }
  function onDailyCellClick(r, c) {
    if (!activePuzzle) return;
    const isWin = r === activePuzzle.winningMove[0] && c === activePuzzle.winningMove[1];
    const status = $('daily-puzzle-status');
    const shareBtn = $('btn-daily-share');
    if (isWin) {
      const streak = DailyPuzzle.markSolved(activePuzzle.dateKey);
      activePuzzle.isSolved = true;
      activePuzzle.streak = streak;
      if (status) {
        status.className = 'daily-banner success';
        status.textContent = 'Solved in 1 move! ' + activePuzzle.shapeName + ' formed! Streak: ' + streak + ' 🔥';
        status.classList.remove('hidden');
      }
      if (shareBtn) shareBtn.classList.remove('hidden');
      if (Audio) Audio.playWin();
      R.spawnVictoryParticles($('daily-puzzle-board'));
    } else {
      if (status) {
        status.className = 'daily-banner error';
        status.textContent = 'Not quite! That does not complete ' + activePuzzle.shapeName + '. Try another cell.';
        status.classList.remove('hidden');
      }
      if (Audio) Audio.playUndo();
    }
  }

  // ---- PGN Notation Export / Import --------------------------------------

  function openExportGame() {
    const dialog = $('notation-dialog');
    const title = $('notation-dialog-title');
    const text = $('notation-text');
    const copyBtn = $('btn-notation-copy');
    const applyBtn = $('btn-notation-apply');
    if (!dialog || !text) return;
    title.textContent = 'Export Game PGN';
    text.value = Notation ? Notation.exportGame(state) : '';
    text.readOnly = true;
    copyBtn.classList.remove('hidden');
    applyBtn.classList.add('hidden');
    dialog.classList.remove('hidden');
  }

  function openImportGame() {
    const dialog = $('notation-dialog');
    const title = $('notation-dialog-title');
    const text = $('notation-text');
    const copyBtn = $('btn-notation-copy');
    const applyBtn = $('btn-notation-apply');
    if (!dialog || !text) return;
    title.textContent = 'Import Game Notation';
    text.value = '';
    text.readOnly = false;
    text.placeholder = 'Paste PGN or algebraic move notation (e.g. 1. C3 D4 2. C4 E4...)';
    copyBtn.classList.add('hidden');
    applyBtn.classList.remove('hidden');
    dialog.classList.remove('hidden');
  }

  function closeNotationDialog() {
    const dialog = $('notation-dialog');
    if (dialog) dialog.classList.add('hidden');
  }

  function applyImportedGame() {
    if (!Notation) return;
    const text = $('notation-text').value;
    const moves = Notation.parseMoves(text);
    if (!moves.length) {
      alert('No valid moves found in notation.');
      return;
    }
    closeNotationDialog();
    state = GS.createInitialState({ boardSize: 6, maxActivePieces: 6, mode: 'HUMAN_VS_HUMAN' });
    GE.startGame(state);
    for (let i = 0; i < moves.length; i++) {
      if (state.status === GS.STATUS.PLAYING) {
        GE.applyMove(state, moves[i][0], moves[i][1]);
      }
    }
    renderAll();
    openReplay();
  }

  // ---- Mode/difficulty change -------------------------------------------
  function onModeChange() {
    const mode = $('select-mode').value;
    const isHumanVsHuman = mode === 'HUMAN_VS_HUMAN';
    $('select-difficulty').disabled = isHumanVsHuman;
    if ($('select-player')) {
      $('select-player').disabled = isHumanVsHuman;
    }
    renderScoreLabels();
  }

  // ---- Wire events -------------------------------------------------------
  function wire() {
    $('btn-new-game').addEventListener('click', newGame);
    $('btn-restart').addEventListener('click', restartMatch);
    $('btn-undo').addEventListener('click', doUndo);
    $('btn-reset-stats').addEventListener('click', resetStats);
    $('select-mode').addEventListener('change', onModeChange);
    if ($('select-player')) {
      $('select-player').addEventListener('change', function () {
        newGame();
      });
    }
    if ($('select-threat-radar')) {
      $('select-threat-radar').addEventListener('change', function () {
        threatRadarEnabled = this.value === 'ON';
        renderAll();
      });
    }
    if ($('select-clock')) {
      $('select-clock').addEventListener('change', function () {
        startClock();
      });
    }
    if ($('select-theme')) {
      $('select-theme').addEventListener('change', function () {
        applyTheme(this.value);
      });
    }

    const soundBtn = $('btn-sound');
    if (soundBtn && Audio) {
      soundBtn.textContent = Audio.isMuted() ? '🔇 Muted' : '🔊 Sound';
      soundBtn.setAttribute('aria-pressed', String(!Audio.isMuted()));
      soundBtn.addEventListener('click', function () {
        const muted = Audio.toggleMute();
        soundBtn.textContent = muted ? '🔇 Muted' : '🔊 Sound';
        soundBtn.setAttribute('aria-pressed', String(!muted));
        if (!muted) Audio.playClick();
      });
    }

    $('btn-how-to-play').addEventListener('click', openHowToPlay);
    $('btn-close-how-to-play').addEventListener('click', closeHowToPlay);
    $('btn-practice').addEventListener('click', startPractice);

    $('btn-shape-guide').addEventListener('click', openShapeGuide);
    $('btn-close-shape-guide').addEventListener('click', closeShapeGuide);

    $('btn-codex').addEventListener('click', openCodex);
    $('btn-close-codex').addEventListener('click', closeCodex);

    $('btn-daily').addEventListener('click', openDailyPuzzle);
    $('btn-close-daily').addEventListener('click', closeDailyPuzzle);
    $('btn-daily-reset').addEventListener('click', loadDailyPuzzle);
    $('btn-daily-share').addEventListener('click', function () {
      if (activePuzzle && DailyPuzzle) {
        const text = DailyPuzzle.generateShareCard(activePuzzle, 1);
        if (navigator.clipboard) {
          navigator.clipboard.writeText(text).then(function () {
            alert('Daily Puzzle result copied to clipboard! Ready to paste into chat.');
          }).catch(function () {});
        }
      }
    });

    $('btn-export-game').addEventListener('click', openExportGame);
    $('btn-import-game').addEventListener('click', openImportGame);
    $('btn-notation-close').addEventListener('click', closeNotationDialog);
    $('btn-notation-copy').addEventListener('click', function () {
      const text = $('notation-text').value;
      if (navigator.clipboard) {
        navigator.clipboard.writeText(text).then(function () {
          alert('PGN notation copied to clipboard!');
        }).catch(function () {});
      }
    });
    $('btn-notation-apply').addEventListener('click', applyImportedGame);

    $('btn-game-lab').addEventListener('click', openGameLab);
    $('btn-close-game-lab').addEventListener('click', closeGameLab);
    $('btn-lab-apply').addEventListener('click', applyLab);
    $('btn-lab-simulate').addEventListener('click', runLabSimulations);

    $('btn-replay').addEventListener('click', openReplay);
    $('btn-close-replay').addEventListener('click', closeReplay);
    $('replay-prev').addEventListener('click', replayPrev);
    $('replay-next').addEventListener('click', replayNext);
    $('replay-play').addEventListener('click', replayPlay);
    $('replay-pause').addEventListener('click', replayPause);
    $('replay-restart').addEventListener('click', replayRestart);

    $('btn-analyze').addEventListener('click', openAnalyzer);
    $('btn-close-analyzer').addEventListener('click', closeAnalyzer);

    $('btn-whatif').addEventListener('click', openWhatIf);
    $('btn-close-whatif').addEventListener('click', closeWhatIf);
    $('whatif-back').addEventListener('click', function () {
      if (whatifState) renderWhatIfBranch(whatifState.baseIndex);
      $('whatif-info').textContent = 'Reverted to original branch point.';
    });

    $('btn-debug').addEventListener('click', toggleDebug);
    $('confirm-yes').addEventListener('click', function () { const cb = confirmCb; closeConfirm(); if (cb) cb(); });
    $('confirm-no').addEventListener('click', closeConfirm);

    // Keyboard: Escape closes overlays.
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        closeHowToPlay(); closeShapeGuide(); closeCodex(); closeDailyPuzzle(); closeNotationDialog();
        closeGameLab(); closeReplay(); closeAnalyzer(); closeWhatIf(); closeConfirm();
      }
    });
  }

  // ---- Boot --------------------------------------------------------------
  function boot() {
    initTheme();
    wire();
    renderScore();
    onModeChange();
    updateCodexBadge();
    if (debugMode) {
      debugBtn.classList.remove('hidden');
      debugPanel.classList.remove('hidden');
      debugBtn.setAttribute('aria-pressed', 'true');
    }
    // Validate shape library at startup (dev error if it fails).
    try {
      const v = SE.validateLibrary();
      console.log('ShapeBound: ' + v.count + ' unique hexominoes detected.');
    } catch (e) {
      console.error('Shape library validation FAILED: ' + e.message);
    }
    newGame();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
