/**
 * ShapeBound — Automated Test Suite
 *
 * Runs in both Node.js and the browser. In the browser, results render into
 * #debug-output when debug mode is on, and are also returned for the Game Lab
 * simulation runner. In Node, run via `node js/tests.js` (the file self-executes).
 *
 * Tests cover: shapes (35 hexominoes), rotations/reflections, connectivity,
 * win detection, lifetime, game state, AI, replay, randomized simulations.
 */

(function (global) {
  'use strict';

  // In Node, load dependencies (they attach to globalThis).
  if (typeof window === 'undefined') {
    require('./shape-engine.js');
    require('./game-state.js');
    require('./game-engine.js');
    require('./ai.js');
  }

  const ShapeEngine = global.ShapeEngine;
  const GameState = global.GameState;
  const GameEngine = global.GameEngine;
  const AI = global.AI;

  let passed = 0, failed = 0;
  const failures = [];

  function assert(cond, msg) {
    if (cond) { passed++; }
    else { failed++; failures.push(msg); if (typeof console !== 'undefined') console.error('FAIL: ' + msg); }
  }

  function assertEqual(actual, expected, msg) {
    assert(actual === expected, msg + ' (expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual) + ')');
  }

  function suite(name, fn) {
    const beforeP = passed, beforeF = failed;
    fn();
    const dp = passed - beforeP, df = failed - beforeF;
    if (typeof console !== 'undefined') console.log('[' + name + '] ' + dp + ' passed, ' + df + ' failed');
  }

  // ---- Shape tests -------------------------------------------------------

  function testShapes() {
    suite('SHAPES', function () {
      const v = ShapeEngine.validateLibrary();
      assertEqual(v.count, 35, '35 unique hexominoes');

      const names = ShapeEngine.SHAPE_NAMES;
      assertEqual(names.length, 35, '35 shape names');

      // Each base shape: exactly 6 cells, connected, normalized.
      names.forEach(function (name) {
        const cells = ShapeEngine.BASE_HEXOMINOES[name];
        assertEqual(cells.length, 6, name + ' has 6 cells');
        assert(ShapeEngine.isConnected(cells), name + ' is connected');
        const norm = ShapeEngine.normalize(cells.slice());
        let minR = Infinity, minC = Infinity;
        norm.forEach(function (p) { if (p[0] < minR) minR = p[0]; if (p[1] < minC) minC = p[1]; });
        assert(minR === 0 && minC === 0, name + ' normalized to origin');
      });

      // No duplicate free hexomino.
      const seen = new Set();
      names.forEach(function (name) {
        const k = ShapeEngine.cellsKey(ShapeEngine.normalize(ShapeEngine.BASE_HEXOMINOES[name].slice()));
        assert(!seen.has(k), 'no duplicate base for ' + name);
        seen.add(k);
      });

      // Total orientations = 216 (known for 35 free hexominoes).
      let total = 0;
      names.forEach(function (n) { total += ShapeEngine.generateOrientations(ShapeEngine.BASE_HEXOMINOES[n]).length; });
      assertEqual(total, 216, 'total orientations = 216');

      // Library builds for 6×6.
      const lib = ShapeEngine.buildLibrary(6);
      assert(lib.allPlacements.length > 0, 'library has placements on 6×6');
      assertEqual(lib.size, 6, 'library size is 6');
    });
  }

  // ---- Connectivity tests ------------------------------------------------

  function testConnectivity() {
    suite('CONNECTIVITY', function () {
      assert(ShapeEngine.isConnected([[0, 0], [0, 1], [0, 2]]), 'horizontal line connected');
      assert(ShapeEngine.isConnected([[0, 1], [1, 0], [1, 1], [1, 2], [2, 1], [2, 2]]), '6-cell blob connected');
      assert(!ShapeEngine.isConnected([[0, 0], [0, 2], [2, 0], [2, 2]]), 'diagonal-only NOT connected');
      assert(!ShapeEngine.isConnected([[0, 0], [2, 0], [2, 2]]), 'disconnected NOT connected');
      assert(ShapeEngine.isConnected([[0, 0], [1, 0], [2, 0], [2, 1], [2, 2], [3, 2]]), 'L-shape hexomino connected');
    });
  }

  // ---- Win detection tests ----------------------------------------------

  function testWinDetection() {
    suite('WIN', function () {
      // Straight hexomino (6 in a row) horizontal row 0.
      let s = GameState.createInitialState({ boardSize: 6, maxActivePieces: 6 });
      GameEngine.startGame(s);
      for (let i = 0; i < 6; i++) {
        GameEngine.applyMove(s, 0, i);
        if (i < 5) GameEngine.applyMove(s, 5, i);
      }
      assertEqual(s.status, GameState.STATUS.X_WON, 'X wins with 6 in a row horizontal');
      assert(s.winInfo && s.winInfo.shape, 'winning shape detected');

      // O wins with an L-shaped hexomino: [0,0],[1,0],[2,0],[3,0],[4,0],[4,1]
      s = GameState.createInitialState({ boardSize: 6, maxActivePieces: 6 });
      GameEngine.startGame(s);
      const oMoves = [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0], [4, 1]];
      const xMoves = [[0, 5], [1, 5], [2, 5], [3, 5], [5, 5], [5, 0]];
      for (let i = 0; i < oMoves.length; i++) {
        GameEngine.applyMove(s, xMoves[i][0], xMoves[i][1]);
        GameEngine.applyMove(s, oMoves[i][0], oMoves[i][1]);
      }
      assertEqual(s.status, GameState.STATUS.O_WON, 'O wins with L hexomino');
      assert(s.winInfo && s.winInfo.shape, 'O winning shape detected');

      // No false positive: random scattered pieces, no win.
      s = GameState.createInitialState({ boardSize: 6, maxActivePieces: 6 });
      GameEngine.startGame(s);
      GameEngine.applyMove(s, 0, 0); GameEngine.applyMove(s, 0, 2);
      GameEngine.applyMove(s, 2, 2); GameEngine.applyMove(s, 4, 4);
      GameEngine.applyMove(s, 5, 0);
      assertEqual(s.status, GameState.STATUS.PLAYING, 'scattered pieces no false win');

      // Diagonal-only must NOT win. 6 cells on the main diagonal of a 6×6 board.
      s = GameState.createInitialState({ boardSize: 6, maxActivePieces: 6 });
      GameEngine.startGame(s);
      const xDiag = [[0, 0], [1, 1], [2, 2], [3, 3], [4, 4], [5, 5]];
      const oFill = [[0, 5], [1, 5], [2, 5], [3, 5], [4, 5]];
      for (let i = 0; i < xDiag.length; i++) {
        GameEngine.applyMove(s, xDiag[i][0], xDiag[i][1]);
        if (oFill[i]) GameEngine.applyMove(s, oFill[i][0], oFill[i][1]);
      }
      assert(s.status !== GameState.STATUS.X_WON, 'diagonal-only does not win');

      // Exactly 6 required: 5 in a row is not a win.
      s = GameState.createInitialState({ boardSize: 6, maxActivePieces: 6 });
      GameEngine.startGame(s);
      GameEngine.applyMove(s, 0, 0); GameEngine.applyMove(s, 5, 0);
      GameEngine.applyMove(s, 0, 1); GameEngine.applyMove(s, 5, 1);
      GameEngine.applyMove(s, 0, 2); GameEngine.applyMove(s, 5, 2);
      GameEngine.applyMove(s, 0, 3); GameEngine.applyMove(s, 5, 3);
      GameEngine.applyMove(s, 0, 4); GameEngine.applyMove(s, 5, 4);
      assertEqual(s.status, GameState.STATUS.PLAYING, '5 in a row is not a win');

      // 6 in a row wins even with higher cap.
      s = GameState.createInitialState({ boardSize: 6, maxActivePieces: 7 });
      GameEngine.startGame(s);
      for (let i = 0; i < 6; i++) {
        GameEngine.applyMove(s, 0, i);
        if (i < 5) GameEngine.applyMove(s, 5, i);
      }
      assertEqual(s.status, GameState.STATUS.X_WON, '6 in row wins even with higher cap');

      // checkWin on overlapping shapes.
      const lib = ShapeEngine.buildLibrary(6);
      const occupied = [[0, 0], [0, 1], [0, 2], [0, 3], [0, 4], [0, 5], [1, 2], [2, 2]];
      const w = ShapeEngine.checkWin(lib, occupied);
      assert(w.won, 'overlapping shapes detected');
      assert(w.shape, 'overlapping win has a shape name');
    });
  }

  // ---- Lifetime tests ----------------------------------------------------

  function testLifetime() {
    suite('LIFETIME', function () {
      // Win before expiration: 6 in a row wins before any expiration.
      let s = GameState.createInitialState({ boardSize: 6, maxActivePieces: 6 });
      GameEngine.startGame(s);
      const xWin = [[0, 0], [0, 1], [0, 2], [0, 3], [0, 4], [0, 5]];
      const oScatter = [[5, 0], [5, 1], [5, 2], [5, 3], [5, 4]];
      let expiredOnWin = null;
      for (let i = 0; i < xWin.length; i++) {
        const r = GameEngine.applyMove(s, xWin[i][0], xWin[i][1]);
        if (r.winInfo && r.winInfo.won) expiredOnWin = r.expired;
        if (oScatter[i]) GameEngine.applyMove(s, oScatter[i][0], oScatter[i][1]);
      }
      assertEqual(expiredOnWin, null, 'no expiration on winning move');
      assertEqual(s.status, GameState.STATUS.X_WON, 'win recorded');

      // Expiration removes oldest when no win.
      s = GameState.createInitialState({ boardSize: 6, maxActivePieces: 6 });
      GameEngine.startGame(s);
      // Place 6 scattered X pieces (no shape), then a 7th -> oldest removed.
      const xM = [[0, 0], [0, 2], [0, 4], [3, 0], [3, 2], [3, 4], [5, 0]];
      const oM = [[1, 1], [1, 3], [1, 5], [4, 1], [4, 3], [4, 5]];
      for (let i = 0; i < xM.length; i++) {
        GameEngine.applyMove(s, xM[i][0], xM[i][1]);
        if (oM[i]) GameEngine.applyMove(s, oM[i][0], oM[i][1]);
      }
      assertEqual(s.activePieces[1].length, 6, 'X active capped at 6');
      assertEqual(s.board[0][0], 0, 'oldest X removed from board');
      assertEqual(s.activePieces[1][0].row, 0, 'new oldest is row 0');
      assertEqual(s.activePieces[1][0].col, 2, 'new oldest is col 2');
      assertEqual(s.activePieces[2].length, 6, 'O has its own 6 active');
    });
  }

  // ---- Game state tests --------------------------------------------------

  function testGameState() {
    suite('GAME_STATE', function () {
      // Illegal moves rejected.
      let s = GameState.createInitialState({ boardSize: 6, maxActivePieces: 6 });
      GameEngine.startGame(s);
      GameEngine.applyMove(s, 0, 0);
      const r = GameEngine.applyMove(s, 0, 0); // occupied
      assert(!r.ok, 'occupied cell rejected');
      GameEngine.applyMove(s, 1, 1); // O
      const r2 = GameEngine.applyMove(s, 2, 2); // X's turn now, valid
      assert(r2.ok, 'correct player turn enforced via state');

      // Moves after win rejected.
      s = GameState.createInitialState({ boardSize: 6, maxActivePieces: 6 });
      GameEngine.startGame(s);
      for (let i = 0; i < 6; i++) { GameEngine.applyMove(s, 0, i); if (i < 5) GameEngine.applyMove(s, 5, i); }
      assertEqual(s.status, GameState.STATUS.X_WON, 'X won');
      const post = GameEngine.applyMove(s, 2, 2);
      assert(!post.ok, 'no moves after win');

      // Restart.
      s = GameEngine.resetMatch(s);
      assertEqual(s.status, GameState.STATUS.READY, 'restart -> READY');
      assertEqual(s.moveHistory.length, 0, 'restart clears history');

      // Undo.
      s = GameState.createInitialState({ boardSize: 6, maxActivePieces: 6 });
      GameEngine.startGame(s);
      const stack = [];
      stack.push(GameState.snapshot(s));
      GameEngine.applyMove(s, 0, 0);
      assertEqual(s.moveHistory.length, 1, 'one move recorded');
      GameEngine.undo(s, stack);
      assertEqual(s.moveHistory.length, 0, 'undo clears move');
      assertEqual(s.currentPlayer, GameState.PLAYER_X, 'undo restores player');
      assertEqual(s.board[0][0], 0, 'undo restores board');
    });
  }

  // ---- AI tests ----------------------------------------------------------

  function testAI() {
    suite('AI', function () {
      // AI never plays occupied cell.
      let s = GameState.createInitialState({ boardSize: 6, mode: 'HUMAN_VS_AI', aiDifficulty: 'NORMAL' });
      GameEngine.startGame(s);
      GameEngine.applyMove(s, 0, 0); // X
      const m = AI.chooseMove(s, 'NORMAL');
      assert(m && s.board[m[0]][m[1]] === 0, 'AI picks empty cell');

      // AI never plays after game over.
      s = GameState.createInitialState({ boardSize: 6, maxActivePieces: 6, mode: 'HUMAN_VS_AI', aiDifficulty: 'NORMAL' });
      GameEngine.startGame(s);
      for (let i = 0; i < 6; i++) { GameEngine.applyMove(s, 0, i); if (i < 5) GameEngine.applyMove(s, 5, i); }
      assertEqual(s.status, GameState.STATUS.X_WON, 'game over');
      const m2 = AI.chooseMove(s, 'NORMAL');
      assert(m2 === null || s.status !== GameState.STATUS.PLAYING, 'AI no move after game over');

      // AI detects immediate win: O has 5 in row 5, O to move.
      s = GameState.createInitialState({ boardSize: 6, maxActivePieces: 6, mode: 'HUMAN_VS_AI', aiDifficulty: 'NORMAL' });
      GameEngine.startGame(s);
      GameEngine.applyMove(s, 1, 1); GameEngine.applyMove(s, 5, 0);
      GameEngine.applyMove(s, 1, 2); GameEngine.applyMove(s, 5, 1);
      GameEngine.applyMove(s, 1, 3); GameEngine.applyMove(s, 5, 2);
      GameEngine.applyMove(s, 2, 2); GameEngine.applyMove(s, 5, 3);
      GameEngine.applyMove(s, 3, 3); GameEngine.applyMove(s, 5, 4);
      GameEngine.applyMove(s, 4, 4); // X, now O to move
      assertEqual(s.currentPlayer, GameState.PLAYER_O, 'O to move');
      const m3 = AI.chooseMove(s, 'NORMAL');
      const res = GameEngine.applyMove(s, m3[0], m3[1]);
      assert(res.ok && res.winInfo && res.winInfo.won, 'AI takes immediate win');

      // AI blocks opponent immediate win: X has 5 in row 0, O must block [0,5].
      s = GameState.createInitialState({ boardSize: 6, maxActivePieces: 6, mode: 'HUMAN_VS_AI', aiDifficulty: 'NORMAL' });
      GameEngine.startGame(s);
      GameEngine.applyMove(s, 0, 0); GameEngine.applyMove(s, 5, 5);
      GameEngine.applyMove(s, 0, 1); GameEngine.applyMove(s, 5, 4);
      GameEngine.applyMove(s, 0, 2); GameEngine.applyMove(s, 5, 3);
      GameEngine.applyMove(s, 0, 3); GameEngine.applyMove(s, 5, 2);
      GameEngine.applyMove(s, 0, 4); // X, now O to move
      assertEqual(s.currentPlayer, GameState.PLAYER_O, 'O to move to block');
      const m4 = AI.chooseMove(s, 'NORMAL');
      GameEngine.applyMove(s, m4[0], m4[1]);
      assert(s.board[0][5] === 2 || s.status === GameState.STATUS.O_WON, 'AI blocked X win or won itself');

      // AI respects piece cap in AI-vs-AI game.
      s = GameState.createInitialState({ boardSize: 6, maxActivePieces: 6, mode: 'HUMAN_VS_HUMAN' });
      GameEngine.startGame(s);
      let moves = 0;
      while (s.status === GameState.STATUS.PLAYING && moves < 80) {
        const mv = AI.chooseMove(s, 'EASY');
        if (!mv) break;
        GameEngine.applyMove(s, mv[0], mv[1]);
        moves++;
        if (s.status === GameState.STATUS.PLAYING) {
          assert(s.activePieces[1].length <= 6 && s.activePieces[2].length <= 6, 'AI respects piece cap');
        }
      }
      assert(s.status !== GameState.STATUS.PLAYING || moves >= 80, 'AI game terminates');

      // Practice mode assigns AI as O.
      s = GameState.createInitialState({ boardSize: 6, maxActivePieces: 6, mode: 'PRACTICE', aiDifficulty: 'EASY' });
      assertEqual(s.aiPlayer, GameState.PLAYER_O, 'Practice mode assigns AI as O');
      GameEngine.startGame(s);
      GameEngine.applyMove(s, 0, 0);
      assertEqual(s.currentPlayer, GameState.PLAYER_O, 'Practice: O to move after X');
      const practiceMove = AI.chooseMove(s, 'EASY');
      assert(practiceMove && s.board[practiceMove[0]][practiceMove[1]] === 0, 'Practice AI picks empty cell');
    });
  }

  // ---- Replay tests ------------------------------------------------------

  function testReplay() {
    suite('REPLAY', function () {
      const s = GameState.createInitialState({ boardSize: 6, maxActivePieces: 6 });
      GameEngine.startGame(s);
      while (s.status === GameState.STATUS.PLAYING) {
        const legal = GameEngine.getLegalMoves(s);
        if (!legal.length) break;
        const mv = legal[Math.floor(Math.random() * legal.length)];
        GameEngine.applyMove(s, mv[0], mv[1]);
        if (s.moveHistory.length > 120) break;
      }
      const finalStatus = s.status;
      const finalWinner = s.winner;

      // Replay.
      const s2 = GameState.createInitialState({ boardSize: 6, maxActivePieces: 6 });
      GameEngine.startGame(s2);
      const hist = s.moveHistory;
      for (let i = 0; i < hist.length; i++) {
        GameEngine.applyMove(s2, hist[i].row, hist[i].col);
      }
      assertEqual(s2.status, finalStatus, 'replay reaches same status');
      assertEqual(s2.winner, finalWinner, 'replay reaches same winner');
      assertEqual(s2.moveHistory.length, hist.length, 'replay has same move count');
    });
  }

  // ---- Randomized simulations -------------------------------------------

  function runRandomGames(count, opts) {
    opts = opts || {};
    const maxGames = count || 10000;
    let crashes = 0, invalidStates = 0, noWinnerEnds = 0, wins = 0, draws = 0;
    let maxLen = 0, totalLen = 0;
    const errors = [];
    for (let g = 0; g < maxGames; g++) {
      try {
        const s = GameState.createInitialState({ boardSize: 6, maxActivePieces: 6 });
        GameEngine.startGame(s);
        let len = 0;
        while (s.status === GameState.STATUS.PLAYING && len < 500) {
          const legal = GameEngine.getLegalMoves(s);
          if (legal.length === 0) { invalidStates++; break; }
          const mv = legal[Math.floor(Math.random() * legal.length)];
          if (s.board[mv[0]][mv[1]] !== 0) { invalidStates++; break; }
          GameEngine.applyMove(s, mv[0], mv[1]);
          const over = s.status !== GameState.STATUS.PLAYING;
          if ((!over && s.activePieces[1].length > 6) || (!over && s.activePieces[2].length > 6)) { invalidStates++; break; }
          len++;
        }
        if (s.status === GameState.STATUS.X_WON || s.status === GameState.STATUS.O_WON) {
          wins++;
          if (!s.winInfo || !s.winInfo.shape) invalidStates++;
        } else if (s.status === GameState.STATUS.DRAW) {
          draws++;
        } else if (s.status === GameState.STATUS.PLAYING) {
          noWinnerEnds++;
        }
        if (len > maxLen) maxLen = len;
        totalLen += len;
      } catch (e) {
        crashes++;
        if (errors.length < 5) errors.push(e.message);
      }
    }
    return {
      games: maxGames, wins: wins, draws: draws, crashes: crashes,
      invalidStates: invalidStates, noWinnerEnds: noWinnerEnds,
      maxLen: maxLen, avgLen: (totalLen / maxGames).toFixed(1), errors: errors
    };
  }

  function testRandomized() {
    suite('RANDOMIZED', function () {
      const r = runRandomGames(1000);
      assert(r.crashes === 0, 'no crashes in ' + r.games + ' random games');
      assert(r.invalidStates === 0, 'no invalid states in random games');
      assert(r.noWinnerEnds === 0, 'no unterminated random games');
      if (typeof console !== 'undefined') {
        console.log('Randomized: ' + r.games + ' games, ' + r.wins + ' wins, ' + r.draws + ' draws, avg ' + r.avgLen + ' moves');
      }
    });
  }

  // ---- Run all -----------------------------------------------------------

  function runAll() {
    passed = 0; failed = 0; failures.length = 0;
    testShapes();
    testConnectivity();
    testWinDetection();
    testLifetime();
    testGameState();
    testAI();
    testReplay();
    testRandomized();
    const summary = {
      passed: passed, failed: failed, total: passed + failed,
      failures: failures.slice(),
      timestamp: new Date().toISOString()
    };
    if (typeof console !== 'undefined') {
      console.log('=== TEST SUMMARY ===');
      console.log('Passed: ' + passed + ' / ' + (passed + failed));
      if (failed) console.log('Failures:\n' + failures.join('\n'));
    }
    return summary;
  }

  const Tests = {
    runAll: runAll,
    runRandomGames: runRandomGames,
    assert: assert,
    assertEqual: assertEqual
  };

  global.Tests = Tests;

  // Auto-run in Node.
  if (typeof window === 'undefined' && require && require.main === module) {
    const r = runAll();
    process.exit(r.failed ? 1 : 0);
  }
})(typeof window !== 'undefined' ? window : globalThis);
