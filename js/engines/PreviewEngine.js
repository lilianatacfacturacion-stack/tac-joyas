export class PreviewEngine {
  /**
   * canvases: {
   *   materialCanvas,    // color + textura, ya clipeado a silueta
   *   silhouetteCanvas,  // BN rellena (negro=objeto) — de MaterialEngine
   *   cutCanvas,         // líneas de corte/borde exterior
   *   laserEngCanvas,    // grabado binarizado con nivel aplicado
   *   laserSilCanvas,    // BN rellena a escala láser (de LaserEngine.buildFilledSilhouette)
   *   engravingCanvas,   // grabado crudo (para composición en vista normal)
   *   engravingLevel,    // 'SUAVE'|'MEDIO'|'FUERTE'
   * }
   */
  render(canvas, project, view = 'PIEZA', laserView = null, canvases = {}) {
    this._c = canvas;
    this._ctx = canvas.getContext('2d');
    this._project = project;
    this._canvases = canvases;
    this._W = canvas.width;
    this._H = canvas.height;

    if (laserView) {
      this._renderLaser(laserView);
    } else {
      this._renderNormal(view);
    }
  }

  // ─── Vista normal (Pieza sola / Pendiente / Pareja) ──────────────────────
  _renderNormal(view) {
    const ctx = this._ctx;
    const W = this._W, H = this._H;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#050510';
    ctx.fillRect(0, 0, W, H);

    if (view === 'PAREJA') {
      this._drawPiece(W * 0.28, H * 0.5, W * 0.38, H * 0.78, false);
      this._drawPiece(W * 0.72, H * 0.5, W * 0.38, H * 0.78, true);
    } else if (view === 'PENDIENTE') {
      this._drawPiece(W * 0.5, H * 0.45, W * 0.5, H * 0.85, false);
      this._drawHardware(W * 0.5, H * 0.09);
    } else {
      this._drawPiece(W * 0.5, H * 0.5, W * 0.6, H * 0.85, false);
    }
  }

  // Dibuja la pieza realista: color de material + grabado encima en multiply
  _drawPiece(cx, cy, maxW, maxH, mirror = false) {
    const ctx = this._ctx;
    const { materialCanvas, silhouetteCanvas, laserEngCanvas, laserSilCanvas, engravingLevel } = this._canvases;

    // Canvas a usar como fuente de forma: laserSilCanvas si existe, si no silhouetteCanvas
    const shapeSrc = laserSilCanvas || silhouetteCanvas;
    if (!shapeSrc && !materialCanvas) {
      this._drawPlaceholderEllipse(cx, cy, maxW * 0.5, maxH * 0.5, ctx);
      return;
    }

    // Calcular tamaño de visualización manteniendo proporción
    const srcW = (shapeSrc || materialCanvas).width;
    const srcH = (shapeSrc || materialCanvas).height;
    const scale = Math.min(maxW / srcW, maxH / srcH);
    const dW = srcW * scale;
    const dH = srcH * scale;
    const dx = cx - dW / 2;
    const dy = cy - dH / 2;

    ctx.save();
    if (mirror) {
      ctx.translate(cx * 2, 0);
      ctx.scale(-1, 1);
    }

    if (materialCanvas && shapeSrc) {
      // 1. Crear canvas temporal con material clipeado a silueta limpia
      const tmp = document.createElement('canvas');
      tmp.width = dW; tmp.height = dH;
      const tCtx = tmp.getContext('2d');

      // Dibujar material
      tCtx.drawImage(materialCanvas, 0, 0, dW, dH);

      // Clipear con la silueta limpia (negro=objeto → invertir a alfa)
      const maskCanvas = this._bnToAlpha(shapeSrc, dW, dH);
      tCtx.globalCompositeOperation = 'destination-in';
      tCtx.drawImage(maskCanvas, 0, 0);
      tCtx.globalCompositeOperation = 'source-over';

      // 2. Superponer grabado en modo multiply para simular grabado láser en cuero
      if (laserEngCanvas) {
        // El grabado láser (negro=grabado, blanco=sin grabar) se aplica como sombra
        tCtx.globalCompositeOperation = 'multiply';
        // Ajustar opacidad del grabado según nivel
        const alphas = { SUAVE: 0.35, MEDIO: 0.6, FUERTE: 0.85 };
        tCtx.globalAlpha = alphas[engravingLevel] ?? 0.6;
        tCtx.drawImage(laserEngCanvas, 0, 0, dW, dH);
        tCtx.globalAlpha = 1;
        tCtx.globalCompositeOperation = 'source-over';
      }

      ctx.drawImage(tmp, dx, dy);
    } else if (materialCanvas) {
      ctx.drawImage(materialCanvas, dx, dy, dW, dH);
    }

    ctx.restore();
  }

  _drawHardware(cx, cy) {
    const ctx = this._ctx;
    const hw = this._project?.hardware?.[0];
    const color = hw?.color || '#b8860b';
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, 12, 0, Math.PI * 2);
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.stroke();
    // Gancho
    ctx.beginPath();
    ctx.moveTo(cx, cy - 12);
    ctx.quadraticCurveTo(cx + 15, cy - 20, cx + 15, cy - 35);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.restore();
  }

  // ─── Vistas láser ─────────────────────────────────────────────────────────
  _renderLaser(laserView) {
    const ctx = this._ctx;
    const W = this._W, H = this._H;
    const pad = 32;

    if (laserView === 'CORTE') {
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, W, H);
      this._drawLaserCanvas(this._canvases.cutCanvas, pad, ctx, W, H);

    } else if (laserView === 'GRABADO') {
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, W, H);
      this._drawLaserCanvas(this._canvases.laserEngCanvas, pad, ctx, W, H);
      // Superponer el borde de corte en azul semitransparente
      if (this._canvases.cutCanvas) {
        const { dX, dY, dW, dH } = this._laserLayout(this._canvases.cutCanvas, pad, W, H);
        ctx.save();
        ctx.globalAlpha = 0.5;
        ctx.globalCompositeOperation = 'multiply';
        // Colorear el borde en azul
        const blue = document.createElement('canvas');
        blue.width = dW; blue.height = dH;
        const bCtx = blue.getContext('2d');
        bCtx.drawImage(this._canvases.cutCanvas, 0, 0, dW, dH);
        // Recolorear líneas negras a azul
        const bData = bCtx.getImageData(0, 0, dW, dH);
        const bd = bData.data;
        for (let i = 0; i < bd.length; i += 4) {
          if (bd[i] < 128) {
            bd[i] = 0; bd[i+1] = 80; bd[i+2] = 200;
          }
        }
        bCtx.putImageData(bData, 0, 0);
        ctx.drawImage(blue, dX, dY);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
        ctx.restore();
      }

    } else if (laserView === 'COMPLETO') {
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, W, H);
      this._drawLaserCanvas(this._canvases.laserEngCanvas, pad, ctx, W, H);
      // Encima el corte con mayor opacidad
      if (this._canvases.cutCanvas) {
        const { dX, dY, dW, dH } = this._laserLayout(this._canvases.cutCanvas, pad, W, H);
        ctx.save();
        ctx.globalAlpha = 0.8;
        ctx.drawImage(this._canvases.cutCanvas, dX, dY, dW, dH);
        ctx.restore();
      }
    }
  }

  _laserLayout(src, pad, W, H) {
    const sW = src.width, sH = src.height;
    const scale = Math.min((W - pad*2) / sW, (H - pad*2) / sH);
    const dW = Math.round(sW * scale);
    const dH = Math.round(sH * scale);
    const dX = Math.round((W - dW) / 2);
    const dY = Math.round((H - dH) / 2);
    return { dX, dY, dW, dH, scale };
  }

  _drawLaserCanvas(src, pad, ctx, W, H) {
    if (!src) {
      ctx.fillStyle = '#ccc';
      ctx.font = '14px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Sin datos de láser', W/2, H/2);
      return;
    }
    const { dX, dY, dW, dH } = this._laserLayout(src, pad, W, H);
    ctx.drawImage(src, dX, dY, dW, dH);
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────

  // Convierte canvas BN (negro=objeto) en canvas RGBA (negro+opaco donde había objeto)
  _bnToAlpha(bnCanvas, destW, destH) {
    const tmp = document.createElement('canvas');
    tmp.width = destW; tmp.height = destH;
    const tCtx = tmp.getContext('2d');
    tCtx.drawImage(bnCanvas, 0, 0, destW, destH);
    const imgData = tCtx.getImageData(0, 0, destW, destH);
    const d = imgData.data;
    for (let i = 0; i < d.length; i += 4) {
      const luma = 0.299 * d[i] + 0.587 * d[i+1] + 0.114 * d[i+2];
      // negro=objeto → opaco; blanco=fondo → transparente
      d[i+3] = luma < 128 ? 255 : 0;
      d[i] = d[i+1] = d[i+2] = 0;
    }
    tCtx.putImageData(imgData, 0, 0);
    return tmp;
  }

  _drawPlaceholderEllipse(cx, cy, rx, ry, ctx) {
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.setLineDash([6, 4]);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fill();
    ctx.restore();
  }
}
