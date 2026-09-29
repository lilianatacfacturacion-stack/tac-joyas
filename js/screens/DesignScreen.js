// js/screens/DesignScreen.js
import { designEngine } from '../engines/DesignEngine.js';
import { loadBlob, saveBlob } from '../storage/Storage.js';

export class DesignScreen {
  constructor(app) {
    this.app = app;
    this._sourceImg   = null;
    this._silCanvas   = null;   // máscara silueta: blanco=objeto, negro=fondo
    this._engCanvas   = null;   // grabado extraído
    this._cutCanvas   = null;   // contorno de corte
    this._drawCanvas  = null;   // trazos manuales del usuario
    this._mode        = 'GRABADO';
    this._drawMode    = 'draw'; // 'draw' | 'erase'
    this._brushSize   = 6;
    this._isDrawing   = false;
    this._lastPt      = null;
    this._history     = [];
    this._historyIdx  = -1;
  }

  render() {
    const el = document.createElement('div');
    el.className = 'screen';
    el.innerHTML = `
      <div class="screen-header">
        <button class="btn btn-icon" id="btn-back">←</button>
        <h1>④ DISEÑAR</h1>
        <button class="btn btn-ghost" id="btn-save" style="font-size:0.85rem;">Guardar</button>
      </div>
      <div class="step-bar">
        <div class="step-dot done"></div><div class="step-dot done"></div>
        <div class="step-dot done"></div><div class="step-dot active"></div>
        <div class="step-dot"></div><div class="step-dot"></div>
      </div>

      <div class="screen-body" style="padding:0;">

        <!-- Toolbar herramientas -->
        <div class="design-toolbar" style="display:flex; gap:6px; padding:10px 12px; overflow-x:auto; background:var(--surface2);">
          <button class="btn btn-secondary active-tool" id="tool-draw" style="min-width:72px;">✏️ Dibujar</button>
          <button class="btn btn-ghost" id="tool-erase" style="min-width:72px;">🧹 Borrar</button>
          <button class="btn btn-ghost" id="tool-smooth" style="min-width:72px;">〜 Suavizar</button>
          <button class="btn btn-ghost" id="tool-simplify" style="min-width:72px;">▪ Simplif.</button>
          <button class="btn btn-ghost" id="tool-undo" style="min-width:60px;">↩ Deshacer</button>
          <button class="btn btn-ghost" id="tool-redo" style="min-width:60px;">↪ Rehacer</button>
        </div>

        <!-- Tabs vista -->
        <div style="display:flex; border-bottom:1px solid var(--border);">
          <button class="design-tab active" data-mode="GRABADO" style="flex:1; padding:8px; background:none; border:none; color:var(--gold); font-weight:700; cursor:pointer; border-bottom:2px solid var(--gold);">Grabado</button>
          <button class="design-tab" data-mode="CORTE" style="flex:1; padding:8px; background:none; border:none; color:var(--text-muted); cursor:pointer;">Silueta corte</button>
          <button class="design-tab" data-mode="PREVIEW" style="flex:1; padding:8px; background:none; border:none; color:var(--text-muted); cursor:pointer;">👁 Solo dibujo</button>
        </div>

        <!-- Canvas principal -->
        <div id="canvas-wrap" style="position:relative; width:100%; background:#000; touch-action:none; user-select:none;">
          <canvas id="canvas-result" style="display:block; width:100%; height:auto;"></canvas>
          <canvas id="canvas-draw"   style="position:absolute; top:0; left:0; width:100%; height:100%; touch-action:none;"></canvas>
        </div>

        <!-- Controles bajo el canvas -->
        <div style="padding:10px 16px 0;">
          <div style="display:flex; align-items:center; gap:10px; margin-bottom:6px;">
            <span style="font-size:0.75rem; color:var(--text-muted); width:90px;">Tamaño pincel</span>
            <input type="range" id="slider-brush" min="2" max="40" value="6" style="flex:1;">
          </div>

          <button class="btn btn-ghost btn-full" id="btn-reextract" style="margin-bottom:10px;">
            ↺ Re-extraer de foto
          </button>

          <div class="section-title">INTENSIDAD DE GRABADO</div>
          <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:8px; margin-bottom:12px;">
            <button class="btn btn-ghost intensity-btn" data-level="SUAVE">SUAVE</button>
            <button class="btn btn-secondary intensity-btn active-intensity" data-level="MEDIO">MEDIO</button>
            <button class="btn btn-ghost intensity-btn" data-level="FUERTE">FUERTE</button>
          </div>

          <!-- Controles avanzados (colapsables) -->
          <details style="margin-bottom:10px;">
            <summary style="font-size:0.75rem; color:var(--text-muted); cursor:pointer;">Ajuste fino extracción</summary>
            <div style="padding:8px 0; display:flex; flex-direction:column; gap:8px;">
              <label style="font-size:0.8rem; display:flex; align-items:center; gap:8px;">
                Umbral <span id="lbl-thr">18</span>
                <input type="range" id="slider-threshold" min="3" max="50" value="18" style="flex:1;">
              </label>
              <label style="font-size:0.8rem; display:flex; align-items:center; gap:8px;">
                Radio local <span id="lbl-radius">8</span>px
                <input type="range" id="slider-radius" min="3" max="30" value="8" style="flex:1;">
              </label>
            </div>
          </details>
        </div>
      </div>

      <div class="screen-footer">
        <div class="btn-row">
          <button class="btn btn-secondary" id="btn-back2">← Material</button>
          <button class="btn btn-primary" id="btn-next">Herrajes →</button>
        </div>
      </div>
    `;

    this._el = el;
    this._bindEvents(el);
    this._initCanvas(el);
    return el;
  }

