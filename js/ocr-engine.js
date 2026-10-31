// OCR Engine for Scrabble Tile Letter Recognition
// Preprocesses tile with OpenCV (adaptive threshold, margin & score subscript crop),
// uses Tesseract.js (PSM 10, whitelist A-Z) with automatic Joker detection and fast local template matching.

export class OCREngine {
  constructor() {
    this.tesseractWorker = null;
    this.isTesseractReady = false;
    this.initTesseract();
  }

  async initTesseract() {
    if (typeof Tesseract === 'undefined') {
      console.warn('[OCR] Tesseract.js n\'est pas encore disponible.');
      return;
    }
    try {
      this.tesseractWorker = await Tesseract.createWorker('fra', 1, {
        logger: m => {
          // Log progression silencieuse
        }
      });
      await this.tesseractWorker.setParameters({
        tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
        tessedit_pageseg_mode: '10', // PSM_SINGLE_CHAR
      });
      this.isTesseractReady = true;
      console.log('[OCR] Tesseract.js initialisé avec succès (PSM 10, whitelist A-Z).');
    } catch (err) {
      console.warn('[OCR] Initialisation Tesseract.js différée ou hors-ligne:', err);
    }
  }

  /**
   * Preprocess a 60x60 cell tile:
   * 1. Crop to remove outer borders and bottom-right score subscript (e.g. "E" with "1" in bottom-right).
   * 2. Convert to grayscale.
   * 3. Apply adaptive thresholding (OpenCV cv.adaptiveThreshold or fallback).
   * @param {HTMLCanvasElement} cellCanvas
   * @returns {HTMLCanvasElement} Preprocessed binarized glyph canvas
   */
  preprocessTile(cellCanvas) {
    const rawW = cellCanvas.width;
    const rawH = cellCanvas.height;

    // Crop to isolate central uppercase letter:
    // Left: 15%, Top: 15%, Right: 25% (remove right-side score number), Bottom: 25%
    const cropX = Math.round(rawW * 0.15);
    const cropY = Math.round(rawH * 0.12);
    const cropW = Math.round(rawW * 0.65); // Avoid bottom-right corner
    const cropH = Math.round(rawH * 0.68);

    const croppedCanvas = document.createElement('canvas');
    croppedCanvas.width = 48;
    croppedCanvas.height = 48;
    const cropCtx = croppedCanvas.getContext('2d', { willReadFrequently: true });

    cropCtx.drawImage(
      cellCanvas,
      cropX, cropY, cropW, cropH,
      0, 0, 48, 48
    );

    // Apply OpenCV adaptive thresholding if available
    if (window.cv && window.cv.Mat) {
      try {
        const src = cv.imread(croppedCanvas);
        const gray = new cv.Mat();
        const thresh = new cv.Mat();

        cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
        // Adaptive threshold to binarize letter
        cv.adaptiveThreshold(gray, thresh, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY_INV, 15, 6);

        cv.imshow(croppedCanvas, thresh);

        src.delete();
        gray.delete();
        thresh.delete();
        return croppedCanvas;
      } catch (cvErr) {
        console.warn('[OCR Preprocess] Fallback JS pour le seuillage adaptatif:', cvErr);
      }
    }

    // Pure JS Adaptive Binarization
    const imgData = cropCtx.getImageData(0, 0, 48, 48);
    const data = imgData.data;
    const grayVals = new Float32Array(48 * 48);

    let sum = 0;
    for (let i = 0, p = 0; i < data.length; i += 4, p++) {
      const g = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      grayVals[p] = g;
      sum += g;
    }
    const mean = sum / (48 * 48);
    const threshold = mean - 18; // Dark glyph contrast

    for (let i = 0, p = 0; i < data.length; i += 4, p++) {
      const isGlyph = grayVals[p] < threshold;
      const v = isGlyph ? 255 : 0; // White on black for template/OCR
      data[i] = v;
      data[i + 1] = v;
      data[i + 2] = v;
      data[i + 3] = 255;
    }
    cropCtx.putImageData(imgData, 0, 0);

    return croppedCanvas;
  }

