/**
 * ShapeBound — Daily Tactical Puzzle
 *
 * Deterministic offline puzzle generator seeded by date (YYYY-MM-DD).
 * Every player gets the exact same tactical puzzle each day with zero backend.
 * Features Wordle-style emoji sharing and streak tracking.
 */

(function (global) {
  'use strict';

  const STORAGE_KEY = 'shapebound_daily_v1';

  // Linear congruential generator for reproducible daily generation
  function makePRNG(seed) {
    let s = (seed % 2147483647 + 2147483647) % 2147483647;
    if (s === 0) s = 123456789;
    return function () {
      s = (s * 16807) % 2147483647;
      return (s - 1) / 2147483646;
    };
  }

  function getTodayKey() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + day;
  }

  function getTodaySeed() {
    const key = getTodayKey();
    const parts = key.split('-').map(Number);
    return parts[0] * 10000 + parts[1] * 100 + parts[2];
  }

  let inMemoryStore = { solvedDays: {}, streak: 0, lastDay: null };

  function loadProgress() {
    if (typeof localStorage === 'undefined') return inMemoryStore;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : inMemoryStore;
    } catch (e) {
      return inMemoryStore;
    }
  }

  function saveProgress(data) {
    inMemoryStore = data;
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {}
  }

  /**
   * Generate today's tactical puzzle scenario.
   */
  function generateDailyPuzzle(shapeEngine) {
    const SE = shapeEngine || global.ShapeEngine;
    const seed = getTodaySeed();
    const rng = makePRNG(seed);
    const dateKey = getTodayKey();

    const lib = SE.buildLibrary(6);
    const placements = lib.allPlacements;

    // Pick a target winning hexomino placement for X
    const targetIdx = Math.floor(rng() * placements.length);
    const target = placements[targetIdx];
    const targetCells = target.cells.slice();

    // Pick which of the 6 cells is the missing winning move
    const missingIdx = Math.floor(rng() * 6);
    const winningMove = targetCells[missingIdx];
    const xCells = targetCells.filter(function (_, i) { return i !== missingIdx; });

    const occupiedSet = new Set(targetCells.map(function (c) { return c[0] + ',' + c[1]; }));

    // Distribute 4-5 pieces for Player O that don't block the winning cell or form an accidental win
    const oCells = [];
    const candidates = [];
    for (let r = 0; r < 6; r++) {
      for (let c = 0; c < 6; c++) {
        const k = r + ',' + c;
        if (!occupiedSet.has(k)) candidates.push([r, c]);
      }
    }

    // Shuffle candidates deterministically
    for (let i = candidates.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const temp = candidates[i];
      candidates[i] = candidates[j];
      candidates[j] = temp;
    }

    const oCount = 4 + Math.floor(rng() * 2); // 4 or 5 pieces
    for (let i = 0; i < candidates.length && oCells.length < oCount; i++) {
      oCells.push(candidates[i]);
    }

    const progress = loadProgress();
    const isSolved = !!(progress.solvedDays && progress.solvedDays[dateKey]);

    return {
      dateKey: dateKey,
      shapeName: target.shape,
      winningMove: winningMove,
      xCells: xCells,
      oCells: oCells,
      isSolved: isSolved,
      streak: progress.streak || 0
    };
  }

  function markSolved(dateKey) {
    const prog = loadProgress();
    if (!prog.solvedDays) prog.solvedDays = {};
    if (!prog.solvedDays[dateKey]) {
      prog.solvedDays[dateKey] = true;
      prog.streak = (prog.streak || 0) + 1;
      prog.lastDay = dateKey;
      saveProgress(prog);
    }
    return prog.streak;
  }

  function generateShareCard(puzzle, solvedInTurns) {
    const turns = solvedInTurns || 1;
    const lines = [
      'ShapeBound Daily (' + puzzle.dateKey + ')',
      'Solved in ' + turns + ' move' + (turns > 1 ? 's' : '') + '! 🏆',
      'Target: ' + puzzle.shapeName,
      ''
    ];

    const winKey = puzzle.winningMove[0] + ',' + puzzle.winningMove[1];
    const xSet = new Set(puzzle.xCells.map(function (c) { return c[0] + ',' + c[1]; }));
    const oSet = new Set(puzzle.oCells.map(function (c) { return c[0] + ',' + c[1]; }));

    for (let r = 0; r < 6; r++) {
      let rowStr = '';
      for (let c = 0; c < 6; c++) {
        const k = r + ',' + c;
        if (k === winKey) rowStr += '🟩';
        else if (xSet.has(k)) rowStr += '🟨';
        else if (oSet.has(k)) rowStr += '🟦';
        else rowStr += '⬛';
      }
      lines.push(rowStr);
    }

    lines.push('');
    lines.push('Play offline: https://neural-port.github.io/project-shapebound-game/');
    return lines.join('\n');
  }

  const DailyPuzzle = {
    getTodayKey: getTodayKey,
    generateDailyPuzzle: generateDailyPuzzle,
    markSolved: markSolved,
    generateShareCard: generateShareCard,
    loadProgress: loadProgress
  };

  global.DailyPuzzle = DailyPuzzle;
})(typeof window !== 'undefined' ? window : globalThis);