  // ── Carga imagen y extrae ───────────────────────────────────────────────────
  async _initCanvas(el) {
    const project = this.app.currentProject;
    if (!project?.imageId) { this.app.showToast('Sin foto — vuelve al paso 1'); return; }

    const dataUrl = await loadBlob(project.imageId);
    if (!dataUrl) { this.app.showToast('No se pudo cargar la imagen'); return; }

    const img = new Image();
    await new Promise(res => { img.onload = res; img.src = dataUrl; });
    this._sourceImg = img;

    const W = img.naturalWidth;
    const H = img.naturalHeight;

    // Dimensionar canvas resultado al ancho real del wrap
    const wrap     = el.querySelector('#canvas-wrap');
    const displayW = wrap.clientWidth || 360;
    const scale    = displayW / W;
    const displayH = Math.round(H * scale);
    wrap.style.height = displayH + 'px';

    const cResult = el.querySelector('#canvas-result');
    cResult.width  = W;
    cResult.height = H;

    // Canvas de dibujo manual (overlay)
    const cDraw   = el.querySelector('#canvas-draw');
    cDraw.width   = W;
    cDraw.height  = H;
    this._drawCanvas = cDraw;

    // Extraer
    await this._reExtract({ threshold: 18, blurRadius: 8 });
  }

  async _reExtract(opts = {}) {
    const thr = opts.threshold  ?? parseInt(this._el?.querySelector('#slider-threshold')?.value ?? 18);
    const rad = opts.blurRadius ?? parseInt(this._el?.querySelector('#slider-radius')?.value    ?? 8);

    if (!this._sourceImg) return;
    const W = this._sourceImg.naturalWidth;
    const H = this._sourceImg.naturalHeight;

    // 1. Silueta
    this._silCanvas = this._buildSilhouette(this._sourceImg, W, H);

    // 2. Líneas de grabado (contraste local adaptativo)
    this._engCanvas = designEngine.extractEngravingLines(this._sourceImg, {
      threshold:      thr,
      blurRadius:     rad,
      silhouetteMask: this._silCanvas,
    });

    // 3. Contorno de corte
    this._cutCanvas = this._buildCutContour(W, H);

    // Reset dibujo manual
    const ctx = this._drawCanvas.getContext('2d');
    ctx.clearRect(0, 0, W, H);
    this._pushHistory();

    this._drawResult();
  }

