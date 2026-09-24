import { loadBlob, saveBlob } from '../storage/Storage.js';
import { DesignEngine } from '../engines/DesignEngine.js';

const designEngine = new DesignEngine();

export class DesignScreen {
  constructor(app) {
    this.app = app;
    this._tool = 'DRAW'; // DRAW | ERASE
    this._layer = 'GRABADO'; // CORTE | GRABADO | PREVIEW
    this._history = [];
    this._historyIdx = -1;
    this._painting = false;
    this._brushSize = 12;
    this._engravingCanvas = null;  // blanco=fondo, negro=graba
    this._cutCanvas = null;
    this._silhouetteCanvas = null; // silueta real extraída de la foto
    this._sourceImg = null;
  }

  render() {
    const project = this.app.currentProject;
    const keptParts = (project.selectedParts || project.detectedParts || []).filter(p => p.kept !== false);

    const el = document.createElement('div');
    el.className = 'screen';
    el.innerHTML = `
      <div class="screen-header">
        <button class="btn btn-icon" id="btn-back">←</button>
        <h1>④ DISEÑAR</h1>
        <button class="btn btn-ghost" id="btn-save-design" style="font-size:0.85rem;">Guardar</button>
      </div>
      <div class="step-bar">
        <div class="step-dot done"></div><div class="step-dot done"></div>
        <div class="step-dot done"></div><div class="step-dot active"></div>
        <div class="step-dot"></div><div class="step-dot"></div>
      </div>

      <div class="screen-body" style="padding:8px 12px;">

        <div class="design-toolbar">
          <button class="tool-btn active" data-tool="DRAW" id="tool-draw">
            <span class="icon">✏️</span><span>Dibujar</span>
          </button>
          <button class="tool-btn" data-tool="ERASE" id="tool-erase">
            <span class="icon">🧹</span><span>Borrar</span>
          </button>
          <button class="tool-btn" id="tool-smooth">
            <span class="icon">〰️</span><span>Suavizar</span>
          </button>
          <button class="tool-btn" id="tool-simplify">
            <span class="icon">◼</span><span>Simplif.</span>
          </button>
          <button class="tool-btn" id="tool-undo">
            <span class="icon">↩</span><span>Deshacer</span>
          </button>
          <button class="tool-btn" id="tool-redo">
            <span class="icon">↪</span><span>Rehacer</span>
          </button>
        </div>

        <div class="layer-switcher">
          <button class="view-tab active" data-layer="GRABADO">Grabado</button>
          <button class="view-tab" data-layer="CORTE">Silueta corte</button>
          <button class="view-tab" data-layer="PREVIEW">👁 Solo dibujo</button>
        </div>

        <div class="design-canvas-wrap" id="design-canvas-wrap" style="min-height:300px; max-height:48vh; margin-top:8px;">
          <canvas id="design-canvas"></canvas>
        </div>

        <div style="display:flex; align-items:center; gap:12px; margin-top:8px; flex-wrap:wrap;">
          <div style="display:flex; align-items:center; gap:8px;">
            <label style="font-size:0.75rem; color:var(--text-muted);">Tamaño pincel</label>
            <input type="range" id="brush-size" min="4" max="40" value="${this._brushSize}" style="width:90px; accent-color:var(--gold);">
          </div>
          <button class="btn btn-secondary" id="btn-extract" style="font-size:0.82rem; padding:8px 14px;">↺ Re-extraer de foto</button>
        </div>

        <!-- Eliminar zona de pieza completa -->
        ${keptParts.length >= 2 ? `
        <div class="section-title" style="margin-top:16px;">Eliminar zona de pieza</div>
        <div style="font-size:0.75rem; color:var(--text-muted); margin-bottom:8px;">
          Borra del grabado la zona de una pieza (ej: enganche, barra).
        </div>
        <div id="erase-parts-list" style="display:flex; flex-wrap:wrap; gap:8px;">
          ${keptParts.map(p => `
            <button class="btn btn-ghost" data-erase-part="${p.id}"
              style="font-size:0.8rem; padding:6px 12px; border-color:rgba(220,60,60,0.4);">
              🗑 ${p.label}
            </button>
          `).join('')}
        </div>
        ` : ''}

        <div class="section-title" style="margin-top:16px;">Intensidad de grabado</div>
        <div class="intensity-group">
          ${['SUAVE','MEDIO','FUERTE'].map(l => `
            <button class="intensity-btn ${(project.engravingLevel||'MEDIO') === l ? 'selected' : ''}" data-level="${l}">
              ${l}
            </button>
          `).join('')}
        </div>

      </div>

      <div class="screen-footer">
        <div class="btn-row">
          <button class="btn btn-secondary" id="btn-back2">← Material</button>
          <button class="btn btn-primary" id="btn-next">Herrajes →</button>
        </div>
      </div>
    `;

    this._initCanvas(el, project);
    this._setupEvents(el, project);
    return el;
  }

