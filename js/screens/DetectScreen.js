import { loadBlob } from '../storage/Storage.js';
import { ManualDetection } from '../detection/ManualDetection.js';
import { DetectedPart } from '../detection/DetectionProvider.js';

const PART_COLORS = {
  body:      '#c9a96e',
  hole:      '#5ce08a',
  connector: '#a0c4ff',
  hardware:  '#ff9eb5',
  other:     '#aaa',
};

export class DetectScreen {
  constructor(app) {
    this.app = app;
    this._img = null;
    this._parts = [];
    this._canvas = null;
    this._overlayCanvas = null;
  }

  render() {
    const el = document.createElement('div');
    el.className = 'screen';
    el.innerHTML = `
      <div class="screen-header">
        <button class="btn btn-icon" id="btn-back">←</button>
        <h1>② DETECTAR</h1>
        <button class="btn btn-ghost" id="btn-save-detect" style="font-size:0.85rem;">Guardar</button>
      </div>
      <div class="step-bar">
        <div class="step-dot done"></div>
        <div class="step-dot active"></div>
        <div class="step-dot"></div><div class="step-dot"></div>
        <div class="step-dot"></div><div class="step-dot"></div>
      </div>

      <div class="screen-body">
        <div class="detect-canvas-wrap" id="detect-wrap" style="max-height: 45vh; overflow:hidden; border-radius:var(--radius);">
          <canvas id="detect-bg" style="display:block; width:100%;"></canvas>
          <canvas id="detect-overlay" style="position:absolute; top:0; left:0; width:100%; height:100%; pointer-events:none;"></canvas>
        </div>

        <div style="margin-top:12px;">
          <div class="section-title">Modo diseño</div>
          <div class="design-mode-btns" id="design-mode-btns">
            <button class="btn btn-secondary ${this._getMode() === 'MANTENER' ? 'active-mode' : ''}" data-mode="MANTENER">Mantener diseño</button>
            <button class="btn btn-ghost ${this._getMode() === 'CREAR' ? 'active-mode' : ''}" data-mode="CREAR">Crear parecido</button>
            <button class="btn btn-ghost ${this._getMode() === 'AMBOS' ? 'active-mode' : ''}" data-mode="AMBOS">Ambos</button>
          </div>
        </div>

        <div class="section-title" style="margin-top:16px;">Piezas detectadas</div>
        <div id="parts-list"></div>

        <button class="btn btn-secondary btn-full" id="btn-add-part" style="margin-top:8px;">
          + Añadir pieza
        </button>
      </div>

      <div class="screen-footer">
        <div class="btn-row">
          <button class="btn btn-secondary" id="btn-back2">← Foto</button>
          <button class="btn btn-primary" id="btn-next">Material →</button>
        </div>
      </div>
    `;

    this._loadAndDetect(el);
    this._setupEvents(el);
    return el;
  }

  _getMode() {
    return this.app.currentProject?.designMode || 'MANTENER';
  }

  async _loadAndDetect(el) {
    const project = this.app.currentProject;
    if (!project?.imageId) return;

    const dataUrl = await loadBlob(project.imageId);
    if (!dataUrl) return;

    const img = new Image();
    img.onload = () => {
      this._img = img;

      const wrap = el.querySelector('#detect-wrap');
      const wrapWidth = wrap.offsetWidth || 360;
      const scale = wrapWidth / img.naturalWidth;
      const displayH = Math.round(img.naturalHeight * scale);

      // Posicionar overlay absolutamente
      wrap.style.position = 'relative';
      wrap.style.height = displayH + 'px';

      const bgCanvas = el.querySelector('#detect-bg');
      bgCanvas.width = img.naturalWidth;
      bgCanvas.height = img.naturalHeight;
      bgCanvas.style.width = '100%';
      bgCanvas.style.height = 'auto';

      const bgCtx = bgCanvas.getContext('2d');
      if (project.imageRotation) {
        bgCtx.save();
        bgCtx.translate(bgCanvas.width/2, bgCanvas.height/2);
        bgCtx.rotate(project.imageRotation * Math.PI/180);
        bgCtx.drawImage(img, -img.naturalWidth/2, -img.naturalHeight/2);
        bgCtx.restore();
      } else {
        bgCtx.drawImage(img, 0, 0);
      }

      const overlay = el.querySelector('#detect-overlay');
      overlay.width = img.naturalWidth;
      overlay.height = img.naturalHeight;
      this._overlayCanvas = overlay;
      this._bgCanvas = bgCanvas;

      // Detectar piezas si no hay ya
      if (project.detectedParts?.length > 0) {
        this._parts = project.detectedParts.map(p => new DetectedPart(p));
      } else {
        const detector = new ManualDetection();
        detector.detect(img).then(parts => {
          this._parts = parts;
          this._updatePartsUI(el);
          this._drawOverlay();
        });
        return;
      }

      this._updatePartsUI(el);
      this._drawOverlay();
    };
    img.src = dataUrl;
  }

