// Synthetic Scrabble Board Generator for Offline Testing
// Renders realistic 15x15 board with wood-textured tiles, multipliers, and optional perspective distortion.

import { BOARD_SIZE, CELL_TYPES, BOARD_LAYOUT, LETTER_VALUES } from './constants.js';

export class TestBoardGenerator {
  /**
   * Render a flat 900x900 Scrabble board onto a canvas.
   * @param {Array<Array>} grid 15x15 grid of tiles ({ letter, isJoker })
   * @param {Object} options { width: 900, height: 900 }
   * @returns {HTMLCanvasElement}
   */
  static renderFlatBoard(grid = null, options = {}) {
    const size = options.size || 900;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    const cellSize = size / BOARD_SIZE;

    // Board background (Deep dark green / slate felt)
    ctx.fillStyle = '#0f382a';
    ctx.fillRect(0, 0, size, size);

    // Draw cells
    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        const x = c * cellSize;
        const y = r * cellSize;
        const cellType = BOARD_LAYOUT[r][c];

        // Cell background
        ctx.fillStyle = this.getCellColor(cellType);
        ctx.fillRect(x + 1, y + 1, cellSize - 2, cellSize - 2);

        // Cell label (MT, MD, LT, LD, Star)
        if (!grid || !grid[r][c]) {
          this.drawCellLabel(ctx, cellType, x, y, cellSize);
        } else {
          // Draw tile
          const tile = grid[r][c];
          this.drawWoodenTile(ctx, tile.letter, tile.isJoker, x + 2, y + 2, cellSize - 4);
        }

        // Cell border
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)';
        ctx.lineWidth = 1;
        ctx.strokeRect(x, y, cellSize, cellSize);
      }
    }

    return canvas;
  }

  /**
   * Render a realistic photo-like Scrabble board with perspective distortion,
   * simulating a phone camera held at an angle above the table.
   * @param {Array<Array>} grid
   * @param {Object} options
   * @returns {Object} { canvas, trueCorners: [{x,y}, {x,y}, {x,y}, {x,y}] }
   */
  static renderPerspectivePhoto(grid = null, options = {}) {
    const flatCanvas = this.renderFlatBoard(grid, { size: 800 });
    const outWidth = options.width || 1080;
    const outHeight = options.height || 1080;

    const photoCanvas = document.createElement('canvas');
    photoCanvas.width = outWidth;
    photoCanvas.height = outHeight;
    const ctx = photoCanvas.getContext('2d');

    // Table surface texture (Dark wood table)
    const tableGrad = ctx.createLinearGradient(0, 0, outWidth, outHeight);
    tableGrad.addColorStop(0, '#1c1511');
    tableGrad.addColorStop(1, '#0e0b08');
    ctx.fillStyle = tableGrad;
    ctx.fillRect(0, 0, outWidth, outHeight);

    // Vignette & subtle camera noise
    const corners = [
      { x: outWidth * 0.16, y: outHeight * 0.14 }, // Top-Left
      { x: outWidth * 0.84, y: outHeight * 0.17 }, // Top-Right
      { x: outWidth * 0.92, y: outHeight * 0.86 }, // Bottom-Right
      { x: outWidth * 0.08, y: outHeight * 0.82 }  // Bottom-Left
    ];

    // Warp flatCanvas into perspective onto photoCanvas
    this.warpCanvasToQuad(flatCanvas, photoCanvas, corners);

    // Add ambient camera lighting and slight shadow
    const lightGrad = ctx.createRadialGradient(outWidth * 0.5, outHeight * 0.45, 100, outWidth * 0.5, outHeight * 0.5, outWidth * 0.7);
    lightGrad.addColorStop(0, 'rgba(255, 255, 240, 0.08)');
    lightGrad.addColorStop(1, 'rgba(0, 0, 0, 0.45)');
    ctx.fillStyle = lightGrad;
    ctx.fillRect(0, 0, outWidth, outHeight);

    return {
      canvas: photoCanvas,
      trueCorners: corners
    };
  }

  static getCellColor(cellType) {
    switch (cellType) {
      case CELL_TYPES.MT: return '#b91c1c'; // Mot Compte Triple (Rouge)
      case CELL_TYPES.MD: return '#ec4899'; // Mot Compte Double (Rose)
      case CELL_TYPES.LT: return '#1d4ed8'; // Lettre Compte Triple (Bleu Foncé)
      case CELL_TYPES.LD: return '#38bdf8'; // Lettre Compte Double (Bleu Ciel)
      case CELL_TYPES.CENTER: return '#ec4899'; // Centre (Étoile)
      default: return '#134e40'; // Vert forêt feutre Scrabble
    }
  }

  static drawCellLabel(ctx, cellType, x, y, size) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff';

    if (cellType === CELL_TYPES.CENTER) {
      ctx.font = `bold ${Math.round(size * 0.5)}px sans-serif`;
      ctx.fillText('★', x + size / 2, y + size / 2);
      return;
    }

    if (cellType === CELL_TYPES.NORMAL) return;

    ctx.font = `900 ${Math.round(size * 0.28)}px sans-serif`;
    let label = '';
    let sub = '';

    if (cellType === CELL_TYPES.MT) { label = 'MOT'; sub = 'TRIPLE'; }
    else if (cellType === CELL_TYPES.MD) { label = 'MOT'; sub = 'DOUBLE'; }
    else if (cellType === CELL_TYPES.LT) { label = 'LETTRE'; sub = 'TRIPLE'; }
    else if (cellType === CELL_TYPES.LD) { label = 'LETTRE'; sub = 'DOUBLE'; }

    ctx.fillText(label, x + size / 2, y + size * 0.38);
    ctx.font = `bold ${Math.round(size * 0.22)}px sans-serif`;
    ctx.fillText(sub, x + size / 2, y + size * 0.68);
  }

  static drawWoodenTile(ctx, letter, isJoker, x, y, size) {
    ctx.save();

    // 3D Shadow
    ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
    ctx.shadowBlur = 4;
    ctx.shadowOffsetX = 1.5;
    ctx.shadowOffsetY = 2;

    // Wood / Ivory Gradient
    const grad = ctx.createLinearGradient(x, y, x + size, y + size);
    grad.addColorStop(0, '#f9edd2'); // Light cream/wood
    grad.addColorStop(0.5, '#e6cf9e');
    grad.addColorStop(1, '#cbaf74'); // Warm oak bevel
    ctx.fillStyle = grad;

    // Rounded rectangle for tile
    const radius = Math.round(size * 0.12);
    ctx.beginPath();
    ctx.roundRect(x, y, size, size, radius);
    ctx.fill();

    // Reset shadow
    ctx.shadowColor = 'transparent';

    // Subtle wood bevel outline
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Draw Letter
    if (!isJoker && letter && letter !== '?') {
      ctx.fillStyle = '#1c1917'; // Rich dark brown/black
      ctx.font = `bold ${Math.round(size * 0.58)}px Arial, Helvetica, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(letter.toUpperCase(), x + size * 0.45, y + size * 0.48);

      // Subscript letter value in bottom right corner
      const val = LETTER_VALUES[letter.toUpperCase()] || 0;
      ctx.font = `bold ${Math.round(size * 0.22)}px Arial, sans-serif`;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'bottom';
      ctx.fillText(val.toString(), x + size * 0.90, y + size * 0.92);
    } else {
      // Joker blank tile: slight subtle dot or pristine blank
      ctx.fillStyle = 'rgba(180, 140, 90, 0.25)';
      ctx.beginPath();
      ctx.arc(x + size * 0.5, y + size * 0.5, size * 0.08, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  static warpCanvasToQuad(srcCanvas, dstCanvas, dstQuad) {
    const dstCtx = dstCanvas.getContext('2d');
    const sw = srcCanvas.width;
    const sh = srcCanvas.height;

    // Subdivision mesh bilinear warp
    const steps = 30;
    for (let iy = 0; iy < steps; iy++) {
      for (let ix = 0; ix < steps; ix++) {
        const u0 = ix / steps, u1 = (ix + 1) / steps;
        const v0 = iy / steps, v1 = (iy + 1) / steps;

        const p00 = this.bilerpQuad(dstQuad, u0, v0);
        const p10 = this.bilerpQuad(dstQuad, u1, v0);
        const p11 = this.bilerpQuad(dstQuad, u1, v1);
        const p01 = this.bilerpQuad(dstQuad, u0, v1);

        // Draw 2 triangles per quad cell
        dstCtx.save();
        dstCtx.beginPath();
        dstCtx.moveTo(p00.x, p00.y);
        dstCtx.lineTo(p10.x, p10.y);
        dstCtx.lineTo(p11.x, p11.y);
        dstCtx.lineTo(p01.x, p01.y);
        dstCtx.closePath();
        dstCtx.clip();

        // Affine approximate slice
        const sx = u0 * sw;
        const sy = v0 * sh;
        const sW = (u1 - u0) * sw;
        const sH = (v1 - v0) * sh;

        dstCtx.drawImage(
          srcCanvas,
          sx, sy, sW, sH,
          Math.min(p00.x, p01.x), Math.min(p00.y, p10.y),
          Math.max(p10.x, p11.x) - Math.min(p00.x, p01.x),
          Math.max(p01.y, p11.y) - Math.min(p00.y, p10.y)
        );
        dstCtx.restore();
      }
    }
  }

  static bilerpQuad(quad, u, v) {
    const topX = quad[0].x * (1 - u) + quad[1].x * u;
    const topY = quad[0].y * (1 - u) + quad[1].y * u;
    const botX = quad[3].x * (1 - u) + quad[2].x * u;
    const botY = quad[3].y * (1 - u) + quad[2].y * u;
    return {
      x: topX * (1 - v) + botX * v,
      y: topY * (1 - v) + botY * v
    };
  }
}
