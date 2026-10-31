// Scrabble Official French Constants & Board Layout
// 15x15 board, French letter values & French letter bag distribution (102 tiles)

export const BOARD_SIZE = 15;
export const CENTER_ROW = 7;
export const CENTER_COL = 7;

// Premium square types
export const CELL_TYPES = {
  NORMAL: 'NORMAL',
  MT: 'MT', // Mot Compte Triple (Red)
  MD: 'MD', // Mot Compte Double (Pink)
  LT: 'LT', // Lettre Compte Triple (Dark Blue)
  LD: 'LD', // Lettre Compte Double (Light Blue)
  CENTER: 'CENTER' // Étoile centrale (counts as MD on 1st turn)
};

// Premium square layout (15x15)
export const BOARD_LAYOUT = Array.from({ length: BOARD_SIZE }, () => 
  Array(BOARD_SIZE).fill(CELL_TYPES.NORMAL)
);

// Mot Compte Triple (MT) - 8 squares
const MT_POSITIONS = [
  [0, 0], [0, 7], [0, 14],
  [7, 0],         [7, 14],
  [14, 0], [14, 7], [14, 14]
];

// Mot Compte Double (MD) - 16 squares + center
const MD_POSITIONS = [
  [1, 1], [2, 2], [3, 3], [4, 4],
  [1, 13], [2, 12], [3, 11], [4, 10],
  [13, 1], [12, 2], [11, 3], [10, 4],
  [13, 13], [12, 12], [11, 11], [10, 10]
];

// Lettre Compte Triple (LT) - 12 squares
const LT_POSITIONS = [
  [1, 5], [1, 9],
  [5, 1], [5, 5], [5, 9], [5, 13],
  [9, 1], [9, 5], [9, 9], [9, 13],
  [13, 5], [13, 9]
];

// Lettre Compte Double (LD) - 24 squares
const LD_POSITIONS = [
  [0, 3], [0, 11],
  [2, 6], [2, 8],
  [3, 0], [3, 7], [3, 14],
  [6, 2], [6, 6], [6, 8], [6, 12],
  [7, 3], [7, 11],
  [8, 2], [8, 6], [8, 8], [8, 12],
  [11, 0], [11, 7], [11, 14],
  [12, 6], [12, 8],
  [14, 3], [14, 11]
];

MT_POSITIONS.forEach(([r, c]) => { BOARD_LAYOUT[r][c] = CELL_TYPES.MT; });
MD_POSITIONS.forEach(([r, c]) => { BOARD_LAYOUT[r][c] = CELL_TYPES.MD; });
LT_POSITIONS.forEach(([r, c]) => { BOARD_LAYOUT[r][c] = CELL_TYPES.LT; });
LD_POSITIONS.forEach(([r, c]) => { BOARD_LAYOUT[r][c] = CELL_TYPES.LD; });
BOARD_LAYOUT[CENTER_ROW][CENTER_COL] = CELL_TYPES.CENTER;

// Official French letter points (Barème officiel francophone)
export const LETTER_VALUES = {
  A: 1, B: 3, C: 3, D: 2, E: 1, F: 4, G: 2, H: 4, I: 1,
  J: 8, K: 10, L: 1, M: 2, N: 1, O: 1, P: 3, Q: 8, R: 1,
  S: 1, T: 1, U: 1, V: 4, W: 10, X: 10, Y: 10, Z: 10,
  '?': 0 // Joker / Lettre blanche
};

// Official French Scrabble letter pool distribution (102 jetons au total)
export const OFFICIAL_BAG_DISTRIBUTION = {
  E: 15,
  A: 9,
  I: 8,
  N: 6, O: 6, R: 6, S: 6, T: 6, U: 6,
  L: 5,
  D: 3, M: 3,
  B: 2, C: 2, P: 2, F: 2, H: 2, V: 2, G: 2,
  J: 1, K: 1, Q: 1, W: 1, X: 1, Y: 1, Z: 1,
  '?': 2
};

export const TOTAL_TILES = 102;
export const SCRABBLE_BONUS = 50; // Bonus for placing all 7 tiles in one turn
