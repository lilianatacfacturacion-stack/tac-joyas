/**
 * PreviewEngine
 * Renderiza el preview 2D/2.5D en el canvas de resultado.
 * Vistas: PIEZA SOLA | PENDIENTE COMPLETO | PAREJA
 */
export class PreviewEngine {
  /**
   * @param {HTMLCanvasElement} targetCanvas
   * @param {object} project - datos del proyecto
   * @param {string} view - 'PIEZA' | 'PENDIENTE' | 'PAREJA'
   * @param {string} laserView - null | 'CORTE' | 'GRABADO' | 'COMPLETO'
   * @param {object} canvases - { materialCanvas, engravingCanvas, cutCanvas }
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

  _drawPiece(ctx, x, y, w, h, project, canvases) {
    ctx.save();

    // Sombra
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = 20;
    ctx.shadowOffsetY = 8;

    if (canvases.materialCanvas) {
      // Clip a elipse
      ctx.beginPath();
      ctx.ellipse(x + w/2, y + h/2, w/2, h/2, 0, 0, Math.PI*2);
      ctx.clip();
      ctx.drawImage(canvases.materialCanvas, x, y, w, h);
    } else {
      // Fallback color sólido
      ctx.beginPath();
      ctx.ellipse(x + w/2, y + h/2, w/2, h/2, 0, 0, Math.PI*2);
      ctx.fillStyle = project.material?.color || '#c2845a';
      ctx.fill();
    }

    ctx.restore();

    // Grabado superpuesto
    if (canvases.engravingCanvas && project.engravingLevel !== 'SUAVE') {
      const alpha = project.engravingLevel === 'FUERTE' ? 0.7 : 0.45;
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(x + w/2, y + h/2, w/2, h/2, 0, 0, Math.PI*2);
      ctx.clip();
      ctx.globalAlpha = alpha;
      ctx.globalCompositeOperation = 'multiply';
      ctx.drawImage(canvases.engravingCanvas, x, y, w, h);
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

    const holeY = y + w * 0.06; // donde está el agujero
    const barLen = w * 0.35;

    // Barra simple
    ctx.beginPath();
    ctx.moveTo(x + w/2 - barLen/2, holeY - 8);
    ctx.lineTo(x + w/2 + barLen/2, holeY - 8);
    ctx.stroke();

    // Gancho arriba
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

    ctx.save();
    ctx.beginPath();
    ctx.ellipse(px + pw/2, py + ph/2, pw/2, ph/2, 0, 0, Math.PI*2);
    ctx.clip();

    if (mode === 'CORTE' || mode === 'COMPLETO') {
      if (canvases.cutCanvas) {
        ctx.drawImage(canvases.cutCanvas, px, py, pw, ph);
      } else {
        ctx.strokeStyle = '#e00';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }

    if (mode === 'GRABADO' || mode === 'COMPLETO') {
      if (canvases.engravingCanvas) {
        ctx.globalAlpha = mode === 'COMPLETO' ? 0.7 : 1;
        ctx.drawImage(canvases.engravingCanvas, px, py, pw, ph);
      }
    }

    ctx.restore();

    // Contorno corte visible
    if (mode === 'CORTE' || mode === 'COMPLETO') {
      ctx.save();
      ctx.strokeStyle = mode === 'COMPLETO' ? '#ff3333' : '#cc0000';
      ctx.lineWidth = mode === 'COMPLETO' ? 1.5 : 2;
      ctx.setLineDash([5, 3]);
      ctx.beginPath();
      ctx.ellipse(px + pw/2, py + ph/2, pw/2, ph/2, 0, 0, Math.PI*2);
      ctx.stroke();
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
