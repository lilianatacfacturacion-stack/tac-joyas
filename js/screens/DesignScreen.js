// js/screens/DesignScreen.js
import { designEngine } from '../engines/DesignEngine.js';
import { loadBlob } from '../utils/storage.js';

export class DesignScreen {
  constructor(container) {
    this._container = container;
    this._sourceImg = null;
    this._silhouetteCanvas = null;
    this._engravingCanvas = null;
    this._cutCanvas = null;
    this._mode = 'GRABADO';
  }

  async show(partData) {
    this._partData = partData;
    this._container.innerHTML = this._template();
    this._bindEvents();
    await this._initCanvas();
  }

  _template() {
    return `
      <div class="design-screen">
        <header class="app-bar">
          <button class="btn-back" id="btnBack">← Atrás</button>
          <h2>Diseño</h2>
          <button class="btn-primary" id="btnExport">Exportar</button>
        </header>
        <div class="mode-tabs">
          <button class="tab active" data-mode="GRABADO">Grabado</button>
          <button class="tab" data-mode="CORTE">Corte</button>
          <button class="tab" data-mode="PREVIEW">Preview</button>
        </div>
        <div class="canvas-wrap">
          <canvas id="workCanvas"></canvas>
        </div>
        <div class="controls">
          <label>Umbral grabado
            <input type="range" id="sliderThreshold" min="10" max="120" value="55">
          </label>
          <label>Suavizado
            <input type="range" id="sliderSmooth" min="0" max="5" value="1">
          </label>
          <button id="btnSimplify">Simplificar</button>
        </div>
      </div>`;
  }

  _bindEvents() {
    this._container.querySelector('#btnBack')
      .addEventListener('click', () => window.app.goBack());

    this._container.querySelector('#btnExport')
      .addEventListener('click', () => this._doExport());

    this._container.querySelectorAll('.tab').forEach(t => {
      t.addEventListener('click', e => {
        this._container.querySelectorAll('.tab')
          .forEach(x => x.classList.remove('active'));
        e.target.classList.add('active');
        this._mode = e.target.dataset.mode;
        this._drawWorkCanvas();
      });
    });

    this._container.querySelector('#sliderThreshold')
      .addEventListener('input', async e => {
        const thr = parseInt(e.target.value);
        this._engravingCanvas = await designEngine.extractEngravingLines(
          this._sourceImg,
          { threshold: thr, silhouetteMask: this._silhouetteCanvas }
        );
        this._drawWorkCanvas();
      });

    this._container.querySelector('#sliderSmooth')
      .addEventListener('input', async e => {
        const passes = parseInt(e.target.value);
        for (let i = 0; i < passes; i++) {
          designEngine.applySmooth(this._engravingCanvas);
        }
        this._drawWorkCanvas();
      });

    this._container.querySelector('#btnSimplify')
      .addEventListener('click', () => {
        designEngine.applySimplify(this._engravingCanvas);
        this._drawWorkCanvas();
      });
  }

  async _initCanvas() {
    const blob = await loadBlob('currentPhoto');
    if (!blob) return;

    const url = URL.createObjectURL(blob);
    const img = new Image();
    await new Promise(res => { img.onload = res; img.src = url; });
    this._sourceImg = img;

    const W = img.naturalWidth;
    const H = img.naturalHeight;

    // Build silhouette mask (alpha-aware)
    this._silhouetteCanvas = this._buildSilhouette(img, W, H);

    // Build cut contour from silhouette
    this._cutCanvas = this._buildCutContour(W, H);

    // Extract engraving lines (alpha-aware Sobel)
    this._engravingCanvas = await designEngine.extractEngravingLines(
      img,
      { threshold: 55, silhouetteMask: this._silhouetteCanvas }
    );

    this._drawWorkCanvas();
    URL.revokeObjectURL(url);
  }

