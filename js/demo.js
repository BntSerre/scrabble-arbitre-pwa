// 3-Turn Interactive Demo Scenario for Referee, Anti-Cheat, and Scoring Verification
// Tour 1: Legal opening move passing through center H8 with 7 letters (Scrabble +50 pts)
// Tour 2: Illegal move (Diagonal cheat) triggering the "TRICHE / COUP INVALIDE" alert
// Tour 3: Spectacular legal play connecting onto a Mot Compte Triple (MT) with 7-letter Scrabble

import { BOARD_SIZE, CENTER_ROW, CENTER_COL } from './constants.js';

export class ScrabbleDemo {
  constructor(app) {
    this.app = app;
  }

  async runTour1() {
    this.app.notify('Tour 1 (Joueur 1) : Placement de "ARBITRE" (7 lettres) sur l\'étoile centrale H8...', 'info');

    const word1 = 'ARBITRE';
    const startRow = CENTER_ROW; // 7
    const startCol = 4; // cols 4, 5, 6, 7 (H8), 8, 9, 10

    const gridTour1 = this.app.cloneGrid(this.app.previousGrid);
    for (let i = 0; i < word1.length; i++) {
      gridTour1[startRow][startCol + i] = {
        letter: word1[i],
        isJoker: false
      };
    }

    this.app.setGrid(gridTour1);
    this.app.switchTab('board');
    await this.wait(400);

    const res1 = this.app.validateCurrentMove();
    if (res1.isValid) {
      this.app.commitValidatedMove(res1.scoreData);
      this.app.playSuccessSound();
      this.app.notify(`Tour 1 validé ! ARBITRE = ${res1.scoreData.totalScore} pts (+50 pts SCRABBLE BINGO)`, 'success');
      return res1;
    } else {
      console.error('Erreur inattendue Tour 1:', res1.error);
      return res1;
    }
  }

  async runTour2() {
    this.app.notify('Tour 2 (Joueur 2) : Simulation d\'un coup de TRICHE (placement illégal en diagonale)...', 'warning');

    const gridTour2 = this.app.cloneGrid(this.app.previousGrid);
    // Add letters diagonally at (6, 5), (5, 6), (4, 7)
    gridTour2[6][5] = { letter: 'F', isJoker: false };
    gridTour2[5][6] = { letter: 'O', isJoker: false };
    gridTour2[4][7] = { letter: 'U', isJoker: false };

    this.app.setGrid(gridTour2);
    await this.wait(400);

    // Attempt to validate Tour 2 -> MUST TRIGGER CHEAT ALERT
    this.app.handleValidateClick();
    return false;
  }

  async runTour3() {
    this.app.dismissModal();
    this.app.revertToPreviousGrid();
    await this.wait(400);

    this.app.notify('Tour 3 (Joueur 2) : Mot magistral "INVENTER" (7 nouvelles tuiles) touchant le Mot Compte Triple (MT)...', 'info');

    const gridTour3 = this.app.cloneGrid(this.app.previousGrid);
    const newLettersTour3 = ['N', 'V', 'E', 'N', 'T', 'E', 'R'];
    for (let i = 0; i < newLettersTour3.length; i++) {
      gridTour3[8 + i][CENTER_COL] = {
        letter: newLettersTour3[i],
        isJoker: false
      };
    }

    this.app.setGrid(gridTour3);
    await this.wait(400);

    const res3 = this.app.validateCurrentMove();
    if (res3.isValid) {
      this.app.commitValidatedMove(res3.scoreData);
      this.app.celebrateWin();
      this.app.notify(`TOUR 3 VALIDÉ ! Mot: INVENTER sur Mot Compte Triple = ${res3.scoreData.totalScore} pts (+50 pts SCRABBLE BINGO)`, 'success');
      return res3;
    } else {
      console.warn('Tour 3 validation result:', res3);
      return res3;
    }
  }

  async run3TurnSequence() {
    this.app.notify('Démarrage de la séquence de démonstration (3 tours)...', 'info');
    this.app.resetGame();

    // 1. Tour 1
    await this.wait(600);
    await this.runTour1();
    await this.wait(2000);

    // 2. Tour 2 (Triche bloquée)
    await this.runTour2();
    await this.wait(3000);

    // 3. Tour 3 (Scrabble 7 lettres + Triple)
    await this.runTour3();
    await this.wait(2000);

    // Switch to stats tab
    this.app.switchTab('stats');
    this.app.notify('Démonstration terminée avec succès ! Graphiques mis à jour.', 'success');
  }

  wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