  async _initCanvas(el, project) {
    const wrap = el.querySelector('#design-canvas-wrap');
    const canvas = el.querySelector('#design-canvas');

    const wrapW = wrap.offsetWidth || 360;
    const aspect = (project.heightMm || 40) / (project.widthMm || 30);
    const canvasH = Math.max(280, Math.min(Math.round(wrapW * aspect), Math.floor(window.innerHeight * 0.45)));

    canvas.width = wrapW;
    canvas.height = canvasH;
    canvas.style.width = wrapW + 'px';
    canvas.style.height = canvasH + 'px';

    // Canvas de trabajo: blanco = fondo, negro = traza láser
    this._engravingCanvas = document.createElement('canvas');
    this._engravingCanvas.width = wrapW;
    this._engravingCanvas.height = canvasH;

    this._cutCanvas = document.createElement('canvas');
    this._cutCanvas.width = wrapW;
    this._cutCanvas.height = canvasH;

    // ── Cargar imagen fuente para silueta real ───────────────────────────────
    if (project.imageId) {
      const dataUrl = await loadBlob(project.imageId);
      if (dataUrl) {
        const img = new Image();
        await new Promise(r => { img.onload = r; img.src = dataUrl; });
        this._sourceImg = img;
        this._silhouetteCanvas = this._buildSilhouette(img, wrapW, canvasH);
        this._buildCutContour(wrapW, canvasH);
      }
    }

    // Si no hay silueta, contorno rectangular redondeado
    if (!this._silhouetteCanvas) {
      this._silhouetteCanvas = this._buildFallbackSilhouette(wrapW, canvasH);
      this._buildCutContour(wrapW, canvasH);
    }

    // ── Grabado: cargar guardado o extraer de foto ───────────────────────────
    let engLoadOk = false;
    if (project.engravingGeometryId) {
      const data = await loadBlob(project.engravingGeometryId);
      if (data) {
        const img = new Image();
        await new Promise(r => { img.onload = r; img.src = data; });
        const ctx = this._engravingCanvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, wrapW, canvasH);
        ctx.drawImage(img, 0, 0, wrapW, canvasH);
        engLoadOk = true;
      }
    }

    if (!engLoadOk && this._sourceImg) {
      const tmpC = document.createElement('canvas');
      tmpC.width = this._sourceImg.naturalWidth;
      tmpC.height = this._sourceImg.naturalHeight;
      const tCtx = tmpC.getContext('2d');
      tCtx.drawImage(this._sourceImg, 0, 0);

      const extracted = designEngine.extractEngravingLines(tmpC, { threshold: 55 });
      const engCtx = this._engravingCanvas.getContext('2d');
      engCtx.fillStyle = '#ffffff';
      engCtx.fillRect(0, 0, wrapW, canvasH);
      engCtx.drawImage(extracted, 0, 0, wrapW, canvasH);
    } else if (!engLoadOk) {
      const engCtx = this._engravingCanvas.getContext('2d');
      engCtx.fillStyle = '#ffffff';
      engCtx.fillRect(0, 0, wrapW, canvasH);
    }

