// Main Application UI & Workflow Controller
// Coordinates Camera CV, OCR, Interactive 15x15 Board, Strict Rules, Score Calculator, Dictionary & Stats.

import { BOARD_SIZE, CENTER_ROW, CENTER_COL, CELL_TYPES, BOARD_LAYOUT, LETTER_VALUES, OFFICIAL_BAG_DISTRIBUTION } from './constants.js';
import { scrabbleDictionary } from './dictionary.js';
import { ScoreCalculator } from './score-calculator.js';
import { RulesEngine } from './rules-engine.js';
import { CVPipeline } from './cv-pipeline.js';
import { ocrEngine } from './ocr-engine.js';
import { TestBoardGenerator } from './test-generator.js';
import { storageStats } from './storage-stats.js';
import { ScrabbleDemo } from './demo.js';

export class ScrabbleApp {
  constructor() {
    // Up to 4 player color themes
    this.playerColors = [
      { name: 'emerald', hex: '#10b981', bg: 'bg-emerald-500', text: 'text-emerald-400', badge: 'bg-emerald-950 text-emerald-300 border-emerald-500/50', ring: 'ring-emerald-400' },
      { name: 'amber', hex: '#f59e0b', bg: 'bg-amber-500', text: 'text-amber-400', badge: 'bg-amber-950 text-amber-300 border-amber-500/50', ring: 'ring-amber-400' },
      { name: 'sky', hex: '#0ea5e9', bg: 'bg-sky-500', text: 'text-sky-400', badge: 'bg-sky-950 text-sky-300 border-sky-500/50', ring: 'ring-sky-400' },
      { name: 'purple', hex: '#a855f7', bg: 'bg-purple-500', text: 'text-purple-400', badge: 'bg-purple-950 text-purple-300 border-purple-500/50', ring: 'ring-purple-400' }
    ];

    // Load initial players from storage
    const saved = storageStats.getPlayers();
    this.players = [
      { id: saved[0]?.id || 'p1', name: saved[0]?.name || 'Joueur 1', score: 0 },
      { id: saved[1]?.id || 'p2', name: saved[1]?.name || 'Joueur 2', score: 0 }
    ];
    this.setupPlayerCount = 2;
    this.currentPlayerIndex = 0;
    this.turnNumber = 1;

    // Grids (15x15)
    this.currentGrid = this.createEmptyGrid();
    this.previousGrid = this.createEmptyGrid();
    this.moveHistory = [];

    // Cell selection for manual edit
    this.selectedCell = null;

    // Components
    this.cvPipeline = null;
    this.demo = new ScrabbleDemo(this);

    // Audio effects via Web Audio API (100% offline, zero assets)
    this.audioCtx = null;

    this.init();
  }

