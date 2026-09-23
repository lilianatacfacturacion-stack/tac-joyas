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
 
const MODE_DESCRIPTIONS = {
  MANTENER: 'Usa el diseño grabado tal como está en la foto.',
  CREAR:    'Genera un diseño nuevo inspirado en la forma detectada.',
  AMBOS:    'Exporta ambas versiones: el diseño original y uno nuevo.',
};
 
export class DetectScreen {
  constructor(app) {
    this.app = app;
    this._img = null;
    this._parts = [];
    this._overlayCanvas = null;
    this._bgCanvas = null;
    this._el = null;
  }
 
  render() {
    const el = document.createElement('div');
    el.className = 'screen';
    this._el = el;
 
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
        <!-- Canvas de imagen con overlay -->
        <div id="detect-wrap" style="position:relative; border-radius:var(--radius); overflow:hidden; background:#000;">
          <canvas id="detect-bg" style="display:block; width:100%; height:auto;"></canvas>
          <canvas id="detect-overlay" style="position:absolute; top:0; left:0; width:100%; height:100%; pointer-events:none;"></canvas>
        </div>
 
        <!-- Modo diseño -->
        <div style="margin-top:14px;">
          <div class="section-title">Modo diseño</div>
          <div class="design-mode-btns" id="design-mode-btns" style="display:flex; gap:8px; flex-wrap:wrap;">
            ${['MANTENER','CREAR','AMBOS'].map(m => `
              <button class="btn ${m === this._getMode() ? 'btn-secondary' : 'btn-ghost'}" data-mode="${m}"
                style="flex:1; min-width:90px;">${m === 'MANTENER' ? 'Mantener diseño' : m === 'CREAR' ? 'Crear parecido' : 'Ambos'}</button>
            `).join('')}
          </div>
          <div id="mode-desc" style="margin-top:8px; font-size:0.78rem; color:var(--text-muted); padding:8px 12px; background:rgba(201,169,110,0.07); border-radius:8px; border-left:3px solid var(--gold);">
            ${MODE_DESCRIPTIONS[this._getMode()]}
          </div>
        </div>
 
        <!-- Piezas detectadas -->
        <div style="margin-top:16px;">
          <div class="section-title">Piezas detectadas</div>
          <div style="font-size:0.75rem; color:var(--text-muted); margin-bottom:8px;">
            Pulsa 🗑 para excluir una pieza del diseño láser. Las excluidas aparecen tachadas.
          </div>
          <div id="parts-list"></div>
          <button class="btn btn-ghost btn-full" id="btn-add-part" style="margin-top:8px; font-size:0.82rem;">
            + Añadir pieza manualmente
          </button>
        </div>
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
      const bgCanvas = el.querySelector('#detect-bg');
      const overlay = el.querySelector('#detect-overlay');
 
      // Dimensiones del canvas = dimensiones naturales de la imagen
      bgCanvas.width = img.naturalWidth;
      bgCanvas.height = img.naturalHeight;
 
      const bgCtx = bgCanvas.getContext('2d');
      if (project.imageRotation) {
        bgCtx.save();
        bgCtx.translate(bgCanvas.width / 2, bgCanvas.height / 2);
        bgCtx.rotate(project.imageRotation * Math.PI / 180);
        bgCtx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
        bgCtx.restore();
      } else {
        bgCtx.drawImage(img, 0, 0);
      }
 
      // El overlay debe tener las MISMAS dimensiones internas que bgCanvas
      overlay.width = img.naturalWidth;
      overlay.height = img.naturalHeight;
      this._overlayCanvas = overlay;
      this._bgCanvas = bgCanvas;
 
      // Detectar o restaurar piezas
      if (project.detectedParts?.length > 0) {
        this._parts = project.detectedParts.map(p => new DetectedPart(p));
        this._updatePartsUI(el);
        this._drawOverlay();
      } else {
        const detector = new ManualDetection();
        detector.detect(img).then(parts => {
          this._parts = parts;
          this._updatePartsUI(el);
          this._drawOverlay();
        });
      }
    };
    img.src = dataUrl;
  }
 
  _drawOverlay() {
    if (!this._overlayCanvas) return;
    const W = this._overlayCanvas.width;
    const H = this._overlayCanvas.height;
    const ctx = this._overlayCanvas.getContext('2d');
    ctx.clearRect(0, 0, W, H);
 
    this._parts.forEach(part => {
      const { x, y, w, h } = part.bounds;
      const px = x * W, py = y * H, pw = w * W, ph = h * H;
      const color = PART_COLORS[part.type] || '#c9a96e';
 
      ctx.save();
      if (!part.kept) {
        // Pieza excluida: relleno rojo semitransparente con tachado
        ctx.fillStyle = 'rgba(220,60,60,0.18)';
        ctx.fillRect(px, py, pw, ph);
        ctx.strokeStyle = 'rgba(220,60,60,0.6)';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 4]);
        ctx.strokeRect(px, py, pw, ph);
        // Cruz de exclusión
        ctx.strokeStyle = 'rgba(220,60,60,0.5)';
        ctx.lineWidth = 2;
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(px, py); ctx.lineTo(px + pw, py + ph);
        ctx.moveTo(px + pw, py); ctx.lineTo(px, py + ph);
        ctx.stroke();
      } else {
        ctx.strokeStyle = color;
        ctx.lineWidth = Math.max(2, W * 0.004);
        ctx.setLineDash([8, 4]);
        ctx.globalAlpha = 0.9;
        ctx.strokeRect(px, py, pw, ph);
 
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.1;
        ctx.fillRect(px, py, pw, ph);
 
        ctx.globalAlpha = 1;
        ctx.fillStyle = color;
        const fs = Math.max(11, W * 0.025);
        ctx.font = `bold ${fs}px system-ui`;
        ctx.shadowColor = '#000';
        ctx.shadowBlur = 4;
        ctx.fillText(part.label, px + 4, py + fs + 2);
      }
      ctx.restore();
    });
  }
 
  _updatePartsUI(el) {
    const list = el.querySelector('#parts-list');
    if (!list) return;
 
    const keptCount = this._parts.filter(p => p.kept).length;
 
    list.innerHTML = this._parts.map(p => {
      const color = PART_COLORS[p.type] || '#888';
      return `
        <div class="part-item" data-id="${p.id}" style="
          display:flex; align-items:center; gap:10px;
          padding:10px 12px; margin-bottom:6px;
          background:${p.kept ? color + '11' : 'rgba(220,60,60,0.07)'};
          border:1px solid ${p.kept ? color + '33' : 'rgba(220,60,60,0.25)'};
          border-radius:10px;
          transition: all 0.2s;
        ">
          <div style="
            width:10px; height:10px; border-radius:50%;
            background:${p.kept ? color : '#dc3c3c'};
            flex-shrink:0;
          "></div>
          <div style="flex:1; font-size:0.88rem; ${!p.kept ? 'text-decoration:line-through; color:var(--text-muted);' : ''}">
            ${p.label}
          </div>
          <div style="font-size:0.72rem; color:var(--text-muted); flex-shrink:0;">
            ${p.kept ? '✓ incluida' : '✗ excluida'}
          </div>
          <button class="btn btn-icon" data-action="toggle" data-id="${p.id}"
            style="font-size:1rem; padding:4px 8px; flex-shrink:0;"
            title="${p.kept ? 'Excluir del láser' : 'Incluir en el láser'}">
            ${p.kept ? '🗑' : '↩'}
          </button>
        </div>
      `;
    }).join('');
 
    // Aviso si no hay ninguna pieza incluida
    if (keptCount === 0) {
      list.innerHTML += `
        <div style="padding:10px; color:#e05c5c; font-size:0.8rem; text-align:center; background:rgba(224,92,92,0.08); border-radius:8px;">
          ⚠ No hay piezas incluidas. Añade o reactiva al menos una.
        </div>
      `;
    }
 
    // Eventos de toggle
    list.querySelectorAll('[data-action="toggle"]').forEach(btn => {
      btn.onclick = () => {
        const part = this._parts.find(p => p.id === btn.dataset.id);
        if (part) {
          part.kept = !part.kept;
          this._saveAndStay();       // guardar inmediatamente
          this._updatePartsUI(el);
          this._drawOverlay();
        }
      };
    });
  }
 
  _setupEvents(el) {
    el.querySelector('#btn-back').onclick = () => this.app.navigate('photo');
    el.querySelector('#btn-back2').onclick = () => this.app.navigate('photo');
    el.querySelector('#btn-save-detect').onclick = () => {
      this._saveAndStay();
      this.app.showToast('Guardado');
    };
 
    el.querySelector('#btn-add-part').onclick = () => {
      const label = prompt('Nombre de la pieza (ej: Pétalo):');
      if (!label) return;
      const newPart = new DetectedPart({
        label,
        type: 'other',
        bounds: { x: 0.1, y: 0.1, w: 0.8, h: 0.8 },
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
          b.className = 'btn ' + (b.dataset.mode === btn.dataset.mode ? 'btn-secondary' : 'btn-ghost');
        });
        el.querySelector('#mode-desc').textContent = MODE_DESCRIPTIONS[btn.dataset.mode];
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