  // ── Silueta (alpha > 10 → objeto) ──────────────────────────────────────────
  _buildSilhouette(img, W, H) {
    const tmp = document.createElement('canvas');
    tmp.width = W; tmp.height = H;
    const ctx = tmp.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const src = ctx.getImageData(0, 0, W, H).data;

    let hasAlpha = false;
    for (let i = 3; i < src.length; i += 4) {
      if (src[i] < 245) { hasAlpha = true; break; }
    }

    const sil  = document.createElement('canvas');
    sil.width  = W; sil.height = H;
    const sCtx = sil.getContext('2d');
    const imgD = sCtx.createImageData(W, H);
    const s    = imgD.data;

    if (hasAlpha) {
      for (let i = 0; i < W * H; i++) {
        const v = src[i*4+3] > 10 ? 255 : 0;
        s[i*4]=v; s[i*4+1]=v; s[i*4+2]=v; s[i*4+3]=255;
      }
    } else {
      // Flood-fill desde esquinas para detectar fondo
      const patch = 3;
      let rS=0, gS=0, bS=0, cnt=0;
      for (const [cx,cy] of [[0,0],[W-patch,0],[0,H-patch],[W-patch,H-patch]]) {
        for (let dy=0; dy<patch; dy++) for (let dx=0; dx<patch; dx++) {
          const idx=((cy+dy)*W+(cx+dx))*4;
          rS+=src[idx]; gS+=src[idx+1]; bS+=src[idx+2]; cnt++;
        }
      }
      const bgR=rS/cnt, bgG=gS/cnt, bgB=bS/cnt;
      const isBg = new Uint8Array(W*H);
      for (let i=0; i<W*H; i++) {
        const dr=src[i*4]-bgR, dg=src[i*4+1]-bgG, db=src[i*4+2]-bgB;
        if (Math.sqrt(dr*dr+dg*dg+db*db)<28) isBg[i]=1;
      }
      const vis=new Uint8Array(W*H), q=[];
      for (const [cx,cy] of [[0,0],[W-patch,0],[0,H-patch],[W-patch,H-patch]]) {
        const idx=cy*W+cx;
        if (isBg[idx]&&!vis[idx]) { vis[idx]=1; q.push(idx); }
      }
      while (q.length) {
        const c=q.pop(), x=c%W, y=Math.floor(c/W);
        for (const [dx,dy] of [[-1,0],[1,0],[0,-1],[0,1]]) {
          const nx=x+dx, ny=y+dy;
          if (nx<0||nx>=W||ny<0||ny>=H) continue;
          const ni=ny*W+nx;
          if (!vis[ni]&&isBg[ni]) { vis[ni]=1; q.push(ni); }
        }
      }
      for (let i=0; i<W*H; i++) {
        const v=vis[i]?0:255;
        s[i*4]=v; s[i*4+1]=v; s[i*4+2]=v; s[i*4+3]=255;
      }
    }
    sCtx.putImageData(imgD,0,0);
    return sil;
  }

