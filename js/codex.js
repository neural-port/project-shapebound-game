/**
 * ShapeBound — The Shape Codex
 *
 * Compendium of all 35 canonical free hexominoes.
 * Tracks discovered shapes, win counts, and mastery ratings in localStorage.
 * Works offline with zero dependencies.
 */

(function (global) {
  'use strict';

  const STORAGE_KEY = 'shapebound_codex_v1';

  // 35 Tactical Hexomino Profiles
  const CODEX_DATA = {
    H01: { name: 'The Monolith', alias: 'Straight Bar', type: 'Linear', lore: 'The purest linear structure. Dominates entire ranks or files with undeniable presence.' },
    H02: { name: 'The Viper', alias: 'S-Bend', type: 'Serpentine', lore: 'A stealthy serpentine zig-zag capable of weaving through contested central fields.' },
    H03: { name: 'The Cross', alias: 'Greek Cross', type: 'Symmetric', lore: 'Spreads defensive influence across all four cardinal axes simultaneously.' },
    H04: { name: 'The Falcon', alias: 'Winged Blade', type: 'Angular', lore: 'A dynamic hooked formation resembling a swooping raptor in mid-strike.' },
    H05: { name: 'The Fortress', alias: 'Heavy Block', type: 'Cluster', lore: 'A dense 2x3 brick formation with immense spatial defense.' },
    H06: { name: 'The Scythe', alias: 'Long Hook', type: 'Angular', lore: 'Extends a razor reach into enemy territory while anchoring in the rear.' },
    H07: { name: 'The Wave', alias: 'Dual Crest', type: 'Serpentine', lore: 'An undulating diagonal curve that bypasses conventional orthogonal barricades.' },
    H08: { name: 'The Anchor', alias: 'T-Spur', type: 'Anchored', lore: 'Features a wide stabilizing base with a prominent forward pylon.' },
    H09: { name: 'The Trident', alias: 'Three-Prong', type: 'Forked', lore: 'A split-fork construction threatening multiple simultaneous tactical alignments.' },
    H10: { name: 'The Stairway', alias: 'Triple Step', type: 'Stepped', lore: 'Ascends diagonally across the grid, controlling diagonal corridors.' },
    H11: { name: 'The Hammer', alias: 'Anvil Spur', type: 'Impact', lore: 'Combines a sturdy haft with a heavy perpendicular striking head.' },
    H12: { name: 'The Raven', alias: 'Crooked Wing', type: 'Angular', lore: 'Deceptive asymmetric wings that disguise impending completion.' },
    H13: { name: 'The Bastion', alias: 'Corner Guard', type: 'Cluster', lore: 'Wraps around corner territory, securing board boundaries.' },
    H14: { name: 'The Eclipse', alias: 'Notched Box', type: 'Cluster', lore: 'A near-solid block with a single tactical notch designed for traps.' },
    H15: { name: 'The Cobra', alias: 'Hooded Snake', type: 'Serpentine', lore: 'Rises upwards with an intimidating flared crest.' },
    H16: { name: 'The Anvil', alias: 'Forged Block', type: 'Impact', lore: 'Resistant to expiration disruption due to closely grouped neighbor cells.' },
    H17: { name: 'The Lance', alias: 'Offset Spear', type: 'Linear', lore: 'Long straight shaft with an offset barb designed for sudden penetration.' },
    H18: { name: 'The Prism', alias: 'Corner Pivot', type: 'Angular', lore: 'Reflects lines of force at right angles across the board.' },
    H19: { name: 'The Mantis', alias: 'Grasping Claw', type: 'Forked', lore: 'Dual pincer formation that clamps down on empty board sectors.' },
    H20: { name: 'The Citadel', alias: 'Triple Tower', type: 'Anchored', lore: 'Multi-turreted formation commanding surrounding squares.' },
    H21: { name: 'The Talon', alias: 'Raptor Claw', type: 'Angular', lore: 'Sharp hook that snatches victory right along the board rim.' },
    H22: { name: 'The Javelin', alias: 'Extended Dart', type: 'Linear', lore: 'Pierces deep into the opponent’s defensive half.' },
    H23: { name: 'The Zigzag', alias: 'Lightning Bolt', type: 'Stepped', lore: 'Strikes suddenly across staggered files.' },
    H24: { name: 'The Crescent', alias: 'Enclosing Arc', type: 'Curved', lore: 'Gently encircles center squares while threatening a closed perimeter.' },
    H25: { name: 'The Beacon', alias: 'Watchtower', type: 'Anchored', lore: 'High focal point that overlooks peripheral board play.' },
    H26: { name: 'The Chariot', alias: 'Dual Axle', type: 'Cluster', lore: 'Fast-moving symmetry that adapts to rapid back-and-forth turns.' },
    H27: { name: 'The Mirage', alias: 'Split Ghost', type: 'Angular', lore: 'Difficult for opponents to track mentally amid busy boards.' },
    H28: { name: 'The Saber', alias: 'Curved Blade', type: 'Angular', lore: 'Sweeps across three rows in a fluid diagonal cut.' },
    H29: { name: 'The Pillar', alias: 'Offset Colonnade', type: 'Linear', lore: 'Stout column capable of withstanding adjacent opponent pressure.' },
    H30: { name: 'The Labyrinth', alias: 'Complex Coil', type: 'Serpentine', lore: 'Intricate winding shape, among the rarest and most prestigious wins.' },
    H31: { name: 'The Tempest', alias: 'Whirlwind', type: 'Chiral', lore: 'Rotational pinwheel shape radiating geometric tension.' },
    H32: { name: 'The Sentry', alias: 'Overlook', type: 'Anchored', lore: 'Positioned to observe and counter opponent movements.' },
    H33: { name: 'The Drake', alias: 'Dragon Tail', type: 'Serpentine', lore: 'Long undulating tail that curls around defensive blocks.' },
    H34: { name: 'The Keystone', alias: 'Arch Crown', type: 'Symmetric', lore: 'Locks two halves of a defensive line into an impenetrable winning unit.' },
    H35: { name: 'The Nexus', alias: 'Central Hub', type: 'Symmetric', lore: 'The crown jewel of hexominoes. Compact, beautiful, and devastating.' }
  };

  let inMemoryStore = {};

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

  function registerWin(shapeCode, mode, difficulty) {
    if (!shapeCode) return null;
    const progress = loadProgress();
    const entry = progress[shapeCode] || { wins: 0, firstUnlocked: Date.now(), highestDiff: null };
    const isNew = !progress[shapeCode];
    entry.wins++;
    entry.lastWon = Date.now();
    if (difficulty === 'HARD' || !entry.highestDiff) entry.highestDiff = difficulty;
    progress[shapeCode] = entry;
    saveProgress(progress);
    return { isNew: isNew, shapeCode: shapeCode, info: CODEX_DATA[shapeCode] || {} };
  }

  function getShapeInfo(shapeCode) {
    return CODEX_DATA[shapeCode] || { name: shapeCode, alias: 'Hexomino', type: 'General', lore: 'A valid 6-cell geometric shape.' };
  }

  function getAllShapesWithProgress() {
    const progress = loadProgress();
    const list = [];
    const keys = Object.keys(CODEX_DATA);
    for (let i = 0; i < keys.length; i++) {
      const code = keys[i];
      const meta = CODEX_DATA[code];
      const prog = progress[code] || null;
      list.push({
        code: code,
        name: meta.name,
        alias: meta.alias,
        type: meta.type,
        lore: meta.lore,
        unlocked: !!prog,
        wins: prog ? prog.wins : 0,
        firstUnlocked: prog ? prog.firstUnlocked : null
      });
    }
    return list;
  }

  function getUnlockedCount() {
    const progress = loadProgress();
    return Object.keys(progress).length;
  }

  const Codex = {
    CODEX_DATA: CODEX_DATA,
    registerWin: registerWin,
    getShapeInfo: getShapeInfo,
    getAllShapesWithProgress: getAllShapesWithProgress,
    getUnlockedCount: getUnlockedCount
  };

  global.Codex = Codex;
})(typeof window !== 'undefined' ? window : globalThis);
