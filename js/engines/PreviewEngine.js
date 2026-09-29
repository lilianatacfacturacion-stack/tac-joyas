/**
 * PreviewEngine
 * Renderiza el preview 2D/2.5D en el canvas de resultado.
 * Vistas: PIEZA SOLA | PENDIENTE COMPLETO | PAREJA
 *
 * FIX: usa silueta real de la foto (via materialCanvas / cutCanvas)
 * en lugar de siempre clipar a elipse.
 */
export class PreviewEngine {
  /**
   * @param {HTMLCanvasElement} targetCanvas
   * @param {object} project
   * @param {string} view - 'PIEZA' | 'PENDIENTE' | 'PAREJA'
   * @param {string} laserView - null | 'CORTE' | 'GRABADO' | 'COMPLETO'
   * @param {object} canvases - { materialCanvas, engravingCanvas, cutCanvas, silhouetteCanvas }
   *   silhouetteCanvas: canvas BN donde negro=objeto (generado por MaterialEngine)
   */
  render(targetCanvas, project, view = 'PIEZA', laserView = null, canvases = {}) {
    const ctx = targetCanvas.getContext('2d');
    const W = targetCanvas.width;
    const H = targetCanvas.height;

    ctx.clearRect(0, 0, W, H);

    if (laserView) {
      this._renderLaser(ctx, W, H, laserView, canvases, project);
      return;
    }

    // Vista preview
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

    // Dimensiones
    if (project.widthMm && project.heightMm) {
      ctx.save();
      ctx.font = '600 11px system-ui';
      ctx.fillStyle = 'rgba(201,169,110,0.7)';
      ctx.textAlign = 'center';
      ctx.fillText(`${project.widthMm} × ${project.heightMm} mm`, W/2, H - 10);
      ctx.restore();
    }
  }

  // ── Genera un canvas alpha-mask a partir de silhouetteCanvas (negro=objeto) ─
  _makeSilhouetteMask(silCanvas, W, H) {
    const tmp = document.createElement('canvas');
    tmp.width = W; tmp.height = H;
    const tCtx = tmp.getContext('2d');
    tCtx.drawImage(silCanvas, 0, 0, W, H);
    const imgData = tCtx.getImageData(0, 0, W, H);
    const d = imgData.data;
    for (let i = 0; i < d.length; i += 4) {
      const luma = d[i]*0.299 + d[i+1]*0.587 + d[i+2]*0.114;
      // negro=objeto → alpha 255; blanco=fondo → alpha 0
      d[i+3] = luma < 128 ? 255 : 0;
      d[i] = d[i+1] = d[i+2] = 0;
    }
    tCtx.putImageData(imgData, 0, 0);
    return tmp;
  }

  _drawPiece(ctx, x, y, w, h, project, canvases) {
    ctx.save();

    // Sombra
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = 20;
    ctx.shadowOffsetY = 8;

    const hasSilhouette = !!(canvases.silhouetteCanvas);

    if (canvases.materialCanvas) {
      if (hasSilhouette) {
        // Clip por silueta real
        const mask = this._makeSilhouetteMask(canvases.silhouetteCanvas, Math.round(w), Math.round(h));
        // Dibujar material en offscreen, recortar con mask
        const off = document.createElement('canvas');
        off.width = Math.round(w); off.height = Math.round(h);
        const oCtx = off.getContext('2d');
        oCtx.drawImage(canvases.materialCanvas, 0, 0, Math.round(w), Math.round(h));
        oCtx.globalCompositeOperation = 'destination-in';
        oCtx.drawImage(mask, 0, 0);
        ctx.shadowColor = 'rgba(0,0,0,0.6)';
        ctx.shadowBlur = 20;
        ctx.shadowOffsetY = 8;
        ctx.drawImage(off, x, y);
      } else {
        // Fallback: elipse
        ctx.beginPath();
        ctx.ellipse(x + w/2, y + h/2, w/2, h/2, 0, 0, Math.PI*2);
        ctx.clip();
        ctx.drawImage(canvases.materialCanvas, x, y, w, h);
      }
    } else {
      // Sin material: relleno sólido
      ctx.beginPath();
      ctx.ellipse(x + w/2, y + h/2, w/2, h/2, 0, 0, Math.PI*2);
      ctx.fillStyle = project.material?.color || '#c2845a';
      ctx.fill();
    }

    ctx.restore();

    // Grabado superpuesto (recortado a silueta también)
    if (canvases.engravingCanvas) {
      const alpha = project.engravingLevel === 'SUAVE' ? 0.55
                  : project.engravingLevel === 'FUERTE' ? 0.9
                  : 0.75;
      const off = document.createElement('canvas');
      off.width = Math.round(w); off.height = Math.round(h);
      const oCtx = off.getContext('2d');
      oCtx.globalAlpha = alpha;
      oCtx.drawImage(canvases.engravingCanvas, 0, 0, Math.round(w), Math.round(h));
      oCtx.globalAlpha = 1;
      if (hasSilhouette) {
        const mask = this._makeSilhouetteMask(canvases.silhouetteCanvas, Math.round(w), Math.round(h));
        oCtx.globalCompositeOperation = 'destination-in';
        oCtx.drawImage(mask, 0, 0);
      } else {
        oCtx.globalCompositeOperation = 'destination-in';
        const ell = document.createElement('canvas');
        ell.width = Math.round(w); ell.height = Math.round(h);
        const eCtx = ell.getContext('2d');
        eCtx.beginPath();
        eCtx.ellipse(w/2, h/2, w/2, h/2, 0, 0, Math.PI*2);
        eCtx.fill();
        oCtx.drawImage(ell, 0, 0);
      }
      ctx.save();
      ctx.globalCompositeOperation = 'multiply';
      ctx.drawImage(off, x, y);
      ctx.restore();
    }

    // Agujero superior
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

    // Barra simple
    ctx.beginPath();
    ctx.moveTo(x + w/2 - barLen/2, holeY - 8);
    ctx.lineTo(x + w/2 + barLen/2, holeY - 8);
    ctx.stroke();

    // Gancho
    ctx.beginPath();
    ctx.arc(x + w/2, holeY - 22, 10, Math.PI * 0.1, Math.PI * 0.9, true);
    ctx.stroke();

    ctx.restore();
  }

