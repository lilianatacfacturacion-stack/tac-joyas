export class LaserEngine {
  constructor() {
    this.pxPerMm = 10; // resolución interna
  }

  // ─── NUEVO: silueta rellena sin Sobel ─────────────────────────────────────
  buildFilledSilhouette(widthMm, heightMm, sourceCanvas) {
    if (!sourceCanvas) return null;
    const W = Math.round((widthMm || 30) * this.pxPerMm);
    const H = Math.round((heightMm || 40) * this.pxPerMm);
    return this._extractSilhouette(sourceCanvas, W, H);
  }

  // ─── CORTE: contorno exterior + agujeros ──────────────────────────────────
  buildCutCanvas(widthMm, heightMm, sourceCanvas, holes = []) {
    const W = Math.round((widthMm || 30) * this.pxPerMm);
    const H = Math.round((heightMm || 40) * this.pxPerMm);
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, W, H);

    if (sourceCanvas) {
      const filled = this._extractSilhouette(sourceCanvas, W, H);
      const edgeCanvas = this._outerEdge(filled, W, H);
      ctx.drawImage(edgeCanvas, 0, 0);
    }

    // Agujeros
    holes.forEach(h => {
      if (!h.diametrMm) return;
      const r = (h.diametrMm / 2) * this.pxPerMm;
      const cx = W * (h.xRel ?? 0.5);
      const cy = H * (h.yRel ?? 0.15);
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
    });

    return canvas;
  }

  // ─── GRABADO: imagen con intensidad variable en escala de grises ───────────
  // SUAVE = pocos detalles oscuros (umbral alto, solo lo más oscuro de la foto)
  // MEDIO = detalle moderado
  // FUERTE = muchos detalles, líneas más oscuras y densas
  // En lugar de binarizar a B&N puro, se genera una imagen con GRISES reales
  // para que el modo multiply en PreviewEngine sí muestre diferencia visual.
  buildEngravingCanvas(widthMm, heightMm, engravingCanvas, level = 'MEDIO', sourceCanvas = null) {
    const W = Math.round((widthMm || 30) * this.pxPerMm);
    const H = Math.round((heightMm || 40) * this.pxPerMm);
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, W, H);

    const src = engravingCanvas || sourceCanvas;
    if (!src) return canvas;

    ctx.drawImage(src, 0, 0, W, H);

    const imgData = ctx.getImageData(0, 0, W, H);
    const d = imgData.data;

    // Parámetros por nivel:
    // - threshold: píxeles más oscuros que este valor participan en el grabado
    // - contrast: cuánto se oscurecen las zonas grabadas
    // SUAVE: solo lo más oscuro, poco contraste → grabado ligero
    // MEDIO: moderado
    // FUERTE: umbral amplio + alto contraste → grabado intenso
    const params = {
      SUAVE:  { threshold: 160, minOutput: 200 }, // zonas grabadas salen gris claro
      MEDIO:  { threshold: 200, minOutput: 100 }, // zonas grabadas salen gris medio
      FUERTE: { threshold: 230, minOutput: 0   }, // zonas grabadas salen negro
    };
    const { threshold, minOutput } = params[level] ?? params.MEDIO;

    for (let i = 0; i < d.length; i += 4) {
      const luma = 0.299 * d[i] + 0.587 * d[i+1] + 0.114 * d[i+2];
      let v;
      if (luma < threshold) {
        // Zona oscura de la imagen → zona grabada
        // Escalar: luma=0 → minOutput, luma=threshold → 255
        v = minOutput + (255 - minOutput) * (luma / threshold);
        v = Math.round(v);
      } else {
        // Zona clara → sin grabar → blanco
        v = 255;
      }
      d[i] = d[i+1] = d[i+2] = v;
      d[i+3] = 255;
    }
    ctx.putImageData(imgData, 0, 0);

    // Mascarar con silueta
    if (sourceCanvas) {
      const sil = this._extractSilhouette(sourceCanvas, W, H);
      const mask = this._bnToAlpha(sil, W, H);
      ctx.globalCompositeOperation = 'destination-in';
      ctx.drawImage(mask, 0, 0);
      ctx.globalCompositeOperation = 'source-over';
    }

    return canvas;
  }

  // ─── Exportar PNG ─────────────────────────────────────────────────────────
  exportPNG(canvas, filename) {
    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = filename || 'export.png';
    a.click();
  }

  // ═══════════════════ MÉTODOS PRIVADOS ════════════════════════════════════

  _extractSilhouette(src, W, H) {
    const tmp = document.createElement('canvas');
    tmp.width = W; tmp.height = H;
    const tCtx = tmp.getContext('2d');
    tCtx.drawImage(src, 0, 0, W, H);
    const imgData = tCtx.getImageData(0, 0, W, H);
    const d = imgData.data;

    const corners = [0, (W-1)*4, (H-1)*W*4, ((H-1)*W + W-1)*4];
    let bgR = 0, bgG = 0, bgB = 0;
    corners.forEach(i => { bgR += d[i]; bgG += d[i+1]; bgB += d[i+2]; });
    bgR /= 4; bgG /= 4; bgB /= 4;

    const out = document.createElement('canvas');
    out.width = W; out.height = H;
    const oCtx = out.getContext('2d');
    const oData = oCtx.createImageData(W, H);
    const o = oData.data;

    for (let i = 0; i < d.length; i += 4) {
      const diff = Math.abs(d[i]-bgR) + Math.abs(d[i+1]-bgG) + Math.abs(d[i+2]-bgB);
      const v = diff > 30 ? 0 : 255;
      o[i] = o[i+1] = o[i+2] = v;
      o[i+3] = 255;
    }

    oCtx.putImageData(oData, 0, 0);
    this._floodFillWhite(oData.data, W, H);
    oCtx.putImageData(oData, 0, 0);
    return out;
  }

  _floodFillWhite(data, W, H) {
    const visited = new Uint8Array(W * H);
    const queue = [];
    const push = (x, y) => {
      const i = y * W + x;
      if (x < 0 || x >= W || y < 0 || y >= H) return;
      if (visited[i]) return;
      const pi = i * 4;
      if (data[pi] < 128) return;
      visited[i] = 1;
      data[pi] = data[pi+1] = data[pi+2] = 255;
      queue.push(i);
    };
    for (let x = 0; x < W; x++) { push(x, 0); push(x, H-1); }
    for (let y = 0; y < H; y++) { push(0, y); push(W-1, y); }

    let qi = 0;
    while (qi < queue.length) {
      const idx = queue[qi++];
      const x = idx % W, y = (idx / W) | 0;
      push(x-1, y); push(x+1, y); push(x, y-1); push(x, y+1);
    }
  }

  _outerEdge(silCanvas, W, H) {
    const ctx = silCanvas.getContext('2d');
    const data = ctx.getImageData(0, 0, W, H).data;

    const out = document.createElement('canvas');
    out.width = W; out.height = H;
    const oCtx = out.getContext('2d');
    const oData = oCtx.createImageData(W, H);
    const o = oData.data;
    for (let i = 0; i < o.length; i += 4) { o[i]=o[i+1]=o[i+2]=255; o[i+3]=255; }

    for (let y = 1; y < H-1; y++) {
      for (let x = 1; x < W-1; x++) {
        const ci = (y * W + x) * 4;
        if (data[ci] > 128) continue;
        const n = [(y-1)*W+x, (y+1)*W+x, y*W+(x-1), y*W+(x+1)];
        const isBorder = n.some(ni => data[ni*4] > 128);
        if (isBorder) {
          o[ci] = o[ci+1] = o[ci+2] = 0;
        }
      }
    }
    oCtx.putImageData(oData, 0, 0);
    return out;
  }

  _bnToAlpha(bnCanvas, W, H) {
    const ctx = bnCanvas.getContext('2d');
    const d = ctx.getImageData(0, 0, W, H).data;
    const out = document.createElement('canvas');
    out.width = W; out.height = H;
    const oCtx = out.getContext('2d');
    const oData = oCtx.createImageData(W, H);
    const o = oData.data;
    for (let i = 0; i < d.length; i += 4) {
      o[i] = o[i+1] = o[i+2] = 0;
      o[i+3] = d[i] < 128 ? 255 : 0;
    }
    oCtx.putImageData(oData, 0, 0);
    return out;
  }

  _sobelEdge(imgData, W, H) {
    const d = imgData.data;
    const out = document.createElement('canvas');
    out.width = W; out.height = H;
    const oCtx = out.getContext('2d');
    const oData = oCtx.createImageData(W, H);
    const o = oData.data;
    for (let i = 0; i < o.length; i += 4) { o[i]=o[i+1]=o[i+2]=255; o[i+3]=255; }

    for (let y = 1; y < H-1; y++) {
      for (let x = 1; x < W-1; x++) {
        const luma = (px, py) => {
          const idx = (py * W + px) * 4;
          return 0.299*d[idx]+0.587*d[idx+1]+0.114*d[idx+2];
        };
        const gx = -luma(x-1,y-1)-2*luma(x-1,y)-luma(x-1,y+1)+luma(x+1,y-1)+2*luma(x+1,y)+luma(x+1,y+1);
        const gy = -luma(x-1,y-1)-2*luma(x,y-1)-luma(x+1,y-1)+luma(x-1,y+1)+2*luma(x,y+1)+luma(x+1,y+1);
        const mag = Math.sqrt(gx*gx+gy*gy);
        const ci = (y*W+x)*4;
        if (mag > 40) { o[ci]=o[ci+1]=o[ci+2]=0; }
      }
    }
    oCtx.putImageData(oData, 0, 0);
    return out;
  }
}
