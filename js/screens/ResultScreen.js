import { loadBlob, saveBlob } from '../storage/Storage.js';
import { PreviewEngine } from '../engines/PreviewEngine.js';
import { LaserEngine } from '../engines/LaserEngine.js';
import { MaterialEngine } from '../engines/MaterialEngine.js';

const previewEngine = new PreviewEngine();
const laserEngine   = new LaserEngine();
const materialEngine = new MaterialEngine();

export class ResultScreen {
  constructor(app) {
    this.app = app;
    this._view      = 'PIEZA';
    this._laserView = null;
    this._canvases  = {};
    this._mainCanvas = null;
    this._sourceCanvas  = null;
    this._el = null;
    this._project = null;
  }

  render() {
    const project = this.app.currentProject;
    this._project = project;

    const el = document.createElement('div');
    el.className = 'screen';
    this._el = el;

    const lvl = project.engravingLevel || 'MEDIO';

    el.innerHTML = `
      <div class="screen-header">
        <button class="btn btn-icon" id="btn-back">←</button>
        <h1>⑥ RESULTADO</h1>
        <button class="btn btn-ghost" id="btn-save-res" style="font-size:0.85rem;">Guardar</button>
      </div>
      <div class="step-bar">
        ${[0,1,2,3,4,5].map(i=>`<div class="step-dot ${i<5?'done':'active'}"></div>`).join('')}
      </div>

      <div class="screen-body" style="padding:8px 12px;">

        <div id="result-canvas-wrap" style="
          background:#050510; border-radius:10px; overflow:hidden;
          min-height:260px; max-height:44vh; display:flex; align-items:center; justify-content:center;">
          <canvas id="result-canvas"></canvas>
        </div>

        <!-- Vistas de preview -->
        <div style="margin-top:8px;">
          <div class="view-tabs" id="preview-tabs">
            <button class="view-tab active" data-pview="PIEZA">Pieza sola</button>
            <button class="view-tab" data-pview="PENDIENTE">Pendiente</button>
            <button class="view-tab" data-pview="PAREJA">Pareja</button>
          </div>
        </div>

        <!-- Medidas rápidas -->
        <div class="dim-display" style="margin-top:8px;">
          <div class="dim-box"><div class="val">${project.widthMm||'—'}</div><div class="lbl">Ancho mm</div></div>
          <div class="dim-box"><div class="val">${project.heightMm||'—'}</div><div class="lbl">Alto mm</div></div>
          <div class="dim-box"><div class="val">${project.holes?.[0]?.diametrMm||'—'}</div><div class="lbl">Ø mm</div></div>
          <div class="dim-box"><div class="val" id="lbl-level" style="font-size:0.8rem;text-transform:uppercase;">${lvl}</div><div class="lbl">Grabado</div></div>
        </div>

        <!-- Intensidad de grabado -->
        <div class="section-title" style="margin-top:14px;">Intensidad del grabado</div>
        <div class="view-tabs" id="eng-level-tabs">
          <button class="view-tab ${lvl==='SUAVE'?'active':''}" data-elevel="SUAVE">🪶 Suave</button>
          <button class="view-tab ${lvl==='MEDIO'?'active':''}" data-elevel="MEDIO">✦ Medio</button>
          <button class="view-tab ${lvl==='FUERTE'?'active':''}" data-elevel="FUERTE">🔥 Fuerte</button>
        </div>

        <!-- Vistas láser -->
        <div class="section-title" style="margin-top:16px;">Vista de preparación láser</div>
        <div class="view-tabs" id="laser-tabs" style="flex-wrap:wrap; gap:4px;">
          <button class="view-tab active" data-lview="">Color real</button>
          <button class="view-tab" data-lview="CORTE">Solo corte</button>
          <button class="view-tab" data-lview="GRABADO">Solo grabado</button>
          <button class="view-tab" data-lview="COMPLETO">Corte+Grabado</button>
          <button class="view-tab" data-lview="PREVIEW">Vista final</button>
        </div>

        <!-- Exportar -->
        <div class="section-title" style="margin-top:16px;">Exportar para LaserGRBL</div>
        <div class="export-row">
          <button class="btn btn-secondary" id="btn-export-cut">⬇ CORTE</button>
          <button class="btn btn-secondary" id="btn-export-eng">⬇ GRABADO</button>
        </div>
        <button class="btn btn-ghost btn-full" id="btn-export-preview" style="margin-top:8px;font-size:0.85rem;">⬇ Exportar preview PNG</button>

        <!-- Material -->
        <div class="section-title" style="margin-top:16px;">Material</div>
        <div class="card" style="display:flex;align-items:center;gap:12px;">
          <div style="width:40px;height:40px;border-radius:8px;border:1px solid rgba(255,255,255,0.15);background:${project.material?.color||'#c2845a'};"></div>
          <div>
            <div style="font-weight:700;">${project.material?.type||'LISO'}</div>
            <div style="font-size:0.8rem;color:var(--text-muted);">${project.material?.color||''}</div>
          </div>
          <div style="margin-left:auto;font-size:0.85rem;color:var(--text-muted);">
            ${project.hardware?.[0]?`${project.hardware[0].categoria}·${project.hardware[0].acabado}`:'—'}
          </div>
        </div>

        <div style="margin-top:16px;padding-bottom:8px;">
          <button class="btn btn-primary btn-full" id="btn-new-from-here">✦ Nuevo diseño</button>
        </div>
      </div>

      <div class="screen-footer">
        <div class="btn-row">
          <button class="btn btn-secondary" id="btn-back2">← Herrajes</button>
          <button class="btn btn-ghost" id="btn-home">Inicio</button>
        </div>
      </div>
    `;

    this._loadAndRender(el, project);
    this._setupEvents(el, project);
    return el;
  }

