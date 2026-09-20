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
   * Genera el canvas de silueta sólida (forma básica = rectángulo redondeado si no hay imagen).
   */
  buildBasicSilhouette(widthPx, heightPx, material) {
    const c = document.createElement('canvas');
    c.width = widthPx; c.height = heightPx;
    const ctx = c.getContext('2d');

    // Fondo blanco (exterior)
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, widthPx, heightPx);

    // Forma: elipse para pendiente floral
    const r = Math.min(widthPx, heightPx) * 0.42;
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(widthPx/2, heightPx/2 + heightPx*0.02, widthPx*0.45, heightPx*0.47, 0, 0, Math.PI*2);
    ctx.fill();

    return c;
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
