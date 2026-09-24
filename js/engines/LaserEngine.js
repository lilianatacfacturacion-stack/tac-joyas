/**
 * LaserEngine
 * Produce vistas y exportaciones para SCULPFUN C1 + LaserGRBL.
 * Trabaja internamente en mm. Exporta PNG en escala configurable (px/mm).
 */
export class LaserEngine {
  constructor() {
    this.dpi = 254; // 10 px/mm — resolución adecuada para láser
    this.pxPerMm = 10;
  }

  /**
   * Genera canvas de CORTE.
   * Si se pasa sourceCanvas (foto original), extrae la silueta real.
   * Si no, dibuja un rectángulo redondeado proporcional.
   */
  buildCutCanvas(widthMm, heightMm, sourceCanvas, holes = []) {
    const W = Math.round(widthMm * this.pxPerMm);
    const H = Math.round(heightMm * this.pxPerMm);
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const ctx = c.getContext('2d');

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, H);

    if (sourceCanvas) {
      // Extraer silueta real de la imagen
      const silhouette = this._extractSilhouette(sourceCanvas, W, H);
      // Dibujar solo el contorno en negro (= línea de corte para láser)
      ctx.save();
      ctx.globalCompositeOperation = 'source-over';
      // Contorno negro = pasar la silueta como borde
      const sCtx = silhouette.getContext('2d');
      const sData = sCtx.getImageData(0, 0, W, H);
      const edgeCanvas = this._sobelEdge(sData, W, H);
      ctx.drawImage(edgeCanvas, 0, 0);
      ctx.restore();
    } else {
      // Forma genérica: rectángulo redondeado
      ctx.save();
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = Math.max(2, W * 0.015);
      const r = Math.min(W, H) * 0.12;
      this._roundRect(ctx, W * 0.05, H * 0.05, W * 0.9, H * 0.9, r);
      ctx.stroke();
      ctx.restore();
    }

    // Agujero superior
    holes.forEach(hole => {
      const d = Math.round((hole.diametrMm || 2) * this.pxPerMm);
      const hx = Math.round(W / 2);
      const hy = Math.round(d * 1.5);
      ctx.save();
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = Math.max(1, W * 0.01);
      ctx.beginPath();
      ctx.arc(hx, hy, d / 2, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    });

    return c;
  }

  /**
   * Genera canvas de GRABADO (B/N, negro = graba).
   * Si se pasa sourceCanvas, usa la silueta real como máscara.
   */
  buildEngravingCanvas(widthMm, heightMm, engravingCanvas, level = 'MEDIO', sourceCanvas = null) {
    const W = Math.round(widthMm * this.pxPerMm);
    const H = Math.round(heightMm * this.pxPerMm);
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const ctx = c.getContext('2d');

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, H);

    if (engravingCanvas) {
      ctx.save();

      // Máscara: si hay foto original, usar silueta real; si no, sin clip
      if (sourceCanvas) {
        const sil = this._extractSilhouette(sourceCanvas, W, H);
        this._clipBySilhouette(ctx, sil, W, H);
      }

      const alphas = { SUAVE: 0.45, MEDIO: 0.75, FUERTE: 1.0 };
      ctx.globalAlpha = alphas[level] || 0.75;
      ctx.drawImage(engravingCanvas, 0, 0, W, H);
      ctx.restore();

      this._binarize(ctx, W, H);
    }

