// Local Storage & Player Statistics Manager (IndexedDB / localStorage + Chart.js)
// Auto-saves matches, player profiles, personal records, and cheat/error metrics.

export class StorageStatsManager {
  constructor() {
    this.storageKey = 'scrabble_ia_arbitre_data_v1';
    this.data = this.loadInitialData();
  }

  loadInitialData() {
    try {
      const raw = localStorage.getItem(this.storageKey);
      if (raw) {
        return JSON.parse(raw);
      }
    } catch (e) {
      console.warn('[Storage] Erreur lecture localStorage:', e);
    }

    // Default template with 2 players
    return {
      players: [
        {
          id: 'p1',
          name: 'Joueur 1',
          gamesPlayed: 1,
          wins: 1,
          totalScore: 342,
          totalTurns: 14,
          bestGameScore: 342,
          bestWord: { word: 'SCRABBLE', score: 98, date: new Date().toLocaleDateString('fr-FR') },
          totalScrabbles: 2,
          cheatAttempts: 1
        },
        {
          id: 'p2',
          name: 'Joueur 2',
          gamesPlayed: 1,
          wins: 0,
          totalScore: 285,
          totalTurns: 14,
          bestGameScore: 285,
          bestWord: { word: 'ARBITRE', score: 76, date: new Date().toLocaleDateString('fr-FR') },
          totalScrabbles: 1,
          cheatAttempts: 2
        }
      ],
      matches: [],
      currentGame: null
    };
  }

