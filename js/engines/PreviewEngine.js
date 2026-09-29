/**
 * PreviewEngine v3
 * Renderiza el preview 2D/2.5D en el canvas de resultado.
 * Vistas: PIEZA SOLA | PENDIENTE COMPLETO | PAREJA
 *
 * FIX v3:
 *  - Usa cutCanvas para derivar la silueta real (flood-fill desde esquinas)
 *    en lugar de la elipse hardcodeada o silhouetteCanvas (que falla con fondos claros)
 *  - GRABADO incluye el borde de corte como línea superpuesta
 *  - COMPLETO muestra grabado sobre la pieza con forma correcta
 */
export class PreviewEngine {
  render(targetCanvas, project, view = 'PIEZA', laserView = null, canvases = {}) {
    const ctx = targetCanvas.getContext('2d');
    const W = targetCanvas.width;
    const H = targetCanvas.height;
    ctx.clearRect(0, 0, W, H);

    if (laserView) {
      this._renderLaser(ctx, W, H, laserView, canvases, project);
      return;
    }

    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, W, H);

    const count = view === 'PAREJA' ? 2 : 1;
    const pieceW = view === 'PAREJA' ? W * 0.38 : W * 0.7;
    const pieceH = pieceW * (project.heightMm || 40) / (project.widthMm || 30);
    const startX = view === 'PAREJA' ? W * 0.1 : (W - pieceW) / 2;
    const offsetX = view === 'PAREJA' ? W * 0.52 : 0;
    const pieceY = view === 'PENDIENTE' ? H * 0.15 : (H - pieceH) / 2;

    for (let i = 0; i < count; i++) {
      const x = startX + (i === 0 ? 0 : offsetX);
      this._drawPiece(ctx, x, pieceY, pieceW, pieceH, project, canvases);
      if (view === 'PENDIENTE' || view === 'PAREJA') {
        this._drawHardware(ctx, x, pieceY, pieceW, pieceH, project);
      }
    }