    return c;
  }

  exportPNG(canvas, filename = 'laser.png') {
    const url = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
  }

  getDimensions(widthMm, heightMm) {
    return {
      widthMm, heightMm,
      widthPx: Math.round(widthMm * this.pxPerMm),
      heightPx: Math.round(heightMm * this.pxPerMm),
      pxPerMm: this.pxPerMm,
    };
  }

  // ── Privado ──────────────────────────────────────────────────────────────────

  /**
   * Extrae silueta rellena (negro sobre blanco) de la imagen fuente.
   * Umbraliza por alpha o por luminosidad.
   */
  _extractSilhouette(src, W, H) {
    const tmp = document.createElement('canvas');
    tmp.width = src.width; tmp.height = src.height;
    const tCtx = tmp.getContext('2d');
    tCtx.drawImage(src, 0, 0);
    const d = tCtx.getImageData(0, 0, src.width, src.height);
    const px = d.data;

    // Detectar fondo: samplear esquinas
    const corners = [0, (src.width-1)*4, (src.height-1)*src.width*4, ((src.height-1)*src.width + src.width-1)*4];
    let bgR = 0, bgG = 0, bgB = 0;
    corners.forEach(i => { bgR += px[i]; bgG += px[i+1]; bgB += px[i+2]; });
    bgR = Math.round(bgR/4); bgG = Math.round(bgG/4); bgB = Math.round(bgB/4);

    // Crear máscara: píxeles distintos del fondo = parte del objeto
    const mask = tCtx.createImageData(src.width, src.height);
    for (let i = 0; i < px.length; i += 4) {
      const dr = Math.abs(px[i] - bgR);
      const dg = Math.abs(px[i+1] - bgG);
      const db = Math.abs(px[i+2] - bgB);
      const diff = (dr + dg + db) / 3;
      const isObj = diff > 30 || (px[i+3] !== undefined && px[i+3] < 200);
      mask.data[i] = mask.data[i+1] = mask.data[i+2] = isObj ? 0 : 255;
      mask.data[i+3] = 255;
    }

    // Canvas de silueta al tamaño de destino
    const dst = document.createElement('canvas');
    dst.width = W; dst.height = H;
    const dCtx = dst.getContext('2d');
    tCtx.putImageData(mask, 0, 0);
    dCtx.drawImage(tmp, 0, 0, W, H);

    return dst;
  }

  /**
   * Aplica clip de silueta al contexto: solo dibuja donde hay objeto.
   */
  _clipBySilhouette(ctx, silhouetteCanvas, W, H) {
    // Dibujar silueta en canal alpha para clip
    const offscreen = document.createElement('canvas');
    offscreen.width = W; offscreen.height = H;
    const oCtx = offscreen.getContext('2d');
    oCtx.drawImage(silhouetteCanvas, 0, 0);
    const d = oCtx.getImageData(0, 0, W, H);
    for (let i = 0; i < d.data.length; i += 4) {
      // Negro (objeto) = opaco; Blanco (fondo) = transparente
      const luma = d.data[i]*0.299 + d.data[i+1]*0.587 + d.data[i+2]*0.114;
      d.data[i+3] = luma < 128 ? 255 : 0;
      d.data[i] = d.data[i+1] = d.data[i+2] = 0;
    }
    oCtx.putImageData(d, 0, 0);

    ctx.globalCompositeOperation = 'destination-in';
    // No podemos usar clip() con imagen, usamos compositing
  }

  /**
   * Detecta bordes con Sobel — produce el contorno de la silueta.
   */
  _sobelEdge(imgData, W, H) {
    const src = imgData.data;
    const dst = document.createElement('canvas');
    dst.width = W; dst.height = H;
    const dCtx = dst.getContext('2d');
    dCtx.fillStyle = '#fff';
    dCtx.fillRect(0, 0, W, H);
    const out = dCtx.createImageData(W, H);
    const o = out.data;

    const kX = [-1,0,1,-2,0,2,-1,0,1];
    const kY = [-1,-2,-1,0,0,0,1,2,1];

    for (let y = 1; y < H-1; y++) {
      for (let x = 1; x < W-1; x++) {
        let gx = 0, gy = 0;
        for (let ky = -1; ky <= 1; ky++) {
          for (let kx2 = -1; kx2 <= 1; kx2++) {
            const idx = ((y+ky)*W + (x+kx2)) * 4;
            const luma = src[idx]*0.299 + src[idx+1]*0.587 + src[idx+2]*0.114;
            const ki = (ky+1)*3 + (kx2+1);
            gx += luma * kX[ki];
            gy += luma * kY[ki];
          }
        }
        const mag = Math.sqrt(gx*gx + gy*gy);
        const i = (y*W+x)*4;
        const v = mag > 40 ? 0 : 255;
        o[i] = o[i+1] = o[i+2] = v;
        o[i+3] = 255;
      }
    }
    dCtx.putImageData(out, 0, 0);
    return dst;
  }

  _roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  _binarize(ctx, W, H, threshold = 128) {
    const d = ctx.getImageData(0, 0, W, H);
    const px = d.data;
    for (let i = 0; i < px.length; i += 4) {
      const luma = px[i]*0.299 + px[i+1]*0.587 + px[i+2]*0.114;
      const v = luma < threshold ? 0 : 255;
      px[i] = px[i+1] = px[i+2] = v;
      px[i+3] = 255;
    }
    ctx.putImageData(d, 0, 0);
  }
}
