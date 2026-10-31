// Strict Scrabble Rules & Anti-Cheat Engine (Version Francophone)
// Validates 1st turn, alignment, continuity, connectivity, board integrity, 102-tile bag counts, and French lexicon.

import { BOARD_SIZE, CENTER_ROW, CENTER_COL, OFFICIAL_BAG_DISTRIBUTION } from './constants.js';
import { ScoreCalculator } from './score-calculator.js';
import { scrabbleDictionary } from './dictionary.js';

export class RulesEngine {
  /**
   * Compare previous turn grid and current turn grid to detect changes.
   * @param {Array<Array>} previousGrid
   * @param {Array<Array>} currentGrid
   * @returns {Object} { newTiles, modifiedTiles, removedTiles, isFirstTurn }
   */
  static analyzeGridChanges(previousGrid, currentGrid) {
    const newTiles = [];
    const modifiedTiles = [];
    const removedTiles = [];
    let prevTotalTiles = 0;

    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        const prev = previousGrid ? previousGrid[r][c] : null;
        const curr = currentGrid ? currentGrid[r][c] : null;

        if (prev) prevTotalTiles++;

        if (!prev && curr) {
          newTiles.push({ row: r, col: c, ...curr });
        } else if (prev && !curr) {
          removedTiles.push({ row: r, col: c, ...prev });
        } else if (prev && curr) {
          if (prev.letter !== curr.letter || prev.isJoker !== curr.isJoker) {
            modifiedTiles.push({ row: r, col: c, oldTile: prev, newTile: curr });
          }
        }
      }
    }

    const isFirstTurn = prevTotalTiles === 0;
    return { newTiles, modifiedTiles, removedTiles, isFirstTurn, prevTotalTiles };
  }

  /**
   * Strict validation of a move according to official French Scrabble rules.
   * @param {Array<Array>} previousGrid 15x15 grid of turn N-1
   * @param {Array<Array>} currentGrid 15x15 grid of turn N
   * @returns {Object} { isValid: boolean, error: string|null, scoreData: object|null, ruleCode: string|null }
   */
  static validateMove(previousGrid, currentGrid) {
    const { newTiles, modifiedTiles, removedTiles, isFirstTurn } = this.analyzeGridChanges(previousGrid, currentGrid);

    // 0. Did the user place any tiles?
    if (newTiles.length === 0) {
      if (removedTiles.length > 0 || modifiedTiles.length > 0) {
        return {
          isValid: false,
          ruleCode: 'INTEGRITY_TAMPERING',
          error: 'TRICHE / INTÉGRITÉ: Des tuiles du tour précédent ont été modifiées ou retirées sans poser de nouveau mot.'
        };
      }
      return {
        isValid: false,
        ruleCode: 'NO_TILES_PLACED',
        error: 'Aucune nouvelle lettre posée sur le plateau.'
      };
    }

    // 1. Board Integrity check (Anti-Cheat): Previous tiles cannot be moved, removed, or changed
    if (removedTiles.length > 0) {
      const pos = removedTiles.map(t => `${String.fromCharCode(65 + t.col)}${t.row + 1}`).join(', ');
      return {
        isValid: false,
        ruleCode: 'INTEGRITY_REMOVAL',
        error: `TRICHE DÉTECTÉE: Des tuiles déjà jouées aux tours précédents ont été retirées (${pos}).`
      };
    }

    if (modifiedTiles.length > 0) {
      const pos = modifiedTiles.map(t => `${String.fromCharCode(65 + t.col)}${t.row + 1}`).join(', ');
      return {
        isValid: false,
        ruleCode: 'INTEGRITY_ALTERATION',
        error: `TRICHE DÉTECTÉE: Des tuiles existantes ont été altérées (${pos}).`
      };
    }

    // 2. Maximum tiles played in one turn: <= 7
    if (newTiles.length > 7) {
      return {
        isValid: false,
        ruleCode: 'MAX_TILES_EXCEEDED',
        error: `TRICHE DÉTECTÉE: ${newTiles.length} tuiles posées en un seul tour ! Le chevalet est limité à 7 lettres maximum.`
      };
    }

    // 3. Tile Bag Count Control (102 official French tiles)
    const currentBagCounts = {};
    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        const cell = currentGrid[r][c];
        if (cell) {
          const char = cell.isJoker ? '?' : cell.letter.toUpperCase();
          currentBagCounts[char] = (currentBagCounts[char] || 0) + 1;
        }
      }
    }

    for (const [letter, count] of Object.entries(currentBagCounts)) {
      const maxAllowed = OFFICIAL_BAG_DISTRIBUTION[letter] || 0;
      if (count > maxAllowed) {
        return {
          isValid: false,
          ruleCode: 'BAG_OVERFLOW',
          error: `TRICHE / STOCK PIOCHE: Il y a ${count}x '${letter === '?' ? 'Joker' : letter}' sur le plateau, alors que la pioche officielle francophone n'en contient que ${maxAllowed} au maximum !`
        };
      }
    }

    // 4. Alignment: All new tiles must be on a single row or single column
    const rows = new Set(newTiles.map(t => t.row));
    const cols = new Set(newTiles.map(t => t.col));
    const isSingleRow = rows.size === 1;
    const isSingleCol = cols.size === 1;

    if (!isSingleRow && !isSingleCol) {
      return {
        isValid: false,
        ruleCode: 'ALIGNMENT_ERROR',
        error: 'COUP ILLÉGAL: Toutes les nouvelles lettres doivent être posées sur une seule et même ligne ou colonne (les diagonales et placements dispersés sont interdits).'
      };
    }

    // 5. First turn rules:
    // - Must pass through center star H8 (row 7, col 7)
    // - Must have at least 2 letters
    if (isFirstTurn) {
      const coversCenter = newTiles.some(t => t.row === CENTER_ROW && t.col === CENTER_COL);
      if (!coversCenter) {
        return {
          isValid: false,
          ruleCode: 'FIRST_TURN_CENTER',
          error: 'COUP ILLÉGAL: Le premier mot de la partie doit obligatoirement passer par la case centrale (H8, étoile).'
        };
      }
      if (newTiles.length < 2) {
        return {
          isValid: false,
          ruleCode: 'FIRST_TURN_MIN_LENGTH',
          error: 'COUP ILLÉGAL: Le premier mot doit comporter au moins 2 lettres.'
        };
      }
    }

    // 6. Continuity check:
    // Between the first and last new tile along the placement line, there must be NO empty cells.
    // Any spaces between new tiles must be filled by existing tiles from previous turns.
    if (isSingleRow) {
      const r = newTiles[0].row;
      const colIndices = newTiles.map(t => t.col).sort((a, b) => a - b);
      const minCol = colIndices[0];
      const maxCol = colIndices[colIndices.length - 1];

      for (let c = minCol; c <= maxCol; c++) {
        if (!currentGrid[r][c]) {
          return {
            isValid: false,
            ruleCode: 'CONTINUITY_GAP',
            error: `COUP ILLÉGAL: Mot discontinu ! La case ${String.fromCharCode(65 + c)}${r + 1} est vide dans l'alignement.`
          };
        }
      }
    } else {
      const c = newTiles[0].col;
      const rowIndices = newTiles.map(t => t.row).sort((a, b) => a - b);
      const minRow = rowIndices[0];
      const maxRow = rowIndices[rowIndices.length - 1];

      for (let r = minRow; r <= maxRow; r++) {
        if (!currentGrid[r][c]) {
          return {
            isValid: false,
            ruleCode: 'CONTINUITY_GAP',
            error: `COUP ILLÉGAL: Mot discontinu ! La case ${String.fromCharCode(65 + c)}${r + 1} est vide dans l'alignement.`
          };
        }
      }
    }

    // 7. Mandatory connection (after turn 1):
    // At least one new tile must touch (orthogonally: up/down/left/right) an existing tile from a previous turn.
    if (!isFirstTurn) {
      let isConnected = false;

      // Check if any new tile bridges adjacent to a previous tile, or is in the same contiguous line as a previous tile
      for (const t of newTiles) {
        const neighbors = [
          [t.row - 1, t.col],
          [t.row + 1, t.col],
          [t.row, t.col - 1],
          [t.row, t.col + 1]
        ];

        for (const [nr, nc] of neighbors) {
          if (nr >= 0 && nr < BOARD_SIZE && nc >= 0 && nc < BOARD_SIZE) {
            // Check if this neighbor existed in previous turn
            if (previousGrid && previousGrid[nr][nc]) {
              isConnected = true;
              break;
            }
          }
        }
        if (isConnected) break;
      }

      if (!isConnected) {
        return {
          isValid: false,
          ruleCode: 'DISCONNECTED_MOVE',
          error: 'COUP ILLÉGAL: Le mot posé est isolé ! Il doit obligatoirement se raccorder (toucher horizontalement ou verticalement) à au moins une lettre déjà présente.'
        };
      }
    }

    // 8. Calculate score and extract all words formed (primary word + all cross words)
    const scoreData = ScoreCalculator.calculateTurnScore(currentGrid, previousGrid, newTiles, isFirstTurn);

    if (scoreData.wordsFormed.length === 0) {
      return {
        isValid: false,
        ruleCode: 'NO_WORDS_FORMED',
        error: 'COUP INVALIDE: Aucun mot valide d\'au moins 2 lettres n\'a été formé.'
      };
    }

    // 9. Offline French Dictionary Validation:
    // Every single word formed (primary AND cross words) must exist in the lexicon!
    const invalidWords = [];
    for (const w of scoreData.wordsFormed) {
      if (!scrabbleDictionary.isValid(w.word)) {
        invalidWords.push(w.word);
      }
    }

    if (invalidWords.length > 0) {
      return {
        isValid: false,
        ruleCode: 'DICTIONARY_REJECTED',
        error: `TRICHE / MOT INVALIDE: ${invalidWords.length === 1 ? 'Le mot' : 'Les mots'} "${invalidWords.join('", "')}" n'existe${invalidWords.length === 1 ? ' pas' : 'nt pas'} dans le dictionnaire officiel francophone !`,
        invalidWords,
        scoreData
      };
    }

    // All rules passed!
    return {
      isValid: true,
      error: null,
      ruleCode: null,
      scoreData,
      newTiles,
      isFirstTurn
    };
  }
}