  _drawOverlay() {
    if (!this._overlayCanvas) return;
    const W = this._overlayCanvas.width;
    const H = this._overlayCanvas.height;
    const ctx = this._overlayCanvas.getContext('2d');
    ctx.clearRect(0, 0, W, H);

    this._parts.filter(p => p.kept).forEach(part => {
      const { x, y, w, h } = part.bounds;
      const px = x * W, py = y * H, pw = w * W, ph = h * H;
      const color = PART_COLORS[part.type] || '#c9a96e';

      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.setLineDash([8, 4]);
      ctx.globalAlpha = 0.85;
      ctx.strokeRect(px, py, pw, ph);

      ctx.fillStyle = color;
      ctx.globalAlpha = 0.12;
      ctx.fillRect(px, py, pw, ph);

      ctx.globalAlpha = 1;
      ctx.fillStyle = color;
      ctx.font = `bold ${Math.max(10, W * 0.025)}px system-ui`;
      ctx.fillText(part.label, px + 4, py + 16);
      ctx.restore();
    });
  }

  _updatePartsUI(el) {
    const list = el.querySelector('#parts-list');
    list.innerHTML = this._parts.map(p => `
      <div class="part-item" data-id="${p.id}">
        <div class="part-badge ${p.kept ? 'kept' : 'removed'}" style="background:${PART_COLORS[p.type] || '#888'}22; color:${PART_COLORS[p.type] || '#888'}; border-color:${PART_COLORS[p.type] || '#888'}44;">
          ${p.kept ? '✓' : '✗'} ${p.label}
        </div>
        <div class="part-actions">
          <button class="btn btn-icon" data-action="toggle" data-id="${p.id}" style="font-size:1rem;" title="${p.kept ? 'Eliminar' : 'Conservar'}">
            ${p.kept ? '🗑' : '✓'}
          </button>
        </div>
      </div>
    `).join('');

    list.querySelectorAll('[data-action="toggle"]').forEach(btn => {
      btn.onclick = () => {
        const part = this._parts.find(p => p.id === btn.dataset.id);
        if (part) {
          part.kept = !part.kept;
          this._updatePartsUI(el);
          this._drawOverlay();
        }
      };
    });
  }

  _setupEvents(el) {
    el.querySelector('#btn-back').onclick = () => this.app.navigate('photo');
    el.querySelector('#btn-back2').onclick = () => this.app.navigate('photo');
    el.querySelector('#btn-save-detect').onclick = () => { this._saveAndStay(); this.app.showToast('Guardado'); };

    el.querySelector('#btn-add-part').onclick = () => {
      const label = prompt('Nombre de la pieza (ej: Pétalo):');
      if (!label) return;
      const newPart = new DetectedPart({
        label,
        type: 'other',
        bounds: { x: 0.2, y: 0.2, w: 0.6, h: 0.6 },
        kept: true,
      });
      this._parts.push(newPart);
      this._updatePartsUI(el);
      this._drawOverlay();
    };

    el.querySelectorAll('#design-mode-btns button').forEach(btn => {
      btn.onclick = () => {
        this.app.currentProject.designMode = btn.dataset.mode;
        el.querySelectorAll('#design-mode-btns button').forEach(b => {
          b.className = 'btn ' + (b.dataset.mode === btn.dataset.mode ? 'btn-secondary active-mode' : 'btn-ghost');
        });
      };
    });

    el.querySelector('#btn-next').onclick = () => {
      this._saveAndStay();
      this.app.navigate('material');
    };
  }

  _saveAndStay() {
    const project = this.app.currentProject;
    project.detectedParts = this._parts.map(p => ({ ...p }));
    project.selectedParts = this._parts.filter(p => p.kept).map(p => ({ ...p }));
    this.app.saveProject();
  }
}
