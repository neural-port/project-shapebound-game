# ShapeBound — Don't make a line. Make a shape.

> **Live: https://neural-port.github.io/project-shapebound-game/**

A strategic two-player browser board game built on a 6×6 grid. Instead of lining up tokens (Tic-Tac-Toe style), a player wins by forming **exactly six of their own pieces** into one of the 35 valid free **hexomino** shapes — anywhere on the board. Rotations and reflections of a shape count as the same shape.

Built with vanilla HTML5, CSS3, and JavaScript. No frameworks, no build step, no backend, no database, no external APIs. Open `index.html` directly or serve the folder with any static server.

> 35 hexominoes · 216 unique orientations · legal placements on 6×6 · 205 automated tests · 10,000 randomized games validated with 0 crashes and 0 invalid states.

---

## Table of Contents

1. [Features](#features)
2. [Architecture](#architecture)
3. [Game Rules](#game-rules)
4. [Hexomino System](#hexomino-system)
5. [Artificial Intelligence](#artificial-intelligence)
6. [Game Modes](#game-modes)
7. [Run Locally](#run-locally)
8. [Test Suite](#test-suite)
9. [Deploy to GitHub Pages](#deploy-to-github-pages)
10. [Quality Audit](#quality-audit)
11. [Known Limitations](#known-limitations)
12. [Accessibility](#accessibility)
13. [Tech Stack](#tech-stack)
14. [Why This Project Is in My Portfolio](#why-this-project-is-in-my-portfolio)
15. [License](#license)

---

## Features

### Core gameplay

- **6×6 grid board** with two players: X (Player 1) and O (Player 2). X always moves first.
- **Win condition**: exactly six orthogonally connected same-player cells forming one of the 35 free hexominoes (H01–H35).
- **Piece lifetime**: each player keeps up to 5 active pieces. Placing a 6th piece expires the oldest. A winning 6th piece is checked **before** expiration, so it never self-destructs.
- **Draw detection**: by repeated board state (3 times) or turn cap (200 plies default).

### Player tools

- **Shape Guide** — interactive panel rendering all 35 hexominoes as SVG. Selecting a shape shows its unique orientations and legal placement count.
- **Move preview** — hovering an empty cell shows a subtle preview of the current player's symbol.
- **Piece-age visualization** — newer pieces are full opacity; older pieces fade; the oldest piece of each player shows a dashed warning ring indicating it will expire next.
- **Undo** — full state-based undo (not DOM manipulation). In AI mode, one Undo reverses both the human move and the AI response.
- **New Game / Restart Match** — New Game resets the board, keeping match score. Restart Match resets the board only (score is preserved; use Reset Statistics to wipe scores).
- **Match Score** — X wins / O wins / Draws persisted in `localStorage`. A "Reset Statistics" option is provided.

### Post-game analysis

- **Replay** — after a game ends, replay reproduces the exact game deterministically with Previous / Play / Pause / Next / Restart controls.
- **Game Analyzer** — inspects every move using the real engine and labels each as: winning move, missed win, dangerous move, strong defensive block, near-complete shape creation, or neutral. Explanations come from engine data — no LLM, no fake reasoning.
- **What If?** — branches the game from any point. The original game is preserved; the player explores alternate moves on a separate board and can return to the original at any time.
- **Game Lab** — experimental screen to configure board size, max active pieces, AI strategy, and run bulk randomized simulations. Production games default to 6×6 / hexominoes / `MAX_ACTIVE_PIECES = 6`.

### Platform features

- **Debug mode** — append `?debug=true` to the URL to show live state, turn, active piece counts, legal move count, detected shapes, and AI evaluation.
- **Fully responsive** — layout adapts to desktop, laptop, tablet, and mobile. On narrow screens the side panels stack, the board scales, and the shape guide collapses to fewer columns.
- **Immersive HUD** — dark navy environment with mountain silhouettes, stars, moon, fog layers, and a tactical ground grid. Warm cream cards and tan board surface. 3D puck-style X and O tokens.

---

## Architecture

### Module boundaries

The codebase separates game rules from presentation. Logic modules have no DOM dependency and run identically in the browser and Node — this is what makes the test suite possible.

```
project-shapebound-game/
├── index.html              # Markup, ARIA, script load order
├── css/
│   └── styles.css          # Immersive dark theme, responsive layout, HUD
├── js/
│   ├── shape-engine.js     # Pure: 35 hexominoes, orientations, placements, win checks
│   ├── game-state.js       # Pure: canonical serializable state model
│   ├── game-engine.js      # Pure: move validation, win-before-expiration, draw, undo
│   ├── ai.js               # Pure: minimax + alpha-beta + evaluation + difficulties
│   ├── renderer.js         # Pure DOM projection of state (no game logic)
│   ├── tests.js            # Automated suite + randomized simulations
│   └── main.js             # Controller: wires UI events to engine/AI/renderer
└── README.md
```

| Module | Responsibility | DOM? | Node? |
|---|---|---|---|
| `shape-engine.js` | Generate 35 hexominoes, 216 orientations, legal placements, win checks | No | Yes |
| `game-state.js` | State model, constants, factory, history | No | Yes |
| `game-engine.js` | Turn order, legal moves, win/expiration/draw, undo, replay | No | Yes |
| `ai.js` | Difficulty levels, immediate win/block, minimax evaluation, async move | No | Yes |
| `renderer.js` | Render board, shapes, previews, status, log, panels | Yes | No |
| `tests.js` | Assertions, suites, randomized simulations, Node auto-run | No | Yes |
| `main.js` | Event wiring, state ownership, mode switching, Game Lab, What If? | Yes | No |

### Data flow

```
User Input
    │
    ▼
main.js (controller)
    │
    ├──► game-engine.js ───► game-state.js
    │           │
    │           └──────────► shape-engine.js
    │
    ├──► ai.js ────────────► game-engine.js
    │
    └──► renderer.js ──────► DOM
```

The controller is the integration boundary. The renderer only reads state and projects it onto the DOM; it never mutates game state. The engine is the single rule chokepoint — AI, replay, what-if, and the lab all inherit correct behavior for free.

---

## Game Rules

### Winning

A player wins when any subset of exactly six of their currently active pieces forms a valid hexomino. A player may hold more than six active pieces; extra pieces do not invalidate a win — the engine searches all 6-cell subsets.

### Piece Lifetime

Each player may have a configurable maximum number of **active pieces** (default `MAX_ACTIVE_PIECES = 6`). When a player places a new piece beyond the limit, their **oldest** active piece disappears and the new piece becomes active.

This is tracked per-player and per-sequence (not by global turn), so X and O have independent piece histories.

### Critical Interaction: Win Before Expiration

When a player places a piece that would both (a) complete a winning shape and (b) push them over the active-piece limit, the **win is checked first**. Only if there is no win does the oldest piece expire. This guarantees a legitimate winning move can never vanish the instant it is played.

### Draw

Because pieces expire, "board full" is not a reliable draw condition. Two deterministic triggers are used:

1. **Turn cap**: the game ends in a draw after `maxTurns` (default 200) plies.
2. **Repeated state**: if the same canonical strategic state (board + player to move) occurs `repeatDrawThreshold` (default 3) times, the game is a draw.

---

## Hexomino System

The 35 free hexominoes are defined once as normalized coordinate sets in `js/shape-engine.js`. The engine automatically generates:

- all rotations (0°, 90°, 180°, 270°),
- all reflections,
- normalized orientations (translated to the origin),
- every legal placement on the board (computed at runtime for the board size),
- deduplicated orientations (216 unique orientations total, placements).

No board position is hand-coded. Win detection scans all placements against the player's occupied cells for the current board size, short-circuiting on placements that include the last-played cell for speed.

Validation code (`ShapeEngine.validateLibrary`) confirms at startup that exactly 35 unique, orthogonally-connected, 6-cell hexominoes exist.

---

## Artificial Intelligence

A real game-playing AI in `js/ai.js` — no external API, no faked behavior.

- **Immediate win/block**: `findImmediateWin` looks for a move that wins now or blocks an opponent win next turn.
- **Heuristic evaluation** (`evaluateBoard`) scores: immediate win/loss, 4-of-5 threats, 3-of-5 potential, central control, threat creation/suppression.
- **Minimax with alpha-beta pruning** and move ordering by centrality.
- **Asynchronous search** (`chooseMoveAsync`) uses `setTimeout` so the UI never freezes.

The AI calls the same `GameEngine.applyMove` as the human, so it obeys every rule (piece lifetime, win-before-expiration, no moves after game over).

| Difficulty | Depth | Alpha-Beta | Notes |
|---|---|---|---|
| Easy | 1 | no | 20% chance to play a random legal move (may blunder) |
| Normal | 2 | yes | Deterministic best move at depth 2 |
| Hard | 3 | yes | Deterministic best move at depth 3 |

Hard is not unbeatable and does not cheat.

---

## Game Modes

| Mode | Description |
|---|---|
| **Human vs Human** | Two players on one device. |
| **Human vs AI** | Human is X, AI is O. Choose Easy / Normal / Hard. |
| **Practice** | Play against the AI without affecting match statistics. Undo, replay, analyzer, and what-if features still work. |

---

## Run Locally

### Option 1 — open directly

Double-click `index.html`. Some browsers restrict local `file://` loading of scripts, so a static server is preferred.

### Option 2 — static server

```bash
python -m http.server 8123
# open http://localhost:8123/
```

or

```bash
npx http-server -p 8123
```

### Debug mode

```text
http://localhost:8123/?debug=true
```

---

## Test Suite

The project includes **205 automated tests** plus 1,000 randomized legal games, all running in Node with no browser required.

### Running the tests

```bash
node js/tests.js
```

### Current result

```text
[SHAPES]      145 passed, 0 failed
[CONNECTIVITY]  5 passed, 0 failed
[WIN]          10 passed, 0 failed
[LIFETIME]      7 passed, 0 failed
[GAME_STATE]   10 passed, 0 failed
[AI]           22 passed, 0 failed
[REPLAY]        3 passed, 0 failed
[RANDOMIZED]    3 passed, 0 failed

Total: 205 / 205 passed
```

### Coverage

- **Shapes**: all 35 hexominoes, 216 orientations, placements, connectivity, no duplicates.
- **Win detection**: X wins, O wins, no false positives, diagonal-only rejected, exactly-5 required, overlapping shapes, win on the latest move.
- **Lifetime**: oldest-piece removal, ordering, separate X/O histories, cap enforcement, win-before-expiration.
- **Game state**: illegal moves rejected, post-win moves rejected, correct turn, restart, undo.
- **AI**: never plays occupied cell, never moves after game over, takes immediate wins, blocks immediate wins, respects piece cap.
- **Replay**: reproduces same status and winner.
- **Randomized**: 1,000 random legal games in the suite.

### 10,000 randomized games

Run the extended simulation:

```bash
node -e "require('./js/tests.js'); console.log(global.Tests.runRandomGames(10000));"
```

Latest result:

```json
{
  "games": 10000,
  "wins": 9967,
  "draws": 33,
  "crashes": 0,
  "invalidStates": 0,
  "noWinnerEnds": 0,
  "maxLen": 200,
  "avgLen": "43.6"
}
```

---

## Deploy to GitHub Pages

This repo includes a GitHub Actions workflow that deploys automatically on every push to `main`.

**One-time setup:**

1. In the repo: Settings → Pages → Build and deployment → Source: GitHub Actions.
2. Push to `main` — the workflow publishes to `https://<your-username>.github.io/<your-repo-name>/`.

After setup, every push to `main` automatically redeploys the updated website.

---

## Quality Audit

A full file-by-file audit was conducted covering game-rule correctness, AI legality, DOM injection, local storage, overlay behaviour, and accessibility. The audit was mapped against four frameworks: **ISO/IEC 27001** (information security), **ISO/IEC 5055** (software quality), **ISO/IEC 42001** (AI governance), and the **IT Act 2000** (India, including SPDI Rules 2011).

### Bugs found and fixed

- **Practice mode AI never moved.** `createInitialState` assigned `aiPlayer` only for `HUMAN_VS_AI`, so Practice left `aiPlayer` as `null`. The controller therefore never called the AI after X's first move. Practice now assigns O as the AI player, with a regression test.
- **Restart Match wiped score.** The confirmation copy said the score would be kept, but the handler zeroed `localStorage` statistics. Restart now resets only the board. Reset Statistics remains the explicit wipe path.
- **Match statistics accepted malformed storage.** `loadStats()` parsed JSON without checking that `x`, `o`, and `draw` were finite non-negative numbers. Corrupted storage could render `NaN` in the scoreboard. Load now validates and falls back to `{ x: 0, o: 0, draw: 0 }`.
- **Win banner and shape-guide details used `innerHTML`.** Shape names were interpolated into HTML. The values are currently engine-controlled, but the injection surface was unnecessary. Both now use `textContent` / `createElement`.
- **Game Lab could freeze the tab.** Simulation count accepted up to 100,000 games on the UI thread. The input and controller now clamp to 100–10,000.
- **No Content Security Policy.** `index.html` now ships a restrictive CSP: `default-src 'self'`, no remote scripts, no `connect-src`, no `object-src`.

### Second-round audit fixes

- **Replay/Analyzer/What-If ignored custom board size from Game Lab.** All three rebuilt state with the default board size even when Game Lab had configured a different size. `boardSize` is now passed to every `createInitialState` call, and the analyzer uses `after.boardSize` for its library lookup.
- **What-If "select a move in the log" was not wired.** Clicking a move in the log only highlighted it. The What-If panel now branches from the clicked move when open.
- **Async AI could apply a move to stale state.** If the user clicked New Game, Undo, or Apply Lab while the AI was thinking, the AI callback could fire against the new state. A `aiToken` counter now invalidates stale callbacks; Undo is blocked while AI is thinking.
- **CSP blocked Google Fonts.** The CSP now allows `fonts.googleapis.com` for stylesheets and `fonts.gstatic.com` for font files.
- **Move-log items were mouse-only.** Log entries now have `tabindex="0"`, `role="button"`, and Enter/Space keyboard handlers.
- **Easy AI description was inaccurate.** README claimed "non-losing random move" but the code does not filter losing moves. Description now says "random legal move (may blunder)".
- **Restart Match description was inaccurate.** README said it wiped statistics, but the handler only resets the board. Description now matches the code.

### Compliance audit — control-by-control

#### ISO/IEC 27001 — Information Security

| Control | Status | Evidence |
|---|---|---|
| A.8.24 Use of cryptography | NOT APPLICABLE | Client-only game; no passwords, tokens, or secrets |
| A.8.3 Information access restriction | COMPLIANT | Stats load validates finite numbers before rendering |
| A.8.10 Information deletion | COMPLIANT | Reset Statistics wipes match scores; no other stored identity |
| A.8.15 Logging | COMPLIANT | Console used only for library validation; no PII logged |
| A.8.28 Secure coding | COMPLIANT | `'use strict'`; no `eval`, no `dangerouslySetInnerHTML`; DOM built with `createElement`/`textContent` after the audit |
| A.8.25 Secure development lifecycle | PARTIALLY COMPLIANT | 205 tests and Pages workflow exist; no lint/test CI gate on push |
| A.8.20 Network security | PARTIALLY COMPLIANT | CSP added; GitHub Pages still does not set additional security headers from this repo |

#### ISO/IEC 5055 — Software Quality

| Characteristic | Status | Evidence |
|---|---|---|
| Functional Suitability | COMPLIANT | Win, lifetime, undo, replay, and AI legality are covered by tests |
| Reliability | COMPLIANT | `localStorage` in try/catch; AI search cloned before mutation; malformed stats rejected |
| Security | COMPLIANT | No secrets, no XSS interpolation after the audit, CSP on `index.html` |
| Maintainability | PARTIALLY COMPLIANT | Clear module split; `main.js` remains a large controller (~600 lines) |
| Performance Efficiency | PARTIALLY COMPLIANT | Game Lab simulations run on the UI thread; count is now capped |
| Usability | COMPLIANT | How to Play, Practice, keyboard focus, live status, responsive HUD |

#### ISO/IEC 42001 — AI Governance

| Aspect | Status | Evidence |
|---|---|---|
| Algorithmic Accountability | COMPLIANT | Deterministic minimax; Easy's 20% randomness is explicit |
| Hallucination Defense | COMPLIANT | Zero runtime LLM calls; analyzer explanations come from engine data |
| Data Provenance | COMPLIANT | AI uses the same `GameEngine.applyMove` as the human |
| Privacy in AI Context | COMPLIANT | No user data is sent to any AI service |
| Human Oversight | PARTIALLY COMPLIANT | Difficulty, Undo, and What If? exist; no in-game "report this move" channel |

#### IT Act 2000 — India (including SPDI Rules 2011)

| Aspect | Status | Evidence |
|---|---|---|
| SPDI Collection with Consent | NOT APPLICABLE | No name, email, or other SPDI is collected |
| Sensitive Data Transmission | COMPLIANT | No player data is transmitted; the app is static |
| Data Retention and Deletion | COMPLIANT | Only anonymous win/draw counts persist; Reset Statistics deletes them |
| Reasonable Security Practices | COMPLIANT | CSP, no secrets, validated local storage, no remote script |

### Audit verdict

**PASS with documented exceptions.** Core gameplay, AI legality, and storage handling hold after the Practice-mode and Restart Match fixes. Remaining items are documentation-level limitations (no E2E tests, no lint CI gate, Game Lab remains a UI-thread simulation tool), not rule defects.

---

## Known Limitations

1. **No browser-level E2E tests.** The 205 tests cover the pure logic layer in Node. Overlay, focus-trap, and layout behaviour are not automated.
2. **Game Lab simulations block the UI.** Randomized runs execute on the main thread. The count is capped at 10,000 to reduce freeze risk.
3. **Match statistics are origin-scoped.** `localhost` and the GitHub Pages origin keep separate scores.
4. **Multi-tab usage.** Two tabs on the same origin share `localStorage`; last-write-wins on the stats key.
5. **What If? does not auto-play the AI.** Alternate timelines are human-driven on a separate board so the original match is preserved.
6. **Hard AI is not unbeatable.** Search depth is 3. It finds immediate wins and blocks, but does not look ahead indefinitely.

---

## Accessibility

- Full keyboard navigation: cells are focusable, Enter/Space places a piece.
- Visible focus states.
- Semantic buttons and ARIA labels.
- `aria-live` status region for screen readers.
- Respects `prefers-reduced-motion`.
- X and O are distinguished by **shape/glyph**, not color alone.

---

## Tech Stack

- **HTML5** — semantic markup, ARIA, script load order
- **CSS3** — immersive dark HUD, responsive layout, CSS custom properties, `clip-path`, `backdrop-filter`, `mask-image`
- **Vanilla JavaScript** — no frameworks, no build step, no external libraries
- **Node.js** — test execution and syntax checks
- **GitHub Actions** — CI/CD for Pages deployment
- **Inline SVG** — shape guide renders all 35 hexominoes as vector graphics

---

## Why This Project Is in My Portfolio

### 1. Pure logic separated from presentation

The game rules (`shape-engine`, `game-state`, `game-engine`, `ai`) have zero DOM dependency and run identically in the browser and Node. This separation makes the full test suite possible without a browser environment.

### 2. Algorithmic thinking, not framework plumbing

- Data-driven hexomino definitions with automatic rotation, reflection, normalization, deduplication, and placement generation
- Win detection with last-move short-circuit filtering across placements
- Minimax with alpha-beta pruning and centrality-based move ordering
- Canonical state hashing for draw detection by repetition
- Piece-lifetime tracking with win-before-expiration ordering

These are problems you solve with thinking, not with `npm install`.

### 3. Production-grade rule consistency

The engine guarantees, by construction, that these never contradict:

1. A win requires exactly six orthogonally-connected same-player cells.
2. A player can hold at least six active pieces (default limit = 6).
3. Expiration only happens when exceeding the configured limit.
4. Win detection runs before expiration caused by the new move.
5. Rotations/reflections count.
6. Diagonal-only connectivity does not count.
7. The AI uses the same `applyMove` as the human.
8. Replay re-applies the same move list through the same engine.

### 4. Full-stack product ownership

- **Product design**: strategic hexomino win condition, piece-lifetime mechanic, three game modes, three AI difficulties
- **UX engineering**: immersive HUD, responsive across phone/tablet/desktop, piece-age indicators, move preview, keyboard accessible
- **DevOps**: GitHub Actions CI for Pages deployment
- **Documentation**: architecture, rules, testing, design decisions, extension guide

### 5. What this project is NOT

Being honest about what this doesn't prove:

- No backend — there's no database, no auth, no server. It's a client-only game.
- No real users at scale — match statistics are single-device `localStorage`.
- No integration/E2E tests — the 122 unit tests cover the pure logic layer, but there are no browser-level tests.

### The one-line pitch

> *"I can architect a complete browser game with pure logic separation, a real minimax AI, and a 122-test suite — all in vanilla JavaScript with zero dependencies."*

---

## License

MIT — free to use, learn from, and build on.

---

*Developed by: Gauresh Chari — NeuralWeb Solutions, Goa © 2026*
*Built with AI*
