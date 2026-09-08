/**
 * ShapeBound — Game State
 *
 * Canonical, serializable game state. Pure data — no DOM, no functions.
 * This is the single source of truth for the engine, AI, undo, replay,
 * what-if, and the analyzer.
 *
 * State shape:
 * {
 *   boardSize: number,
 *   maxActivePieces: number,
 *   board: number[][],            // 0 empty, 1 = X, 2 = O
 *   activePieces: { 1: Piece[], 2: Piece[] },  // ordered oldest->newest
 *   currentPlayer: 1 | 2,
 *   turn: number,                 // 1-based move counter
 *   status: 'READY'|'PLAYING'|'X_WON'|'O_WON'|'DRAW',
 *   winner: null | 1 | 2,
 *   winInfo: null | { shape, cells, orientation },
 *   moveHistory: Move[],          // full move log for replay/undo/analyze
 *   stateHistory: string[],       // canonical state hashes for draw detection
 *   mode: 'HUMAN_VS_HUMAN'|'HUMAN_VS_AI',
 *   aiDifficulty: 'EASY'|'NORMAL'|'HARD'|null,
 *   aiPlayer: 2,                  // AI is always O in HUMAN_VS_AI
 *   maxTurns: number              // hard draw cap
 * }
 *
 * Piece: { player, row, col, createdTurn, sequence }
 * Move:  { player, row, col, turn, expired: Piece|null, winInfo }
 */

(function (global) {
  'use strict';

  const PLAYER_X = 1;
  const PLAYER_O = 2;
  const SYMBOL = { 1: 'X', 2: 'O' };
  const STATUS = {
    READY: 'READY',
    PLAYING: 'PLAYING',
    X_WON: 'X_WON',
    O_WON: 'O_WON',
    DRAW: 'DRAW'
  };

  const DEFAULTS = {
    boardSize: 6,
    maxActivePieces: 6,
    maxTurns: 200,           // deterministic draw cap
    repeatDrawThreshold: 3   // same canonical state N times => draw
  };

  function emptyBoard(size) {
    const b = [];
    for (let r = 0; r < size; r++) {
      const row = [];
      for (let c = 0; c < size; c++) row.push(0);
      b.push(row);
    }
    return b;
  }

  /**
   * Create a fresh state. Options override DEFAULTS.
   */
  function createInitialState(options) {
    options = options || {};
    const boardSize = options.boardSize || DEFAULTS.boardSize;
    const maxActivePieces = options.maxActivePieces || DEFAULTS.maxActivePieces;
    if (maxActivePieces < 6) {
      throw new Error('maxActivePieces must be >= 6 to allow a 6-cell win');
    }
    const state = {
      boardSize: boardSize,
      maxActivePieces: maxActivePieces,
      board: emptyBoard(boardSize),
      activePieces: { 1: [], 2: [] },
      currentPlayer: PLAYER_X,
      turn: 0,
      status: STATUS.READY,
      winner: null,
      winInfo: null,
      moveHistory: [],
      stateHistory: [],
      mode: options.mode || 'HUMAN_VS_HUMAN',
      aiDifficulty: options.aiDifficulty || null,
      aiPlayer: (options.mode === 'HUMAN_VS_AI' || options.mode === 'PRACTICE') ? PLAYER_O : null,
      maxTurns: options.maxTurns || DEFAULTS.maxTurns,
      repeatDrawThreshold: options.repeatDrawThreshold || DEFAULTS.repeatDrawThreshold
    };
    return state;
  }

  /**
   * Deep clone a state (structured clone of plain data).
   */
  function cloneState(state) {
    return {
      boardSize: state.boardSize,
      maxActivePieces: state.maxActivePieces,
      board: state.board.map(function (row) { return row.slice(); }),
      activePieces: {
        1: state.activePieces[1].map(function (p) { return { player: p.player, row: p.row, col: p.col, createdTurn: p.createdTurn, sequence: p.sequence }; }),
        2: state.activePieces[2].map(function (p) { return { player: p.player, row: p.row, col: p.col, createdTurn: p.createdTurn, sequence: p.sequence }; })
      },
      currentPlayer: state.currentPlayer,
      turn: state.turn,
      status: state.status,
      winner: state.winner,
      winInfo: state.winInfo ? { shape: state.winInfo.shape, cells: state.winInfo.cells.map(function (c) { return c.slice(); }), orientation: state.winInfo.orientation } : null,
      moveHistory: state.moveHistory.map(function (m) { return cloneMove(m); }),
      stateHistory: state.stateHistory.slice(),
      mode: state.mode,
      aiDifficulty: state.aiDifficulty,
      aiPlayer: state.aiPlayer,
      maxTurns: state.maxTurns,
      repeatDrawThreshold: state.repeatDrawThreshold
    };
  }

  function cloneMove(m) {
    return {
      player: m.player,
      row: m.row,
      col: m.col,
      turn: m.turn,
      expired: m.expired ? { player: m.expired.player, row: m.expired.row, col: m.expired.col, createdTurn: m.expired.createdTurn, sequence: m.expired.sequence } : null,
      winInfo: m.winInfo ? { shape: m.winInfo.shape, cells: m.winInfo.cells.map(function (c) { return c.slice(); }), orientation: m.winInfo.orientation } : null
    };
  }

  /**
   * Canonical hash of the strategic state for draw detection.
   * Includes board + whose turn it is (turn parity is implied by piece counts).
   */
  function canonicalHash(state) {
    const parts = [];
    for (let r = 0; r < state.boardSize; r++) {
      parts.push(state.board[r].join(''));
    }
    parts.push('P' + state.currentPlayer);
    return parts.join('/');
  }

  /**
   * Get all cells occupied by a player (derived from activePieces, which is
   * always consistent with the board).
   */
  function occupiedCells(state, player) {
    return state.activePieces[player].map(function (p) { return [p.row, p.col]; });
  }

  /**
   * Snapshot for undo: returns a deep clone suitable for pushing onto a stack.
   */
  function snapshot(state) {
    return cloneState(state);
  }

  const GameState = {
    PLAYER_X: PLAYER_X,
    PLAYER_O: PLAYER_O,
    SYMBOL: SYMBOL,
    STATUS: STATUS,
    DEFAULTS: DEFAULTS,
    createInitialState: createInitialState,
    cloneState: cloneState,
    cloneMove: cloneMove,
    canonicalHash: canonicalHash,
    occupiedCells: occupiedCells,
    snapshot: snapshot,
    emptyBoard: emptyBoard
  };

  global.GameState = GameState;
})(typeof window !== 'undefined' ? window : globalThis);