  // ── Contorno de corte ───────────────────────────────────────────────────────
  _buildCutContour(W, H) {
    const cc   = document.createElement('canvas');
    cc.width=W; cc.height=H;
    const ctx  = cc.getContext('2d');
    const silD = this._silCanvas.getContext('2d').getImageData(0,0,W,H).data;
    const outI = ctx.createImageData(W,H);
    const o    = outI.data;
    for (let i=0;i<W*H;i++) { o[i*4]=255; o[i*4+1]=255; o[i*4+2]=255; o[i*4+3]=255; }
    for (let y=1;y<H-1;y++) {
      for (let x=1;x<W-1;x++) {
        const i=y*W+x;
        if (!silD[i*4]) continue;
        const isEdge = !silD[((y-1)*W+x)*4] || !silD[((y+1)*W+x)*4]
                    || !silD[(y*W+(x-1))*4]  || !silD[(y*W+(x+1))*4];
        if (isEdge) { o[i*4]=0; o[i*4+1]=0; o[i*4+2]=0; o[i*4+3]=255; }
      }
    }
    ctx.putImageData(outI,0,0);
    return cc;
  }

  // ── Renderizar resultado en canvas ─────────────────────────────────────────
  _drawResult() {
    if (!this._sourceImg) return;
    const el     = this._el;
    const cRes   = el.querySelector('#canvas-result');
    const ctx    = cRes.getContext('2d');
    const W      = cRes.width;
    const H      = cRes.height;

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);

    const mode = this._mode;