  createEmptyGrid() {
    return Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(null));
  }

  setGrid(newGrid) {
    this.currentGrid = this.cloneGrid(newGrid);
    this.renderBoard();
    this.updateScorePreview();
  }

  cloneGrid(grid) {
    return grid.map(row => row.map(cell => (cell ? { ...cell } : null)));
  }

  async init() {
    console.log('[App] Initialisation de Scrabble Arbitre IA...');

    // Setup CV Pipeline
    const rawCanvas = document.getElementById('camera-canvas');
    const overlayCanvas = document.getElementById('camera-overlay');
    if (rawCanvas && overlayCanvas) {
      this.cvPipeline = new CVPipeline(rawCanvas, overlayCanvas);
    }

    // Load French Dictionary
    scrabbleDictionary.loadDictionary().then(() => {
      this.updateDictionaryStats();
    });

    // Setup DOM Event Listeners
    this.setupTabs();
    this.setupGameTab();
    this.setupCameraControls();
    this.setupBoardInteraction();
    this.setupGameActions();
    this.setupDictionaryUI();
    this.setupStatsUI();
    this.setupNewGameModal();

    // Render initial empty board and player states
    this.populateSavedPlayersDatalist();
    this.renderGameTabInputs();
    this.renderCurrentMatchStats();
    this.renderBoard();
    this.updatePlayerScoresUI();

    // Generate initial test board image on camera canvas so user sees the camera viewfinder immediately
    this.loadSyntheticSample();

    console.log('[App] Prêt.');
  }

  // --- AUDIO SYNTHESIS (Zero audio files required) ---
  playBeep(freq = 440, type = 'sine', duration = 0.1) {
    try {
      if (!this.audioCtx) {
        this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      }
      if (this.audioCtx.state === 'suspended') {
        this.audioCtx.resume();
      }
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, this.audioCtx.currentTime);
      gain.gain.setValueAtTime(0.12, this.audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.audioCtx.currentTime + duration);
      osc.connect(gain);
      gain.connect(this.audioCtx.destination);
      osc.start();
      osc.stop(this.audioCtx.currentTime + duration);
    } catch (e) {
      // Audio might be muted or blocked by browser policy
    }
  }

  playErrorSound() {
    this.playBeep(180, 'sawtooth', 0.25);
    setTimeout(() => this.playBeep(130, 'sawtooth', 0.35), 180);
  }

  playSuccessSound() {
    this.playBeep(523.25, 'triangle', 0.12); // C5
    setTimeout(() => this.playBeep(659.25, 'triangle', 0.12), 100); // E5
    setTimeout(() => this.playBeep(783.99, 'triangle', 0.25), 200); // G5
  }

  celebrateWin() {
    this.playSuccessSound();
    setTimeout(() => {
      this.playBeep(1046.50, 'triangle', 0.4); // C6
    }, 320);
  }

  // --- TAB NAVIGATION ---
  setupTabs() {
    const tabButtons = document.querySelectorAll('[data-tab-target]');
    tabButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const target = btn.getAttribute('data-tab-target');
        this.switchTab(target);
      });
    });
  }

  switchTab(tabId) {
    // Hide all tab panels
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.add('hidden'));
    // Show active panel
    const active = document.getElementById(`tab-${tabId}`);
    if (active) active.classList.remove('hidden');

    // Update bottom nav active indicators
    document.querySelectorAll('[data-tab-target]').forEach(btn => {
      const isTarget = btn.getAttribute('data-tab-target') === tabId;
      btn.classList.toggle('text-emerald-400', isTarget);
      btn.classList.toggle('text-slate-400', !isTarget);
    });

    // Specific tab activations
    if (tabId === 'stats') {
      this.refreshStatsTab();
    } else if (tabId === 'board') {
      this.renderBoard();
      this.updateScorePreview();
    } else if (tabId === 'game') {
      this.renderGameTabInputs();
      this.renderCurrentMatchStats();
    }
  }

  // --- CAMERA & VISION CONTROLS ---
  setupCameraControls() {
    const btnStartCam = document.getElementById('btn-start-cam');
    const btnStopCam = document.getElementById('btn-stop-cam');
    const btnSnapScan = document.getElementById('btn-snap-scan');
    const btnLoadSample = document.getElementById('btn-load-sample');
    const fileInput = document.getElementById('file-input-photo');
    const btnUpload = document.getElementById('btn-upload-photo');
    const btnDemo3Turns = document.getElementById('btn-demo-3turns');

    if (btnStartCam) {
      btnStartCam.addEventListener('click', async () => {
        const ok = await this.cvPipeline.startCamera();
        if (ok) {
          btnStartCam.classList.add('hidden');
          btnStopCam.classList.remove('hidden');
          this.notify('Flux caméra activé. Ajustez les 4 coins au doigt sur la grille.', 'info');
        } else {
          this.notify('Impossible d\'ouvrir la caméra. Vérifiez les permissions.', 'error');
        }
      });
    }

    if (btnStopCam) {
      btnStopCam.addEventListener('click', () => {
        this.cvPipeline.stopCamera();
        btnStopCam.classList.add('hidden');
        btnStartCam.classList.remove('hidden');
        this.notify('Caméra arrêtée.', 'info');
      });
    }

    if (btnUpload && fileInput) {
      btnUpload.addEventListener('click', () => fileInput.click());
      fileInput.addEventListener('change', async (e) => {
        if (e.target.files && e.target.files[0]) {
          await this.cvPipeline.loadImage(e.target.files[0]);
          this.notify('Photo chargée avec succès. Ajustez les 4 coins.', 'success');
        }
      });
    }

    if (btnLoadSample) {
      btnLoadSample.addEventListener('click', () => {
        this.loadSyntheticSample();
        this.notify('Plateau de test synthétique généré !', 'success');
      });
    }

    if (btnSnapScan) {
      btnSnapScan.addEventListener('click', () => this.runFullRecognitionPipeline());
    }

    if (btnDemo3Turns) {
      btnDemo3Turns.addEventListener('click', () => this.demo.run3TurnSequence());
    }
  }

  loadSyntheticSample() {
    // Generate perspective photo of a realistic Scrabble game
    const sampleGrid = this.createEmptyGrid();
    sampleGrid[CENTER_ROW][CENTER_COL] = { letter: 'S', isJoker: false };
    sampleGrid[CENTER_ROW][CENTER_COL + 1] = { letter: 'A', isJoker: false };
    sampleGrid[CENTER_ROW][CENTER_COL + 2] = { letter: 'C', isJoker: false };

    const { canvas, trueCorners } = TestBoardGenerator.renderPerspectivePhoto(sampleGrid, { width: 900, height: 900 });

    this.cvPipeline.canvas.width = canvas.width;
    this.cvPipeline.canvas.height = canvas.height;
    this.cvPipeline.ctx.drawImage(canvas, 0, 0);

    // Set corners to the generated quad
    this.cvPipeline.corners = trueCorners.map((pt, i) => ({ ...pt, name: ['TL', 'TR', 'BR', 'BL'][i] }));
    this.cvPipeline.renderOverlay();
  }

  /**
   * Run full OpenCV homography warp + 15x15 slicing + HSV color detection + OCR
   */
  async runFullRecognitionPipeline() {
    this.notify('Redressement OpenCV et découpage des 225 cases en cours...', 'info');

    // 1. Rectify board (OpenCV warpPerspective or fallback)
    const rectified = this.cvPipeline.rectifyBoard();

    // 2. Slice and detect tiles by colorimetry (HSV)
    const boardMatrix = this.cvPipeline.sliceAndDetectTiles(rectified);

    // 3. Compare with previousGrid to identify newly placed tiles
    const newlyDetectedTiles = [];
    const scannedGrid = this.cloneGrid(this.previousGrid);

    let detectedCount = 0;
    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        const cellData = boardMatrix[r][c];
        const hadTileBefore = !!(this.previousGrid && this.previousGrid[r][c]);

        if (cellData.hasTile && !hadTileBefore) {
          detectedCount++;
          // OCR on the new tile
          const ocrRes = await ocrEngine.recognizeTile(cellData.tileCanvas);
          scannedGrid[r][c] = {
            letter: ocrRes.letter,
            isJoker: ocrRes.isJoker,
            jokerLetter: ocrRes.isJoker ? 'E' : null,
            confidence: ocrRes.confidence,
            isNew: true
          };
          newlyDetectedTiles.push({ row: r, col: c, ...scannedGrid[r][c] });
        }
      }
    }

    this.currentGrid = scannedGrid;
    this.switchTab('board');
    this.renderBoard();
    this.updateScorePreview();

    if (detectedCount > 0) {
      this.notify(`${detectedCount} nouvelle(s) tuile(s) détectée(s) ! Vérifiez ou ajustez sur la grille.`, 'success');
      this.playSuccessSound();
    } else {
      this.notify('Aucune nouvelle tuile détectée. Vous pouvez aussi placer les lettres directement au doigt.', 'warning');
    }
  }

  // --- 15x15 BOARD RENDERING & INTERACTIVE EDITING ---
  setupBoardInteraction() {
    const boardContainer = document.getElementById('scrabble-board-grid');
    if (!boardContainer) return;

    // Build the 15x15 DOM grid cells
    boardContainer.innerHTML = '';
    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        const cellEl = document.createElement('button');
        cellEl.className = 'board-cell flex items-center justify-center relative select-none cursor-pointer focus:outline-none transition-all duration-150';
        cellEl.dataset.row = r;
        cellEl.dataset.col = c;

        cellEl.addEventListener('click', () => this.handleCellClick(r, c));
        boardContainer.appendChild(cellEl);
      }
    }

    // Modal Letter Picker setup
    this.setupLetterPicker();
  }

  renderBoard() {
    const boardContainer = document.getElementById('scrabble-board-grid');
    if (!boardContainer) return;

    const cells = boardContainer.querySelectorAll('.board-cell');
    cells.forEach(cellEl => {
      const r = parseInt(cellEl.dataset.row, 10);
      const c = parseInt(cellEl.dataset.col, 10);
      const cellType = BOARD_LAYOUT[r][c];
      const tile = this.currentGrid[r][c];
      const isOld = this.previousGrid && this.previousGrid[r][c];
      const isSelected = this.selectedCell && this.selectedCell.row === r && this.selectedCell.col === c;

      // Reset classes
      cellEl.className = 'board-cell flex flex-col items-center justify-center relative select-none rounded-[3px] text-[10px] font-bold transition-all';
      if (isSelected) {
        cellEl.classList.add('ring-2', 'ring-amber-400', 'z-20');
      }

      if (tile) {
        // Tile is placed here
        if (tile.isJoker) {
          cellEl.classList.add('bg-amber-100', 'text-slate-900', 'shadow-md');
          cellEl.innerHTML = `
            <span class="text-sm font-black">${tile.jokerLetter || tile.letter || '?'}</span>
            <span class="text-[7px] text-amber-700 uppercase font-bold">★ JKR</span>
          `;
        } else {
          // Normal wood tile
          const val = LETTER_VALUES[tile.letter] || 0;
          cellEl.classList.add('bg-[#f3dfb2]', 'text-slate-900', 'shadow-sm', 'border', 'border-[#d0b376]');
          cellEl.innerHTML = `
            <span class="text-xs sm:text-sm font-black leading-none">${tile.letter}</span>
            <span class="text-[8px] font-semibold text-slate-700 leading-none absolute bottom-0.5 right-1">${val}</span>
          `;
        }

        // Highlight newly placed tiles
        if (!isOld) {
          cellEl.classList.add('ring-2', 'ring-emerald-500', 'bg-emerald-50');
        } else {
          cellEl.classList.add('opacity-90');
        }
      } else {
        // Empty board cell
        this.styleEmptyCell(cellEl, cellType);
      }
    });

    this.updateRemainingBagCount();
  }

  styleEmptyCell(el, type) {
    switch (type) {
      case CELL_TYPES.MT:
        el.className += ' bg-rose-900 text-rose-200 border border-rose-800/60';
        el.innerHTML = '<span class="text-[7px] leading-tight font-black text-center">MOT<br>TRIPLE</span>';
        break;
      case CELL_TYPES.MD:
        el.className += ' bg-pink-900/80 text-pink-200 border border-pink-800/60';
        el.innerHTML = '<span class="text-[7px] leading-tight font-black text-center">MOT<br>DOUBLE</span>';
        break;
      case CELL_TYPES.LT:
        el.className += ' bg-blue-900 text-blue-200 border border-blue-800/60';
        el.innerHTML = '<span class="text-[7px] leading-tight font-black text-center">LETTRE<br>TRIPLE</span>';
        break;
      case CELL_TYPES.LD:
        el.className += ' bg-sky-900/80 text-sky-200 border border-sky-800/60';
        el.innerHTML = '<span class="text-[7px] leading-tight font-black text-center">LETTRE<br>DOUBLE</span>';
        break;
      case CELL_TYPES.CENTER:
        el.className += ' bg-pink-900 text-pink-200 border border-pink-700 flex items-center justify-center';
        el.innerHTML = '<span class="text-sm">★</span>';
        break;
      default:
        el.className += ' bg-slate-800/90 text-slate-500 border border-slate-700/40';
        el.innerHTML = '';
        break;
    }
  }

  handleCellClick(r, c) {
    const isLocked = this.previousGrid && this.previousGrid[r][c];
    if (isLocked) {
      this.notify(`Case ${String.fromCharCode(65 + c)}${r + 1} verrouillée (jouée lors d'un tour précédent).`, 'warning');
      this.playBeep(200, 'sine', 0.08);
      return;
    }

    this.selectedCell = { row: r, col: c };
    this.renderBoard();
    this.openLetterPicker(r, c);
  }

  setupLetterPicker() {
    const pickerModal = document.getElementById('modal-letter-picker');
    const keysContainer = document.getElementById('letter-keys-container');
    const btnClose = document.getElementById('btn-close-picker');
    const btnDelete = document.getElementById('btn-delete-tile');
    const btnJoker = document.getElementById('btn-joker-tile');

    if (!keysContainer) return;

    // Generate A-Z buttons
    keysContainer.innerHTML = '';
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    for (const char of alphabet) {
      const btn = document.createElement('button');
      const val = LETTER_VALUES[char];
      btn.className = 'flex flex-col items-center justify-center py-2 px-1 bg-slate-800 hover:bg-emerald-600 active:scale-95 text-white font-bold rounded-lg border border-slate-700 shadow transition-all';
      btn.innerHTML = `<span class="text-base">${char}</span><span class="text-[9px] text-slate-400 font-normal">${val}pt</span>`;
      btn.addEventListener('click', () => {
        this.setTileAtSelected(char, false);
        this.closeLetterPicker();
      });
      keysContainer.appendChild(btn);
    }

    if (btnClose) btnClose.addEventListener('click', () => this.closeLetterPicker());
    if (btnDelete) {
      btnDelete.addEventListener('click', () => {
        this.setTileAtSelected(null);
        this.closeLetterPicker();
      });
    }
    if (btnJoker) {
      btnJoker.addEventListener('click', () => {
        const letter = prompt('Quelle lettre ce Joker (lettre blanche) représente-t-il ? (A-Z)', 'E') || 'E';
        this.setTileAtSelected('?', true, letter.toUpperCase());
        this.closeLetterPicker();
      });
    }
  }

  openLetterPicker(r, c) {
    const pickerModal = document.getElementById('modal-letter-picker');
    const title = document.getElementById('picker-cell-title');
    if (title) {
      title.textContent = `Case ${String.fromCharCode(65 + c)}${r + 1} (${BOARD_LAYOUT[r][c]})`;
    }
    if (pickerModal) pickerModal.classList.remove('hidden');
    this.playBeep(500, 'sine', 0.05);
  }

  closeLetterPicker() {
    const pickerModal = document.getElementById('modal-letter-picker');
    if (pickerModal) pickerModal.classList.add('hidden');
    this.selectedCell = null;
    this.renderBoard();
    this.updateScorePreview();
  }

  setTileAtSelected(letter, isJoker = false, jokerLetter = null) {
    if (!this.selectedCell) return;
    const { row, col } = this.selectedCell;

    if (!letter) {
      this.currentGrid[row][col] = null;
    } else {
      this.currentGrid[row][col] = {
        letter: isJoker ? '?' : letter.toUpperCase(),
        isJoker: !!isJoker,
        jokerLetter: isJoker ? (jokerLetter || 'E') : null,
        isNew: true
      };
    }
    this.renderBoard();
    this.updateScorePreview();
  }

  // --- GAME ACTIONS & VALIDATION ---
  setupGameActions() {
    const btnValidate = document.getElementById('btn-validate-move');
    const btnClearTurn = document.getElementById('btn-clear-turn');
    const btnPassTurn = document.getElementById('btn-pass-turn');
    const btnNewGame = document.getElementById('btn-new-game');
    const btnDismissCheat = document.getElementById('btn-dismiss-cheat');

    if (btnValidate) btnValidate.addEventListener('click', () => this.handleValidateClick());
    if (btnClearTurn) btnClearTurn.addEventListener('click', () => this.revertToPreviousGrid());
    if (btnPassTurn) btnPassTurn.addEventListener('click', () => this.handlePassTurn());
    if (btnNewGame) btnNewGame.addEventListener('click', () => this.openNewGameModal());
    if (btnDismissCheat) btnDismissCheat.addEventListener('click', () => this.dismissModal());
  }

  updateScorePreview() {
    const result = RulesEngine.validateMove(this.previousGrid, this.currentGrid);
    const scoreValEl = document.getElementById('preview-turn-score');
    const wordsListEl = document.getElementById('preview-words-list');
    const statusBannerEl = document.getElementById('status-preview-banner');

    if (!scoreValEl) return;

    if (result.isValid) {
      const score = result.scoreData.totalScore;
      scoreValEl.textContent = `${score} pts`;
      scoreValEl.className = 'text-2xl font-black text-emerald-400';

      if (statusBannerEl) {
        statusBannerEl.className = 'p-2 rounded-lg bg-emerald-950/60 border border-emerald-500/40 text-emerald-300 text-xs flex items-center justify-between';
        statusBannerEl.innerHTML = `
          <span>✓ Coup valide (${result.scoreData.wordsFormed.length} mot(s))</span>
          ${result.scoreData.isScrabble ? '<span class="bg-amber-500 text-slate-900 font-bold px-2 py-0.5 rounded text-[10px] animate-pulse">BINGO +50</span>' : ''}
        `;
      }

      if (wordsListEl) {
        wordsListEl.innerHTML = result.scoreData.wordsFormed.map(w => `
          <div class="flex items-center justify-between text-xs bg-slate-800/80 px-2.5 py-1 rounded border border-slate-700">
            <span class="font-bold text-slate-200 tracking-wider">${w.word}</span>
            <span class="font-black text-emerald-400">${w.score} pts</span>
          </div>
        `).join('');
      }
    } else {
      scoreValEl.textContent = '0 pt';
      scoreValEl.className = 'text-2xl font-black text-slate-500';

      if (statusBannerEl) {
        statusBannerEl.className = 'p-2 rounded-lg bg-rose-950/60 border border-rose-500/40 text-rose-300 text-xs';
        statusBannerEl.textContent = result.error || 'En attente de placement...';
      }

      if (wordsListEl) {
        wordsListEl.innerHTML = '<span class="text-xs text-slate-500 italic">Aucun mot valide calculé</span>';
      }
    }
  }

  handleValidateClick() {
    const res = this.validateCurrentMove();
    if (!res.isValid) {
      this.playErrorSound();
      this.showCheatAlert(res.error, res.ruleCode);
      const currP = this.players[this.currentPlayerIndex];
      storageStats.recordCheatAttempt(currP.id);
    } else {
      this.playSuccessSound();
      this.notify(`Coup validé ! +${res.scoreData.totalScore} pts pour ${this.players[this.currentPlayerIndex].name}`, 'success');
      this.commitValidatedMove(res.scoreData);
    }
  }

  validateCurrentMove() {
    return RulesEngine.validateMove(this.previousGrid, this.currentGrid);
  }

  commitValidatedMove(scoreData) {
    const currP = this.players[this.currentPlayerIndex];
    currP.score += scoreData.totalScore;

    // Log move
    this.moveHistory.push({
      turn: this.turnNumber,
      playerId: currP.id,
      playerName: currP.name,
      score: scoreData.totalScore,
      words: scoreData.wordsFormed.map(w => w.word).join(', '),
      isScrabble: scoreData.isScrabble
    });

    // Save to storage & stats
    storageStats.recordTurn(currP.id, scoreData);

    // Lock board: previousGrid becomes currentGrid
    this.previousGrid = this.cloneGrid(this.currentGrid);

    // Advance turn: round advances when all players have played
    this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.players.length;
    if (this.currentPlayerIndex === 0) {
      this.turnNumber++;
    }

    const nextP = this.players[this.currentPlayerIndex];
    this.renderBoard();
    this.updatePlayerScoresUI();
    this.updateScorePreview();
    this.renderCurrentMatchStats();

    this.notify(`C'est au tour de ${nextP.name} de jouer !`, 'info');
  }

  handlePassTurn() {
    const currP = this.players[this.currentPlayerIndex];
    this.notify(`${currP.name} a passé son tour (0 pt).`, 'info');
    this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.players.length;
    if (this.currentPlayerIndex === 0) {
      this.turnNumber++;
    }
    const nextP = this.players[this.currentPlayerIndex];
    this.updatePlayerScoresUI();
    this.renderCurrentMatchStats();
    this.notify(`C'est au tour de ${nextP.name} de jouer !`, 'info');
    this.playBeep(300, 'sine', 0.1);
  }

  revertToPreviousGrid() {
    this.currentGrid = this.cloneGrid(this.previousGrid);
    this.renderBoard();
    this.updateScorePreview();
    this.notify('Modifications du tour annulées.', 'info');
    this.playBeep(260, 'sine', 0.08);
  }

  resetGame() {
    this.players.forEach(p => p.score = 0);
    this.currentPlayerIndex = 0;
    this.turnNumber = 1;
    this.currentGrid = this.createEmptyGrid();
    this.previousGrid = this.createEmptyGrid();
    this.moveHistory = [];
    this.renderBoard();
    this.updatePlayerScoresUI();
    this.updateScorePreview();
    this.renderCurrentMatchStats();
    this.notify('Partie réinitialisée !', 'success');
  }

  // --- PARTIE TAB: GAME SETUP & LIVE MATCH STATS ---
  setupGameTab() {
    // 1. Player count selector buttons (2, 3, 4)
    const countBtns = document.querySelectorAll('.btn-game-count');
    countBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const count = parseInt(btn.dataset.gameCount, 10);
        this.setGameTabPlayerCount(count);
      });
    });

    // 2. Start game with current player configuration
    const btnApply = document.getElementById('btn-apply-game-setup');
    if (btnApply) {
      btnApply.addEventListener('click', () => {
        this.applyGameTabSetup();
      });
    }

    // 3. Finish current match & save into persistent stats
    const btnFinish = document.getElementById('btn-finish-current-match');
    if (btnFinish) {
      btnFinish.addEventListener('click', () => {
        this.finishCurrentMatch();
      });
    }
  }

  setGameTabPlayerCount(count) {
    this.setupPlayerCount = count;

    // Update active badge
    const badge = document.getElementById('game-active-count-badge');
    if (badge) badge.textContent = `${count} Joueurs`;

    // Update button states
    document.querySelectorAll('.btn-game-count').forEach(btn => {
      const c = parseInt(btn.dataset.gameCount, 10);
      const isSelected = c === count;
      btn.classList.toggle('bg-emerald-600', isSelected);
      btn.classList.toggle('border-emerald-400', isSelected);
      btn.classList.toggle('text-white', isSelected);
      btn.classList.toggle('shadow-md', isSelected);
      btn.classList.toggle('bg-slate-800', !isSelected);
      btn.classList.toggle('border-slate-700', !isSelected);
      btn.classList.toggle('text-slate-300', !isSelected);
    });

    this.renderGameTabInputs();
  }

  renderGameTabInputs() {
    const container = document.getElementById('game-player-inputs-container');
    if (!container) return;

    this.populateSavedPlayersDatalist();
    const saved = storageStats.getPlayers();
    container.innerHTML = '';

    for (let i = 0; i < this.setupPlayerCount; i++) {
      const color = this.playerColors[i % this.playerColors.length];
      const defaultName = (this.players[i] && this.players[i].name) || (saved[i] && saved[i].name) || `Joueur ${i + 1}`;

      const row = document.createElement('div');
      row.className = 'bg-slate-950/80 p-2.5 rounded-xl border border-slate-800 space-y-1.5 transition-all';
      row.innerHTML = `
        <div class="flex items-center justify-between">
          <div class="flex items-center space-x-2">
            <span class="w-6 h-6 rounded-full ${color.bg} text-slate-950 font-black text-xs flex items-center justify-center shadow">J${i + 1}</span>
            <label class="text-xs font-bold text-slate-200">Joueur ${i + 1}</label>
          </div>
          <span class="text-[10px] font-bold ${color.text} uppercase tracking-wider">J${i + 1}</span>
        </div>
        <div>
          <input type="text" id="game-input-player-${i}" value="${defaultName}" list="saved-players-datalist" placeholder="Prénom ou pseudo..." class="w-full bg-slate-900 border border-slate-700 focus:border-emerald-500 rounded-lg py-2 px-3 text-xs font-bold text-slate-100 focus:outline-none transition-colors">
        </div>
      `;
      container.appendChild(row);
    }
  }

  applyGameTabSetup() {
    const newPlayers = [];
    for (let i = 0; i < this.setupPlayerCount; i++) {
      const input = document.getElementById(`game-input-player-${i}`);
      const rawName = input ? input.value.trim() : '';
      const name = rawName || `Joueur ${i + 1}`;
      // Persist / retrieve in stats manager
      const persistentPlayer = storageStats.getOrCreatePlayerByName(name);
      newPlayers.push({
        id: persistentPlayer.id,
        name: persistentPlayer.name,
        score: 0
      });
    }

    this.players = newPlayers;
    this.currentPlayerIndex = 0;
    this.turnNumber = 1;
    this.currentGrid = this.createEmptyGrid();
    this.previousGrid = this.createEmptyGrid();
    this.moveHistory = [];

    this.renderBoard();
    this.updatePlayerScoresUI();
    this.updateScorePreview();
    this.renderCurrentMatchStats();
    this.switchTab('board');

    this.playSuccessSound();
    const namesList = this.players.map(p => p.name).join(', ');
    this.notify(`Partie lancée (${this.players.length} joueurs) : ${namesList} !`, 'success');
  }

  renderCurrentMatchStats() {
    // 1. Turn badge in match stats card
    const turnBadge = document.getElementById('live-match-turn-badge');
    const activeP = this.players[this.currentPlayerIndex] || this.players[0];
    if (turnBadge && activeP) {
      turnBadge.textContent = `Tour ${this.turnNumber} • À ${activeP.name} de jouer`;
    }

    // 2. Leaderboard ranking
    const leaderboard = document.getElementById('live-match-leaderboard');
    if (leaderboard && this.players.length > 0) {
      const sorted = [...this.players].sort((a, b) => b.score - a.score);
      const topScore = sorted[0].score;
      const rankMedals = ['🥇 1er', '🥈 2e', '🥉 3e', '4e'];

      leaderboard.innerHTML = sorted.map((p, rankIdx) => {
        const originalIndex = this.players.findIndex(orig => orig.id === p.id);
        const color = this.playerColors[(originalIndex >= 0 ? originalIndex : rankIdx) % this.playerColors.length];
        const isCurrentTurn = p.id === activeP.id;
        const initial = p.name ? p.name.charAt(0).toUpperCase() : `J${rankIdx + 1}`;
        const gap = rankIdx === 0 ? 'Leader' : `-${topScore - p.score} pts`;

        return `
          <div class="flex items-center justify-between p-2 rounded-xl border transition-all ${
            isCurrentTurn 
              ? 'bg-slate-800/90 border-emerald-500/50 shadow-md ring-1 ring-emerald-400/40' 
              : 'bg-slate-950/60 border-slate-800/70'
          }">
            <div class="flex items-center space-x-2.5 min-w-0">
              <span class="text-xs font-black text-slate-400 w-10 shrink-0">${rankMedals[rankIdx] || `${rankIdx + 1}e`}</span>
              <span class="w-6 h-6 rounded-full ${color.bg} text-slate-950 font-black text-[10px] flex items-center justify-center shrink-0 shadow">${initial}</span>
              <div class="truncate">
                <span class="text-xs font-bold ${isCurrentTurn ? 'text-white font-black' : 'text-slate-200'} truncate block leading-tight">${p.name}</span>
                ${isCurrentTurn ? '<span class="text-[9px] text-emerald-400 font-extrabold flex items-center gap-1"><span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>En train de jouer</span>' : ''}
              </div>
            </div>
            <div class="text-right shrink-0 ml-2">
              <span class="text-xs font-black ${color.text} block leading-tight">${p.score} pts</span>
              <span class="text-[9px] font-bold ${rankIdx === 0 ? 'text-amber-400' : 'text-slate-500'} block">${gap}</span>
            </div>
          </div>
        `;
      }).join('');
    }

    // 3. Match Highlights: Best word and Scrabbles
    const bestWordDisplay = document.getElementById('match-best-word-display');
    const bestWordAuthor = document.getElementById('match-best-word-author');
    const scrabblesDisplay = document.getElementById('match-total-scrabbles');
    const movesCountDisplay = document.getElementById('match-moves-count');

    let bestMove = null;
    let totalScrabbles = 0;

    for (const m of this.moveHistory) {
      if (!bestMove || m.score > bestMove.score) {
        bestMove = m;
      }
      if (m.isScrabble) {
        totalScrabbles++;
      }
    }

    if (bestWordDisplay && bestWordAuthor) {
      if (bestMove && bestMove.words) {
        bestWordDisplay.textContent = bestMove.words;
        bestWordAuthor.textContent = `${bestMove.score} pts par ${bestMove.playerName}`;
      } else {
        bestWordDisplay.textContent = '-';
        bestWordAuthor.textContent = '0 pt';
      }
    }

    if (scrabblesDisplay) {
      scrabblesDisplay.textContent = `${totalScrabbles} fois`;
    }

    if (movesCountDisplay) {
      movesCountDisplay.textContent = `${this.moveHistory.length} coup${this.moveHistory.length > 1 ? 's' : ''}`;
    }

    // 4. Recent moves log
    const movesLogContainer = document.getElementById('match-recent-moves-log');
    if (movesLogContainer) {
      if (this.moveHistory.length === 0) {
        movesLogContainer.innerHTML = '<div class="text-[11px] text-slate-500 italic py-2 text-center bg-slate-950/40 rounded-lg border border-slate-800/40">Aucun coup validé pour l\'instant dans ce match.</div>';
      } else {
        const recent = [...this.moveHistory].reverse().slice(0, 6);
        movesLogContainer.innerHTML = recent.map(m => {
          return `
            <div class="flex items-center justify-between bg-slate-950/70 border border-slate-800/80 rounded-lg px-2.5 py-1.5 text-xs">
              <div class="flex items-center space-x-2 truncate min-w-0">
                <span class="text-[10px] font-bold text-slate-400 bg-slate-800 px-1.5 py-0.5 rounded shrink-0">T${m.turn}</span>
                <span class="font-bold text-slate-200 truncate shrink-0 max-w-[80px]">${m.playerName}</span>
                <span class="font-mono font-black text-amber-300 tracking-wider truncate">${m.words}</span>
                ${m.isScrabble ? '<span class="text-[8px] bg-emerald-950 text-emerald-300 font-black px-1 py-0.5 rounded border border-emerald-500/50 shrink-0 animate-pulse">BINGO +50</span>' : ''}
              </div>
              <span class="font-black text-emerald-400 shrink-0 ml-2">+${m.score} pts</span>
            </div>
          `;
        }).join('');
      }
    }
  }

  finishCurrentMatch() {
    const totalScore = this.players.reduce((sum, p) => sum + (p.score || 0), 0);
    if (totalScore === 0 && this.moveHistory.length === 0) {
      this.notify('Aucun coup n\'a encore été validé dans ce match.', 'warning');
      return;
    }

    // Determine winner (highest score)
    const sorted = [...this.players].sort((a, b) => b.score - a.score);
    const winner = sorted[0];

    const matchData = {
      id: 'match_' + Date.now(),
      date: new Date().toLocaleDateString('fr-FR') + ' ' + new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
      players: this.players.map(p => ({ id: p.id, name: p.name, score: p.score })),
      winnerId: winner.id,
      winnerName: winner.name,
      totalTurns: this.turnNumber,
      moveCount: this.moveHistory.length,
      turnsHistory: [...this.moveHistory]
    };

    storageStats.finishMatch(matchData);
    this.celebrateWin();
    this.notify(`🏆 Match terminé ! Victoire de ${winner.name} (${winner.score} pts). Résultats enregistrés dans l'onglet Stats !`, 'success');

    this.renderCurrentMatchStats();
    setTimeout(() => {
      this.switchTab('stats');
    }, 1000);
  }

  setupNewGameModal() {
    const btnOpen = document.getElementById('btn-open-game-setup');
    const modal = document.getElementById('modal-new-game-setup');
    const btnClose = document.getElementById('btn-close-setup-modal');
    const btnConfirm = document.getElementById('btn-start-game-confirm');
    const countBtns = document.querySelectorAll('.btn-player-count');

    if (btnOpen) {
      btnOpen.addEventListener('click', () => this.switchTab('game'));
    }

    if (btnClose && modal) {
      btnClose.addEventListener('click', () => modal.classList.add('hidden'));
    }

    countBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const count = parseInt(btn.dataset.count, 10);
        this.setSetupPlayerCount(count);
      });
    });

    if (btnConfirm) {
      btnConfirm.addEventListener('click', () => this.confirmStartNewGame());
    }
  }

  openNewGameModal() {
    const modal = document.getElementById('modal-new-game-setup');
    if (!modal) return;
    this.populateSavedPlayersDatalist();
    this.setSetupPlayerCount(this.players.length || 2);
    this.renderSetupInputs();
    modal.classList.remove('hidden');
    this.playBeep(450, 'sine', 0.06);
  }

  setSetupPlayerCount(count) {
    this.setupPlayerCount = count;
    document.querySelectorAll('.btn-player-count').forEach(btn => {
      const c = parseInt(btn.dataset.count, 10);
      const isSelected = c === count;
      btn.classList.toggle('bg-emerald-600', isSelected);
      btn.classList.toggle('border-emerald-400', isSelected);
      btn.classList.toggle('text-white', isSelected);
      btn.classList.toggle('shadow-lg', isSelected);
      btn.classList.toggle('bg-slate-800', !isSelected);
      btn.classList.toggle('border-slate-700', !isSelected);
      btn.classList.toggle('text-slate-300', !isSelected);
    });
    this.renderSetupInputs();
  }

  populateSavedPlayersDatalist() {
    const datalist = document.getElementById('saved-players-datalist');
    if (!datalist) return;
    datalist.innerHTML = '';
    const all = storageStats.getPlayers();
    all.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.name;
      datalist.appendChild(opt);
    });
  }

  renderSetupInputs() {
    const container = document.getElementById('setup-player-inputs-container');
    if (!container) return;

    const saved = storageStats.getPlayers();
    container.innerHTML = '';

    for (let i = 0; i < this.setupPlayerCount; i++) {
      const color = this.playerColors[i % this.playerColors.length];
      const defaultName = (this.players[i] && this.players[i].name) || (saved[i] && saved[i].name) || `Joueur ${i + 1}`;

      const row = document.createElement('div');
      row.className = 'bg-slate-950/80 p-2.5 rounded-xl border border-slate-800 space-y-1.5';
      row.innerHTML = `
        <div class="flex items-center justify-between">
          <div class="flex items-center space-x-2">
            <span class="w-6 h-6 rounded-full ${color.bg} text-slate-950 font-black text-xs flex items-center justify-center">J${i + 1}</span>
            <label class="text-xs font-bold text-slate-200">Joueur ${i + 1}</label>
          </div>
          <span class="text-[10px] font-bold ${color.text} uppercase">J${i + 1}</span>
        </div>
        <div>
          <input type="text" id="setup-input-player-${i}" value="${defaultName}" list="saved-players-datalist" placeholder="Prénom du joueur..." class="w-full bg-slate-900 border border-slate-700 rounded-lg py-2 pl-3 pr-3 text-xs font-bold text-slate-100 focus:outline-none focus:border-emerald-500">
        </div>
      `;
      container.appendChild(row);
    }
  }

  confirmStartNewGame() {
    const newPlayers = [];
    for (let i = 0; i < this.setupPlayerCount; i++) {
      const input = document.getElementById(`setup-input-player-${i}`);
      const rawName = input ? input.value.trim() : '';
      const name = rawName || `Joueur ${i + 1}`;
      // Persist in stats manager
      const persistentPlayer = storageStats.getOrCreatePlayerByName(name);
      newPlayers.push({
        id: persistentPlayer.id,
        name: persistentPlayer.name,
        score: 0
      });
    }

    this.players = newPlayers;
    this.currentPlayerIndex = 0;
    this.turnNumber = 1;
    this.currentGrid = this.createEmptyGrid();
    this.previousGrid = this.createEmptyGrid();
    this.moveHistory = [];

    const modal = document.getElementById('modal-new-game-setup');
    if (modal) modal.classList.add('hidden');

    this.renderBoard();
    this.updatePlayerScoresUI();
    this.updateScorePreview();
    this.renderCurrentMatchStats();
    this.renderGameTabInputs();
    this.switchTab('board');

    this.playSuccessSound();
    const namesList = this.players.map(p => p.name).join(', ');
    this.notify(`Partie lancée (${this.players.length} joueurs) : ${namesList} !`, 'success');
  }

  showCheatAlert(message, ruleCode) {
    const modal = document.getElementById('modal-cheat-alert');
    const msgEl = document.getElementById('cheat-error-message');
    const codeEl = document.getElementById('cheat-rule-code');

    if (msgEl) msgEl.textContent = message;
    if (codeEl) codeEl.textContent = `Code infraction : ${ruleCode || 'RÈGLE_VIOLÉE'}`;
    if (modal) modal.classList.remove('hidden');
  }

  dismissModal() {
    const modal = document.getElementById('modal-cheat-alert');
    if (modal) modal.classList.add('hidden');
  }

  updatePlayerScoresUI() {
    const container = document.getElementById('players-score-cards-container');
    const turnEl = document.getElementById('current-turn-indicator');
    const bannerNameEl = document.getElementById('active-player-name-banner');
    const bannerAvatarEl = document.getElementById('active-player-avatar');

    if (!container) return;

    // Set responsive grid column classes depending on player count
    container.className = 'grid gap-2 transition-all';
    if (this.players.length === 2) {
      container.classList.add('grid-cols-2');
    } else if (this.players.length === 3) {
      container.classList.add('grid-cols-3');
    } else {
      container.classList.add('grid-cols-2', 'sm:grid-cols-4');
    }

    const activeP = this.players[this.currentPlayerIndex] || this.players[0];
    const activeColor = this.playerColors[this.currentPlayerIndex % this.playerColors.length];

    // Render cards for all players
    container.innerHTML = this.players.map((p, idx) => {
      const isActive = idx === this.currentPlayerIndex;
      const color = this.playerColors[idx % this.playerColors.length];
      const initial = p.name ? p.name.charAt(0).toUpperCase() : `J${idx + 1}`;

      return `
        <div class="bg-slate-900 border rounded-xl p-2.5 transition-all relative overflow-hidden ${
          isActive 
            ? `ring-2 ${color.ring} border-transparent bg-slate-800/90 shadow-lg shadow-emerald-950/40` 
            : 'border-slate-800/80 opacity-60 hover:opacity-90'
        }">
          <div class="flex items-center justify-between text-[11px] font-bold mb-1">
            <div class="flex items-center space-x-1.5 truncate">
              <span class="w-4 h-4 rounded-full ${color.bg} text-slate-950 font-black text-[9px] flex items-center justify-center shrink-0">${initial}</span>
              <span class="truncate ${isActive ? 'text-white font-black' : 'text-slate-300'}">${p.name}</span>
            </div>
            ${isActive 
              ? `<span class="text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded ${color.badge} border animate-pulse shrink-0">JOUE</span>`
              : `<span class="w-2 h-2 rounded-full ${color.bg} opacity-50 shrink-0"></span>`
            }
          </div>
          <div class="text-xl font-black ${color.text} tracking-tight">${p.score} pts</div>
        </div>
      `;
    }).join('');

    // Update Turn Indicator and Active Player Banner
    if (turnEl) {
      turnEl.textContent = `Tour ${this.turnNumber}`;
    }
    if (bannerNameEl) {
      bannerNameEl.textContent = `À ${activeP.name} de jouer`;
      bannerNameEl.className = `text-sm font-black ${activeColor.text} block leading-tight`;
    }
    if (bannerAvatarEl) {
      bannerAvatarEl.textContent = activeP.name ? activeP.name.charAt(0).toUpperCase() : `J${this.currentPlayerIndex + 1}`;
      bannerAvatarEl.className = `w-8 h-8 rounded-full ${activeColor.bg} text-slate-950 font-black text-xs flex items-center justify-center shadow-lg ring-2 ring-white/30`;
    }
  }

  updateRemainingBagCount() {
    let placedTotal = 0;
    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        if (this.currentGrid[r][c]) placedTotal++;
      }
    }
    const remaining = Math.max(0, 102 - placedTotal);
    const bagEl = document.getElementById('bag-remaining-count');
    if (bagEl) {
      bagEl.textContent = `${remaining} / 102 jetons`;
    }
  }

  // --- DICTIONARY UI ---
  setupDictionaryUI() {
    const input = document.getElementById('dict-search-input');
    const btnSearch = document.getElementById('dict-btn-search');
    const resultBox = document.getElementById('dict-search-result');
    const btnAddCustom = document.getElementById('dict-btn-add-custom');

    const doSearch = () => {
      const q = (input ? input.value : '').trim().toUpperCase();
      if (!q) return;

      if (q.includes('?')) {
        // Joker search
        const matches = scrabbleDictionary.findJokerCompletions(q);
        resultBox.innerHTML = `
          <div class="text-xs text-amber-300 font-bold mb-1">Mots possibles avec Joker (${matches.length}) :</div>
          <div class="flex flex-wrap gap-1 max-h-36 overflow-y-auto">
            ${matches.slice(0, 50).map(m => `<span class="bg-slate-800 px-2 py-0.5 rounded text-xs text-slate-200 border border-slate-700">${m}</span>`).join('')}
          </div>
        `;
      } else {
        const valid = scrabbleDictionary.isValid(q);
        if (valid) {
          resultBox.innerHTML = `
            <div class="p-3 bg-emerald-950/80 border border-emerald-500 rounded-lg text-emerald-300 flex items-center justify-between">
              <div>
                <span class="text-base font-black tracking-wider">${q}</span>
                <span class="ml-2 text-xs text-emerald-400 font-bold">✓ VALIDE EN SCRABBLE</span>
              </div>
              <span class="text-xs bg-emerald-800 text-white font-bold px-2 py-0.5 rounded">${q.length} lettres</span>
            </div>
          `;
        } else {
          resultBox.innerHTML = `
            <div class="p-3 bg-rose-950/80 border border-rose-500 rounded-lg text-rose-300 flex items-center justify-between">
              <div>
                <span class="text-base font-black tracking-wider">${q}</span>
                <span class="ml-2 text-xs text-rose-400 font-bold">✗ REFUSÉ (Inconnu)</span>
              </div>
              <button id="dict-quick-add" class="text-xs bg-rose-800 text-white px-2 py-1 rounded font-bold hover:bg-rose-700">Tolérer le mot</button>
            </div>
          `;
          const quickAdd = document.getElementById('dict-quick-add');
          if (quickAdd) {
            quickAdd.addEventListener('click', () => {
              scrabbleDictionary.addCustomWord(q);
              doSearch();
              this.notify(`Le mot "${q}" a été ajouté aux exceptions acceptées.`, 'success');
            });
          }
        }
      }
    };

    if (btnSearch) btnSearch.addEventListener('click', doSearch);
    if (input) {
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') doSearch();
      });
    }

    if (btnAddCustom) {
      btnAddCustom.addEventListener('click', () => {
        const w = prompt('Mot français à ajouter exceptionnellement :');
        if (w && scrabbleDictionary.addCustomWord(w)) {
          this.notify(`Mot "${w.toUpperCase()}" ajouté au dictionnaire !`, 'success');
          this.updateDictionaryStats();
        }
      });
    }
  }

  updateDictionaryStats() {
    const el = document.getElementById('dict-total-count');
    if (el) {
      el.textContent = `${scrabbleDictionary.getWordCount().toLocaleString('fr-FR')} mots officiels ODS`;
    }
  }

  // --- STATS TAB & EXPORT/IMPORT ---
  setupStatsUI() {
    const btnExport = document.getElementById('btn-export-stats');
    const btnImport = document.getElementById('btn-import-stats');
    const fileImport = document.getElementById('file-input-stats');

    if (btnExport) btnExport.addEventListener('click', () => storageStats.exportDataJson());
    if (btnImport && fileImport) {
      btnImport.addEventListener('click', () => fileImport.click());
      fileImport.addEventListener('change', async (e) => {
        if (e.target.files && e.target.files[0]) {
          try {
            await storageStats.importDataJson(e.target.files[0]);
            this.refreshStatsTab();
            this.notify('Statistiques et profils importés avec succès !', 'success');
          } catch (err) {
            this.notify(err.message, 'error');
          }
        }
      });
    }
  }

  refreshStatsTab() {
    const players = storageStats.getPlayers();
    const container = document.getElementById('stats-players-cards');
    if (!container) return;

    container.innerHTML = players.map(p => {
      const winRate = p.gamesPlayed > 0 ? Math.round((p.wins / p.gamesPlayed) * 100) : 0;
      const avgScore = p.gamesPlayed > 0 ? Math.round(p.totalScore / p.gamesPlayed) : 0;
      const avgTurn = p.totalTurns > 0 ? Math.round(p.totalScore / p.totalTurns) : 0;

      return `
        <div class="bg-slate-900 border border-slate-800 rounded-xl p-3.5 space-y-3 shadow-lg">
          <div class="flex items-center justify-between border-b border-slate-800 pb-2">
            <div class="flex items-center space-x-2">
              <span class="w-3 h-3 rounded-full bg-emerald-400"></span>
              <h4 class="font-black text-slate-100 text-sm tracking-wide">${p.name}</h4>
            </div>
            <span class="text-xs font-bold px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800/50">
              ${winRate}% victoires (${p.wins}/${p.gamesPlayed})
            </span>
          </div>

          <div class="grid grid-cols-2 gap-2 text-xs">
            <div class="bg-slate-950/60 p-2 rounded-lg border border-slate-800/50">
              <div class="text-slate-400 text-[10px]">Score Moyen / Partie</div>
              <div class="text-base font-black text-slate-200">${avgScore} pts</div>
            </div>
            <div class="bg-slate-950/60 p-2 rounded-lg border border-slate-800/50">
              <div class="text-slate-400 text-[10px]">Moyenne par Tour</div>
              <div class="text-base font-black text-slate-200">${avgTurn} pts</div>
            </div>
            <div class="bg-slate-950/60 p-2 rounded-lg border border-slate-800/50">
              <div class="text-slate-400 text-[10px]">Record Partie</div>
              <div class="text-base font-black text-amber-400">${p.bestGameScore || 0} pts</div>
            </div>
            <div class="bg-slate-950/60 p-2 rounded-lg border border-slate-800/50">
              <div class="text-slate-400 text-[10px]">Scrabbles (+50 pts)</div>
              <div class="text-base font-black text-emerald-400">${p.totalScrabbles || 0} fois</div>
            </div>
          </div>

          <div class="flex items-center justify-between text-xs bg-slate-950/80 p-2 rounded-lg border border-slate-800/80">
            <div>
              <span class="text-slate-400 text-[10px] block">Mot le plus payant :</span>
              <span class="font-black text-slate-100 tracking-wider">${p.bestWord ? p.bestWord.word : '-'}</span>
              <span class="text-amber-400 font-bold ml-1">(${p.bestWord ? p.bestWord.score : 0} pts)</span>
            </div>
            <div class="text-right">
              <span class="text-slate-400 text-[10px] block">Indice Triche / Fautes :</span>
              <span class="font-black ${p.cheatAttempts > 0 ? 'text-rose-400' : 'text-emerald-400'}">${p.cheatAttempts || 0} alertes</span>
            </div>
          </div>
        </div>
      `;
    }).join('');

    // Render Chart.js graphs
    const chartProg = document.getElementById('chart-progression');
    const chartComp = document.getElementById('chart-comparison');
    storageStats.renderCharts(chartProg, chartComp, this.players);
  }

  // --- NOTIFICATION TOAST ---
  notify(msg, type = 'info') {
    const toast = document.getElementById('app-toast');
    if (!toast) return;

    toast.textContent = msg;
    toast.className = 'fixed top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-full text-xs font-bold shadow-2xl transition-all duration-300 border flex items-center space-x-2';

    if (type === 'success') {
      toast.classList.add('bg-emerald-950', 'text-emerald-200', 'border-emerald-500');
    } else if (type === 'warning' || type === 'error') {
      toast.classList.add('bg-rose-950', 'text-rose-200', 'border-rose-500');
    } else {
      toast.classList.add('bg-slate-900', 'text-slate-200', 'border-slate-700');
    }

    toast.classList.remove('opacity-0', 'pointer-events-none', '-translate-y-4');
    toast.classList.add('opacity-100', 'translate-y-0');

    clearTimeout(this._toastTimeout);
    this._toastTimeout = setTimeout(() => {
      toast.classList.remove('opacity-100', 'translate-y-0');
      toast.classList.add('opacity-0', 'pointer-events-none', '-translate-y-4');
    }, 3200);
  }
}

// Global bootstrap
window.addEventListener('DOMContentLoaded', () => {
  window.scrabbleApp = new ScrabbleApp();
  window.scrabbleDictionary = scrabbleDictionary;
});
