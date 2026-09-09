/**
 * ShapeBound — Game Engine
 *
 * Pure, DOM-free engine that mutates GameState according to the rules.
 * Critical ordering: win detection BEFORE piece expiration.
 *
 * Public API:
 *   startGame(state)
 *   applyMove(state, row, col)            -> { ok, winInfo, expired }
 *   getLegalMoves(state)                  -> [[r,c], ...]
 *   isLegalMove(state, row, col)
 *   undo(state, undoStack)                -> boolean (pops one ply)
 *   checkDraw(state)                      -> boolean
 *   currentSymbol(state)
 */

(function (global) {
  'use strict';

  const GameState = global.GameState;
  const ShapeEngine = global.ShapeEngine;
  const STATUS = GameState.STATUS;

  // Library cache keyed by board size.
  const libraryCache = {};
  function getLibrary(size) {
    if (!libraryCache[size]) libraryCache[size] = ShapeEngine.buildLibrary(size);
    return libraryCache[size];
  }

  function startGame(state) {
    if (state.status !== STATUS.READY) {
      throw new Error('Game can only start from READY state');
    }
    state.status = STATUS.PLAYING;
  }

  function currentSymbol(state) {
    return GameState.SYMBOL[state.currentPlayer];
  }

  function isLegalMove(state, row, col) {
    if (state.status !== STATUS.PLAYING) return false;
    if (row < 0 || row >= state.boardSize || col < 0 || col >= state.boardSize) return false;
    return state.board[row][col] === 0;
  }

  function getLegalMoves(state) {
    if (state.status !== STATUS.PLAYING) return [];
    const moves = [];
    for (let r = 0; r < state.boardSize; r++) {
      for (let c = 0; c < state.boardSize; c++) {
        if (state.board[r][c] === 0) moves.push([r, c]);
      }
    }
    return moves;
  }

  /**
   * Apply a move for the current player at (row, col).
   * Order of operations (per spec section 9):
   *   1. Validate.
   *   2. Place the piece on the board + activePieces.
   *   3. Check win using the FULL board (including the new piece, before
   *      any expiration). If win -> end game, record move, return.
   *   4. If no win, expire oldest piece if active count exceeds limit.
   *   5. Check draw (repeat states / turn cap).
   *   6. Switch player, increment turn.
   *
   * Returns { ok:true, winInfo, expired } or { ok:false, reason }.
   */
  function applyMove(state, row, col) {
    if (!isLegalMove(state, row, col)) {
      return { ok: false, reason: 'illegal-move' };
    }
    const player = state.currentPlayer;
    const library = getLibrary(state.boardSize);

    // 1. Place piece.
    state.board[row][col] = player;
    const seq = state.activePieces[player].length + 1;
    const piece = {
      player: player,
      row: row,
      col: col,
      createdTurn: state.turn + 1,
      sequence: seq
    };
    state.activePieces[player].push(piece);

    // 2. Win check (before expiration).
    const occupied = GameState.occupiedCells(state, player);
    const winInfo = ShapeEngine.checkWinAt(library, occupied, [row, col]);

    let expired = null;

    if (winInfo.won) {
      state.status = player === GameState.PLAYER_X ? STATUS.X_WON : STATUS.O_WON;
      state.winner = player;
      state.winInfo = winInfo;
      state.moveHistory.push({
        player: player, row: row, col: col, turn: state.turn + 1,
        expired: null, winInfo: winInfo
      });
      state.turn += 1;
      return { ok: true, winInfo: winInfo, expired: null, ended: true };
    }

    // 3. Expiration: if active count > limit, remove oldest.
    if (state.activePieces[player].length > state.maxActivePieces) {
      expired = state.activePieces[player].shift();
      state.board[expired.row][expired.col] = 0;
    }

    // Record move.
    state.moveHistory.push({
      player: player, row: row, col: col, turn: state.turn + 1,
      expired: expired, winInfo: null
    });
    state.turn += 1;

    // 4. Draw detection.
    if (checkDraw(state)) {
      state.status = STATUS.DRAW;
      state.winner = null;
      state.winInfo = null;
      return { ok: true, winInfo: null, expired: expired, ended: true, draw: true };
    }

    // 5. Switch player.
    state.currentPlayer = player === GameState.PLAYER_X ? GameState.PLAYER_O : GameState.PLAYER_X;
    return { ok: true, winInfo: null, expired: expired, ended: false };
  }

  /**
   * Draw detection: deterministic. Two independent triggers:
   *   a) Turn cap reached (maxTurns).
   *   b) Same canonical strategic state seen >= repeatDrawThreshold times.
   */
  function checkDraw(state) {
    if (state.turn >= state.maxTurns) return true;
    const hash = GameState.canonicalHash(state);
    state.stateHistory.push(hash);
    let count = 0;
    for (let i = 0; i < state.stateHistory.length; i++) {
      if (state.stateHistory[i] === hash) count++;
    }
    return count >= state.repeatDrawThreshold;
  }

  /**
   * Undo one ply. In AI mode the caller pops twice (human + AI) — but this
   * function pops exactly one ply from moveHistory and restores state by
   * replaying from a snapshot. The caller is responsible for providing the
   * snapshot stack.
   *
   * undoStack: array of snapshots taken BEFORE each move was applied.
   */
  function undo(state, undoStack) {
    if (!undoStack.length) return false;
    const snap = undoStack.pop();
    // Restore by reference replacement of fields (keep object identity).
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
    state.mode = snap.mode;
    state.aiDifficulty = snap.aiDifficulty;
    state.aiPlayer = snap.aiPlayer;
    state.humanPlayer = snap.humanPlayer;
    state.maxTurns = snap.maxTurns;
    state.repeatDrawThreshold = snap.repeatDrawThreshold;
    return true;
  }

  /**
   * Convenience: full reset to a fresh state preserving mode/config.
   */
  function resetMatch(state) {
    const fresh = GameState.createInitialState({
      boardSize: state.boardSize,
      maxActivePieces: state.maxActivePieces,
      mode: state.mode,
      aiDifficulty: state.aiDifficulty,
      maxTurns: state.maxTurns,
      repeatDrawThreshold: state.repeatDrawThreshold
    });
    return fresh;
  }

  const GameEngine = {
    getLibrary: getLibrary,
    startGame: startGame,
    currentSymbol: currentSymbol,
    isLegalMove: isLegalMove,
    getLegalMoves: getLegalMoves,
    applyMove: applyMove,
    checkDraw: checkDraw,
    undo: undo,
    resetMatch: resetMatch
  };

  global.GameEngine = GameEngine;
})(typeof window !== 'undefined' ? window : globalThis);
