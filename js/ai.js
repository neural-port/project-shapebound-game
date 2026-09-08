/**
 * ShapeBound — AI
 *
 * Real game-playing AI using minimax + alpha-beta pruning. No external APIs.
 * The AI obeys exactly the same rules as the human (uses GameEngine.applyMove).
 *
 * Evaluation considers:
 *   - immediate win / immediate loss
 *   - near-complete shapes (4/5 cells, 5th empty) — strong
 *   - potential shapes (3/5 cells, rest empty)
 *   - central control
 *   - threat creation / opponent threat suppression
 *
 * Difficulty:
 *   EASY:   depth 1, 20% random move (may blunder)
 *   NORMAL: depth 2
 *   HARD:   depth 3 with alpha-beta
 *
 * Async entry point chooseMoveAsync(state, difficulty, cb) avoids freezing UI.
 */

(function (global) {
  'use strict';

  const GameState = global.GameState;
  const GameEngine = global.GameEngine;
  const ShapeEngine = global.ShapeEngine;

  const DIFFICULTY = {
    EASY: { depth: 1, randomness: 0.20, alphaBeta: false },
    NORMAL: { depth: 2, randomness: 0.0, alphaBeta: true },
    HARD: { depth: 3, randomness: 0.0, alphaBeta: true }
  };

  const WIN_SCORE = 1000000;
  const NEAR_SCORE = 5000;     // 5/6 cells, 6th empty
  const POTENTIAL_SCORE = 200; // 4/6 cells, rest empty
  const CENTER_WEIGHT = 30;

  // ---- Evaluation --------------------------------------------------------

  /**
   * Evaluate the board from the perspective of `aiPlayer`.
   * Positive = good for AI, negative = good for opponent.
   */
  function evaluateBoard(state, aiPlayer) {
    const library = GameEngine.getLibrary(state.boardSize);
    const opp = aiPlayer === GameState.PLAYER_X ? GameState.PLAYER_O : GameState.PLAYER_X;

    // Fast occupancy sets.
    const aiSet = new Set(state.activePieces[aiPlayer].map(function (p) { return p.row + ',' + p.col; }));
    const oppSet = new Set(state.activePieces[opp].map(function (p) { return p.row + ',' + p.col; }));

    let score = 0;
    const placements = library.allPlacements;

    for (let i = 0; i < placements.length; i++) {
      const cells = placements[i].cells;
      let aiCount = 0, oppCount = 0;
      for (let j = 0; j < cells.length; j++) {
        const k = cells[j][0] + ',' + cells[j][1];
        if (aiSet.has(k)) aiCount++;
        else if (oppSet.has(k)) oppCount++;
      }
      // A placement is "live" for a player if opponent has 0 cells in it.
      if (oppCount === 0 && aiCount > 0) {
        if (aiCount === 6) score += WIN_SCORE;
        else if (aiCount === 5) score += NEAR_SCORE;
        else if (aiCount === 4) score += POTENTIAL_SCORE;
        else if (aiCount === 3) score += 50;
        else if (aiCount === 2) score += 20;
        else if (aiCount === 1) score += 5;
      } else if (aiCount === 0 && oppCount > 0) {
        if (oppCount === 6) score -= WIN_SCORE;
        else if (oppCount === 5) score -= NEAR_SCORE;
        else if (oppCount === 4) score -= POTENTIAL_SCORE;
        else if (oppCount === 3) score -= 50;
        else if (oppCount === 2) score -= 20;
        else if (oppCount === 1) score -= 5;
      }
    }

    // Central control: center cell (2,2) on 5x5, plus the 4 adjacent.
    const center = Math.floor(state.boardSize / 2);
    for (let r = 0; r < state.boardSize; r++) {
      for (let c = 0; c < state.boardSize; c++) {
        const dist = Math.abs(r - center) + Math.abs(c - center);
        const cellScore = Math.max(0, CENTER_WEIGHT - dist * 8);
        const v = state.board[r][c];
        if (v === aiPlayer) score += cellScore;
        else if (v === opp) score -= cellScore;
      }
    }

    return score;
  }

  // ---- Move generation with light ordering -------------------------------

  function orderedMoves(state) {
    const moves = GameEngine.getLegalMoves(state);
    const center = Math.floor(state.boardSize / 2);
    // Order by distance to center (helps alpha-beta pruning).
    moves.sort(function (a, b) {
      const da = Math.abs(a[0] - center) + Math.abs(a[1] - center);
      const db = Math.abs(b[0] - center) + Math.abs(b[1] - center);
      return da - db;
    });
    return moves;
  }

  // ---- Minimax with alpha-beta -------------------------------------------

  function minimax(state, depth, alpha, beta, maximizing, aiPlayer, useAlphaBeta) {
    if (state.status === GameState.STATUS.X_WON || state.status === GameState.STATUS.O_WON) {
      const won = state.winner === aiPlayer ? WIN_SCORE - (10 - depth) : -WIN_SCORE + (10 - depth);
      return won;
    }
    if (state.status === GameState.STATUS.DRAW) return 0;
    if (depth === 0) return evaluateBoard(state, aiPlayer);

    const moves = orderedMoves(state);
    if (moves.length === 0) return evaluateBoard(state, aiPlayer);

    if (maximizing) {
      let best = -Infinity;
      for (let i = 0; i < moves.length; i++) {
        const snap = GameState.snapshot(state);
        GameEngine.applyMove(state, moves[i][0], moves[i][1]);
        const val = minimax(state, depth - 1, alpha, beta, false, aiPlayer, useAlphaBeta);
        // restore
        restoreFromSnapshot(state, snap);
        if (val > best) best = val;
        if (useAlphaBeta) {
          if (best > alpha) alpha = best;
          if (beta <= alpha) break;
        }
      }
      return best;
    } else {
      let best = Infinity;
      for (let i = 0; i < moves.length; i++) {
        const snap = GameState.snapshot(state);
        GameEngine.applyMove(state, moves[i][0], moves[i][1]);
        const val = minimax(state, depth - 1, alpha, beta, true, aiPlayer, useAlphaBeta);
        restoreFromSnapshot(state, snap);
        if (val < best) best = val;
        if (useAlphaBeta) {
          if (best < beta) beta = best;
          if (beta <= alpha) break;
        }
      }
      return best;
    }
  }

  function restoreFromSnapshot(state, snap) {
    state.boardSize = snap.boardSize;
    state.maxActivePieces = snap.maxActivePieces;
    state.board = snap.board;
    state.activePieces = snap.activePieces;
    state.currentPlayer = snap.currentPlayer;
    state.turn = snap.turn;
    state.status = snap.status;
    state.winner = snap.winner;
    state.winInfo = snap.winInfo;
    state.moveHistory = snap.moveHistory;
    state.stateHistory = snap.stateHistory;
  }

  // ---- Immediate win / block detection (fast path) -----------------------

  function findImmediateWin(state, player) {
    const moves = GameEngine.getLegalMoves(state);
    for (let i = 0; i < moves.length; i++) {
      const snap = GameState.snapshot(state);
      // Temporarily set current player to `player` for the test.
      state.currentPlayer = player;
      const res = GameEngine.applyMove(state, moves[i][0], moves[i][1]);
      const won = res.ok && res.winInfo && res.winInfo.won;
      restoreFromSnapshot(state, snap);
      if (won) return moves[i];
    }
    return null;
  }

  // ---- Top-level move selection ------------------------------------------

  function chooseMove(state, difficulty) {
    const cfg = DIFFICULTY[difficulty] || DIFFICULTY.NORMAL;
    const aiPlayer = state.currentPlayer;
    const opp = aiPlayer === GameState.PLAYER_X ? GameState.PLAYER_O : GameState.PLAYER_X;

    // 1. Immediate win.
    const winMove = findImmediateWin(state, aiPlayer);
    if (winMove) return winMove;

    // 2. Block opponent immediate win.
    const blockMove = findImmediateWin(state, opp);
    if (blockMove) return blockMove;

    const moves = orderedMoves(state);
    if (moves.length === 0) return null;

    // 3. Easy randomness.
    if (cfg.randomness > 0 && Math.random() < cfg.randomness) {
      return moves[Math.floor(Math.random() * moves.length)];
    }

    // 4. Minimax.
    let bestMove = moves[0];
    let bestVal = -Infinity;
    let alpha = -Infinity, beta = Infinity;

    for (let i = 0; i < moves.length; i++) {
      const snap = GameState.snapshot(state);
      GameEngine.applyMove(state, moves[i][0], moves[i][1]);
      const val = minimax(state, cfg.depth - 1, alpha, beta, false, aiPlayer, cfg.alphaBeta);
      restoreFromSnapshot(state, snap);
      if (val > bestVal) {
        bestVal = val;
        bestMove = moves[i];
      }
      if (cfg.alphaBeta) {
        if (bestVal > alpha) alpha = bestVal;
      }
    }
    return bestMove;
  }

  /**
   * Async wrapper — runs the search in a setTimeout so the UI can update.
   * Calls callback(move) where move is [r,c] or null.
   * Delay is randomized between 500–1000ms so the AI feels like it's thinking.
   */
  function chooseMoveAsync(state, difficulty, callback) {
    const delay = 500 + Math.floor(Math.random() * 501); // 500–1000ms
    setTimeout(function () {
      let move = null, err = null;
      try {
        // Work on a clone so the original state is untouched.
        const clone = GameState.cloneState(state);
        move = chooseMove(clone, difficulty);
      } catch (e) {
        err = e;
      }
      callback(err, move);
    }, delay);
  }

  const AI = {
    DIFFICULTY: DIFFICULTY,
    evaluateBoard: evaluateBoard,
    chooseMove: chooseMove,
    chooseMoveAsync: chooseMoveAsync,
    findImmediateWin: findImmediateWin
  };

  global.AI = AI;
})(typeof window !== 'undefined' ? window : globalThis);