    this._saveHistory();
    this._drawWorkCanvas(el);
  }

  /**
   * Construye silueta binaria (negro=objeto, blanco=fondo)
   * a partir de la imagen fuente.
   */
  _buildSilhouette(img, W, H) {
    // Dibujar imagen fuente a tamaño del canvas
    const tmp = document.createElement('canvas');
    tmp.width = img.naturalWidth; tmp.height = img.naturalHeight;
    const tCtx = tmp.getContext('2d');
    tCtx.drawImage(img, 0, 0);
    const d = tCtx.getImageData(0, 0, img.naturalWidth, img.naturalHeight);
    const px = d.data;
    const sw = img.naturalWidth, sh = img.naturalHeight;

    // Samplear fondo desde las cuatro esquinas (3×3 píxeles cada una)
    const sampleBg = (cx, cy) => {
      let r = 0, g = 0, b = 0, n = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const xi = Math.min(Math.max(cx+dx, 0), sw-1);
          const yi = Math.min(Math.max(cy+dy, 0), sh-1);
          const i = (yi*sw+xi)*4;
          r += px[i]; g += px[i+1]; b += px[i+2]; n++;
        }
      }
      return [r/n, g/n, b/n];
    };
    const corners = [
      sampleBg(0, 0), sampleBg(sw-1, 0),
      sampleBg(0, sh-1), sampleBg(sw-1, sh-1),
    ];
    let bgR = 0, bgG = 0, bgB = 0;
    corners.forEach(([r, g, b]) => { bgR += r; bgG += g; bgB += b; });
    bgR /= 4; bgG /= 4; bgB /= 4;

    // Crear máscara binaria
    const mask = new Uint8ClampedArray(sw * sh * 4);
    for (let i = 0; i < px.length; i += 4) {
      const diff = (Math.abs(px[i]-bgR) + Math.abs(px[i+1]-bgG) + Math.abs(px[i+2]-bgB)) / 3;
      const v = diff > 28 ? 0 : 255; // 0=objeto(negro), 255=fondo(blanco)
      mask[i] = mask[i+1] = mask[i+2] = v;
      mask[i+3] = 255;
    }

    // Flood-fill desde esquinas para limpiar islas de fondo dentro del objeto
    const visited = new Uint8Array(sw * sh);
    const queue = [0, sw-1, (sh-1)*sw, (sh-1)*sw + sw-1];
    for (const start of queue) {
      if (visited[start]) continue;
      const stack = [start];
      while (stack.length) {
        const p = stack.pop();
        if (p < 0 || p >= sw*sh || visited[p]) continue;
        const mi = p * 4;
        if (mask[mi] !== 255) continue; // no es fondo
        visited[p] = 1;
        stack.push(p-1, p+1, p-sw, p+sw);
      }
    }
    // Los píxeles de fondo no alcanzados por flood = están dentro del objeto → hacerlos objeto
    for (let i = 0; i < sw*sh; i++) {
      if (mask[i*4] === 255 && !visited[i]) {
        mask[i*4] = mask[i*4+1] = mask[i*4+2] = 0;
      }
    }

    // Dibujar máscara en canvas temporal
    const mCanvas = document.createElement('canvas');
    mCanvas.width = sw; mCanvas.height = sh;
    const mCtx = mCanvas.getContext('2d');
    mCtx.putImageData(new ImageData(mask, sw, sh), 0, 0);

    // Escalar al tamaño del canvas de diseño
    const dst = document.createElement('canvas');
    dst.width = W; dst.height = H;
    const dCtx = dst.getContext('2d');
    dCtx.fillStyle = '#fff';
    dCtx.fillRect(0, 0, W, H);
    dCtx.drawImage(mCanvas, 0, 0, W, H);
    return dst;
  }

  /**
   * Silueta rectangular redondeada (fallback sin foto).
   */
  _buildFallbackSilhouette(W, H) {
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#000000';
    const r = Math.min(W, H) * 0.1;
    const pad = 6;
    this._roundRectFill(ctx, pad, pad, W - pad*2, H - pad*2, r);
    return c;
  }

  /**
   * Dibuja contorno de corte sobre _cutCanvas usando la silueta real.
   */
  _buildCutContour(W, H) {
    const ctx = this._cutCanvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, H);

    if (!this._silhouetteCanvas) return;

    // Obtener datos de la silueta y detectar bordes (Sobel simplificado)
    const sCtx = this._silhouetteCanvas.getContext('2d');
    const sData = sCtx.getImageData(0, 0, W, H);
    const sp = sData.data;
    const out = ctx.createImageData(W, H);
    const op = out.data;

    for (let y = 1; y < H-1; y++) {
      for (let x = 1; x < W-1; x++) {
        const center = sp[((y)*W + x) * 4];
        const neighbors = [
          sp[((y-1)*W + x)*4], sp[((y+1)*W + x)*4],
          sp[(y*W + x-1)*4],   sp[(y*W + x+1)*4],
        ];
        // Es borde si centro es objeto (negro) y algún vecino es fondo (blanco)
        const isBorder = center < 128 && neighbors.some(n => n > 128);
        const idx = (y*W+x)*4;
        op[idx] = op[idx+1] = op[idx+2] = isBorder ? 0 : 255;
        op[idx+3] = 255;
      }
    }
    ctx.putImageData(out, 0, 0);
  }

  _drawWorkCanvas(el) {
    const canvas = el.querySelector('#design-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#0a0a14';
    ctx.fillRect(0, 0, W, H);

    if (this._layer === 'PREVIEW') {
      // Vista limpia del canvas de grabado sin clip
      if (this._engravingCanvas) {
        ctx.save();
        ctx.globalAlpha = 0.95;
        ctx.drawImage(this._engravingCanvas, 0, 0, W, H);
        ctx.restore();
      }
    } else if (this._layer === 'CORTE') {
      // Mostrar silueta de corte
      if (this._cutCanvas) {
        ctx.drawImage(this._cutCanvas, 0, 0, W, H);
      }
    } else {
      // Vista GRABADO: dibujar con máscara de silueta real
      if (this._engravingCanvas && this._silhouetteCanvas) {
        // 1. Componer grabado sobre offscreen
        const off = document.createElement('canvas');
        off.width = W; off.height = H;
        const offCtx = off.getContext('2d');
        offCtx.drawImage(this._engravingCanvas, 0, 0, W, H);

        // 2. Usar silueta como máscara: destination-in
        offCtx.globalCompositeOperation = 'destination-in';
        // Crear alpha mask desde silueta (negro=opaco)
        const silData = this._silhouetteCanvas.getContext('2d').getImageData(0, 0, W, H);
        const alphaCanvas = document.createElement('canvas');
        alphaCanvas.width = W; alphaCanvas.height = H;
        const aCtx = alphaCanvas.getContext('2d');
        const ad = aCtx.createImageData(W, H);
        for (let i = 0; i < silData.data.length; i += 4) {
          const luma = silData.data[i];
          // negro (objeto) = opaco, blanco (fondo) = transparente
          ad.data[i] = ad.data[i+1] = ad.data[i+2] = 0;
          ad.data[i+3] = luma < 128 ? 255 : 0;
        }
        aCtx.putImageData(ad, 0, 0);
        offCtx.drawImage(alphaCanvas, 0, 0);

        ctx.drawImage(off, 0, 0);
      } else if (this._engravingCanvas) {
        ctx.drawImage(this._engravingCanvas, 0, 0, W, H);
      }
    }

    // Contorno silueta siempre visible
    if (this._silhouetteCanvas) {
      ctx.save();
      ctx.globalAlpha = 0.35;
      ctx.globalCompositeOperation = 'screen';
      // Dibujar contorno en dorado
      const sCtx = this._silhouetteCanvas.getContext('2d');
      const sData = sCtx.getImageData(0, 0, W, H);
      const edgeData = ctx.createImageData(W, H);
      for (let y = 1; y < H-1; y++) {
        for (let x = 1; x < W-1; x++) {
          const c = sData.data[((y)*W+x)*4];
          const neighbors = [
            sData.data[((y-1)*W+x)*4], sData.data[((y+1)*W+x)*4],
            sData.data[(y*W+x-1)*4],   sData.data[(y*W+x+1)*4],
          ];
          if (c < 128 && neighbors.some(n => n > 128)) {
            const idx = (y*W+x)*4;
            edgeData.data[idx] = 201;
            edgeData.data[idx+1] = 169;
            edgeData.data[idx+2] = 110;
            edgeData.data[idx+3] = 255;
          }
        }
      }
      ctx.putImageData(edgeData, 0, 0);
      ctx.restore();
    }

    // Label capa
    ctx.save();
    ctx.font = '600 10px system-ui';
    ctx.fillStyle = 'rgba(201,169,110,0.5)';
    ctx.textAlign = 'right';
    ctx.fillText(this._layer, W - 8, H - 8);
    ctx.restore();
  }

  _setupEvents(el, project) {
    el.querySelector('#btn-back').onclick = () => this.app.navigate('detect');
    el.querySelector('#btn-back2').onclick = () => this.app.navigate('detect');
    el.querySelector('#btn-save-design').onclick = () => { this._save(); this.app.showToast('Guardado'); };
    el.querySelector('#btn-next').onclick = () => { this._save(); this.app.navigate('hardware'); };

    // Herramientas
    el.querySelectorAll('[data-tool]').forEach(btn => {
      btn.onclick = () => {
        this._tool = btn.dataset.tool;
        el.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      };
    });

    el.querySelector('#tool-smooth').onclick = () => {
      designEngine.applySmooth(this._engravingCanvas);
      this._saveHistory();
      this._drawWorkCanvas(el);
    };
    el.querySelector('#tool-simplify').onclick = () => {
      designEngine.applySimplify(this._engravingCanvas);
      this._saveHistory();
      this._drawWorkCanvas(el);
    };
    el.querySelector('#tool-undo').onclick = () => { this._undo(el); };
    el.querySelector('#tool-redo').onclick = () => { this._redo(el); };

    // Capas
    el.querySelectorAll('[data-layer]').forEach(tab => {
      tab.onclick = () => {
        this._layer = tab.dataset.layer;
        el.querySelectorAll('[data-layer]').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        this._drawWorkCanvas(el);
      };
    });

    // Pincel
    el.querySelector('#brush-size').oninput = e => {
      this._brushSize = parseInt(e.target.value);
    };

    // Re-extraer
    el.querySelector('#btn-extract').onclick = () => this._reExtract(el, project);

    // Intensidad
    el.querySelectorAll('.intensity-btn').forEach(btn => {
      btn.onclick = () => {
        project.engravingLevel = btn.dataset.level;
        el.querySelectorAll('.intensity-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
      };
    });

    // Borrar zona de pieza ── ahora rellena con BLANCO (= borrar las líneas negras del grabado)
    el.querySelectorAll('[data-erase-part]').forEach(btn => {
      btn.onclick = () => {
        const partId = btn.dataset.erasePart;
        const allParts = project.selectedParts || project.detectedParts || [];
        const part = allParts.find(p => p.id === partId);
        if (!part?.bounds || !this._engravingCanvas) return;

        const W = this._engravingCanvas.width;
        const H = this._engravingCanvas.height;
        const ctx = this._engravingCanvas.getContext('2d');
        const { x, y, w, h } = part.bounds;

        // El canvas de grabado: blanco=fondo(sin graba), negro=traza(graba)
        // Para BORRAR una zona → rellenar en BLANCO (elimina el negro)
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(
          Math.floor(x * W),
          Math.floor(y * H),
          Math.ceil(w * W),
          Math.ceil(h * H)
        );

        this._saveHistory();
        this._drawWorkCanvas(el);
        this.app.showToast(`Zona "${part.label}" eliminada`);
      };
    });

    // Pintar en canvas
    const canvas = el.querySelector('#design-canvas');
    this._setupPaint(canvas, el);
  }

  _setupPaint(canvas, el) {
    const getPos = e => {
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      const cx = (e.clientX ?? e.touches?.[0]?.clientX ?? 0) - rect.left;
      const cy = (e.clientY ?? e.touches?.[0]?.clientY ?? 0) - rect.top;
      return { x: cx * scaleX, y: cy * scaleY };
    };

    const paint = (pos) => {
      const target = this._layer === 'CORTE' ? this._cutCanvas : this._engravingCanvas;
      if (!target) return;
      const ctx = target.getContext('2d');
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, this._brushSize / 2, 0, Math.PI * 2);
      // DRAW = negro (graba), ERASE = blanco (borra)
      ctx.fillStyle = this._tool === 'ERASE' ? '#ffffff' : '#000000';
      ctx.fill();
      this._drawWorkCanvas(el);
    };

    canvas.addEventListener('mousedown', e => { this._painting = true; paint(getPos(e)); });
    canvas.addEventListener('mousemove', e => { if (this._painting) paint(getPos(e)); });
    canvas.addEventListener('mouseup', () => { if (this._painting) { this._painting = false; this._saveHistory(); } });

    canvas.addEventListener('touchstart', e => {
      e.preventDefault(); this._painting = true; paint(getPos(e));
    }, { passive: false });
    canvas.addEventListener('touchmove', e => {
      e.preventDefault(); if (this._painting) paint(getPos(e));
    }, { passive: false });
    canvas.addEventListener('touchend', () => {
      if (this._painting) { this._painting = false; this._saveHistory(); }
    });
  }

  _saveHistory() {
    const canvas = this._engravingCanvas;
    if (!canvas) return;
    const snapshot = canvas.toDataURL();
    this._history = this._history.slice(0, this._historyIdx + 1);
    this._history.push(snapshot);
    if (this._history.length > 20) this._history.shift();
    this._historyIdx = this._history.length - 1;
  }

  _undo(el) {
    if (this._historyIdx <= 0) return;
    this._historyIdx--;
    this._restoreHistory(el);
  }

  _redo(el) {
    if (this._historyIdx >= this._history.length - 1) return;
    this._historyIdx++;
    this._restoreHistory(el);
  }

  _restoreHistory(el) {
    const snap = this._history[this._historyIdx];
    if (!snap || !this._engravingCanvas) return;
    const img = new Image();
    img.onload = () => {
      const ctx = this._engravingCanvas.getContext('2d');
      ctx.clearRect(0, 0, this._engravingCanvas.width, this._engravingCanvas.height);
      ctx.drawImage(img, 0, 0);
      this._drawWorkCanvas(el);
    };
    img.src = snap;
  }

  async _reExtract(el, project) {
    if (!project.imageId) return;
    const dataUrl = await loadBlob(project.imageId);
    if (!dataUrl) return;
    const img = new Image();
    img.onload = () => {
      const tmp = document.createElement('canvas');
      tmp.width = img.naturalWidth; tmp.height = img.naturalHeight;
      const tCtx = tmp.getContext('2d');
      tCtx.drawImage(img, 0, 0);
      const extracted = designEngine.extractEngravingLines(tmp, { threshold: 55 });
      const ctx = this._engravingCanvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, this._engravingCanvas.width, this._engravingCanvas.height);
      ctx.drawImage(extracted, 0, 0, this._engravingCanvas.width, this._engravingCanvas.height);

      // Regenerar silueta
      this._silhouetteCanvas = this._buildSilhouette(img, this._engravingCanvas.width, this._engravingCanvas.height);
      this._buildCutContour(this._engravingCanvas.width, this._engravingCanvas.height);

      this._saveHistory();
      this._drawWorkCanvas(el);
    };
    img.src = dataUrl;
  }

  async _save() {
    const project = this.app.currentProject;
    if (this._engravingCanvas) {
      const id = `eng_${project.id}`;
      await saveBlob(id, this._engravingCanvas.toDataURL());
      project.engravingGeometryId = id;
    }
    if (this._cutCanvas) {
      const id = `cut_${project.id}`;
      await saveBlob(id, this._cutCanvas.toDataURL());
      project.cutGeometryId = id;
    }
    this.app.saveProject();
  }

  // ── Utilidades ─────────────────────────────────────────────────────────────

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
}
