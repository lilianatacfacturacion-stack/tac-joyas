export class PreviewEngine {
  /**
   * canvases: {
   *   materialCanvas,    // color + textura, ya clipeado a silueta
   *   silhouetteCanvas,  // BN rellena (negro=objeto) — de MaterialEngine
   *   cutCanvas,         // líneas de corte/borde exterior (solo para vistas láser)
   *   laserEngCanvas,    // grabado en grises (blanco=sin grabar, gris/negro=grabado)
   *   laserSilCanvas,    // BN rellena a escala láser
   *   engravingLevel,    // 'SUAVE'|'MEDIO'|'FUERTE' (ya codificado en laserEngCanvas)
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
    // Fondo oscuro elegante para la vista de color real
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, W, H);

    if (view === 'PAREJA') {
      this._drawPiece(W * 0.28, H * 0.5, W * 0.38, H * 0.78, false);
      this._drawPiece(W * 0.72, H * 0.5, W * 0.38, H * 0.78, true);
    } else if (view === 'PENDIENTE') {
      this._drawPiece(W * 0.5, H * 0.48, W * 0.5, H * 0.80, false);
      this._drawHardware(W * 0.5, H * 0.1);
    } else {
      this._drawPiece(W * 0.5, H * 0.5, W * 0.65, H * 0.88, false);
    }
  }

  // Dibuja la pieza: color de material clipeado a silueta + grabado en grises encima
  _drawPiece(cx, cy, maxW, maxH, mirror = false) {
    const ctx = this._ctx;
    const { materialCanvas, silhouetteCanvas, laserEngCanvas, laserSilCanvas } = this._canvases;

    // Silueta de clip: usar laserSilCanvas (limpia, sin líneas internas) si existe
    const shapeSrc = laserSilCanvas || silhouetteCanvas;
    if (!shapeSrc && !materialCanvas) {
      // Sin datos: no dibujar nada (eliminado placeholder elipse)
      return;
    }

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
      // Canvas temporal: material + grabado, clipeado a silueta
      const tmp = document.createElement('canvas');
      tmp.width = Math.round(dW); tmp.height = Math.round(dH);
      const tCtx = tmp.getContext('2d');

      // 1. Dibujar material (color de cuero/tela)
      tCtx.drawImage(materialCanvas, 0, 0, tmp.width, tmp.height);

      // 2. Superponer grabado en multiply
      //    laserEngCanvas tiene grises: blanco=sin grabar, gris/negro=grabado
      //    multiply: material_color * grabado_gris → zonas grabadas más oscuras
      if (laserEngCanvas) {
        tCtx.globalCompositeOperation = 'multiply';
        tCtx.globalAlpha = 1.0; // opacidad total — el nivel ya está codificado en los grises
        tCtx.drawImage(laserEngCanvas, 0, 0, tmp.width, tmp.height);
        tCtx.globalAlpha = 1;
        tCtx.globalCompositeOperation = 'source-over';
      }

      // 3. Clipear a silueta (negro=objeto → opaco, blanco=fondo → transparente)
      const maskCanvas = this._bnToAlpha(shapeSrc, tmp.width, tmp.height);
      tCtx.globalCompositeOperation = 'destination-in';
      tCtx.drawImage(maskCanvas, 0, 0);
      tCtx.globalCompositeOperation = 'source-over';

      // 4. Dibujar resultado en canvas principal
      ctx.drawImage(tmp, Math.round(dx), Math.round(dy));

    } else if (materialCanvas) {
      ctx.drawImage(materialCanvas, Math.round(dx), Math.round(dy), Math.round(dW), Math.round(dH));
    }

    ctx.restore();
  }

  _drawHardware(cx, cy) {
    const ctx = this._ctx;
    const hw = this._project?.hardware?.[0];
    const color = hw?.color || '#c8a035';
    ctx.save();
    // Argolla
    ctx.beginPath();
    ctx.arc(cx, cy, 10, 0, Math.PI * 2);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;
    ctx.stroke();
    // Gancho
    ctx.beginPath();
    ctx.moveTo(cx, cy - 10);
    ctx.quadraticCurveTo(cx + 12, cy - 18, cx + 12, cy - 30);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }

  // ─── Vistas láser ─────────────────────────────────────────────────────────
  _renderLaser(laserView) {
    const ctx = this._ctx;
    const W = this._W, H = this._H;
    const pad = 32;

    if (laserView === 'CORTE') {
      // Fondo blanco + borde de corte negro
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, W, H);
      this._drawLaserCanvas(this._canvases.cutCanvas, pad, ctx, W, H);

    } else if (laserView === 'GRABADO') {
      // Fondo blanco + grabado en grises + borde en azul semitransparente
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, W, H);
      this._drawLaserCanvas(this._canvases.laserEngCanvas, pad, ctx, W, H);
      if (this._canvases.cutCanvas) {
        const { dX, dY, dW, dH } = this._laserLayout(this._canvases.cutCanvas, pad, W, H);
        ctx.save();
        ctx.globalAlpha = 0.6;
        const blue = this._recolorCanvas(this._canvases.cutCanvas, dW, dH, 0, 80, 200);
        ctx.drawImage(blue, dX, dY);
        ctx.globalAlpha = 1;
        ctx.restore();
      }

    } else if (laserView === 'COMPLETO') {
      // Fondo blanco + grabado + corte encima
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, W, H);
      this._drawLaserCanvas(this._canvases.laserEngCanvas, pad, ctx, W, H);
      if (this._canvases.cutCanvas) {
        const { dX, dY, dW, dH } = this._laserLayout(this._canvases.cutCanvas, pad, W, H);
        ctx.save();
        ctx.globalAlpha = 0.85;
        ctx.drawImage(this._canvases.cutCanvas, dX, dY, dW, dH);
        ctx.restore();
      }

    } else if (laserView === 'PREVIEW') {
      // Vista final realista: material+grabado sobre fondo blanco con sombra
      ctx.fillStyle = '#f0f0f0';
      ctx.fillRect(0, 0, W, H);
      // Dibujar la pieza centrada sobre fondo claro
      this._renderNormalOnWhite();
    }
  }

  // Vista "PREVIEW": como _renderNormal pero sobre fondo claro
  _renderNormalOnWhite() {
    const ctx = this._ctx;
    const W = this._W, H = this._H;
    const { materialCanvas, silhouetteCanvas, laserEngCanvas, laserSilCanvas } = this._canvases;
    const shapeSrc = laserSilCanvas || silhouetteCanvas;
    if (!shapeSrc && !materialCanvas) return;

    const srcW = (shapeSrc || materialCanvas).width;
    const srcH = (shapeSrc || materialCanvas).height;
    const maxW = W * 0.65, maxH = H * 0.88;
    const scale = Math.min(maxW / srcW, maxH / srcH);
    const dW = Math.round(srcW * scale);
    const dH = Math.round(srcH * scale);
    const dx = Math.round((W - dW) / 2);
    const dy = Math.round((H - dH) / 2);

    if (materialCanvas && shapeSrc) {
      const tmp = document.createElement('canvas');
      tmp.width = dW; tmp.height = dH;
      const tCtx = tmp.getContext('2d');

      tCtx.drawImage(materialCanvas, 0, 0, dW, dH);

      if (laserEngCanvas) {
        tCtx.globalCompositeOperation = 'multiply';
        tCtx.drawImage(laserEngCanvas, 0, 0, dW, dH);
        tCtx.globalCompositeOperation = 'source-over';
      }

      const maskCanvas = this._bnToAlpha(shapeSrc, dW, dH);
      tCtx.globalCompositeOperation = 'destination-in';
      tCtx.drawImage(maskCanvas, 0, 0);
      tCtx.globalCompositeOperation = 'source-over';

      // Sombra suave
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.35)';
      ctx.shadowBlur = 18;
      ctx.shadowOffsetX = 3;
      ctx.shadowOffsetY = 4;
      ctx.drawImage(tmp, dx, dy);
      ctx.restore();
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

  // Recolorea un canvas: reemplaza pixels oscuros con el color dado
  _recolorCanvas(src, dW, dH, r, g, b) {
    const tmp = document.createElement('canvas');
    tmp.width = dW; tmp.height = dH;
    const tCtx = tmp.getContext('2d');
    tCtx.drawImage(src, 0, 0, dW, dH);
    const data = tCtx.getImageData(0, 0, dW, dH);
    const d = data.data;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i] < 128) { d[i] = r; d[i+1] = g; d[i+2] = b; }
    }
    tCtx.putImageData(data, 0, 0);
    return tmp;
  }

  // BN (negro=objeto) → RGBA (negro+opaco donde había objeto)
  _bnToAlpha(bnCanvas, destW, destH) {
    const tmp = document.createElement('canvas');
    tmp.width = destW; tmp.height = destH;
    const tCtx = tmp.getContext('2d');
    tCtx.drawImage(bnCanvas, 0, 0, destW, destH);
    const imgData = tCtx.getImageData(0, 0, destW, destH);
    const d = imgData.data;
    for (let i = 0; i < d.length; i += 4) {
      const luma = 0.299 * d[i] + 0.587 * d[i+1] + 0.114 * d[i+2];
      d[i+3] = luma < 128 ? 255 : 0;
      d[i] = d[i+1] = d[i+2] = 0;
    }
    tCtx.putImageData(imgData, 0, 0);
    return tmp;
  }
}
