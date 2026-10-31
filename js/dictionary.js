// French Scrabble Dictionary Validator (ODS compatible)
// Loads data/scrabble_ods.json into a Set for instantaneous O(1) lookups.

class ScrabbleDictionary {
  constructor() {
    this.wordsSet = new Set();
    this.isLoaded = false;
    this.customWords = new Set();
    this.loadingPromise = null;
    
    // Core fallback 2-letter and common words in case dictionary file is still loading
    this.initFallbackWords();
  }

  initFallbackWords() {
    const essential = [
      'AA','AH','AI','AN','AS','AU','AY','BA','BE','BI','BU','CA','CE','CI','DA','DE','DO','DU',
      'EH','EN','ES','ET','EU','EX','FA','FI','GO','HA','HE','HI','HO','IF','IL','IN','JE','KA',
      'LA','LE','LI','LU','MA','ME','MI','MU','NA','NE','NI','NO','NU','OC','OH','OM','ON','OR',
      'OS','OU','PI','PU','RA','RE','RI','RU','SA','SE','SI','SU','TA','TE','TO','TU','UN','US',
      'UT','VA','VE','VS','VU','WU','XI','YU',
      'QI','WUS','KOT','KOP','ZOO','ZOOM','WEB','WIFI','YACK','YEN','YOGA','YEUX','KILO','KIWI',
      'KOALA','KAYAK','KRACH','KAPO','KHMER','JOKER','SCRABBLE','ARBITRE','TRICHE','PLATEAU',
      'POINTS','JOUEUR','CHAMPION','LETTRE','GRILLE','PARTIE','VICTOIRE','ROUGE','BLEU','TOUR',
      'JEU','GAGNER','COMPTER','BONUS','DOUBLE','TRIPLE','CASE','MOT','SCORE','REGLE','MOTS'
    ];
    essential.forEach(w => this.wordsSet.add(w));
  }

  async loadDictionary(path = 'data/scrabble_ods.json') {
    if (this.isLoaded) return true;
    if (this.loadingPromise) return this.loadingPromise;

    this.loadingPromise = (async () => {
      try {
        const response = await fetch(path);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status} loading dictionary`);
        }
        const wordsArray = await response.json();
        for (let i = 0; i < wordsArray.length; i++) {
          this.wordsSet.add(wordsArray[i]);
        }
        this.isLoaded = true;
        console.log(`[Dictionnaire] ${this.wordsSet.size} mots chargés avec succès.`);
        return true;
      } catch (err) {
        console.warn('[Dictionnaire] Essai de chargement du fichier texte ODS8:', err);
        try {
          const txtResp = await fetch('data/ods8.txt');
          if (txtResp.ok) {
            const text = await txtResp.text();
            const lines = text.split(/\r?\n/);
            for (let i = 0; i < lines.length; i++) {
              const w = lines[i].trim().toUpperCase();
              if (w.length >= 2 && w.length <= 15) this.wordsSet.add(w);
            }
            this.isLoaded = true;
            console.log(`[Dictionnaire ODS8 TXT] ${this.wordsSet.size} mots chargés.`);
            return true;
          }
        } catch (e2) {
          console.warn('[Dictionnaire] Utilisation du dictionnaire de secours:', e2);
        }
        this.isLoaded = true;
        return false;
      }
    })();

    return this.loadingPromise;
  }

  cleanWord(word) {
    if (!word) return '';
    return word
      .trim()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toUpperCase();
  }

  isValid(word) {
    const cleaned = this.cleanWord(word);
    if (cleaned.length < 2 || cleaned.length > 15) return false;
    return this.wordsSet.has(cleaned) || this.customWords.has(cleaned);
  }

  // Find all valid completions when a word contains wildcard '?' (Joker)
  // Example: "J?UEUR" -> ['JOUEUR']
  findJokerCompletions(pattern) {
    const cleaned = this.cleanWord(pattern);
    const regex = new RegExp(`^${cleaned.replace(/\?/g, '[A-Z]')}$`);
    const results = [];
    for (const w of this.wordsSet) {
      if (w.length === cleaned.length && regex.test(w)) {
        results.push(w);
      }
    }
    return results;
  }

  addCustomWord(word) {
    const cleaned = this.cleanWord(word);
    if (cleaned.length >= 2 && cleaned.length <= 15) {
      this.customWords.add(cleaned);
      return true;
    }
    return false;
  }

  getWordCount() {
    return this.wordsSet.size + this.customWords.size;
  }
}

export const scrabbleDictionary = new ScrabbleDictionary();