  async _loadAndRender(el, project) {
    // 1. Imagen fuente
    let sourceCanvas = null;
    if (project.imageId) {
      const imgData = await loadBlob(project.imageId);
      if (imgData) {
        const sImg = new Image();
        await new Promise(r => { sImg.onload = r; sImg.src = imgData; });
        sourceCanvas = document.createElement('canvas');
        sourceCanvas.width  = sImg.naturalWidth;
        sourceCanvas.height = sImg.naturalHeight;
        sourceCanvas.getContext('2d').drawImage(sImg, 0, 0);
      }
    }
    this._sourceCanvas = sourceCanvas;

    // 2. Silueta y material con color
    const silhouetteCanvas = materialEngine.buildBasicSilhouette(300, 400, project.material, sourceCanvas);
    const materialCanvas   = materialEngine.applyMaterial(silhouetteCanvas, project.material || {});

    // 3. Silueta láser (para clip sin líneas internas)
    const laserSilCanvas = laserEngine.buildFilledSilhouette(
      project.widthMm || 40, project.heightMm || 40, sourceCanvas
    );

    // 4. Corte: solo borde exterior
    const cutCanvas = laserEngine.buildCutCanvas(
      project.widthMm || 40, project.heightMm || 40, sourceCanvas, project.holes || []
    );

    // 5. Grabado: usa la imagen fuente directamente (binarizada con nivel)
    //    La imagen de la flor tiene textura rica — binarizar con distintos umbrales
    //    produce diferencia visual clara entre SUAVE/MEDIO/FUERTE
    const laserEngCanvas = laserEngine.buildEngravingCanvas(
      project.widthMm || 40, project.heightMm || 40,
      null,  // sin canvas de grabado explícito → usar sourceCanvas
      project.engravingLevel || 'MEDIO',
      sourceCanvas
    );

    this._canvases = {
      materialCanvas,
      silhouetteCanvas,
      cutCanvas,
      laserEngCanvas,
      laserSilCanvas,
    };

    this._initMainCanvas(el, project);
  }

  // Regenera solo el canvas de grabado con el nuevo nivel
  _rebuildEngraving(project) {
    this._canvases.laserEngCanvas = laserEngine.buildEngravingCanvas(
      project.widthMm || 40, project.heightMm || 40,
      null,
      project.engravingLevel || 'MEDIO',
      this._sourceCanvas
    );
  }

