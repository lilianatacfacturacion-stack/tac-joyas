import { loadBlob, saveBlob } from '../storage/Storage.js';
import { DesignEngine } from '../engines/DesignEngine.js';
import { MaterialEngine } from '../engines/MaterialEngine.js';

const designEngine = new DesignEngine();
const materialEngine = new MaterialEngine();

export class DesignScreen {
  constructor(app) {
    this.app = app;
    this._tool = 'DRAW'; // DRAW | ERASE
    this._layer = 'GRABADO'; // CORTE | GRABADO
    this._history = [];
    this._historyIdx = -1;
    this._painting = false;
    this._brushSize = 12;
    this._engravingCanvas = null;
    this._cutCanvas = null;
  }

  render() {
    const project = this.app.currentProject;

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
            <label style="font-size:0.75rem; color:var(--text-muted);">Tamaño</label>
            <input type="range" id="brush-size" min="4" max="40" value="${this._brushSize}" style="width:100px; accent-color:var(--gold);">
          </div>
          <button class="btn btn-secondary" id="btn-extract" style="font-size:0.82rem; padding:8px 14px;">↺ Re-extraer de foto</button>
        </div>

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
    const wrapH = Math.round(wrapW * (project.heightMm || 40) / (project.widthMm || 30));
    const canvasH = Math.max(280, Math.min(wrapH, window.innerHeight * 0.45));

    canvas.width = wrapW;
    canvas.height = canvasH;
    canvas.style.width = wrapW + 'px';
    canvas.style.height = canvasH + 'px';

    // Crear canvas de trabajo para grabado
    this._engravingCanvas = document.createElement('canvas');
    this._engravingCanvas.width = wrapW;
    this._engravingCanvas.height = canvasH;

    this._cutCanvas = document.createElement('canvas');
    this._cutCanvas.width = wrapW;
    this._cutCanvas.height = canvasH;

    // Intentar cargar desde proyecto guardado
    let engLoadOk = false;
    if (project.engravingGeometryId) {
      const data = await loadBlob(project.engravingGeometryId);
      if (data) {
        const img = new Image();
        await new Promise(r => { img.onload = r; img.src = data; });
        const ctx = this._engravingCanvas.getContext('2d');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, wrapW, canvasH);
        ctx.drawImage(img, 0, 0, wrapW, canvasH);
        engLoadOk = true;
      }
    }

    // Si no hay grabado guardado, intentar extraer de la foto
    if (!engLoadOk && project.imageId) {
      const dataUrl = await loadBlob(project.imageId);
      if (dataUrl) {
        const img = new Image();
        await new Promise(r => { img.onload = r; img.src = dataUrl; });
        const tmpCanvas = document.createElement('canvas');
        tmpCanvas.width = img.naturalWidth;
        tmpCanvas.height = img.naturalHeight;
        const tmpCtx = tmpCanvas.getContext('2d');
        tmpCtx.drawImage(img, 0, 0);

        const extracted = designEngine.extractEngravingLines(tmpCanvas, { threshold: 55 });
        const engCtx = this._engravingCanvas.getContext('2d');
        engCtx.fillStyle = '#fff';
        engCtx.fillRect(0, 0, wrapW, canvasH);
        engCtx.drawImage(extracted, 0, 0, wrapW, canvasH);
      }
    }

    // Silueta de corte
    const cutCtx = this._cutCanvas.getContext('2d');
    cutCtx.fillStyle = '#fff';
    cutCtx.fillRect(0, 0, wrapW, canvasH);
    cutCtx.strokeStyle = '#000';
    cutCtx.lineWidth = 3;
    cutCtx.beginPath();
    cutCtx.ellipse(wrapW/2, canvasH/2, wrapW/2 - 4, canvasH/2 - 4, 0, 0, Math.PI*2);
    cutCtx.stroke();

    this._saveHistory();
    this._drawWorkCanvas(el);
  }

  _drawWorkCanvas(el) {
    const canvas = el.querySelector('#design-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#050510';
    ctx.fillRect(0, 0, W, H);

    const src = this._layer === 'CORTE' ? this._cutCanvas : this._engravingCanvas;
    if (src) {
      ctx.save();
      if (this._layer !== 'PREVIEW') {
        // Clip a forma de pieza
        ctx.beginPath();
        ctx.ellipse(W/2, H/2, W/2 - 2, H/2 - 2, 0, 0, Math.PI*2);
        ctx.clip();
      }
      ctx.drawImage(src, 0, 0, W, H);
      ctx.restore();
    }

    // Contorno silueta siempre visible
    ctx.save();
    ctx.strokeStyle = 'rgba(201,169,110,0.4)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.ellipse(W/2, H/2, W/2 - 2, H/2 - 2, 0, 0, Math.PI*2);
    ctx.stroke();
    ctx.restore();

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

    // Tamaño pincel
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
      if (this._tool === 'ERASE') {
        ctx.fillStyle = '#ffffff';
      } else {
        ctx.fillStyle = '#000000';
      }
      ctx.fill();
      this._drawWorkCanvas(el);
    };

    canvas.addEventListener('mousedown', e => { this._painting = true; paint(getPos(e)); });
    canvas.addEventListener('mousemove', e => { if (this._painting) paint(getPos(e)); });
    canvas.addEventListener('mouseup', () => { if (this._painting) { this._painting = false; this._saveHistory(); } });

    canvas.addEventListener('touchstart', e => {
      e.preventDefault();
      this._painting = true;
      paint(getPos(e));
    }, { passive: false });
    canvas.addEventListener('touchmove', e => {
      e.preventDefault();
      if (this._painting) paint(getPos(e));
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
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, this._engravingCanvas.width, this._engravingCanvas.height);
      ctx.drawImage(extracted, 0, 0, this._engravingCanvas.width, this._engravingCanvas.height);
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
}