  _renderLaser(ctx, W, H, mode, canvases, project) {
    ctx.fillStyle = mode === 'COMPLETO' ? '#0a0a14' : '#ffffff';
    ctx.fillRect(0, 0, W, H);

    const pw = W * 0.8;
    const ph = pw * (project.heightMm || 40) / (project.widthMm || 30);
    const px = (W - pw) / 2;
    const py = (H - ph) / 2;

    const hasSilhouette = !!(canvases.silhouetteCanvas);

    ctx.save();

    if (hasSilhouette) {
      // Clip por silueta real: dibujar en offscreen recortado
      const mask = this._makeSilhouetteMask(canvases.silhouetteCanvas, Math.round(pw), Math.round(ph));
      const off = document.createElement('canvas');
      off.width = Math.round(pw); off.height = Math.round(ph);
      const oCtx = off.getContext('2d');

      if (mode === 'CORTE' || mode === 'COMPLETO') {
        if (canvases.cutCanvas) {
          oCtx.drawImage(canvases.cutCanvas, 0, 0, Math.round(pw), Math.round(ph));
        }
      }
      if (mode === 'GRABADO' || mode === 'COMPLETO') {
        if (canvases.engravingCanvas) {
          if (mode === 'COMPLETO') oCtx.globalAlpha = 0.7;
          oCtx.drawImage(canvases.engravingCanvas, 0, 0, Math.round(pw), Math.round(ph));
          oCtx.globalAlpha = 1;
        }
      }

      oCtx.globalCompositeOperation = 'destination-in';
      oCtx.drawImage(mask, 0, 0);

      ctx.drawImage(off, px, py);
    } else {
      // Fallback elipse
      ctx.beginPath();
      ctx.ellipse(px + pw/2, py + ph/2, pw/2, ph/2, 0, 0, Math.PI*2);
      ctx.clip();

      if (mode === 'CORTE' || mode === 'COMPLETO') {
        if (canvases.cutCanvas) ctx.drawImage(canvases.cutCanvas, px, py, pw, ph);
        else { ctx.strokeStyle = '#e00'; ctx.lineWidth = 2; ctx.stroke(); }
      }
      if (mode === 'GRABADO' || mode === 'COMPLETO') {
        if (canvases.engravingCanvas) {
          ctx.globalAlpha = mode === 'COMPLETO' ? 0.7 : 1;
          ctx.drawImage(canvases.engravingCanvas, px, py, pw, ph);
        }
      }
    }

    ctx.restore();

    // Contorno de corte (línea roja sobre el resultado)
    if (mode === 'CORTE' || mode === 'COMPLETO') {
      ctx.save();
      ctx.strokeStyle = mode === 'COMPLETO' ? '#ff3333' : '#cc0000';
      ctx.lineWidth = mode === 'COMPLETO' ? 1.5 : 2;
      ctx.setLineDash([5, 3]);
      if (hasSilhouette) {
        // Dibujar contorno real (cutCanvas ya tiene el borde en negro)
        // Usamos el cutCanvas directamente como overlay para el contorno
        const tmp = document.createElement('canvas');
        tmp.width = Math.round(pw); tmp.height = Math.round(ph);
        const tCtx = tmp.getContext('2d');
        if (canvases.cutCanvas) tCtx.drawImage(canvases.cutCanvas, 0, 0, Math.round(pw), Math.round(ph));
        // Recolorear negro a rojo
        const imgD = tCtx.getImageData(0, 0, Math.round(pw), Math.round(ph));
        const d = imgD.data;
        for (let i = 0; i < d.length; i += 4) {
          if (d[i] < 80 && d[i+3] > 200) {
            d[i] = 220; d[i+1] = 0; d[i+2] = 0; d[i+3] = 255;
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
    ctx.font = '700 10px system-ui';
    ctx.textAlign = 'center';
    ctx.setLineDash([]);
    if (mode === 'CORTE') {
      ctx.fillStyle = '#cc0000';
      ctx.fillText('▷ CORTE', W/2, H - 8);
    } else if (mode === 'GRABADO') {
      ctx.fillStyle = '#333';
      ctx.fillText('░ GRABADO', W/2, H - 8);
    } else {
      ctx.fillStyle = '#888';
      ctx.fillText('◈ CORTE + GRABADO', W/2, H - 8);
    }
    if (project.widthMm && project.heightMm) {
      ctx.fillStyle = '#666';
      ctx.fillText(`${project.widthMm} × ${project.heightMm} mm`, W/2, H - 22);
    }
    ctx.restore();
  }
}