  /**
   * Build a silhouette canvas (white = object, black = background).
   * Strategy:
   *   1. If the source image has meaningful transparency (any pixel with alpha < 245),
   *      use the alpha channel directly: alpha > 10 → object (white), else background (black).
   *   2. Otherwise fall back to corner-sampling colour-distance flood-fill.
   */
  _buildSilhouette(img, W, H) {
    // Draw source to a temp canvas to inspect pixels
    const tmp = document.createElement('canvas');
    tmp.width = W; tmp.height = H;
    const tCtx = tmp.getContext('2d');
    tCtx.drawImage(img, 0, 0);
    const srcData = tCtx.getImageData(0, 0, W, H);
    const src = srcData.data;

    // Check if image has transparency (Option A: PNG without background)
    let hasAlpha = false;
    for (let i = 3; i < src.length; i += 4) {
      if (src[i] < 245) { hasAlpha = true; break; }
    }

    const sil = document.createElement('canvas');
    sil.width = W; sil.height = H;
    const sCtx = sil.getContext('2d');
    const silData = sCtx.createImageData(W, H);
    const s = silData.data;

    if (hasAlpha) {
      // === Option A: use alpha channel ===
      for (let i = 0; i < W * H; i++) {
        const alpha = src[i * 4 + 3];
        const v = alpha > 10 ? 255 : 0;   // white = object, black = bg
        s[i * 4 + 0] = v;
        s[i * 4 + 1] = v;
        s[i * 4 + 2] = v;
        s[i * 4 + 3] = 255;
      }
    } else {
      // === Fallback: corner-sampling + colour-distance + flood-fill ===
      // Sample 3×3 from each corner, average to get bg colour
      const patchSize = 3;
      let rSum = 0, gSum = 0, bSum = 0, count = 0;
      const corners = [[0, 0], [W - patchSize, 0], [0, H - patchSize], [W - patchSize, H - patchSize]];
      for (const [cx, cy] of corners) {
        for (let dy = 0; dy < patchSize; dy++) {
          for (let dx = 0; dx < patchSize; dx++) {
            const idx = ((cy + dy) * W + (cx + dx)) * 4;
            rSum += src[idx]; gSum += src[idx + 1]; bSum += src[idx + 2];
            count++;
          }
        }
      }
      const bgR = rSum / count, bgG = gSum / count, bgB = bSum / count;

      // Build visited & bg mask
      const isBg = new Uint8Array(W * H);
      const threshold = 28;
      for (let i = 0; i < W * H; i++) {
        const dr = src[i * 4] - bgR;
        const dg = src[i * 4 + 1] - bgG;
        const db = src[i * 4 + 2] - bgB;
        if (Math.sqrt(dr * dr + dg * dg + db * db) < threshold) isBg[i] = 1;
      }

      // Flood-fill from corners to mark connected background
      const visited = new Uint8Array(W * H);
      const queue = [];
      for (const [cx, cy] of corners) {
        const idx = cy * W + cx;
        if (isBg[idx] && !visited[idx]) { visited[idx] = 1; queue.push(idx); }
      }
      while (queue.length) {
        const cur = queue.pop();
        const x = cur % W, y = Math.floor(cur / W);
        for (const [dx, dy] of [[-1,0],[1,0],[0,-1],[0,1]]) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue;
          const ni = ny * W + nx;
          if (!visited[ni] && isBg[ni]) { visited[ni] = 1; queue.push(ni); }
        }
      }

      // Invert: connected bg = black, everything else = white (object)
      for (let i = 0; i < W * H; i++) {
        const v = visited[i] ? 0 : 255;
        s[i * 4 + 0] = v;
        s[i * 4 + 1] = v;
        s[i * 4 + 2] = v;
        s[i * 4 + 3] = 255;
      }
    }