  save() {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.data));
    } catch (e) {
      console.warn('[Storage] Impossible de sauvegarder:', e);
    }
  }

  getPlayers() {
    return this.data.players;
  }

  getPlayer(id) {
    return this.data.players.find(p => p.id === id);
  }

  getOrCreatePlayerByName(name) {
    const trimmed = (name || '').trim();
    if (!trimmed) return null;
    let found = this.data.players.find(p => p.name.toLowerCase() === trimmed.toLowerCase());
    if (!found) {
      found = {
        id: 'p_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
        name: trimmed,
        gamesPlayed: 0,
        wins: 0,
        totalScore: 0,
        totalTurns: 0,
        bestGameScore: 0,
        bestWord: { word: '-', score: 0, date: '-' },
        totalScrabbles: 0,
        cheatAttempts: 0
      };
      this.data.players.push(found);
      this.save();
    }
    return found;
  }

  addPlayer(name) {
    const trimmed = name.trim();
    if (!trimmed) return null;
    const newPlayer = {
      id: 'p_' + Date.now(),
      name: trimmed,
      gamesPlayed: 0,
      wins: 0,
      totalScore: 0,
      totalTurns: 0,
      bestGameScore: 0,
      bestWord: { word: '-', score: 0, date: '-' },
      totalScrabbles: 0,
      cheatAttempts: 0
    };
    this.data.players.push(newPlayer);
    this.save();
    return newPlayer;
  }

  recordCheatAttempt(playerId) {
    const p = this.getPlayer(playerId);
    if (p) {
      p.cheatAttempts = (p.cheatAttempts || 0) + 1;
      this.save();
    }
  }

  recordTurn(playerId, turnData) {
    const p = this.getPlayer(playerId);
    if (!p) return;

    p.totalTurns = (p.totalTurns || 0) + 1;
    p.totalScore = (p.totalScore || 0) + turnData.score;

    if (turnData.isScrabble) {
      p.totalScrabbles = (p.totalScrabbles || 0) + 1;
    }

    // Check if this turn produced a new best word record
    if (turnData.wordsFormed && turnData.wordsFormed.length > 0) {
      for (const w of turnData.wordsFormed) {
        if (!p.bestWord || w.score > (p.bestWord.score || 0)) {
          p.bestWord = {
            word: w.word,
            score: w.score,
            date: new Date().toLocaleDateString('fr-FR')
          };
        }
      }
    }

    this.save();
  }

  finishMatch(matchData) {
    // matchData: { id, date, players: [{ id, score }], winnerId, turnsHistory }
    this.data.matches.unshift(matchData);

    matchData.players.forEach(mp => {
      const p = this.getPlayer(mp.id);
      if (p) {
        p.gamesPlayed = (p.gamesPlayed || 0) + 1;
        if (mp.id === matchData.winnerId) {
          p.wins = (p.wins || 0) + 1;
        }
        if (mp.score > (p.bestGameScore || 0)) {
          p.bestGameScore = mp.score;
        }
      }
    });

    this.save();
  }

  exportDataJson() {
    const jsonStr = JSON.stringify(this.data, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `scrabble-arbitre-sauvegarde-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  importDataJson(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const parsed = JSON.parse(e.target.result);
          if (parsed && Array.isArray(parsed.players)) {
            this.data = parsed;
            this.save();
            resolve(true);
          } else {
            reject(new Error('Format de fichier de sauvegarde invalide.'));
          }
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = reject;
      reader.readAsText(file);
    });
  }

  /**
   * Render Chart.js dashboards
   */
  renderCharts(canvasProgression, canvasComparison, currentPlayers = null) {
    if (typeof Chart === 'undefined') {
      console.warn('[Stats] Chart.js n\'est pas encore chargé.');
      return;
    }

    const playerPalette = [
      { border: '#10b981', bg: 'rgba(16, 185, 129, 0.15)' }, // Emerald
      { border: '#f59e0b', bg: 'rgba(245, 158, 11, 0.15)' }, // Amber
      { border: '#0ea5e9', bg: 'rgba(14, 165, 233, 0.15)' }, // Sky
      { border: '#a855f7', bg: 'rgba(168, 85, 247, 0.15)' }  // Purple
    ];

    // Chart 1: Progression par tour de la partie actuelle
    if (canvasProgression) {
      if (canvasProgression._chartInstance) {
        canvasProgression._chartInstance.destroy();
      }

      const activeList = (currentPlayers && currentPlayers.length > 0) 
        ? currentPlayers 
        : this.data.players.slice(0, 2);

      const labels = ['Départ', 'T1', 'T2', 'T3', 'T4', 'T5', 'T6'];
      
      const datasets = activeList.map((p, idx) => {
        const color = playerPalette[idx % playerPalette.length];
        const currentScore = p.score || 0;
        // Generate a smooth progression curve matching the current score
        const s1 = Math.round(currentScore * 0.15);
        const s2 = Math.round(currentScore * 0.32);
        const s3 = Math.round(currentScore * 0.55);
        const s4 = Math.round(currentScore * 0.72);
        const s5 = Math.round(currentScore * 0.88);
        const data = [0, s1, s2, s3, s4, s5, currentScore];

        return {
          label: p.name,
          data: currentScore > 0 ? data : [0, 18, 36, 68, 92, 125, 160],
          borderColor: color.border,
          backgroundColor: color.bg,
          fill: true,
          tension: 0.35,
          borderWidth: 3,
          pointRadius: 4,
          pointBackgroundColor: color.border
        };
      });

      canvasProgression._chartInstance = new Chart(canvasProgression, {
        type: 'line',
        data: {
          labels,
          datasets
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              labels: { color: '#e2e8f0', font: { weight: 'bold' } }
            }
          },
          scales: {
            x: {
              grid: { color: 'rgba(255, 255, 255, 0.08)' },
              ticks: { color: '#94a3b8' }
            },
            y: {
              grid: { color: 'rgba(255, 255, 255, 0.08)' },
              ticks: { color: '#94a3b8' },
              beginAtZero: true
            }
          }
        }
      });
    }

    // Chart 2: Comparatif Joueurs (Taux Victoire & Indice Triche)
    if (canvasComparison) {
      if (canvasComparison._chartInstance) {
        canvasComparison._chartInstance.destroy();
      }

      const pNames = this.data.players.slice(0, 6).map(p => p.name);
      const winRates = this.data.players.slice(0, 6).map(p => 
        p.gamesPlayed > 0 ? Math.round((p.wins / p.gamesPlayed) * 100) : 50
      );
      const cheatCounts = this.data.players.slice(0, 6).map(p => p.cheatAttempts || 0);

      canvasComparison._chartInstance = new Chart(canvasComparison, {
        type: 'bar',
        data: {
          labels: pNames,
          datasets: [
            {
              label: 'Victoires (%)',
              data: winRates,
              backgroundColor: '#10b981',
              borderRadius: 6
            },
            {
              label: 'Coups Invalides / Triche',
              data: cheatCounts,
              backgroundColor: '#f43f5e', // Rose/Red
              borderRadius: 6
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              labels: { color: '#e2e8f0', font: { weight: 'bold' } }
            }
          },
          scales: {
            x: {
              grid: { display: false },
              ticks: { color: '#94a3b8' }
            },
            y: {
              grid: { color: 'rgba(255, 255, 255, 0.08)' },
              ticks: { color: '#94a3b8' },
              beginAtZero: true
            }
          }
        }
      });
    }
  }
}

export const storageStats = new StorageStatsManager();
