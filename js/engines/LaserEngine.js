/**
 * LaserEngine
 * Produce vistas y exportaciones para SCULPFUN C1 + LaserGRBL.
 * Trabaja internamente en mm. Exporta PNG en escala configurable (px/mm).
 */
export class LaserEngine {
  constructor() {
    this.dpi = 96; // px/inch
    this.pxPerMm = this.dpi / 25.4; // ≈ 3.78 px/mm (a 96dpi)
  }

  /**
   * Genera canvas de CORTE (contorno en rojo sobre blanco).
   * @param {number} widthMm
   * @param {number} heightMm
   * @param {HTMLCanvasElement|null} sourceCanvas - canvas con la forma extraída
   * @param {Array} holes - [{diametrMm, x, y}]
   * @returns {HTMLCanvasElement}
   */
  buildCutCanvas(widthMm, heightMm, sourceCanvas, holes = []) {
    const W = Math.round(widthMm * this.pxPerMm);
    const H = Math.round(heightMm * this.pxPerMm);
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const ctx = c.getContext('2d');

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, H);

    // Contorno exterior
    ctx.save();
    ctx.strokeStyle = '#000000'; // negro = corte para LaserGRBL
    ctx.lineWidth = Math.max(1, W * 0.004);
    ctx.beginPath();
    ctx.ellipse(W/2, H/2, W/2 - 2, H/2 - 2, 0, 0, Math.PI*2);
    ctx.stroke();
    ctx.restore();

    // Agujeros
    holes.forEach(hole => {
      const d = ((hole.diametrMm || 2) / widthMm) * W;
      const hx = W/2;
      const hy = d * 1.5;
      ctx.save();
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = Math.max(1, W * 0.003);
      ctx.beginPath();
      ctx.arc(hx, hy, d/2, 0, Math.PI*2);
      ctx.stroke();
      ctx.restore();
    });

    return c;
  }

  /**
   * Genera canvas de GRABADO (B/N, negro = graba).
   * @param {number} widthMm
   * @param {number} heightMm
   * @param {HTMLCanvasElement|null} engravingCanvas
   * @param {string} level - SUAVE | MEDIO | FUERTE
   * @returns {HTMLCanvasElement}
   */
  buildEngravingCanvas(widthMm, heightMm, engravingCanvas, level = 'MEDIO') {
    const W = Math.round(widthMm * this.pxPerMm);
    const H = Math.round(heightMm * this.pxPerMm);
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const ctx = c.getContext('2d');

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, H);

    if (engravingCanvas) {
      // Escalar al tamaño mm real
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(W/2, H/2, W/2 - 1, H/2 - 1, 0, 0, Math.PI*2);
      ctx.clip();

      // Ajustar contraste según nivel visual
      const alphas = { SUAVE: 0.4, MEDIO: 0.7, FUERTE: 1.0 };
      ctx.globalAlpha = alphas[level] || 0.7;
      ctx.drawImage(engravingCanvas, 0, 0, W, H);
      ctx.restore();

      // Posterizar a B/N puro para LaserGRBL
      this._binarize(ctx, W, H);
    }

    return c;
  }

  /**
   * Exporta el canvas como PNG descargable.
   * @param {HTMLCanvasElement} canvas
   * @param {string} filename
   */
  exportPNG(canvas, filename = 'laser.png') {
    const url = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
  }

  /**
   * Devuelve las dimensiones de salida en mm y px.
   */
  getDimensions(widthMm, heightMm) {
    return {
      widthMm, heightMm,
      widthPx: Math.round(widthMm * this.pxPerMm),
      heightPx: Math.round(heightMm * this.pxPerMm),
      pxPerMm: this.pxPerMm,
    };
  }

  // ── Privado ──────────────────────────────────────────────────────────────────

  _binarize(ctx, W, H, threshold = 128) {
    const d = ctx.getImageData(0, 0, W, H);
    const px = d.data;
    for (let i = 0; i < px.length; i += 4) {
      const luma = px[i]*0.299 + px[i+1]*0.587 + px[i+2]*0.114;
      const v = luma < threshold ? 0 : 255;
      px[i] = px[i+1] = px[i+2] = v;
    }
    ctx.putImageData(d, 0, 0);
  }
}