    if (mode === 'GRABADO' && this._engCanvas) {
      // Grabado extraído + trazos manuales, recortado a silueta
      const tmp   = document.createElement('canvas');
      tmp.width=W; tmp.height=H;
      const tCtx  = tmp.getContext('2d');
      // Fondo blanco dentro de silueta
      tCtx.drawImage(this._engCanvas, 0, 0);
      // Superponer trazos manuales
      tCtx.drawImage(this._drawCanvas, 0, 0);
      // Recortar a silueta
      tCtx.globalCompositeOperation = 'destination-in';
      tCtx.drawImage(this._silCanvas, 0, 0);
      tCtx.globalCompositeOperation = 'source-over';
      // Dibujar sobre fondo negro
      ctx.drawImage(tmp, 0, 0);

    } else if (mode === 'CORTE' && this._cutCanvas) {
      // Fondo blanco, contorno negro
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, W, H);
      ctx.drawImage(this._cutCanvas, 0, 0);

    } else if (mode === 'PREVIEW' && this._engCanvas) {
      // Solo el grabado en negro (sin silueta)
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, W, H);
      ctx.drawImage(this._engCanvas, 0, 0);
      ctx.drawImage(this._drawCanvas, 0, 0);
    }
  }

  // ── Historial deshacer/rehacer ─────────────────────────────────────────────
  _pushHistory() {
    const W = this._drawCanvas.width, H = this._drawCanvas.height;
    const data = this._drawCanvas.getContext('2d').getImageData(0,0,W,H);
    this._history = this._history.slice(0, this._historyIdx+1);
    this._history.push(data);
    if (this._history.length > 20) this._history.shift();
    this._historyIdx = this._history.length - 1;
  }

  _undo() {
    if (this._historyIdx <= 0) return;
    this._historyIdx--;
    const ctx = this._drawCanvas.getContext('2d');
    ctx.putImageData(this._history[this._historyIdx], 0, 0);
    this._drawResult();
  }

  _redo() {
    if (this._historyIdx >= this._history.length-1) return;
    this._historyIdx++;
    const ctx = this._drawCanvas.getContext('2d');
    ctx.putImageData(this._history[this._historyIdx], 0, 0);
    this._drawResult();
  }

  // ── Dibujo táctil en el overlay ────────────────────────────────────────────
  _getCanvasPoint(e, canvas) {
    const rect  = canvas.getBoundingClientRect();
    const touch = e.touches?.[0] ?? e;
    const scaleX = canvas.width  / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (touch.clientX - rect.left)  * scaleX,
      y: (touch.clientY - rect.top)   * scaleY,
    };
  }

  _startDraw(e) {
    e.preventDefault();
    this._isDrawing = true;
    this._lastPt    = this._getCanvasPoint(e, this._drawCanvas);
  }

  _moveDraw(e) {
    if (!this._isDrawing) return;
    e.preventDefault();
    const pt  = this._getCanvasPoint(e, this._drawCanvas);
    const ctx = this._drawCanvas.getContext('2d');
    ctx.globalCompositeOperation = this._drawMode === 'erase' ? 'destination-out' : 'source-over';
    ctx.strokeStyle = '#000';
    ctx.lineWidth   = this._brushSize;
    ctx.lineCap     = 'round';
    ctx.lineJoin    = 'round';
    ctx.beginPath();
    ctx.moveTo(this._lastPt.x, this._lastPt.y);
    ctx.lineTo(pt.x, pt.y);
    ctx.stroke();
    this._lastPt = pt;
    this._drawResult();
  }

  _endDraw() {
    if (!this._isDrawing) return;
    this._isDrawing = false;
    this._pushHistory();
  }

  // ── Guardar ─────────────────────────────────────────────────────────────────
  async _save() {
    const project = this.app.currentProject;
    if (!project || !this._engCanvas) return;

    // Combinar grabado extraído + trazos manuales, recortado a silueta
    const W = this._engCanvas.width, H = this._engCanvas.height;
    const final = document.createElement('canvas');
    final.width=W; final.height=H;
    const ctx = final.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0,0,W,H);
    ctx.drawImage(this._engCanvas, 0, 0);
    ctx.drawImage(this._drawCanvas, 0, 0);
    // Recortar a silueta
    ctx.globalCompositeOperation = 'destination-in';
    ctx.drawImage(this._silCanvas, 0, 0);

    const engDataUrl = final.toDataURL('image/png');
    const cutDataUrl = this._cutCanvas.toDataURL('image/png');

    const engId = project.engravingGeometryId || ('eng_' + Date.now());
    const cutId = project.cutGeometryId       || ('cut_' + Date.now());

    await saveBlob(engId, engDataUrl);
    await saveBlob(cutId, cutDataUrl);

    project.engravingGeometryId = engId;
    project.cutGeometryId       = cutId;
    project.engravingLevel      = this._el.querySelector('.active-intensity')?.dataset.level || 'MEDIO';
    this.app.saveProject();
    this.app.showToast('Diseño guardado');
  }

  // ── Eventos ─────────────────────────────────────────────────────────────────
  _bindEvents(el) {
    el.querySelector('#btn-back').onclick  = () => this.app.navigate('material');
    el.querySelector('#btn-back2').onclick = () => this.app.navigate('material');
    el.querySelector('#btn-save').onclick  = () => this._save();
    el.querySelector('#btn-next').onclick  = () => { this._save().then(() => this.app.navigate('hardware')); };

    // Tabs
    el.querySelectorAll('.design-tab').forEach(tab => {
      tab.onclick = () => {
        el.querySelectorAll('.design-tab').forEach(t => {
          t.style.color = 'var(--text-muted)';
          t.style.borderBottom = 'none';
          t.classList.remove('active');
        });
        tab.style.color = 'var(--gold)';
        tab.style.borderBottom = '2px solid var(--gold)';
        tab.classList.add('active');
        this._mode = tab.dataset.mode;
        this._drawResult();
      };
    });

    // Herramientas
    const setTool = (id) => {
      el.querySelectorAll('.design-toolbar .btn').forEach(b => {
        b.className = b.className.replace('btn-secondary','btn-ghost').replace(' active-tool','');
      });
      const btn = el.querySelector('#' + id);
      if (btn) { btn.className = btn.className.replace('btn-ghost','btn-secondary') + ' active-tool'; }
    };

    el.querySelector('#tool-draw').onclick = () => {
      this._drawMode = 'draw';
      setTool('tool-draw');
      el.querySelector('#canvas-draw').style.cursor = 'crosshair';
    };
    el.querySelector('#tool-erase').onclick = () => {
      this._drawMode = 'erase';
      setTool('tool-erase');
      el.querySelector('#canvas-draw').style.cursor = 'cell';
    };
    el.querySelector('#tool-smooth').onclick = () => {
      if (!this._engCanvas) return;
      designEngine.applySmooth(this._engCanvas);
      this._drawResult();
    };
    el.querySelector('#tool-simplify').onclick = () => {
      if (!this._engCanvas) return;
      designEngine.applySimplify(this._engCanvas);
      this._drawResult();
    };
    el.querySelector('#tool-undo').onclick = () => this._undo();
    el.querySelector('#tool-redo').onclick = () => this._redo();

    // Pincel
    el.querySelector('#slider-brush').oninput = e => {
      this._brushSize = parseInt(e.target.value);
    };

    // Re-extraer
    el.querySelector('#btn-reextract').onclick = async () => {
      await this._reExtract();
      this.app.showToast('Re-extraído');
    };

    // Intensidad
    el.querySelectorAll('.intensity-btn').forEach(btn => {
      btn.onclick = () => {
        el.querySelectorAll('.intensity-btn').forEach(b => {
          b.className = b.className.replace('btn-secondary','btn-ghost').replace(' active-intensity','');
        });
        btn.className = btn.className.replace('btn-ghost','btn-secondary') + ' active-intensity';
      };
    });

    // Sliders avanzados
    el.querySelector('#slider-threshold').oninput = async e => {
      el.querySelector('#lbl-thr').textContent = e.target.value;
      const rad = parseInt(el.querySelector('#slider-radius').value);
      this._engCanvas = designEngine.extractEngravingLines(this._sourceImg, {
        threshold: parseInt(e.target.value), blurRadius: rad, silhouetteMask: this._silCanvas,
      });
      this._drawResult();
    };
    el.querySelector('#slider-radius').oninput = async e => {
      el.querySelector('#lbl-radius').textContent = e.target.value;
      const thr = parseInt(el.querySelector('#slider-threshold').value);
      this._engCanvas = designEngine.extractEngravingLines(this._sourceImg, {
        threshold: thr, blurRadius: parseInt(e.target.value), silhouetteMask: this._silCanvas,
      });
      this._drawResult();
    };

    // Dibujo táctil / ratón
    // (se asignan después de que el canvas exista, en _initCanvas)
    this._pendingDrawBind = true;
  }

  async _initCanvas(el) {
    const project = this.app.currentProject;
    if (!project?.imageId) { this.app.showToast('Sin foto — vuelve al paso 1'); return; }

    const dataUrl = await loadBlob(project.imageId);
    if (!dataUrl) { this.app.showToast('No se pudo cargar la imagen'); return; }

    const img = new Image();
    await new Promise(res => { img.onload = res; img.src = dataUrl; });
    this._sourceImg = img;

    const W = img.naturalWidth, H = img.naturalHeight;

    const wrap     = el.querySelector('#canvas-wrap');
    const displayW = wrap.clientWidth || window.innerWidth || 360;
    const displayH = Math.round(H * (displayW / W));
    wrap.style.height = displayH + 'px';

    const cResult = el.querySelector('#canvas-result');
    cResult.width = W; cResult.height = H;

    const cDraw = el.querySelector('#canvas-draw');
    cDraw.width = W; cDraw.height = H;
    this._drawCanvas = cDraw;
    cDraw.style.cursor = 'crosshair';

    // Eventos dibujo
    cDraw.addEventListener('mousedown',  e => this._startDraw(e));
    cDraw.addEventListener('mousemove',  e => this._moveDraw(e));
    cDraw.addEventListener('mouseup',    () => this._endDraw());
    cDraw.addEventListener('mouseleave', () => this._endDraw());
    cDraw.addEventListener('touchstart', e => this._startDraw(e), { passive: false });
    cDraw.addEventListener('touchmove',  e => this._moveDraw(e),  { passive: false });
    cDraw.addEventListener('touchend',   () => this._endDraw());

    await this._reExtract({ threshold: 18, blurRadius: 8 });
  }
}
