/**
 * MaterialEngine
 * Aplica el material (color, tipo, textura) al canvas de preview.
 */
export class MaterialEngine {
  /**
   * Colorea un canvas de silueta (B/N) con el color y tipo de cuero.
   * @param {HTMLCanvasElement} silhouetteCanvas - Canvas con silueta (negro sobre blanco)
   * @param {object} material - { color, type, textureCanvas? }
   * @returns {HTMLCanvasElement} canvas coloreado
   */
  applyMaterial(silhouetteCanvas, material) {
    const W = silhouetteCanvas.width;
    const H = silhouetteCanvas.height;
    const dst = document.createElement('canvas');
    dst.width = W; dst.height = H;
    const ctx = dst.getContext('2d');

    // 1. Silueta en color base
    ctx.fillStyle = material.color || '#c2845a';
    ctx.fillRect(0, 0, W, H);

    // 2. Aplicar efecto según tipo
    this._applyTypeEffect(ctx, material.type, W, H, material.color);

    // 3. Enmascarar con la silueta (solo donde hay píxeles oscuros = forma)
    const sCtx = silhouetteCanvas.getContext('2d');
    const sData = sCtx.getImageData(0, 0, W, H);
    const dData = ctx.getImageData(0, 0, W, H);
    for (let i = 0; i < sData.data.length; i += 4) {
      const luma = sData.data[i]*0.299 + sData.data[i+1]*0.587 + sData.data[i+2]*0.114;
      // Si en la silueta hay zona blanca (fuera de la pieza), hacemos transparente
      if (luma > 200) {
        dData.data[i+3] = 0;
      }
    }
    ctx.putImageData(dData, 0, 0);

    return dst;
  }

  /**
   * Genera el canvas de silueta sólida.
   * Si se pasa sourceCanvas (la foto), extrae la forma real del objeto.
   * Si no, usa un rectángulo redondeado como fallback.
   *
   * @param {number} widthPx
   * @param {number} heightPx
   * @param {object} material
   * @param {HTMLCanvasElement|null} sourceCanvas - canvas con la foto original
   */
  buildBasicSilhouette(widthPx, heightPx, material, sourceCanvas = null) {
    const c = document.createElement('canvas');
    c.width = widthPx; c.height = heightPx;
    const ctx = c.getContext('2d');

    // Fondo blanco (exterior)
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, widthPx, heightPx);

    if (sourceCanvas) {
      // ── Extraer silueta real de la foto ──────────────────────────────────
      const sw = sourceCanvas.width, sh = sourceCanvas.height;
      const sCtx = sourceCanvas.getContext('2d');
      const d = sCtx.getImageData(0, 0, sw, sh);
      const px = d.data;

      // Samplear color de fondo desde las esquinas
      const sampleCorner = (x, y) => {
        const xi = Math.min(Math.max(x, 0), sw-1);
        const yi = Math.min(Math.max(y, 0), sh-1);
        const i = (yi*sw+xi)*4;
        return [px[i], px[i+1], px[i+2]];
      };
      const corners = [
        sampleCorner(0,0), sampleCorner(sw-1,0),
        sampleCorner(0,sh-1), sampleCorner(sw-1,sh-1),
      ];
      let bgR=0, bgG=0, bgB=0;
      corners.forEach(([r,g,b]) => { bgR+=r; bgG+=g; bgB+=b; });
      bgR/=4; bgG/=4; bgB/=4;

      // Generar máscara: objeto = negro (0), fondo = blanco (255)
      const mask = new Uint8ClampedArray(sw * sh * 4);
      for (let i = 0; i < px.length; i += 4) {
        const diff = (Math.abs(px[i]-bgR) + Math.abs(px[i+1]-bgG) + Math.abs(px[i+2]-bgB)) / 3;
        const v = diff > 28 ? 0 : 255;
        mask[i] = mask[i+1] = mask[i+2] = v;
        mask[i+3] = 255;
      }

      // Flood-fill desde esquinas para aislar el objeto correctamente
      const visited = new Uint8Array(sw * sh);
      const floodQueue = [0, sw-1, (sh-1)*sw, (sh-1)*sw + sw-1];
      for (const start of floodQueue) {
        const stack = [start];
        while (stack.length) {
          const p = stack.pop();
          if (p < 0 || p >= sw*sh || visited[p]) continue;
          if (mask[p*4] !== 255) continue; // solo fondo blanco
          visited[p] = 1;
          stack.push(p-1, p+1, p-sw, p+sw);
        }
      }
      // Islas de fondo dentro del objeto → convertir a objeto
      for (let i = 0; i < sw*sh; i++) {
        if (mask[i*4] === 255 && !visited[i]) {
          mask[i*4] = mask[i*4+1] = mask[i*4+2] = 0;
        }
      }

      const mCanvas = document.createElement('canvas');
      mCanvas.width = sw; mCanvas.height = sh;
      mCanvas.getContext('2d').putImageData(new ImageData(mask, sw, sh), 0, 0);

      // Dibujar silueta escalada al canvas destino
      ctx.drawImage(mCanvas, 0, 0, widthPx, heightPx);

    } else {
      // ── Fallback: rectángulo redondeado ──────────────────────────────────
      const pad = Math.min(widthPx, heightPx) * 0.06;
      const r = Math.min(widthPx, heightPx) * 0.1;
      ctx.fillStyle = '#000';
      this._roundRectFill(ctx, pad, pad, widthPx - pad*2, heightPx - pad*2, r);
    }