  _initMainCanvas(el, project) {
    const wrap = el.querySelector('#result-canvas-wrap');
    if (!wrap) return;
    const W = wrap.offsetWidth || 360;
    const H = Math.round(W * 0.9);
    const canvas = el.querySelector('#result-canvas');
    canvas.width  = W; canvas.height = H;
    canvas.style.width  = W + 'px';
    canvas.style.height = H + 'px';
    this._mainCanvas = canvas;
    this._render(el, project);
  }

  _render(el, project) {
    if (!this._mainCanvas) return;
    previewEngine.render(
      this._mainCanvas, project, this._view, this._laserView,
      {
        materialCanvas:   this._canvases.materialCanvas,
        silhouetteCanvas: this._canvases.silhouetteCanvas,
        cutCanvas:        this._canvases.cutCanvas,
        laserEngCanvas:   this._canvases.laserEngCanvas,
        laserSilCanvas:   this._canvases.laserSilCanvas,
        engravingLevel:   project.engravingLevel || 'MEDIO',
      }
    );

    const wrap = el.querySelector('#result-canvas-wrap');
    if (wrap) {
      const isWhiteBg = this._laserView === 'CORTE' || this._laserView === 'GRABADO' || this._laserView === 'COMPLETO';
      wrap.style.background = isWhiteBg ? '#fff' : '#050510';
    }
  }

  _setupEvents(el, project) {
    el.querySelector('#btn-back').onclick   = () => this.app.navigate('hardware');
    el.querySelector('#btn-back2').onclick  = () => this.app.navigate('hardware');
    el.querySelector('#btn-home').onclick   = () => this.app.navigate('home');
    el.querySelector('#btn-new-from-here').onclick = () => this.app.newProject();

    el.querySelector('#btn-save-res').onclick = () => {
      this._savePreview(project);
      this.app.saveProject();
      this.app.showToast('Proyecto guardado');
    };

    // Intensidad grabado → regenerar inmediatamente
    el.querySelectorAll('[data-elevel]').forEach(tab => {
      tab.onclick = () => {
        project.engravingLevel = tab.dataset.elevel;
        el.querySelectorAll('[data-elevel]').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        const lbl = el.querySelector('#lbl-level');
        if (lbl) lbl.textContent = tab.dataset.elevel;
        this._rebuildEngraving(project);
        this._render(el, project);
      };
    });

    // Vistas de preview
    el.querySelectorAll('[data-pview]').forEach(tab => {
      tab.onclick = () => {
        this._view      = tab.dataset.pview;
        this._laserView = null;
        el.querySelectorAll('[data-pview]').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        el.querySelectorAll('[data-lview]').forEach(t => t.classList.remove('active'));
        el.querySelector('[data-lview=""]').classList.add('active');
        this._render(el, project);
      };
    });

    // Vistas láser
    el.querySelectorAll('[data-lview]').forEach(tab => {
      tab.onclick = () => {
        this._laserView = tab.dataset.lview || null;
        el.querySelectorAll('[data-lview]').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        this._render(el, project);
      };
    });

    el.querySelector('#btn-export-cut').onclick = () => {
      if (this._canvases.cutCanvas) laserEngine.exportPNG(this._canvases.cutCanvas, `${project.name||'joya'}_CORTE.png`);
    };
    el.querySelector('#btn-export-eng').onclick = () => {
      if (this._canvases.laserEngCanvas) laserEngine.exportPNG(this._canvases.laserEngCanvas, `${project.name||'joya'}_GRABADO.png`);
    };
    el.querySelector('#btn-export-preview').onclick = () => {
      if (this._mainCanvas) laserEngine.exportPNG(this._mainCanvas, `${project.name||'joya'}_preview.png`);
    };
  }

  async _savePreview(project) {
    if (!this._mainCanvas) return;
    const id = `prev_${project.id}`;
    await saveBlob(id, this._mainCanvas.toDataURL('image/jpeg', 0.7));
    project.previewId = id;
    project.status = 'ready';
  }
}
