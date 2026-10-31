// Computer Vision Pipeline for Scrabble Board Recognition
// Handles Camera capture, 4-corner interactive calibration, OpenCV.js homography warp, 15x15 cell slicing & HSV tile detection.

import { BOARD_SIZE } from './constants.js';

export class CVPipeline {
  constructor(canvasElement, overlayElement) {
    this.canvas = canvasElement;
    this.ctx = canvasElement.getContext('2d', { willReadFrequently: true });
    this.overlay = overlayElement;
    this.stream = null;
    this.video = document.createElement('video');
    this.video.setAttribute('playsinline', '');
    this.video.setAttribute('autoplay', '');
    this.video.muted = true;

    this.isOpenCvReady = false;
    this.targetSize = 900; // 900x900 px rectified square (60x60 px per cell)
    this.cellSize = this.targetSize / BOARD_SIZE;

    // Default 4 corners normalized (0 to 1) or in pixels
    this.corners = [
      { x: 50, y: 50, name: 'TL' },   // Top-Left
      { x: 350, y: 50, name: 'TR' },  // Top-Right
      { x: 350, y: 350, name: 'BR' }, // Bottom-Right
      { x: 50, y: 350, name: 'BL' }   // Bottom-Left
    ];

    this.activeCornerIndex = -1;
    this.initOpenCv();
    this.setupCornerTouchListeners();
  }

  initOpenCv() {
    if (window.cv && window.cv.Mat) {
      this.isOpenCvReady = true;
      console.log('[OpenCV] OpenCV.js est prêt.');
    } else {
      window.addEventListener('opencv-ready', () => {
        this.isOpenCvReady = true;
        console.log('[OpenCV] OpenCV.js initialisé via événement.');
      });
      // Periodically check if cv loaded
      const checkInterval = setInterval(() => {
        if (window.cv && window.cv.Mat) {
          this.isOpenCvReady = true;
          clearInterval(checkInterval);
          console.log('[OpenCV] OpenCV.js prêt (détecté par scrutation).');
        }
      }, 500);
    }
  }

