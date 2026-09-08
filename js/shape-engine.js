/**
 * ShapeBound — Shape Engine
 *
 * Pure, DOM-free module that defines the 35 free hexominoes (6-cell shapes)
 * and generates all unique orientations (rotations + reflections), normalized
 * to the top-left of their bounding box. Also generates every legal placement
 * on a configurable board and provides fast win detection against a board.
 *
 * A "shape" is represented as a sorted array of [row, col] coordinate pairs.
 * Normalization translates the shape so its min row/col is 0,0.
 *
 * Orthogonal connectivity only (no diagonals).
 */

(function (global) {
  'use strict';

  // ---- Polyomino generation ---------------------------------------------
  // Hexominoes (6-cell polyominoes) are generated programmatically rather
  // than hand-coded, to avoid transcription errors. There are exactly 35
  // free hexominoes (unique under rotation + reflection).

  /**
   * Generate all free n-cell polyominoes (connected, unique under
   * rotation + reflection). Returns array of normalized cell arrays.
   */
  function generateFreePolyominoes(n) {
    if (n < 1) return [];
    if (n === 1) return [[[0, 0]]];

    const results = [];
    const seenFree = new Set();
    const seenIntermediates = new Set();

    function recurse(cells) {
      const norm = normalize(cells);
      const key = cellsKey(norm);

      if (cells.length === n) {
        const orients = generateOrientations(norm);
        const orientKeys = orients.map(cellsKey).sort();
        const canonical = orientKeys[0];
        if (!seenFree.has(canonical)) {
          seenFree.add(canonical);
          results.push(norm);
        }
        return;
      }

      // Intermediate dedup: skip if we've already grown from this shape.
      const intKey = key + ':' + cells.length;
      if (seenIntermediates.has(intKey)) return;
      seenIntermediates.add(intKey);

      const cellSet = new Set(norm.map(function (c) { return c[0] + ',' + c[1]; }));
      const candSet = new Set();
      const candidates = [];
      for (let i = 0; i < norm.length; i++) {
        const r = norm[i][0], c = norm[i][1];
        const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
        for (let d = 0; d < dirs.length; d++) {
          const nr = r + dirs[d][0], nc = c + dirs[d][1];
          const k = nr + ',' + nc;
          if (!cellSet.has(k) && !candSet.has(k)) {
            candSet.add(k);
            candidates.push([nr, nc]);
          }
        }
      }
      candidates.sort(compareCells);
      for (let i = 0; i < candidates.length; i++) {
        const next = norm.slice();
        next.push([candidates[i][0], candidates[i][1]]);
        recurse(next);
      }
    }

    recurse([[0, 0]]);
    return results;
  }

  // ---- Base hexomino definitions (generated) ----------------------------
  // The 35 free hexominoes, generated at load time. Named H01..H35.
  const HEXOMINO_CELLS = generateFreePolyominoes(6);
  const BASE_HEXOMINOES = {};
  const SHAPE_NAMES = [];
  for (let i = 0; i < HEXOMINO_CELLS.length; i++) {
    const name = 'H' + (i < 9 ? '0' : '') + (i + 1);
    BASE_HEXOMINOES[name] = HEXOMINO_CELLS[i];
    SHAPE_NAMES.push(name);
  }

  // ---- Coordinate helpers -------------------------------------------------

  function normalize(cells) {
    let minR = Infinity, minC = Infinity;
    for (let i = 0; i < cells.length; i++) {
      const r = cells[i][0], c = cells[i][1];
      if (r < minR) minR = r;
      if (c < minC) minC = c;
    }
    const out = cells.map(function (p) { return [p[0] - minR, p[1] - minC]; });
    out.sort(compareCells);
    return out;
  }

  function compareCells(a, b) {
    return a[0] - b[0] || a[1] - b[1];
  }

  function cellsKey(cells) {
    return cells.map(function (p) { return p[0] + ',' + p[1]; }).join('|');
  }

  function rotate90(cells) {
    // (r, c) -> (c, -r) then normalize
    return normalize(cells.map(function (p) { return [p[1], -p[0]]; }));
  }

  function reflect(cells) {
    // (r, c) -> (r, -c) then normalize
    return normalize(cells.map(function (p) { return [p[0], -p[1]]; }));
  }

  // ---- Connectivity check -------------------------------------------------

  function isConnected(cells) {
    if (cells.length === 0) return false;
    const set = new Set(cells.map(function (p) { return p[0] + ',' + p[1]; }));
    const visited = new Set();
    const stack = [cells[0]];
    visited.add(cells[0][0] + ',' + cells[0][1]);
    while (stack.length) {
      const cur = stack.pop();
      const neighbors = [
        [cur[0] - 1, cur[1]],
        [cur[0] + 1, cur[1]],
        [cur[0], cur[1] - 1],
        [cur[0], cur[1] + 1]
      ];
      for (let i = 0; i < neighbors.length; i++) {
        const k = neighbors[i][0] + ',' + neighbors[i][1];
        if (set.has(k) && !visited.has(k)) {
          visited.add(k);
          stack.push(neighbors[i]);
        }
      }
    }
    return visited.size === cells.length;
  }

  // ---- Orientation generation --------------------------------------------

  /**
   * Generate all unique free orientations (rotations + reflections) of a
   * base shape. Returns array of normalized cell arrays (deduplicated).
   */
  function generateOrientations(baseCells) {
    const seen = new Set();
    const out = [];
    let current = normalize(baseCells.slice());
    for (let i = 0; i < 4; i++) {
      const k = cellsKey(current);
      if (!seen.has(k)) { seen.add(k); out.push(current); }
      const refl = reflect(current);
      const rk = cellsKey(refl);
      if (!seen.has(rk)) { seen.add(rk); out.push(refl); }
      current = rotate90(current);
    }
    return out;
  }

  // ---- Placement generation ----------------------------------------------

  /**
   * Generate all legal placements of a shape on a size×size board.
   * Returns array of { shape, orientation, cells: [[r,c],...] }.
   */
  function generatePlacements(cells, size) {
    const norm = normalize(cells);
    let maxR = 0, maxC = 0;
    for (let i = 0; i < norm.length; i++) {
      if (norm[i][0] > maxR) maxR = norm[i][0];
      if (norm[i][1] > maxC) maxC = norm[i][1];
    }
    const placements = [];
    for (let r = 0; r <= size - 1 - maxR; r++) {
      for (let c = 0; c <= size - 1 - maxC; c++) {
        const placed = norm.map(function (p) { return [p[0] + r, p[1] + c]; });
        placements.push(placed);
      }
    }
    return placements;
  }

  // ---- Build the full shape library --------------------------------------

  /**
   * Build the complete shape library for a given board size.
   * Returns:
   *   {
   *     shapes: { NAME: { name, base, orientations: [cells[]], placements: [cells[]] } },
   *     allPlacements: [ { shape, orientation, cells } ],
   *     orientationIndex: Map<key, {shape, orientation, cells}>  // for fast lookup
   *   }
   */
  function buildLibrary(size) {
    size = size || 6;
    const shapes = {};
    const allPlacements = [];
    for (let s = 0; s < SHAPE_NAMES.length; s++) {
      const name = SHAPE_NAMES[s];
      const base = normalize(BASE_HEXOMINOES[name].slice());
      const orientations = generateOrientations(base);
      const placements = [];
      for (let o = 0; o < orientations.length; o++) {
        const op = generatePlacements(orientations[o], size);
        for (let p = 0; p < op.length; p++) {
          const entry = { shape: name, orientation: o, cells: op[p] };
          placements.push(entry);
          allPlacements.push(entry);
        }
      }
      shapes[name] = { name: name, base: base, orientations: orientations, placements: placements };
    }
    return { size: size, shapes: shapes, allPlacements: allPlacements };
  }

  // ---- Win detection -----------------------------------------------------

  /**
   * Find a winning hexomino shape among a player's occupied cells.
   * occupiedCells: array of [r,c] (any length >= 6).
   * Returns { won:true, shape, cells, orientation } or { won:false }.
   *
   * Strategy: scan all placements whose cells are all contained in the
   * occupied set.
   */
  function checkWin(library, occupiedCells) {
    const occupied = new Set(occupiedCells.map(function (p) { return p[0] + ',' + p[1]; }));
    const placements = library.allPlacements;
    for (let i = 0; i < placements.length; i++) {
      const pl = placements[i];
      let allIn = true;
      for (let j = 0; j < pl.cells.length; j++) {
        if (!occupied.has(pl.cells[j][0] + ',' + pl.cells[j][1])) { allIn = false; break; }
      }
      if (allIn) {
        return { won: true, shape: pl.shape, cells: pl.cells.slice(), orientation: pl.orientation };
      }
    }
    return { won: false };
  }

  /**
   * Faster win check that only considers placements that include a
   * specific "last move" cell. Used after every move to short-circuit.
   */
  function checkWinAt(library, occupiedCells, lastCell) {
    const occupied = new Set(occupiedCells.map(function (p) { return p[0] + ',' + p[1]; }));
    const placements = library.allPlacements;
    const lk = lastCell[0] + ',' + lastCell[1];
    for (let i = 0; i < placements.length; i++) {
      const pl = placements[i];
      let containsLast = false;
      let allIn = true;
      for (let j = 0; j < pl.cells.length; j++) {
        const k = pl.cells[j][0] + ',' + pl.cells[j][1];
        if (k === lk) containsLast = true;
        if (!occupied.has(k)) { allIn = false; break; }
      }
      if (containsLast && allIn) {
        return { won: true, shape: pl.shape, cells: pl.cells.slice(), orientation: pl.orientation };
      }
    }
    return { won: false };
  }

  // ---- Validation --------------------------------------------------------

  /**
   * Validate the base shape library. Throws on any structural problem.
   * Returns a summary { count, shapes: [...] }.
   */
  function validateLibrary() {
    const seen = new Set();
    const names = SHAPE_NAMES.slice();
    if (names.length !== 35) {
      throw new Error('Expected 35 base hexominoes, got ' + names.length);
    }
    for (let i = 0; i < names.length; i++) {
      const name = names[i];
      const cells = BASE_HEXOMINOES[name];
      if (cells.length !== 6) {
        throw new Error('Shape ' + name + ' does not have exactly 6 cells');
      }
      if (!isConnected(cells)) {
        throw new Error('Shape ' + name + ' is not orthogonally connected');
      }
      const norm = normalize(cells.slice());
      const k = cellsKey(norm);
      if (seen.has(k)) {
        throw new Error('Duplicate hexomino detected: ' + name);
      }
      seen.add(k);
    }
    return { count: names.length, shapes: names };
  }

  // ---- Export ------------------------------------------------------------

  const ShapeEngine = {
    BASE_HEXOMINOES: BASE_HEXOMINOES,
    SHAPE_NAMES: SHAPE_NAMES,
    generateFreePolyominoes: generateFreePolyominoes,
    normalize: normalize,
    rotate90: rotate90,
    reflect: reflect,
    isConnected: isConnected,
    generateOrientations: generateOrientations,
    generatePlacements: generatePlacements,
    buildLibrary: buildLibrary,
    checkWin: checkWin,
    checkWinAt: checkWinAt,
    validateLibrary: validateLibrary,
    cellsKey: cellsKey,
    compareCells: compareCells
  };

  global.ShapeEngine = ShapeEngine;
})(typeof window !== 'undefined' ? window : globalThis);
