import { LEATHER_TYPES } from '../models/Material.js';

export class MaterialScreen {
  constructor(app) { this.app = app; }

  render() {
    const project = this.app.currentProject;
    const mat = project.material || {};
    const color = mat.color || '#c2845a';
    const type = mat.type || 'LISO';

    const el = document.createElement('div');
    el.className = 'screen';
    el.innerHTML = `
      <div class="screen-header">
        <button class="btn btn-icon" id="btn-back">←</button>
        <h1>③ MATERIAL</h1>
        <button class="btn btn-ghost" id="btn-save-mat" style="font-size:0.85rem;">Guardar</button>
      </div>
      <div class="step-bar">
        <div class="step-dot done"></div><div class="step-dot done"></div>
        <div class="step-dot active"></div>
        <div class="step-dot"></div><div class="step-dot"></div><div class="step-dot"></div>
      </div>

      <div class="screen-body">

        <div class="section-title">Previsualización</div>
        <div id="color-preview" class="color-preview" style="background:${color};"></div>

        <div class="section-title">Tipo de cuero</div>
        <div class="type-grid" id="type-grid">
          ${LEATHER_TYPES.map(t => `
            <div class="type-item ${t === type ? 'selected' : ''}" data-type="${t}">${t}</div>
          `).join('')}
        </div>

        <div class="section-title">Color</div>
        <div class="field">
          <input type="color" id="color-picker" value="${color}">
        </div>
        <div class="hex-row">
          <span style="color:var(--text-muted); font-size:0.9rem;">#</span>
          <input type="text" id="hex-input" value="${color.replace('#','')}" maxlength="6" placeholder="c2845a" style="font-family:monospace; background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.12); border-radius:var(--radius-sm); color:var(--text); font-size:1rem; padding:10px 12px; outline:none;">
        </div>

        <div class="section-title" style="margin-top:20px;">Colores rápidos</div>
        <div class="chip-group" id="quick-colors">
          ${[
            ['#c2845a','Marrón'],['#8B4513','Cuero marrón oscuro'],['#2C1810','Negro'],
            ['#F5DEB3','Beige'],['#CD853F','Castaño'],['#D2691E','Chocolate'],
            ['#800000','Granate'],['#c9a96e','Dorado'],['#808080','Gris'],
            ['#FFFFFF','Blanco'],
          ].map(([c, n]) => `<div class="chip quick-color" data-color="${c}" style="border-color:${c}33; background:${c}22; color:var(--text-muted);">
            <span style="display:inline-block; width:12px; height:12px; border-radius:50%; background:${c}; border:1px solid rgba(255,255,255,0.3); margin-right:4px; vertical-align:middle;"></span>
            ${n}
          </div>`).join('')}
        </div>

        <div class="section-title" style="margin-top:20px;">Medidas de la pieza</div>
        <div class="field-row">
          <div class="field">
            <label>Ancho (mm)</label>
            <input type="number" id="width-mm" min="5" max="200" step="0.5" value="${project.widthMm || ''}">
          </div>
          <div class="field">
            <label>Alto (mm)</label>
            <input type="number" id="height-mm" min="5" max="200" step="0.5" value="${project.heightMm || ''}">
          </div>
        </div>
        <label class="field-check">
          <input type="checkbox" id="lock-ratio" ${project.lockAspectRatio !== false ? 'checked' : ''}>
          <span>Mantener proporción</span>
        </label>

        <div class="section-title">Agujero superior</div>
        <div class="field" style="max-width:150px;">
          <label>Diámetro (mm)</label>
          <input type="number" id="hole-diam" min="1" max="10" step="0.5" value="${project.holes?.[0]?.diametrMm || 2}">
        </div>

      </div>

      <div class="screen-footer">
        <div class="btn-row">
          <button class="btn btn-secondary" id="btn-back2">← Detectar</button>
          <button class="btn btn-primary" id="btn-next">Diseñar →</button>
        </div>
      </div>
    `;

    this._setupEvents(el, project);
    return el;
  }

  _setupEvents(el, project) {
    el.querySelector('#btn-back').onclick = () => this.app.navigate('detect');
    el.querySelector('#btn-back2').onclick = () => this.app.navigate('detect');
    el.querySelector('#btn-save-mat').onclick = () => { this._save(el); this.app.showToast('Guardado'); };
    el.querySelector('#btn-next').onclick = () => { this._save(el); this.app.navigate('design'); };

    const preview = el.querySelector('#color-preview');
    const picker = el.querySelector('#color-picker');
    const hexInput = el.querySelector('#hex-input');

    const setColor = color => {
      preview.style.background = color;
      picker.value = color;
      hexInput.value = color.replace('#', '');
    };

    picker.oninput = () => setColor(picker.value);
    hexInput.oninput = () => {
      const v = '#' + hexInput.value.replace(/[^0-9a-fA-F]/g, '').slice(0, 6);
      if (v.length === 7) setColor(v);
    };

    el.querySelectorAll('.quick-color').forEach(chip => {
      chip.onclick = () => setColor(chip.dataset.color);
    });

    el.querySelectorAll('.type-item').forEach(item => {
      item.onclick = () => {
        el.querySelectorAll('.type-item').forEach(i => i.classList.remove('selected'));
        item.classList.add('selected');
      };
    });

    // Proporción bloqueada
    const widthInput = el.querySelector('#width-mm');
    const heightInput = el.querySelector('#height-mm');
    const lockCheck = el.querySelector('#lock-ratio');

    let ratio = (project.widthMm && project.heightMm) ? project.heightMm / project.widthMm : 1;

    widthInput.oninput = () => {
      if (lockCheck.checked && widthInput.value) {
        heightInput.value = Math.round(widthInput.value * ratio * 2) / 2;
      }
    };
    heightInput.oninput = () => {
      if (lockCheck.checked && heightInput.value) {
        widthInput.value = Math.round(heightInput.value / ratio * 2) / 2;
      }
    };
    widthInput.onchange = () => {
      ratio = heightInput.value / widthInput.value;
    };
  }

  _save(el) {
    const project = this.app.currentProject;
    const picker = el.querySelector('#color-picker');
    const type = el.querySelector('.type-item.selected')?.dataset.type || 'LISO';
    const w = parseFloat(el.querySelector('#width-mm').value);
    const h = parseFloat(el.querySelector('#height-mm').value);
    const lock = el.querySelector('#lock-ratio').checked;
    const holeDiam = parseFloat(el.querySelector('#hole-diam').value) || 2;

    project.material = { ...(project.material || {}), color: picker.value, type };
    if (w) project.widthMm = w;
    if (h) project.heightMm = h;
    project.lockAspectRatio = lock;
    project.holes = [{ id: 'h1', diametrMm: holeDiam, x: 0.5, y: 0.05 }];

    this.app.saveProject();
  }
}