  async startCamera(onFrameReady) {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        },
        audio: false
      });
      this.video.srcObject = this.stream;
      await this.video.play();

      // Adjust canvas to video aspect ratio
      this.canvas.width = this.video.videoWidth || 800;
      this.canvas.height = this.video.videoHeight || 600;
      this.resetDefaultCorners(this.canvas.width, this.canvas.height);

      const renderLoop = () => {
        if (!this.stream) return;
        this.ctx.drawImage(this.video, 0, 0, this.canvas.width, this.canvas.height);
        this.renderOverlay();
        if (onFrameReady) onFrameReady();
        requestAnimationFrame(renderLoop);
      };
      requestAnimationFrame(renderLoop);
      return true;
    } catch (err) {
      console.warn('[Camera] Impossible d\'accéder à la caméra:', err);
      return false;
    }
  }

  stopCamera() {
    if (this.stream) {
      this.stream.getTracks().forEach(t => t.stop());
      this.stream = null;
    }
    if (this.video) {
      this.video.pause();
      this.video.srcObject = null;
    }
  }

  loadImage(imageSource) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        this.canvas.width = img.width;
        this.canvas.height = img.height;
        this.ctx.drawImage(img, 0, 0);
        this.resetDefaultCorners(img.width, img.height);
        this.renderOverlay();
        resolve(true);
      };
      img.onerror = reject;
      img.src = typeof imageSource === 'string' ? imageSource : URL.createObjectURL(imageSource);
    });
  }

  resetDefaultCorners(w, h) {
    const padX = Math.round(w * 0.1);
    const padY = Math.round(h * 0.1);
    this.corners = [
      { x: padX, y: padY, name: 'TL' },
      { x: w - padX, y: padY, name: 'TR' },
      { x: w - padX, y: h - padY, name: 'BR' },
      { x: padX, y: h - padY, name: 'BL' }
    ];
  }

  setupCornerTouchListeners() {
    if (!this.overlay) return;

    const getPos = (e) => {
      const rect = this.overlay.getBoundingClientRect();
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      const scaleX = this.canvas.width / rect.width;
      const scaleY = this.canvas.height / rect.height;
      return {
        x: (clientX - rect.left) * scaleX,
        y: (clientY - rect.top) * scaleY
      };
    };

    const onStart = (e) => {
      const pos = getPos(e);
      const hitRadius = Math.max(35, this.canvas.width * 0.08);

      let closestIdx = -1;
      let minD = Infinity;
      for (let i = 0; i < this.corners.length; i++) {
        const d = Math.hypot(this.corners[i].x - pos.x, this.corners[i].y - pos.y);
        if (d < hitRadius && d < minD) {
          minD = d;
          closestIdx = i;
        }
      }

      if (closestIdx !== -1) {
        this.activeCornerIndex = closestIdx;
        if (e.cancelable) e.preventDefault();
      }
    };

    const onMove = (e) => {
      if (this.activeCornerIndex === -1) return;
      const pos = getPos(e);
      // Constrain inside canvas
      this.corners[this.activeCornerIndex].x = Math.max(0, Math.min(this.canvas.width, pos.x));
      this.corners[this.activeCornerIndex].y = Math.max(0, Math.min(this.canvas.height, pos.y));
      this.renderOverlay();
      if (e.cancelable) e.preventDefault();
    };

    const onEnd = () => {
      this.activeCornerIndex = -1;
    };

    this.overlay.addEventListener('touchstart', onStart, { passive: false });
    this.overlay.addEventListener('touchmove', onMove, { passive: false });
    this.overlay.addEventListener('touchend', onEnd);
    this.overlay.addEventListener('touchcancel', onEnd);

    this.overlay.addEventListener('mousedown', onStart);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onEnd);
  }

  renderOverlay() {
    if (!this.overlay) return;
    const ctx = this.overlay.getContext('2d');
    if (!ctx) return;

    this.overlay.width = this.canvas.width;
    this.overlay.height = this.canvas.height;
    ctx.clearRect(0, 0, this.overlay.width, this.overlay.height);

    const c = this.corners;
    if (c.length < 4) return;

    // Draw grid polygon
    ctx.beginPath();
    ctx.moveTo(c[0].x, c[0].y);
    ctx.lineTo(c[1].x, c[1].y);
    ctx.lineTo(c[2].x, c[2].y);
    ctx.lineTo(c[3].x, c[3].y);
    ctx.closePath();

    ctx.fillStyle = 'rgba(16, 185, 129, 0.08)'; // Light emerald tint
    ctx.fill();
    ctx.strokeStyle = '#10b981';
    ctx.lineWidth = 3;
    ctx.stroke();

    // Draw internal 15x15 guide grid lines
    ctx.strokeStyle = 'rgba(16, 185, 129, 0.3)';
    ctx.lineWidth = 1;
    for (let i = 1; i < BOARD_SIZE; i++) {
      const t = i / BOARD_SIZE;
      // Horizontal interpolations
      const topX = c[0].x + (c[1].x - c[0].x) * t;
      const topY = c[0].y + (c[1].y - c[0].y) * t;
      const botX = c[3].x + (c[2].x - c[3].x) * t;
      const botY = c[3].y + (c[2].y - c[3].y) * t;

      ctx.beginPath();
      ctx.moveTo(topX, topY);
      ctx.lineTo(botX, botY);
      ctx.stroke();

      // Vertical interpolations
      const leftX = c[0].x + (c[3].x - c[0].x) * t;
      const leftY = c[0].y + (c[3].y - c[0].y) * t;
      const rightX = c[1].x + (c[2].x - c[1].x) * t;
      const rightY = c[1].y + (c[2].y - c[1].y) * t;

      ctx.beginPath();
      ctx.moveTo(leftX, leftY);
      ctx.lineTo(rightX, rightY);
      ctx.stroke();
    }

    // Draw handles on 4 corners
    const handleRadius = Math.max(16, this.canvas.width * 0.025);
    const cornerLabels = ['H-G', 'H-D', 'B-D', 'B-G'];
    c.forEach((pt, idx) => {
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, handleRadius, 0, Math.PI * 2);
      ctx.fillStyle = idx === this.activeCornerIndex ? '#f59e0b' : '#10b981';
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3;
      ctx.stroke();

      // Crosshairs
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(pt.x - handleRadius - 6, pt.y);
      ctx.lineTo(pt.x + handleRadius + 6, pt.y);
      ctx.moveTo(pt.x, pt.y - handleRadius - 6);
      ctx.lineTo(pt.x, pt.y + handleRadius + 6);
      ctx.stroke();

      // Corner label
      ctx.font = 'bold 12px sans-serif';
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(cornerLabels[idx], pt.x, pt.y);
    });
  }

  /**
   * Rectify perspective using OpenCV.js or fallback pure JS homography.
   * Produces a 900x900 square canvas of the Scrabble board.
   */
  rectifyBoard() {
    const outputCanvas = document.createElement('canvas');
    outputCanvas.width = this.targetSize;
    outputCanvas.height = this.targetSize;
    const outCtx = outputCanvas.getContext('2d');

    const srcPts = [
      this.corners[0].x, this.corners[0].y,
      this.corners[1].x, this.corners[1].y,
      this.corners[2].x, this.corners[2].y,
      this.corners[3].x, this.corners[3].y
    ];

    const dstPts = [
      0, 0,
      this.targetSize, 0,
      this.targetSize, this.targetSize,
      0, this.targetSize
    ];

    if (this.isOpenCvReady && window.cv && window.cv.Mat) {
      try {
        const srcMat = cv.imread(this.canvas);
        const dstMat = new cv.Mat();
        const dsize = new cv.Size(this.targetSize, this.targetSize);

        const srcTri = cv.matFromArray(4, 1, cv.CV_32FC2, srcPts);
        const dstTri = cv.matFromArray(4, 1, cv.CV_32FC2, dstPts);

        const M = cv.getPerspectiveTransform(srcTri, dstTri);
        cv.warpPerspective(srcMat, dstMat, M, dsize, cv.INTER_LINEAR, cv.BORDER_CONSTANT, new cv.Scalar());

        cv.imshow(outputCanvas, dstMat);

        srcMat.delete();
        dstMat.delete();
        srcTri.delete();
        dstTri.delete();
        M.delete();

        return outputCanvas;
      } catch (cvErr) {
        console.warn('[OpenCV] Erreur warpPerspective, utilisation du fallback JS:', cvErr);
      }
    }

    // Pure JS Homography Warp Fallback
    this.warpPerspectiveJS(this.canvas, outputCanvas, srcPts, dstPts);
    return outputCanvas;
  }

  /**
   * Fast pure JS bilinear homography warp fallback
   */
  warpPerspectiveJS(srcCanvas, dstCanvas, src, dst) {
    const srcCtx = srcCanvas.getContext('2d');
    const dstCtx = dstCanvas.getContext('2d');
    const srcData = srcCtx.getImageData(0, 0, srcCanvas.width, srcCanvas.height);
    const dstData = dstCtx.createImageData(dstCanvas.width, dstCanvas.height);

    const H = this.computeHomography(dst, src); // Inverse homography dst -> src

    const w = dstCanvas.width;
    const h = dstCanvas.height;
    const sw = srcCanvas.width;
    const sh = srcCanvas.height;
    const sPixels = srcData.data;
    const dPixels = dstData.data;

    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < w; dx++) {
        const z = H[6] * dx + H[7] * dy + H[8];
        const sx = (H[0] * dx + H[1] * dy + H[2]) / z;
        const sy = (H[3] * dx + H[4] * dy + H[5]) / z;

        if (sx >= 0 && sx < sw - 1 && sy >= 0 && sy < sh - 1) {
          const x0 = Math.floor(sx);
          const y0 = Math.floor(sy);
          const fx = sx - x0;
          const fy = sy - y0;

          const idx00 = (y0 * sw + x0) * 4;
          const idx10 = (y0 * sw + (x0 + 1)) * 4;
          const idx01 = ((y0 + 1) * sw + x0) * 4;
          const idx11 = ((y0 + 1) * sw + (x0 + 1)) * 4;

          const dIdx = (dy * w + dx) * 4;
          for (let c = 0; c < 3; c++) {
            const top = sPixels[idx00 + c] * (1 - fx) + sPixels[idx10 + c] * fx;
            const bot = sPixels[idx01 + c] * (1 - fx) + sPixels[idx11 + c] * fx;
            dPixels[dIdx + c] = top * (1 - fy) + bot * fy;
          }
          dPixels[dIdx + 3] = 255;
        }
      }
    }
    dstCtx.putImageData(dstData, 0, 0);
  }

  computeHomography(src, dst) {
    // 8x8 linear system solver for 2D perspective transform
    const a = [];
    const b = [];
    for (let i = 0; i < 4; i++) {
      const sx = src[i * 2], sy = src[i * 2 + 1];
      const dx = dst[i * 2], dy = dst[i * 2 + 1];
      a.push([sx, sy, 1, 0, 0, 0, -dx * sx, -dx * sy]);
      b.push(dx);
      a.push([0, 0, 0, sx, sy, 1, -dy * sx, -dy * sy]);
      b.push(dy);
    }
    const h = this.solveGaussian(a, b);
    return [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1];
  }

  solveGaussian(A, b) {
    const n = 8;
    for (let i = 0; i < n; i++) {
      let maxEl = Math.abs(A[i][i]), maxRow = i;
      for (let k = i + 1; k < n; k++) {
        if (Math.abs(A[k][i]) > maxEl) {
          maxEl = Math.abs(A[k][i]);
          maxRow = k;
        }
      }
      for (let k = i; k < n; k++) {
        const tmp = A[maxRow][k];
        A[maxRow][k] = A[i][k];
        A[i][k] = tmp;
      }
      const tmp = b[maxRow];
      b[maxRow] = b[i];
      b[i] = tmp;

      for (let k = i + 1; k < n; k++) {
        const c = -A[k][i] / A[i][i];
        for (let j = i; j < n; j++) {
          if (i === j) A[k][j] = 0;
          else A[k][j] += c * A[i][j];
        }
        b[k] += c * b[i];
      }
    }
    const x = new Array(n).fill(0);
    for (let i = n - 1; i >= 0; i--) {
      x[i] = b[i] / A[i][i];
      for (let k = i - 1; k >= 0; k--) {
        b[k] -= A[k][i] * x[i];
      }
    }
    return x;
  }

  /**
   * Slice rectified 900x900 board into 15x15 sub-images (60x60 px each).
   * For each cell, analyzes colorimetry (HSV) to detect presence of a wooden/ivory Scrabble tile.
   * @param {HTMLCanvasElement} rectifiedCanvas
   * @returns {Array<Array>} 15x15 matrix with cell details { row, col, hasTile, tileCanvas, hsv, confidence }
   */
  sliceAndDetectTiles(rectifiedCanvas) {
    const ctx = rectifiedCanvas.getContext('2d');
    const boardMatrix = [];
    const cSize = this.cellSize;

    for (let r = 0; r < BOARD_SIZE; r++) {
      const rowArr = [];
      for (let c = 0; c < BOARD_SIZE; c++) {
        const x = Math.round(c * cSize);
        const y = Math.round(r * cSize);

        // Sub-canvas for this cell
        const cellCanvas = document.createElement('canvas');
        cellCanvas.width = cSize;
        cellCanvas.height = cSize;
        const cellCtx = cellCanvas.getContext('2d');
        cellCtx.drawImage(rectifiedCanvas, x, y, cSize, cSize, 0, 0, cSize, cSize);

        // Colorimetry analysis of central 70% of cell to avoid grid borders
        const pad = Math.round(cSize * 0.15);
        const sampleSize = cSize - pad * 2;
        const imgData = cellCtx.getImageData(pad, pad, sampleSize, sampleSize);
        const data = imgData.data;

        let totalR = 0, totalG = 0, totalB = 0;
        let count = 0;

        for (let i = 0; i < data.length; i += 4) {
          totalR += data[i];
          totalG += data[i + 1];
          totalB += data[i + 2];
          count++;
        }

        const avgR = totalR / count;
        const avgG = totalG / count;
        const avgB = totalB / count;

        const hsv = this.rgbToHsv(avgR, avgG, avgB);

        // Scrabble tile color profile (Wood/Ivory/Beige):
        // Hue: 20 to 50 degrees (Yellow-Orange wood)
        // Saturation: 10% to 55%
        // Value: 50% to 95% (Bright ivory/wood)
        // Ratio R > G > B
        const isWoodHue = (hsv.h >= 18 && hsv.h <= 55);
        const isWoodSat = (hsv.s >= 0.08 && hsv.s <= 0.60);
        const isWoodVal = (hsv.v >= 0.45 && hsv.v <= 0.98);
        const isBeigeRatio = (avgR > avgB * 1.15) && (avgG > avgB * 1.05);

        // Edge / contrast variance inside the tile
        let variance = 0;
        const avgGray = (avgR + avgG + avgB) / 3;
        for (let i = 0; i < data.length; i += 4) {
          const gray = (data[i] + data[i + 1] + data[i + 2]) / 3;
          variance += Math.abs(gray - avgGray);
        }
        variance = variance / count;

        const hasTile = (isWoodHue && isWoodSat && isWoodVal && isBeigeRatio) || (avgR > 180 && avgG > 165 && avgB > 130 && variance < 45);

        rowArr.push({
          row: r,
          col: c,
          hasTile,
          tileCanvas: cellCanvas,
          hsv,
          avgR, avgG, avgB,
          variance
        });
      }
      boardMatrix.push(rowArr);
    }

    return boardMatrix;
  }

  rgbToHsv(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h, s, v = max;
    const d = max - min;
    s = max === 0 ? 0 : d / max;

    if (max === min) {
      h = 0; // achromatic
    } else {
      switch (max) {
        case r: h = (g - b) / d + (g < b ? 6 : 0); break;
        case g: h = (b - r) / d + 2; break;
        case b: h = (r - g) / d + 4; break;
      }
      h *= 60;
    }
    return { h, s, v };
  }
}
