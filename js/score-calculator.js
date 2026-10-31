// French Scrabble Official Score Calculator
// Implements full rules: letter multipliers, word multipliers, wear rule, dual-word multipliers, 50-pt Scrabble bonus.

import { BOARD_SIZE, CENTER_ROW, CENTER_COL, CELL_TYPES, BOARD_LAYOUT, LETTER_VALUES, SCRABBLE_BONUS } from './constants.js';

export class ScoreCalculator {
  /**
   * Get the face value of a tile.
   * If it's a Joker (lettre blanche), value is 0.
   */
  static getLetterBaseValue(tile) {
    if (!tile) return 0;
    if (tile.isJoker || tile.letter === '?') return 0;
    const letter = (tile.letter || '').toUpperCase();
    return LETTER_VALUES[letter] || 0;
  }

  /**
   * Compute the full score for a move.
   * @param {Array<Array>} currentGrid 15x15 grid of tiles
   * @param {Array<Array>} previousGrid 15x15 grid of tiles before this move
   * @param {Array<Object>} newTiles List of newly placed tiles { row, col, letter, isJoker, jokerLetter }
   * @param {Boolean} isFirstTurn True if board was empty
   * @returns {Object} { totalScore, wordsFormed: [{ word, score, details, isPrimary }], isScrabble, bonusScrabble }
   */
  static calculateTurnScore(currentGrid, previousGrid, newTiles, isFirstTurn = false) {
    if (!newTiles || newTiles.length === 0) {
      return { totalScore: 0, wordsFormed: [], isScrabble: false, bonusScrabble: 0 };
    }

    const newTilesMap = new Map();
    newTiles.forEach(t => {
      newTilesMap.set(`${t.row},${t.col}`, t);
    });

    const isTileNew = (r, c) => newTilesMap.has(`${r},${c}`);

    // Determine orientation of new tiles
    let primaryOrientation = 'horizontal';
    if (newTiles.length > 1) {
      const allSameRow = newTiles.every(t => t.row === newTiles[0].row);
      const allSameCol = newTiles.every(t => t.col === newTiles[0].col);
      if (allSameCol && !allSameRow) {
        primaryOrientation = 'vertical';
      }
    } else {
      // If only 1 tile placed, check which direction has adjacent tiles
      const r = newTiles[0].row;
      const c = newTiles[0].col;
      const hasHoriz = (c > 0 && currentGrid[r][c - 1]) || (c < BOARD_SIZE - 1 && currentGrid[r][c + 1]);
      const hasVert = (r > 0 && currentGrid[r - 1][c]) || (r < BOARD_SIZE - 1 && currentGrid[r + 1][c]);
      if (hasVert && !hasHoriz) {
        primaryOrientation = 'vertical';
      }
    }

    const wordsFormed = [];
    const recordedWordKeys = new Set();

    // Helper: Extract contiguous word spanning (r, c) in horizontal direction
    const getHorizontalWord = (startR, startC) => {
      let left = startC;
      while (left > 0 && currentGrid[startR][left - 1]) {
        left--;
      }
      let right = startC;
      while (right < BOARD_SIZE - 1 && currentGrid[startR][right + 1]) {
        right++;
      }
      if (left === right) return null; // 1-letter is not a word

      const key = `H:${startR}:${left}-${right}`;
      if (recordedWordKeys.has(key)) return null;
      recordedWordKeys.add(key);

      let wordStr = '';
      let sumLetters = 0;
      let wordMultiplier = 1;
      const letterDetails = [];

      for (let c = left; c <= right; c++) {
        const cell = currentGrid[startR][c];
        const displayChar = cell.isJoker ? (cell.jokerLetter || cell.letter || '?') : cell.letter;
        wordStr += displayChar;

        const baseVal = ScoreCalculator.getLetterBaseValue(cell);
        const tileIsNew = isTileNew(startR, c);

        if (tileIsNew) {
          const cellType = BOARD_LAYOUT[startR][c];
          let letterMult = 1;

          if (cellType === CELL_TYPES.LD) letterMult = 2;
          else if (cellType === CELL_TYPES.LT) letterMult = 3;

          const tileScore = baseVal * letterMult;
          sumLetters += tileScore;

          // Word multipliers apply only when tile is newly placed
          if (cellType === CELL_TYPES.MT) wordMultiplier *= 3;
          else if (cellType === CELL_TYPES.MD) wordMultiplier *= 2;
          else if (cellType === CELL_TYPES.CENTER && isFirstTurn) wordMultiplier *= 2;

          letterDetails.push({ char: displayChar, baseVal, letterMult, finalVal: tileScore, isNew: true });
        } else {
          // Existing tile from earlier turn: no multipliers apply!
          sumLetters += baseVal;
          letterDetails.push({ char: displayChar, baseVal, letterMult: 1, finalVal: baseVal, isNew: false });
        }
      }

      const score = sumLetters * wordMultiplier;
      return {
        direction: 'H',
        word: wordStr,
        row: startR,
        startCol: left,
        endCol: right,
        score,
        wordMultiplier,
        letterDetails
      };
    };

    // Helper: Extract contiguous word spanning (r, c) in vertical direction
    const getVerticalWord = (startR, startC) => {
      let top = startR;
      while (top > 0 && currentGrid[top - 1][startC]) {
        top--;
      }
      let bottom = startR;
      while (bottom < BOARD_SIZE - 1 && currentGrid[bottom + 1][startC]) {
        bottom++;
      }
      if (top === bottom) return null; // 1-letter is not a word

      const key = `V:${startC}:${top}-${bottom}`;
      if (recordedWordKeys.has(key)) return null;
      recordedWordKeys.add(key);

      let wordStr = '';
      let sumLetters = 0;
      let wordMultiplier = 1;
      const letterDetails = [];

      for (let r = top; r <= bottom; r++) {
        const cell = currentGrid[r][startC];
        const displayChar = cell.isJoker ? (cell.jokerLetter || cell.letter || '?') : cell.letter;
        wordStr += displayChar;

        const baseVal = ScoreCalculator.getLetterBaseValue(cell);
        const tileIsNew = isTileNew(r, startC);

        if (tileIsNew) {
          const cellType = BOARD_LAYOUT[r][startC];
          let letterMult = 1;

          if (cellType === CELL_TYPES.LD) letterMult = 2;
          else if (cellType === CELL_TYPES.LT) letterMult = 3;

          const tileScore = baseVal * letterMult;
          sumLetters += tileScore;

          // Word multipliers apply only when tile is newly placed
          if (cellType === CELL_TYPES.MT) wordMultiplier *= 3;
          else if (cellType === CELL_TYPES.MD) wordMultiplier *= 2;
          else if (cellType === CELL_TYPES.CENTER && isFirstTurn) wordMultiplier *= 2;

          letterDetails.push({ char: displayChar, baseVal, letterMult, finalVal: tileScore, isNew: true });
        } else {
          // Existing tile: wear rule applies
          sumLetters += baseVal;
          letterDetails.push({ char: displayChar, baseVal, letterMult: 1, finalVal: baseVal, isNew: false });
        }
      }

      const score = sumLetters * wordMultiplier;
      return {
        direction: 'V',
        word: wordStr,
        col: startC,
        startRow: top,
        endRow: bottom,
        score,
        wordMultiplier,
        letterDetails
      };
    };

    // 1. Primary Word along the placement axis
    if (primaryOrientation === 'horizontal') {
      const primary = getHorizontalWord(newTiles[0].row, newTiles[0].col);
      if (primary) {
        primary.isPrimary = true;
        wordsFormed.push(primary);
      }
      // Cross words for each tile
      newTiles.forEach(t => {
        const cross = getVerticalWord(t.row, t.col);
        if (cross) {
          cross.isPrimary = false;
          wordsFormed.push(cross);
        }
      });
    } else {
      const primary = getVerticalWord(newTiles[0].row, newTiles[0].col);
      if (primary) {
        primary.isPrimary = true;
        wordsFormed.push(primary);
      }
      // Cross words for each tile
      newTiles.forEach(t => {
        const cross = getHorizontalWord(t.row, t.col);
        if (cross) {
          cross.isPrimary = false;
          wordsFormed.push(cross);
        }
      });
    }

    // Sum word scores
    let wordsTotal = wordsFormed.reduce((sum, w) => sum + w.score, 0);

    // Scrabble (Bingo): exactly 7 new tiles placed in a single turn -> +50 pts!
    const isScrabble = newTiles.length === 7;
    const bonusScrabble = isScrabble ? SCRABBLE_BONUS : 0;
    const totalScore = wordsTotal + bonusScrabble;

    return {
      totalScore,
      wordsTotal,
      wordsFormed,
      isScrabble,
      bonusScrabble
    };
  }
}
