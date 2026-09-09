/**
 * ShapeBound — Algebraic Game Notation Engine
 *
 * PGN-style portable notation for ShapeBound.
 * Formats coordinates into standard algebraic notation (A1–F6),
 * annotates piece expirations, and tags winning hexominoes.
 * Enables exporting and importing games for replay and study.
 */

(function (global) {
  'use strict';

  function cellToAlgebraic(row, col) {
    const colLetter = String.fromCharCode(65 + col);
    const rowNumber = row + 1;
    return colLetter + rowNumber;
  }

  function algebraicToCell(str) {
    if (!str || str.length < 2) return null;
    const clean = str.trim().toUpperCase();
    const col = clean.charCodeAt(0) - 65;
    const row = parseInt(clean.charAt(1), 10) - 1;
    if (col < 0 || col > 7 || row < 0 || row > 7 || isNaN(row)) return null;
    return [row, col];
  }

  /**
   * Export a GameState to full algebraic notation.
   */
  function exportGame(state) {
    if (!state || !state.moveHistory) return '';

    const dateStr = new Date().toISOString().split('T')[0];
    const headers = [
      '[Game "ShapeBound"]',
      '[Date "' + dateStr + '"]',
      '[Board "' + state.boardSize + 'x' + state.boardSize + '"]',
      '[Mode "' + (state.mode || 'HUMAN_VS_AI') + '"]',
      '[Result "' + (state.status === 'X_WON' ? '1-0' : state.status === 'O_WON' ? '0-1' : state.status === 'DRAW' ? '1/2-1/2' : '*') + '"]'
    ];

    if (state.winInfo && state.winInfo.shape) {
      headers.push('[WinShape "' + state.winInfo.shape + '"]');
    }

    const moveLines = [];
    const moves = state.moveHistory;
    let turnNum = 1;

    for (let i = 0; i < moves.length; i += 2) {
      const m1 = moves[i];
      const m2 = moves[i + 1] || null;

      let line = turnNum + '. ';
      line += cellToAlgebraic(m1.row, m1.col);
      if (m1.expired) line += 'e';
      if (m1.winInfo) line += '#' + m1.winInfo.shape;

      if (m2) {
        line += ' ' + cellToAlgebraic(m2.row, m2.col);
        if (m2.expired) line += 'e';
        if (m2.winInfo) line += '#' + m2.winInfo.shape;
      }

      moveLines.push(line);
      turnNum++;
    }

    let resultTag = '*';
    if (state.status === 'X_WON') resultTag = '1-0';
    else if (state.status === 'O_WON') resultTag = '0-1';
    else if (state.status === 'DRAW') resultTag = '1/2-1/2';

    return headers.join('\n') + '\n\n' + moveLines.join(' ') + ' ' + resultTag;
  }

  /**
   * Parse an algebraic notation string back into an array of moves: [[r, c], ...]
   */
  function parseMoves(notationText) {
    if (!notationText) return [];
    // Remove headers enclosed in [ ... ]
    const cleanText = notationText.replace(/\[.*?\]/g, ' ');
    // Match tokens like A1, C3, F6, C4e, B2#H04
    const tokens = cleanText.split(/\s+/);
    const moves = [];

    for (let i = 0; i < tokens.length; i++) {
      let t = tokens[i].trim();
      // Skip turn numbers (e.g. "1.", "12.") and results
      if (!t || /^\d+\.?$/.test(t) || t === '1-0' || t === '0-1' || t === '1/2-1/2' || t === '*') continue;

      // Extract coordinates (first 2 chars: e.g. "C3")
      const match = t.match(/^([A-Fa-f][1-8])/);
      if (match) {
        const cell = algebraicToCell(match[1]);
        if (cell) moves.push(cell);
      }
    }

    return moves;
  }

  const Notation = {
    cellToAlgebraic: cellToAlgebraic,
    algebraicToCell: algebraicToCell,
    exportGame: exportGame,
    parseMoves: parseMoves
  };

  global.Notation = Notation;
})(typeof window !== 'undefined' ? window : globalThis);