    sCtx.putImageData(silData, 0, 0);
    return sil;
  }

  /**
   * Build cut contour canvas from the silhouette mask.
   * Draws a black outline where the silhouette boundary is.
   */
  _buildCutContour(W, H) {
    const cc = document.createElement('canvas');
    cc.width = W; cc.height = H;
    const cCtx = cc.getContext('2d');

    // Fill white
    cCtx.fillStyle = '#fff';
    cCtx.fillRect(0, 0, W, H);

    const silCtx = this._silhouetteCanvas.getContext('2d');
    const silData = silCtx.getImageData(0, 0, W, H).data;
    const out = cCtx.createImageData(W, H);
    const o = out.data;

    // Fill output white first
    for (let i = 0; i < W * H; i++) {
      o[i * 4 + 0] = 255;
      o[i * 4 + 1] = 255;
      o[i * 4 + 2] = 255;
      o[i * 4 + 3] = 255;
    }

    // Find edges: pixel is white in sil but a neighbour is black
    for (let y = 1; y < H - 1; y++) {
      for (let x = 1; x < W - 1; x++) {
        const i = y * W + x;
        if (silData[i * 4] === 0) continue; // already bg
        // Check 4-neighbours
        const neighbours = [
          (y - 1) * W + x, (y + 1) * W + x,
          y * W + (x - 1), y * W + (x + 1)
        ];
        const isEdge = neighbours.some(ni => silData[ni * 4] === 0);
        if (isEdge) {
          o[i * 4 + 0] = 0;
          o[i * 4 + 1] = 0;
          o[i * 4 + 2] = 0;
          o[i * 4 + 3] = 255;
        }
      }
    }

    cCtx.putImageData(out, 0, 0);
    return cc;
  }

  _drawWorkCanvas() {
    const wrap = this._container.querySelector('.canvas-wrap');
    const wW = wrap.clientWidth || 400;
    const wH = wrap.clientHeight || 400;

    const canvas = this._container.querySelector('#workCanvas');
    if (!canvas) return;
    canvas.width = wW;
    canvas.height = wH;

    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, wW, wH);

    if (!this._sourceImg) return;

    const iW = this._sourceImg.naturalWidth;
    const iH = this._sourceImg.naturalHeight;
    const scale = Math.min(wW / iW, wH / iH);
    const dW = iW * scale, dH = iH * scale;
    const dx = (wW - dW) / 2, dy = (wH - dH) / 2;

    if (this._mode === 'GRABADO' && this._engravingCanvas) {
      // Draw engraving, clipped to silhouette using destination-in
      const tmp = document.createElement('canvas');
      tmp.width = iW; tmp.height = iH;
      const tCtx = tmp.getContext('2d');

      tCtx.drawImage(this._engravingCanvas, 0, 0);
      tCtx.globalCompositeOperation = 'destination-in';
      tCtx.drawImage(this._silhouetteCanvas, 0, 0);

      ctx.drawImage(tmp, dx, dy, dW, dH);

    } else if (this._mode === 'CORTE' && this._cutCanvas) {
      ctx.drawImage(this._cutCanvas, dx, dy, dW, dH);

    } else if (this._mode === 'PREVIEW') {
      // Show source photo clipped to silhouette
      const tmp = document.createElement('canvas');
      tmp.width = iW; tmp.height = iH;
      const tCtx = tmp.getContext('2d');

      tCtx.drawImage(this._sourceImg, 0, 0);
      tCtx.globalCompositeOperation = 'destination-in';
      tCtx.drawImage(this._silhouetteCanvas, 0, 0);

      ctx.drawImage(tmp, dx, dy, dW, dH);
    }
  }

  async _doExport() {
    if (!this._engravingCanvas || !this._cutCanvas) return;
    // Export engraving as PNG
    const engLink = document.createElement('a');
    engLink.download = 'grabado.png';
    engLink.href = this._engravingCanvas.toDataURL('image/png');
    engLink.click();
    // Export cut contour as PNG
    await new Promise(r => setTimeout(r, 300));
    const cutLink = document.createElement('a');
    cutLink.download = 'corte.png';
    cutLink.href = this._cutCanvas.toDataURL('image/png');
    cutLink.click();
  }
}
