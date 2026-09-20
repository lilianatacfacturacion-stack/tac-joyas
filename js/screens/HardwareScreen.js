import { HARDWARE_TYPES, HARDWARE_FINISHES } from '../models/Hardware.js';

export class HardwareScreen {
  constructor(app) { this.app = app; }

  render() {
    const project = this.app.currentProject;
    const selHw = project.hardware?.[0] || { categoria: 'BARRA', acabado: 'DORADO' };

    const el = document.createElement('div');
    el.className = 'screen';
    el.innerHTML = `
      <div class="screen-header">
        <button class="btn btn-icon" id="btn-back">←</button>
        <h1>⑤ HERRAJES</h1>
        <button class="btn btn-ghost" id="btn-save-hw" style="font-size:0.85rem;">Guardar</button>
      </div>
      <div class="step-bar">
        <div class="step-dot done"></div><div class="step-dot done"></div>
        <div class="step-dot done"></div><div class="step-dot done"></div>
        <div class="step-dot active"></div><div class="step-dot"></div>
      </div>

      <div class="screen-body">

        <div class="section-title">Tipo de herraje</div>
        <div class="hardware-grid" id="hw-grid">
          ${HARDWARE_TYPES.map(hw => `
            <div class="hardware-item ${hw.id === selHw.categoria ? 'selected' : ''}" data-hw="${hw.id}">
              <span class="icon">${hw.icon}</span>
              <span>${hw.label}</span>
            </div>
          `).join('')}
        </div>

        <div class="section-title" style="margin-top:16px;">Acabado</div>
        <div class="finish-grid" id="finish-grid">
          ${HARDWARE_FINISHES.map(f => `
            <div class="finish-item ${f.id === selHw.acabado ? 'selected' : ''}" data-finish="${f.id}" style="${f.id === selHw.acabado ? `border-color:${f.color}; color:${f.color};` : ''}">
              <span style="display:inline-block; width:10px; height:10px; border-radius:50%; background:${f.color}; margin-right:4px; vertical-align:middle;"></span>
              ${f.label}
            </div>
          `).join('')}
        </div>

        <div class="section-title" style="margin-top:20px;">Preview con herraje</div>
        <div style="background:var(--bg2); border-radius:var(--radius); padding:20px; text-align:center;">
          <div id="hw-preview" style="font-size:3rem; margin-bottom:8px;">
            ${this._getPreviewEmoji(selHw.categoria, selHw.acabado)}
          </div>
          <div style="font-size:0.8rem; color:var(--text-muted);" id="hw-preview-label">
            ${this._getLabel(selHw.categoria, selHw.acabado)}
          </div>
        </div>

        <div class="section-title" style="margin-top:20px;">Medidas del herraje (opcional)</div>
        <div class="field-row">
          <div class="field">
            <label>Ancho (mm)</label>
            <input type="number" id="hw-width" min="1" max="100" step="0.5" value="${selHw.anchoMm || ''}">
          </div>
          <div class="field">
            <label>Alto (mm)</label>
            <input type="number" id="hw-height" min="1" max="100" step="0.5" value="${selHw.altoMm || ''}">
          </div>
        </div>

        <div class="field">
          <label>Notas</label>
          <input type="text" id="hw-notes" value="${selHw.notas || ''}" placeholder="Ej: barra dorada 20mm tipo clip">
        </div>

      </div>

      <div class="screen-footer">
        <div class="btn-row">
          <button class="btn btn-secondary" id="btn-back2">← Diseñar</button>
          <button class="btn btn-primary" id="btn-next">Ver resultado →</button>
        </div>
      </div>
    `;

    this._setupEvents(el, project, selHw);
    return el;
  }

  _setupEvents(el, project, selHw) {
    el.querySelector('#btn-back').onclick = () => this.app.navigate('design');
    el.querySelector('#btn-back2').onclick = () => this.app.navigate('design');
    el.querySelector('#btn-save-hw').onclick = () => { this._save(el); this.app.showToast('Guardado'); };
    el.querySelector('#btn-next').onclick = () => { this._save(el); this.app.navigate('result'); };

    let currentHw = selHw.categoria;
    let currentFinish = selHw.acabado;

    const updatePreview = () => {
      const previewEl = el.querySelector('#hw-preview');
      const labelEl = el.querySelector('#hw-preview-label');
      if (previewEl) previewEl.textContent = this._getPreviewEmoji(currentHw, currentFinish);
      if (labelEl) labelEl.textContent = this._getLabel(currentHw, currentFinish);
    };

    el.querySelectorAll('.hardware-item').forEach(item => {
      item.onclick = () => {
        currentHw = item.dataset.hw;
        el.querySelectorAll('.hardware-item').forEach(i => i.classList.remove('selected'));
        item.classList.add('selected');
        updatePreview();
      };
    });

    el.querySelectorAll('.finish-item').forEach(item => {
      item.onclick = () => {
        currentFinish = item.dataset.finish;
        el.querySelectorAll('.finish-item').forEach(i => {
          i.classList.remove('selected');
          i.style.borderColor = '';
          i.style.color = '';
        });
        item.classList.add('selected');
        const finishData = HARDWARE_FINISHES.find(f => f.id === currentFinish);
        if (finishData) { item.style.borderColor = finishData.color; item.style.color = finishData.color; }
        updatePreview();
      };
    });
  }

  _save(el) {
    const project = this.app.currentProject;
    const hwType = el.querySelector('.hardware-item.selected')?.dataset.hw || 'BARRA';
    const finish = el.querySelector('.finish-item.selected')?.dataset.finish || 'DORADO';
    const hwW = parseFloat(el.querySelector('#hw-width').value) || null;
    const hwH = parseFloat(el.querySelector('#hw-height').value) || null;
    const notes = el.querySelector('#hw-notes').value;

    project.hardware = [{
      id: 'hw1',
      categoria: hwType,
      acabado: finish,
      nombre: `${hwType} ${finish}`,
      anchoMm: hwW,
      altoMm: hwH,
      notas: notes,
    }];
    this.app.saveProject();
  }

  _getPreviewEmoji(categoria, acabado) {
    const icons = { GANCHO:'🪝', POSTE:'📌', ARO:'⭕', BARRA:'➖', ANILLA:'🔗', CADENA:'⛓️', CONECTOR:'🔩', COLGANTE:'💎', OTRO:'✨' };
    const finishEmoji = { DORADO:'✨', ORO_ROSA:'🌸', PLATA:'🔘', ACERO:'⚙️', NEGRO:'🖤', OTRO:'' };
    return (icons[categoria] || '✨') + ' ' + (finishEmoji[acabado] || '');
  }

  _getLabel(categoria, acabado) {
    const hwLabel = HARDWARE_TYPES.find(h => h.id === categoria)?.label || categoria;
    const fLabel = HARDWARE_FINISHES.find(f => f.id === acabado)?.label || acabado;
    return `${hwLabel} · ${fLabel}`;
  }
}