    return c;
  }

  _roundRectFill(ctx, x, y, w, h, r) {
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
    ctx.fill();
  }

  // ── Privado ──────────────────────────────────────────────────────────────────

  _applyTypeEffect(ctx, type, W, H, baseColor) {
    ctx.save();
    switch (type) {
      case 'BRILLANTE':
        // Gradiente de brillo
        const gloss = ctx.createLinearGradient(0, 0, W*0.6, H*0.4);
        gloss.addColorStop(0, 'rgba(255,255,255,0.3)');
        gloss.addColorStop(0.5, 'rgba(255,255,255,0)');
        ctx.fillStyle = gloss;
        ctx.fillRect(0, 0, W, H);
        break;

      case 'MATE':
        // Ruido sutil para textura mate
        this._addNoise(ctx, W, H, 8, 0.06);
        break;

      case 'ANTE':
        // Ruido más marcado, más cálido
        this._addNoise(ctx, W, H, 12, 0.1);
        break;

      case 'METALIZADO': {
        const met = ctx.createLinearGradient(0, 0, W, H);
        met.addColorStop(0, 'rgba(255,255,255,0.5)');
        met.addColorStop(0.3, 'rgba(255,255,255,0.1)');
        met.addColorStop(0.7, 'rgba(0,0,0,0.2)');
        met.addColorStop(1, 'rgba(255,255,255,0.3)');
        ctx.fillStyle = met;
        ctx.fillRect(0, 0, W, H);
        break;
      }

      case 'TEXTURIZADO':
        this._addNoise(ctx, W, H, 6, 0.12);
        this._addNoise(ctx, W, H, 20, 0.08);
        break;

      case 'LISO':
      default:
        // Sutil viñeta
        const vig = ctx.createRadialGradient(W/2, H/2, 0, W/2, H/2, Math.max(W,H)*0.6);
        vig.addColorStop(0, 'rgba(255,255,255,0.05)');
        vig.addColorStop(1, 'rgba(0,0,0,0.15)');
        ctx.fillStyle = vig;
        ctx.fillRect(0, 0, W, H);
        break;
    }
    ctx.restore();
  }

  _addNoise(ctx, W, H, scale, alpha) {
    const tmp = document.createElement('canvas');
    tmp.width = Math.ceil(W/scale);
    tmp.height = Math.ceil(H/scale);
    const tCtx = tmp.getContext('2d');
    const d = tCtx.createImageData(tmp.width, tmp.height);
    for (let i = 0; i < d.data.length; i += 4) {
      const v = Math.random() * 255 | 0;
      d.data[i] = d.data[i+1] = d.data[i+2] = v;
      d.data[i+3] = 255;
    }
    tCtx.putImageData(d, 0, 0);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(tmp, 0, 0, W, H);
    ctx.restore();
  }
}
