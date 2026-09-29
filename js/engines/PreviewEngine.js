/**
 * PreviewEngine v4
 * Preview realista: cuero con textura grabada + herraje dorado
 * Se parece a una foto real del pendiente terminado.
 *
 * PIEZA / PENDIENTE / PAREJA → vista fotorrealista con color de cuero + grabado oscuro
 * CORTE / GRABADO / COMPLETO → vista técnica para láser
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

    // Fondo claro estilo fotografía de producto
    ctx.fillStyle = '#f5f0ea';
    ctx.fillRect(0, 0, W, H);
    // Sombra suave de fondo
    const bgGrad = ctx.createRadialGradient(W/2, H*0.6, 0, W/2, H/2, Math.max(W,H)*0.7);
    bgGrad.addColorStop(0, 'rgba(255,255,255,0.6)');
    bgGrad.addColorStop(1, 'rgba(220,210,200,0.4)');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, W, H);

    const count = view === 'PAREJA' ? 2 : 1;
    const pieceW = view === 'PAREJA' ? W * 0.32 : W * 0.55;
    const ratio = (project.heightMm || 40) / (project.widthMm || 30);
    const pieceH = pieceW * ratio;
    const startX = view === 'PAREJA' ? W * 0.12 : (W - pieceW) / 2;
    const gapX = view === 'PAREJA' ? W * 0.54 : 0;
    const pieceY = view === 'PENDIENTE' || view === 'PAREJA'
      ? H * 0.42   // deja espacio para herraje arriba
      : (H - pieceH) / 2;

    for (let i = 0; i < count; i++) {
      const x = startX + (i === 0 ? 0 : gapX);
      if (view === 'PENDIENTE' || view === 'PAREJA') {
        this._drawHardware(ctx, x, pieceY, pieceW, project);
      }
      this._drawPiece(ctx, x, pieceY, pieceW, pieceH, project, canvases);
    }

    if (project.widthMm && project.heightMm) {
      ctx.save();
      ctx.font = '500 10px system-ui';
      ctx.fillStyle = 'rgba(100,80,60,0.5)';
      ctx.textAlign = 'center';
      ctx.fillText(`${project.widthMm} × ${project.heightMm} mm`, W/2, H - 8);
      ctx.restore();
    }
  }

  /**
   * Deriva máscara rellena desde cutCanvas (flood-fill desde esquinas = exterior)
   * Devuelve canvas con: objeto=opaco, fondo=transparente
   */
  _silhouetteMaskFromCut(cutCanvas, W, H) {
    const tmp = document.createElement('canvas');
    tmp.width = W; tmp.height = H;
    const tCtx = tmp.getContext('2d');
    tCtx.fillStyle = '#fff';
    tCtx.fillRect(0, 0, W, H);
    if (cutCanvas) tCtx.drawImage(cutCanvas, 0, 0, W, H);

    const imgData = tCtx.getImageData(0, 0, W, H);
    const d = imgData.data;

    // Umbralizar
    const isWhite = new Uint8Array(W * H);
    for (let i = 0; i < W * H; i++) {
      const luma = d[i*4]*0.299 + d[i*4+1]*0.587 + d[i*4+2]*0.114;
      isWhite[i] = luma > 150 ? 1 : 0;
    }

    // Flood-fill desde esquinas → fondo exterior
    const isBg = new Uint8Array(W * H);
    const stack = [];
    // Añadir todos los píxeles del borde
    for (let x = 0; x < W; x++) {
      if (isWhite[x] && !isBg[x]) { isBg[x]=1; stack.push(x); }
      const b = (H-1)*W+x;
      if (isWhite[b] && !isBg[b]) { isBg[b]=1; stack.push(b); }
    }
    for (let y = 1; y < H-1; y++) {
      if (isWhite[y*W] && !isBg[y*W]) { isBg[y*W]=1; stack.push(y*W); }
      const r = y*W+W-1;
      if (isWhite[r] && !isBg[r]) { isBg[r]=1; stack.push(r); }
    }
    while (stack.length) {
      const p = stack.pop();
      const x = p % W, y = (p / W) | 0;
      const nb = [];
      if (x > 0) nb.push(p-1);
      if (x < W-1) nb.push(p+1);
      if (y > 0) nb.push(p-W);
      if (y < H-1) nb.push(p+W);
      for (const n of nb) {
        if (isWhite[n] && !isBg[n]) { isBg[n]=1; stack.push(n); }
      }
    }

    // Construir máscara
    const out = tCtx.createImageData(W, H);
    const o = out.data;
    for (let i = 0; i < W * H; i++) {
      if (!isBg[i]) {
        o[i*4] = 0; o[i*4+1] = 0; o[i*4+2] = 0; o[i*4+3] = 255;
      } else {
        o[i*4+3] = 0;
      }
    }
    tCtx.putImageData(out, 0, 0);
    return tmp;
  }

  /**
   * Dibuja la pieza de cuero con aspecto fotorrealista:
   * color base + efecto cuero (luz/sombra) + grabado oscuro en surcos + contorno suave
   */
  _drawPiece(ctx, x, y, w, h, project, canvases) {
    const W = Math.round(w), H = Math.round(h);
    const hasCut = !!(canvases.cutCanvas);
    const baseColor = project.material?.color || '#A0522D';

    // Offscreen donde construimos la pieza
    const off = document.createElement('canvas');
    off.width = W; off.height = H;
    const oCtx = off.getContext('2d');

    // 1. COLOR BASE del cuero
    oCtx.fillStyle = baseColor;
    oCtx.fillRect(0, 0, W, H);

    // 2. EFECTO CUERO: gradiente de luz suave (partes elevadas más claras)
    const leatherGrad = oCtx.createRadialGradient(W*0.35, H*0.3, 0, W*0.5, H*0.5, Math.max(W,H)*0.7);
    leatherGrad.addColorStop(0, 'rgba(255,255,240,0.22)');
    leatherGrad.addColorStop(0.5, 'rgba(255,220,180,0.06)');
    leatherGrad.addColorStop(1, 'rgba(0,0,0,0.18)');
    oCtx.fillStyle = leatherGrad;
    oCtx.fillRect(0, 0, W, H);

    // 3. TEXTURA CUERO: noise sutil
    this._addLeatherTexture(oCtx, W, H, baseColor);

    // 4. GRABADO: las líneas del grabado (engravingCanvas) oscurecen la superficie
    //    Esto simula los surcos tallados con el láser
    if (canvases.engravingCanvas) {
      oCtx.save();
      oCtx.globalCompositeOperation = 'multiply';
      oCtx.globalAlpha = 0.75;
      oCtx.drawImage(canvases.engravingCanvas, 0, 0, W, H);
      oCtx.restore();
    }

    // 5. Oscurecer bordes (profundidad)
    const edgeGrad = oCtx.createRadialGradient(W*0.5, H*0.45, Math.min(W,H)*0.25, W*0.5, H*0.5, Math.max(W,H)*0.6);
    edgeGrad.addColorStop(0.6, 'rgba(0,0,0,0)');
    edgeGrad.addColorStop(1, 'rgba(0,0,0,0.35)');
    oCtx.fillStyle = edgeGrad;
    oCtx.fillRect(0, 0, W, H);

    // 6. RECORTAR A SILUETA REAL (desde cutCanvas via flood-fill)
    if (hasCut) {
      const mask = this._silhouetteMaskFromCut(canvases.cutCanvas, W, H);
      oCtx.globalCompositeOperation = 'destination-in';
      oCtx.drawImage(mask, 0, 0);
      oCtx.globalCompositeOperation = 'source-over';
    } else {
      // Fallback elipse
      const ellOff = document.createElement('canvas');
      ellOff.width = W; ellOff.height = H;
      const eCtx = ellOff.getContext('2d');
      eCtx.beginPath();
      eCtx.ellipse(W/2, H/2, W/2*0.92, H/2*0.92, 0, 0, Math.PI*2);
      eCtx.fill();
      oCtx.globalCompositeOperation = 'destination-in';
      oCtx.drawImage(ellOff, 0, 0);
      oCtx.globalCompositeOperation = 'source-over';
    }

    // 7. Sombra suave debajo de la pieza en canvas principal
    ctx.save();
    ctx.shadowColor = 'rgba(60,30,10,0.45)';
    ctx.shadowBlur = 18;
    ctx.shadowOffsetX = 3;
    ctx.shadowOffsetY = 8;
    ctx.drawImage(off, x, y);
    ctx.restore();

    // 8. Contorno brillante muy sutil (reborde del cuero)
    ctx.save();
    ctx.globalAlpha = 0.18;
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1;
    // Dibujar silueta de recorte en blanco suave encima para dar sensación de volumen
    if (hasCut) {
      const contourTmp = document.createElement('canvas');
      contourTmp.width = W; contourTmp.height = H;
      const cCtx = contourTmp.getContext('2d');
      cCtx.drawImage(canvases.cutCanvas, 0, 0, W, H);
      const cd = cCtx.getImageData(0, 0, W, H);
      const co = cd.data;
      for (let i = 0; i < co.length; i += 4) {
        const luma = co[i]*0.299 + co[i+1]*0.587 + co[i+2]*0.114;
        if (luma < 120) { co[i]=255; co[i+1]=255; co[i+2]=255; co[i+3]=60; }
        else co[i+3] = 0;
      }
      cCtx.putImageData(cd, 0, 0);
      ctx.drawImage(contourTmp, x, y);
    }
    ctx.restore();
  }

  /**
   * Añade textura sutil de cuero (microestructura)
   */
  _addLeatherTexture(ctx, W, H, baseColor) {
    // Grano de cuero: noise pequeño en alpha bajo
    const tmp = document.createElement('canvas');
    const scale = 3;
    tmp.width = Math.ceil(W/scale);
    tmp.height = Math.ceil(H/scale);
    const tCtx = tmp.getContext('2d');
    const d = tCtx.createImageData(tmp.width, tmp.height);
    for (let i = 0; i < d.data.length; i += 4) {
      const v = (Math.random() * 80 - 40) | 0;
      d.data[i] = 128 + v; d.data[i+1] = 128 + v; d.data[i+2] = 128 + v;
      d.data[i+3] = 255;
    }
    tCtx.putImageData(d, 0, 0);
    ctx.save();
    ctx.globalCompositeOperation = 'soft-light';
    ctx.globalAlpha = 0.12;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(tmp, 0, 0, W, H);
    ctx.restore();
  }

  /**
   * Dibuja el herraje (barra dorada + bolita) por encima de la pieza
   */
  _drawHardware(ctx, pieceX, pieceY, pieceW, project) {
    const hw = project.hardware?.[0];
    const finishColors = {
      ACERO: '#b0bec5', PLATA: '#d0d0d0', DORADO: '#C8A84B',
      ORO_ROSA: '#c4889a', NEGRO: '#2a2a2a', OTRO: '#999'
    };
    const color = finishColors[hw?.acabado || 'DORADO'] || '#C8A84B';
    const highlight = hw?.acabado === 'PLATA' ? '#f0f0f0' : '#f5d980';

    const cx = pieceX + pieceW / 2;
    const barBottom = pieceY - 2;
    const barTop = pieceY - pieceW * 0.75;
    const barW = pieceW * 0.055;

    // Barra (tubo dorado)
    const barGrad = ctx.createLinearGradient(cx - barW, 0, cx + barW, 0);
    barGrad.addColorStop(0, 'rgba(0,0,0,0.3)');
    barGrad.addColorStop(0.3, color);
    barGrad.addColorStop(0.5, highlight);
    barGrad.addColorStop(0.7, color);
    barGrad.addColorStop(1, 'rgba(0,0,0,0.25)');

    ctx.save();
    ctx.fillStyle = barGrad;
    ctx.beginPath();
    ctx.roundRect(cx - barW/2, barTop, barW, barBottom - barTop, barW/2);
    ctx.fill();

    // Sombra de la barra
    ctx.shadowColor = 'rgba(0,0,0,0.3)';
    ctx.shadowBlur = 4;
    ctx.shadowOffsetX = 1;
    ctx.shadowOffsetY = 2;
    ctx.fillStyle = barGrad;
    ctx.fill();
    ctx.restore();

    // Anillo de unión (pequeño círculo en la parte de abajo de la barra)
    const ringY = barBottom;
    const ringR = barW * 0.8;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.shadowColor = 'rgba(0,0,0,0.3)';
    ctx.shadowBlur = 3;
    ctx.beginPath();
    ctx.arc(cx, ringY, ringR, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    // Bolita (tuerca superior)
    const ballR = barW * 1.7;
    const ballY = barTop - ballR * 0.6;
    const ballGrad = ctx.createRadialGradient(cx - ballR*0.3, ballY - ballR*0.3, ballR*0.1, cx, ballY, ballR);
    ballGrad.addColorStop(0, highlight);
    ballGrad.addColorStop(0.4, color);
    ballGrad.addColorStop(1, '#6b4f10');

    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.4)';
    ctx.shadowBlur = 6;
    ctx.shadowOffsetY = 2;
    ctx.beginPath();
    ctx.arc(cx, ballY, ballR, 0, Math.PI * 2);
    ctx.fillStyle = ballGrad;
    ctx.fill();
    ctx.restore();

    // Pin de la tuerca (pequeño cilindro que sale por atrás)
    ctx.save();
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.6;
    ctx.beginPath();
    ctx.roundRect(cx - barW*0.3, ballY - ballR*1.8, barW*0.6, ballR*1.2, barW*0.3);
    ctx.fill();
    ctx.restore();
  }

  // ─── Vistas láser (técnicas) ─────────────────────────────────────────────

  _renderLaser(ctx, W, H, mode, canvases, project) {
    ctx.fillStyle = mode === 'COMPLETO' ? '#0a0a14' : '#ffffff';
    ctx.fillRect(0, 0, W, H);

    const pw = Math.round(W * 0.82);
    const ratio = (project.heightMm || 40) / (project.widthMm || 30);
    const ph = Math.round(pw * ratio);
    const px = Math.round((W - pw) / 2);
    const py = Math.round((H - ph) / 2);
    const hasCut = !!(canvases.cutCanvas);

    const off = document.createElement('canvas');
    off.width = pw; off.height = ph;
    const oCtx = off.getContext('2d');

    // Fondo blanco para la pieza
    oCtx.fillStyle = '#fff';
    oCtx.fillRect(0, 0, pw, ph);

    if ((mode === 'GRABADO' || mode === 'COMPLETO') && canvases.engravingCanvas) {
      const alpha = mode === 'COMPLETO' ? 0.85 : 1;
      oCtx.globalAlpha = alpha;
      oCtx.drawImage(canvases.engravingCanvas, 0, 0, pw, ph);
      oCtx.globalAlpha = 1;
    }

    // En GRABADO: borde de corte en negro suave para indicar que también se graba
    if (mode === 'GRABADO' && hasCut) {
      oCtx.save();
      oCtx.globalAlpha = 0.45;
      oCtx.drawImage(canvases.cutCanvas, 0, 0, pw, ph);
      oCtx.restore();
    }

    // Recortar a silueta real
    if (hasCut) {
      const mask = this._silhouetteMaskFromCut(canvases.cutCanvas, pw, ph);
      oCtx.globalCompositeOperation = 'destination-in';
      oCtx.drawImage(mask, 0, 0);
    }

    ctx.drawImage(off, px, py);

    // Contorno de corte rojo encima
    if (mode === 'CORTE' || mode === 'COMPLETO') {
      ctx.save();
      ctx.setLineDash([5, 3]);

      if (hasCut) {
        const redTmp = document.createElement('canvas');
        redTmp.width = pw; redTmp.height = ph;
        const rCtx = redTmp.getContext('2d');
        rCtx.drawImage(canvases.cutCanvas, 0, 0, pw, ph);
        const imgD = rCtx.getImageData(0, 0, pw, ph);
        const d = imgD.data;
        for (let i = 0; i < d.length; i += 4) {
          const luma = d[i]*0.299 + d[i+1]*0.587 + d[i+2]*0.114;
          if (luma < 120) { d[i]=200; d[i+1]=0; d[i+2]=0; d[i+3]=255; }
          else d[i+3] = 0;
        }
        rCtx.putImageData(imgD, 0, 0);
        ctx.drawImage(redTmp, px, py);
      } else {
        ctx.strokeStyle = mode === 'COMPLETO' ? '#ff3333' : '#cc0000';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(px+pw/2, py+ph/2, pw/2, ph/2, 0, 0, Math.PI*2);
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
    if (mode === 'CORTE') { ctx.fillStyle='#cc0000'; ctx.fillText('▷ CORTE', W/2, H-8); }
    else if (mode === 'GRABADO') { ctx.fillStyle='#333'; ctx.fillText('░ GRABADO', W/2, H-8); }
    else { ctx.fillStyle='#888'; ctx.fillText('◈ CORTE + GRABADO', W/2, H-8); }
    if (project.widthMm && project.heightMm) {
      ctx.fillStyle='#666';
      ctx.fillText(`${project.widthMm} × ${project.heightMm} mm`, W/2, H-22);
    }
    ctx.restore();
  }
}