    if (project.widthMm && project.heightMm) {
      ctx.save();
      ctx.font = '600 11px system-ui';
      ctx.fillStyle = 'rgba(201,169,110,0.7)';
      ctx.textAlign = 'center';
      ctx.fillText(`${project.widthMm} × ${project.heightMm} mm`, W/2, H - 10);
      ctx.restore();
    }
  }

  /**
   * Deriva una máscara rellena (negro=objeto transparente, blanco=fondo alpha=0)
   * desde el cutCanvas (que tiene el contorno negro sobre fondo blanco).
   * Hace flood-fill desde las esquinas para rellenar el interior.
   */
  _silhouetteMaskFromCut(cutCanvas, W, H) {
    // Dibujar cutCanvas en canvas temporal a tamaño destino
    const tmp = document.createElement('canvas');
    tmp.width = W; tmp.height = H;
    const tCtx = tmp.getContext('2d');
    tCtx.fillStyle = '#fff';
    tCtx.fillRect(0, 0, W, H);
    if (cutCanvas) tCtx.drawImage(cutCanvas, 0, 0, W, H);

    const imgData = tCtx.getImageData(0, 0, W, H);
    const d = imgData.data;

    // Umbralizar: negro (borde/objeto) → 0, blanco (fondo) → 1
    const isWhite = new Uint8Array(W * H);
    for (let i = 0; i < W * H; i++) {
      const luma = d[i*4]*0.299 + d[i*4+1]*0.587 + d[i*4+2]*0.114;
      isWhite[i] = luma > 180 ? 1 : 0;
    }

    // Flood-fill desde las 4 esquinas: marca como "fondo exterior"
    const isBg = new Uint8Array(W * H);
    const stack = [];
    const corners = [0, W-1, (H-1)*W, (H-1)*W + W-1];
    corners.forEach(p => { if (isWhite[p] && !isBg[p]) { isBg[p] = 1; stack.push(p); } });
    while (stack.length) {
      const p = stack.pop();
      const x = p % W, y = (p / W) | 0;
      const neighbors = [];
      if (x > 0) neighbors.push(p-1);
      if (x < W-1) neighbors.push(p+1);
      if (y > 0) neighbors.push(p-W);
      if (y < H-1) neighbors.push(p+W);
      for (const n of neighbors) {
        if (isWhite[n] && !isBg[n]) { isBg[n] = 1; stack.push(n); }
      }
    }

    // Construir máscara: objeto (no-bg) → opaco; fondo → transparente
    const out = tCtx.createImageData(W, H);
    const o = out.data;
    for (let i = 0; i < W * H; i++) {
      if (!isBg[i]) {
        // objeto: negro opaco
        o[i*4] = 0; o[i*4+1] = 0; o[i*4+2] = 0; o[i*4+3] = 255;
      } else {
        // fondo: transparente
        o[i*4+3] = 0;
      }
    }
    tCtx.putImageData(out, 0, 0);
    return tmp;
  }

  _drawPiece(ctx, x, y, w, h, project, canvases) {
    const W = Math.round(w), H = Math.round(h);
    const hasCut = !!(canvases.cutCanvas);

    // Construir offscreen con todo lo de la pieza
    const off = document.createElement('canvas');
    off.width = W; off.height = H;
    const oCtx = off.getContext('2d');

    // 1. Material (fondo de la pieza)
    if (canvases.materialCanvas) {
      oCtx.drawImage(canvases.materialCanvas, 0, 0, W, H);
    } else {
      oCtx.fillStyle = project.material?.color || '#c2845a';
      oCtx.fillRect(0, 0, W, H);
    }

    // 2. Grabado superpuesto en multiply
    if (canvases.engravingCanvas) {
      const alpha = project.engravingLevel === 'SUAVE' ? 0.55
                  : project.engravingLevel === 'FUERTE' ? 0.95 : 0.80;
      oCtx.save();
      oCtx.globalAlpha = alpha;
      oCtx.globalCompositeOperation = 'multiply';
      oCtx.drawImage(canvases.engravingCanvas, 0, 0, W, H);
      oCtx.restore();
    }

    // 3. Recortar a silueta real
    if (hasCut) {
      const mask = this._silhouetteMaskFromCut(canvases.cutCanvas, W, H);
      oCtx.globalCompositeOperation = 'destination-in';
      oCtx.drawImage(mask, 0, 0);
    } else {
      // Fallback: elipse
      const ell = document.createElement('canvas');
      ell.width = W; ell.height = H;
      const eCtx = ell.getContext('2d');
      eCtx.beginPath();
      eCtx.ellipse(W/2, H/2, W/2, H/2, 0, 0, Math.PI*2);
      eCtx.fill();
      oCtx.globalCompositeOperation = 'destination-in';
      oCtx.drawImage(ell, 0, 0);
    }

    // 4. Dibujar en canvas principal con sombra
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = 20;
    ctx.shadowOffsetY = 8;
    ctx.drawImage(off, x, y);
    ctx.restore();

    // 5. Agujero superior
    if (project.holes?.length > 0) {
      const hole = project.holes[0];
      const diam = ((hole.diametrMm || 2) / (project.widthMm || 30)) * w;
      ctx.save();
      ctx.beginPath();
      ctx.arc(x + w/2, y + diam * 1.5, diam/2, 0, Math.PI*2);
      ctx.fillStyle = '#1a1a2e';
      ctx.fill();
      ctx.restore();
    }
  }

  _drawHardware(ctx, x, y, w, h, project) {
    const hw = project.hardware?.[0];
    if (!hw) return;
    const finishColors = {
      ACERO: '#b0bec5', PLATA: '#e0e0e0', DORADO: '#c9a96e',
      ORO_ROSA: '#e8b4b8', NEGRO: '#333', OTRO: '#888'
    };
    const color = finishColors[hw.acabado || 'DORADO'] || '#c9a96e';
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    const holeY = y + w * 0.06;
    const barLen = w * 0.35;
    ctx.beginPath();
    ctx.moveTo(x + w/2 - barLen/2, holeY - 8);
    ctx.lineTo(x + w/2 + barLen/2, holeY - 8);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x + w/2, holeY - 22, 10, Math.PI * 0.1, Math.PI * 0.9, true);
    ctx.stroke();
    ctx.restore();
  }

  _renderLaser(ctx, W, H, mode, canvases, project) {
    ctx.fillStyle = mode === 'COMPLETO' ? '#0a0a14' : '#ffffff';
    ctx.fillRect(0, 0, W, H);

    const pw = Math.round(W * 0.8);
    const ph = Math.round(pw * (project.heightMm || 40) / (project.widthMm || 30));
    const px = Math.round((W - pw) / 2);
    const py = Math.round((H - ph) / 2);

    const hasCut = !!(canvases.cutCanvas);

    // Construir contenido de la pieza en offscreen
    const off = document.createElement('canvas');
    off.width = pw; off.height = ph;
    const oCtx = off.getContext('2d');

    if (mode === 'CORTE' || mode === 'COMPLETO') {
      // Fondo blanco
      oCtx.fillStyle = '#fff';
      oCtx.fillRect(0, 0, pw, ph);
    }

    if ((mode === 'GRABADO' || mode === 'COMPLETO') && canvases.engravingCanvas) {
      oCtx.fillStyle = '#fff';
      oCtx.fillRect(0, 0, pw, ph);
      const alpha = mode === 'COMPLETO' ? 0.85 : 1;
      oCtx.globalAlpha = alpha;
      oCtx.drawImage(canvases.engravingCanvas, 0, 0, pw, ph);
      oCtx.globalAlpha = 1;
    }

    // En GRABADO: añadir el borde de corte como línea negra fina (se grabará también)
    if (mode === 'GRABADO' && hasCut) {
      // Redibujar el contorno del cutCanvas encima del grabado
      oCtx.save();
      oCtx.globalAlpha = 0.6;
      oCtx.drawImage(canvases.cutCanvas, 0, 0, pw, ph);
      oCtx.restore();
    }

    // Recortar a silueta real
    if (hasCut) {
      const mask = this._silhouetteMaskFromCut(canvases.cutCanvas, pw, ph);
      oCtx.globalCompositeOperation = 'destination-in';
      oCtx.drawImage(mask, 0, 0);
    }

    // Pintar en canvas principal
    ctx.drawImage(off, px, py);

    // Contorno de corte (línea roja visible encima)
    if (mode === 'CORTE' || mode === 'COMPLETO') {
      ctx.save();
      ctx.strokeStyle = mode === 'COMPLETO' ? '#ff3333' : '#cc0000';
      ctx.lineWidth = mode === 'COMPLETO' ? 1.5 : 2;
      ctx.setLineDash([5, 3]);

      if (hasCut) {
        // Recolorear el contorno del cutCanvas a rojo
        const tmp = document.createElement('canvas');
        tmp.width = pw; tmp.height = ph;
        const tCtx = tmp.getContext('2d');
        tCtx.drawImage(canvases.cutCanvas, 0, 0, pw, ph);
        const imgD = tCtx.getImageData(0, 0, pw, ph);
        const d = imgD.data;
        for (let i = 0; i < d.length; i += 4) {
          const luma = d[i]*0.299 + d[i+1]*0.587 + d[i+2]*0.114;
          if (luma < 120) {
            d[i] = 200; d[i+1] = 0; d[i+2] = 0; d[i+3] = 255;
          } else {
            d[i+3] = 0; // transparente
          }
        }
        tCtx.putImageData(imgD, 0, 0);
        ctx.drawImage(tmp, px, py);
      } else {
        ctx.beginPath();
        ctx.ellipse(px + pw/2, py + ph/2, pw/2, ph/2, 0, 0, Math.PI*2);
        ctx.stroke();
      }
      ctx.restore();
    }

    // Agujero
    if (project.holes?.length > 0 && (mode === 'CORTE' || mode === 'COMPLETO')) {
      const hole = project.holes[0];
      const diam = ((hole.diametrMm || 2) / (project.widthMm || 30)) * pw;
      ctx.save();
      ctx.strokeStyle = '#cc0000';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([3, 2]);
      ctx.beginPath();
      ctx.arc(px + pw/2, py + diam * 1.5, diam/2, 0, Math.PI*2);
      ctx.stroke();
      ctx.restore();
    }

    // Labels
    ctx.save();
    ctx.setLineDash([]);
    ctx.font = '700 10px system-ui';
    ctx.textAlign = 'center';
    if (mode === 'CORTE') {
      ctx.fillStyle = '#cc0000'; ctx.fillText('▷ CORTE', W/2, H - 8);
    } else if (mode === 'GRABADO') {
      ctx.fillStyle = '#333'; ctx.fillText('░ GRABADO', W/2, H - 8);
    } else {
      ctx.fillStyle = '#888'; ctx.fillText('◈ CORTE + GRABADO', W/2, H - 8);
    }
    if (project.widthMm && project.heightMm) {
      ctx.fillStyle = '#666';
      ctx.fillText(`${project.widthMm} × ${project.heightMm} mm`, W/2, H - 22);
    }
    ctx.restore();
  }
}