  /**
   * Recognize the letter on a detected tile canvas.
   * Handles:
   * 1. Preprocessing and noise reduction.
   * 2. Joker detection (blank tile if central glyph pixel density < 3%).
   * 3. Tesseract.js recognition or fast template matcher fallback.
   * @param {HTMLCanvasElement} cellCanvas
   * @returns {Promise<Object>} { letter: string, isJoker: boolean, confidence: number }
   */
  async recognizeTile(cellCanvas) {
    const preprocessed = this.preprocessTile(cellCanvas);
    const pCtx = preprocessed.getContext('2d', { willReadFrequently: true });
    const imgData = pCtx.getImageData(0, 0, preprocessed.width, preprocessed.height);
    const pixels = imgData.data;

    // Measure glyph pixel density (white pixels on binarized canvas)
    let glyphPixelCount = 0;
    const totalPixels = preprocessed.width * preprocessed.height;

    for (let i = 0; i < pixels.length; i += 4) {
      if (pixels[i] > 128) {
        glyphPixelCount++;
      }
    }

    const density = glyphPixelCount / totalPixels;

    // Joker Detection:
    // If pixel density is very low (< 3.5%), there is no letter drawn on the tile -> it's a JOKER!
    if (density < 0.035) {
      return {
        letter: '?',
        isJoker: true,
        confidence: 0.95,
        details: 'Tuile blanche détectée (Joker)'
      };
    }

    // Try Tesseract.js if worker is initialized
    if (this.isTesseractReady && this.tesseractWorker) {
      try {
        const { data: { text, confidence } } = await this.tesseractWorker.recognize(preprocessed);
        const char = (text || '').trim().toUpperCase().replace(/[^A-Z]/g, '');
        if (char.length > 0 && confidence > 35) {
          return {
            letter: char[0],
            isJoker: false,
            confidence: confidence / 100
          };
        }
      } catch (tessErr) {
        console.warn('[OCR] Tesseract error, falling back to local glyph matcher:', tessErr);
      }
    }

    // Fast robust local glyph template matcher
    const match = this.matchGlyphTemplate(preprocessed);
    return {
      letter: match.letter,
      isJoker: false,
      confidence: match.score
    };
  }

  /**
   * Local High-Precision Sans-Serif Glyph Matcher
   * Compares the preprocessed tile with canonical French Scrabble letter shapes.
   */
  matchGlyphTemplate(tileCanvas) {
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const ctx = tileCanvas.getContext('2d', { willReadFrequently: true });
    const tileData = ctx.getImageData(0, 0, 48, 48).data;

    let bestLetter = 'E';
    let bestScore = -Infinity;

    // Create reference template canvas
    const refCanvas = document.createElement('canvas');
    refCanvas.width = 48;
    refCanvas.height = 48;
    const refCtx = refCanvas.getContext('2d', { willReadFrequently: true });

    for (let i = 0; i < letters.length; i++) {
      const char = letters[i];
      refCtx.clearRect(0, 0, 48, 48);
      refCtx.fillStyle = '#000000';
      refCtx.fillRect(0, 0, 48, 48);
      refCtx.fillStyle = '#ffffff';
      refCtx.font = 'bold 36px Arial, Helvetica, sans-serif';
      refCtx.textAlign = 'center';
      refCtx.textBaseline = 'middle';
      refCtx.fillText(char, 24, 25);

      const refData = refCtx.getImageData(0, 0, 48, 48).data;
      let score = 0;
      let matchCount = 0;

      for (let p = 0; p < tileData.length; p += 4) {
        const tVal = tileData[p] > 128 ? 1 : 0;
        const rVal = refData[p] > 128 ? 1 : 0;

        if (tVal === 1 && rVal === 1) score += 2;      // Overlapping glyph
        else if (tVal === 0 && rVal === 0) score += 0.5; // Overlapping background
        else score -= 1.5;                               // Mismatch penalty
        matchCount++;
      }

      if (score > bestScore) {
        bestScore = score;
        bestLetter = char;
      }
    }

    const normalizedScore = Math.max(0, Math.min(1, (bestScore / (48 * 48 * 2))));
    return {
      letter: bestLetter,
      score: normalizedScore
    };
  }
}

export const ocrEngine = new OCREngine();
