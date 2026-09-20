import { loadBlob, saveBlob } from '../storage/Storage.js';
import { PreviewEngine } from '../engines/PreviewEngine.js';
import { LaserEngine } from '../engines/LaserEngine.js';
import { MaterialEngine } from '../engines/MaterialEngine.js';

const previewEngine = new PreviewEngine();
const laserEngine = new LaserEngine();
const materialEngine = new MaterialEngine();

export class ResultScreen {
  constructor(app) {
    this.app = app;
    this._view = 'PIEZA';      // PIEZA | PENDIENTE | PAREJA
    this._laserView = null;    // null | CORTE | GRABADO | COMPLETO
    this._canvases = {};
    this._mainCanvas = null;
  }

  render() {
    const project = this.app.currentProject;

    const el = document.createElement('div');
    el.className = 'screen';
    el.innerHTML = `
      <div class="screen-header">
        <button class="btn btn-icon" id="btn-back">←</button>
        <h1>⑥ RESULTADO</h1>
        <button class="btn btn-ghost" id="btn-save-res" style="font-size:0.85rem;">Guardar</button>
      </div>
      <div class="step-bar">
        ${[0,1,2,3,4,5].map(i => `<div class="step-dot ${i < 5 ? 'done' : 'active'}"></div>`).join('')}
      </div>

      <div class="screen-body" style="padding:8px 12px;">

        <!-- Canvas principal -->
        <div id="result-canvas-wrap" class="result-canvas-wrap dark-bg" style="min-height:280px; max-height:45vh;">
          <canvas id="result-canvas"></canvas>
        </div>

        <!-- Vistas preview -->
        <div style="margin-top:8px;">
          <div class="view-tabs" id="preview-tabs">
            <button class="view-tab active" data-pview="PIEZA">Pieza sola</button>
            <button class="view-tab" data-pview="PENDIENTE">Pendiente</button>
            <button class="view-tab" data-pview="PAREJA">Pareja</button>
          </div>
        </div>

        <!-- Información de dimensiones -->
        <div class="dim-display" style="margin-top:10px;">
          <div class="dim-box">
            <div class="val">${project.widthMm || '—'}</div>
            <div class="lbl">Ancho mm</div>
          </div>
          <div class="dim-box">
            <div class="val">${project.heightMm || '—'}</div>
            <div class="lbl">Alto mm</div>
          </div>
          <div class="dim-box">
            <div class="val">${project.holes?.[0]?.diametrMm || '—'}</div>
            <div class="lbl">Ø Agujero mm</div>
          </div>
          <div class="dim-box">
            <div class="val" style="font-size:0.85rem; text-transform:uppercase;">${project.engravingLevel || '—'}</div>
            <div class="lbl">Grabado</div>
          </div>
        </div>

        <!-- Vistas láser -->
        <div class="section-title" style="margin-top:16px;">Preparación para láser</div>
        <div class="view-tabs" id="laser-tabs">
          <button class="view-tab active" data-lview="">Vista normal</button>
          <button class="view-tab" data-lview="CORTE">CORTE</button>
          <button class="view-tab" data-lview="GRABADO">GRABADO</button>
          <button class="view-tab" data-lview="COMPLETO">COMPLETO</button>
        </div>

        <!-- Exportar -->
        <div class="section-title" style="margin-top:16px;">Exportar para LaserGRBL</div>
        <div class="export-row">
          <button class="btn btn-secondary" id="btn-export-cut">⬇ Exportar CORTE</button>
          <button class="btn btn-secondary" id="btn-export-eng">⬇ Exportar GRABADO</button>
        </div>
        <button class="btn btn-ghost btn-full" id="btn-export-preview" style="margin-top:8px; font-size:0.85rem;">
          ⬇ Exportar preview (PNG)
        </button>

        <div class="section-title" style="margin-top:16px;">Material seleccionado</div>
        <div class="card" style="display:flex; align-items:center; gap:12px;">
          <div id="mat-swatch" style="width:40px; height:40px; border-radius:8px; border:1px solid rgba(255,255,255,0.15); background:${project.material?.color || '#c2845a'};"></div>
          <div>
            <div style="font-weight:700;">${project.material?.type || 'LISO'}</div>
            <div style="font-size:0.8rem; color:var(--text-muted);">${project.material?.color || ''}</div>
          </div>
          <div style="margin-left:auto; font-size:0.85rem; color:var(--text-muted);">
            ${project.hardware?.[0] ? `${project.hardware[0].categoria} · ${project.hardware[0].acabado}` : '—'}
          </div>
        </div>

        <div style="margin-top:16px; padding-bottom:8px;">
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
    // Cargar canvas de material
    let materialCanvas = null;
    if (project.engravingGeometryId || project.cutGeometryId || project.imageId) {
      const silhouette = materialEngine.buildBasicSilhouette(300, 400, project.material);
      materialCanvas = materialEngine.applyMaterial(silhouette, project.material || {});
    }

    // Cargar canvas de grabado
    let engravingCanvas = null;
    if (project.engravingGeometryId) {
      const data = await loadBlob(project.engravingGeometryId);
      if (data) {
        const img = new Image();
        await new Promise(r => { img.onload = r; img.src = data; });
        engravingCanvas = document.createElement('canvas');
        engravingCanvas.width = 300; engravingCanvas.height = 400;
        const ctx = engravingCanvas.getContext('2d');
        ctx.drawImage(img, 0, 0, 300, 400);
      }
    }

    // Laser canvases
    const cutCanvas = laserEngine.buildCutCanvas(
      project.widthMm || 30, project.heightMm || 40, null, project.holes || []
    );
    const laserEngCanvas = laserEngine.buildEngravingCanvas(
      project.widthMm || 30, project.heightMm || 40, engravingCanvas, project.engravingLevel || 'MEDIO'
    );

    this._canvases = { materialCanvas, engravingCanvas, cutCanvas, laserEngCanvas };

    this._initMainCanvas(el, project);
  }

  _initMainCanvas(el, project) {
    const wrap = el.querySelector('#result-canvas-wrap');
    if (!wrap) return;
    const W = wrap.offsetWidth || 360;
    const H = Math.round(W * 0.85);

    const canvas = el.querySelector('#result-canvas');
    canvas.width = W;
    canvas.height = H;
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    this._mainCanvas = canvas;

    this._render(el, project);
  }

  _render(el, project) {
    if (!this._mainCanvas) return;
    previewEngine.render(
      this._mainCanvas,
      project,
      this._view,
      this._laserView,
      {
        materialCanvas: this._canvases.materialCanvas,
        engravingCanvas: this._canvases.engravingCanvas || this._canvases.laserEngCanvas,
        cutCanvas: this._canvases.cutCanvas,
      }
    );

    // Fondo del wrap
    const wrap = el.querySelector('#result-canvas-wrap');
    if (this._laserView === 'CORTE' || this._laserView === 'GRABADO') {
      wrap.style.background = '#fff';
    } else {
      wrap.style.background = '#050510';
    }
  }

  _setupEvents(el, project) {
    el.querySelector('#btn-back').onclick = () => this.app.navigate('hardware');
    el.querySelector('#btn-back2').onclick = () => this.app.navigate('hardware');
    el.querySelector('#btn-home').onclick = () => this.app.navigate('home');
    el.querySelector('#btn-save-res').onclick = () => {
      this._savePreview(project);
      this.app.saveProject();
      this.app.showToast('Proyecto guardado');
    };

    // Vistas preview
    el.querySelectorAll('[data-pview]').forEach(tab => {
      tab.onclick = () => {
        this._view = tab.dataset.pview;
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

    // Exportaciones
    el.querySelector('#btn-export-cut').onclick = () => {
      const c = this._canvases.cutCanvas;
      if (c) laserEngine.exportPNG(c, `${project.name || 'joya'}_CORTE.png`);
    };
    el.querySelector('#btn-export-eng').onclick = () => {
      const c = this._canvases.laserEngCanvas;
      if (c) laserEngine.exportPNG(c, `${project.name || 'joya'}_GRABADO.png`);
    };
    el.querySelector('#btn-export-preview').onclick = () => {
      if (this._mainCanvas) laserEngine.exportPNG(this._mainCanvas, `${project.name || 'joya'}_preview.png`);
    };

    el.querySelector('#btn-new-from-here').onclick = () => this.app.newProject();
  }

  async _savePreview(project) {
    if (!this._mainCanvas) return;
    const id = `prev_${project.id}`;
    await saveBlob(id, this._mainCanvas.toDataURL('image/jpeg', 0.7));
    project.previewId = id;
    project.status = 'ready';
  }
}
