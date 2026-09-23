import { LEATHER_TYPES } from '../models/Material.js';
import { loadBlob } from '../storage/Storage.js';
 
// Colores bien diferenciados con nombre y hex
const QUICK_COLORS = [
  { name: 'Marrón claro',    hex: '#C68642' },
  { name: 'Marrón cuero',    hex: '#A0522D' },
  { name: 'Marrón oscuro',   hex: '#6B3A2A' },
  { name: 'Chocolate',       hex: '#3D1C02' },
  { name: 'Castaño',         hex: '#954535' },
  { name: 'Terracota',       hex: '#CC4E2A' },
  { name: 'Camel',           hex: '#C19A6B' },
  { name: 'Beige',           hex: '#E8D5B0' },
  { name: 'Arena',           hex: '#F2DEB0' },
  { name: 'Crema',           hex: '#F5F0E0' },
  { name: 'Blanco roto',     hex: '#FAF0DC' },
  { name: 'Dorado',          hex: '#C9A96E' },
  { name: 'Ocre',            hex: '#D4A017' },
  { name: 'Amarillo mostaza',hex: '#D4AC0D' },
  { name: 'Verde oliva',     hex: '#6B7A2E' },
  { name: 'Verde oscuro',    hex: '#2C4A2E' },
  { name: 'Azul marino',     hex: '#1A2A4A' },
  { name: 'Azul cobalto',    hex: '#1A3A6B' },
  { name: 'Granate',         hex: '#800020' },
  { name: 'Burdeos',         hex: '#5C0A1A' },
  { name: 'Rosa nude',       hex: '#E8B4A0' },
  { name: 'Nude natural',    hex: '#D4967A' },
  { name: 'Gris plata',      hex: '#9A9A9A' },
  { name: 'Gris antracita',  hex: '#3A3A3A' },
  { name: 'Negro',           hex: '#111111' },
  { name: 'Plata metálica',  hex: '#C0C0C0' },
  { name: 'Oro metálico',    hex: '#CFB53B' },
  { name: 'Bronce',          hex: '#8C6927' },
];
 
export class MaterialScreen {
  constructor(app) {
    this.app = app;
    this._previewCanvas = null;
  }
 
  render() {
    const project = this.app.currentProject;
    const mat = project.material || {};
    const color = mat.color || '#C68642';
    const type = mat.type || 'LISO';
 
    // Sugerir tamaño si no existe (basado en imagen detectada)
    const sugW = project.widthMm || this._estimateSize(project).w;
    const sugH = project.heightMm || this._estimateSize(project).h;
 
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
 
        <!-- Preview canvas con textura real -->
        <div class="section-title">Previsualización</div>
        <canvas id="mat-preview-canvas" style="
          width:100%; height:120px; border-radius:10px;
          border:1px solid rgba(255,255,255,0.08); display:block;
        "></canvas>
 
        <!-- Tipo de cuero -->
        <div class="section-title" style="margin-top:16px;">Tipo de cuero</div>
        <div class="type-grid" id="type-grid">
          ${LEATHER_TYPES.map(t => `
            <div class="type-item ${t === type ? 'selected' : ''}" data-type="${t}">${t.charAt(0)+t.slice(1).toLowerCase()}</div>
          `).join('')}
        </div>
 
        <!-- Color hex -->
        <div class="section-title" style="margin-top:16px;">Color</div>
        <div style="display:flex; gap:10px; align-items:center;">
          <input type="color" id="color-picker" value="${color}" style="width:52px; height:48px; border:none; border-radius:8px; cursor:pointer; padding:2px; background:transparent;">
          <div style="display:flex; align-items:center; gap:6px; flex:1; background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.12); border-radius:8px; padding:10px 12px;">
            <span style="color:var(--text-muted); font-size:0.9rem;">#</span>
            <input type="text" id="hex-input" value="${color.replace('#','')}" maxlength="6" placeholder="C68642"
              style="font-family:monospace; background:transparent; border:none; color:var(--text); font-size:1rem; outline:none; width:80px;">
          </div>
        </div>
 
        <!-- Colores rápidos mejorados -->
        <div class="section-title" style="margin-top:16px;">Colores rápidos</div>
        <div id="quick-colors" style="display:flex; flex-wrap:wrap; gap:6px;">
          ${QUICK_COLORS.map(({ hex, name }) => `
            <div class="quick-color-swatch" data-color="${hex}" title="${name}" style="
              width:36px; height:36px; border-radius:6px;
              background:${hex};
              border:2px solid rgba(255,255,255,0.15);
              cursor:pointer;
              box-shadow:0 1px 3px rgba(0,0,0,0.4);
              flex-shrink:0;
            "></div>
          `).join('')}
        </div>
 
        <!-- Medidas -->
        <div class="section-title" style="margin-top:20px;">
          Medidas de la pieza
          <span id="size-suggestion" style="font-size:0.72rem; color:var(--gold); margin-left:8px;"></span>
        </div>
        <div class="field-row">
          <div class="field">
            <label>Ancho (mm)</label>
            <input type="number" id="width-mm" min="5" max="200" step="0.5" value="${sugW || ''}">
          </div>
          <div class="field">
            <label>Alto (mm)</label>
            <input type="number" id="height-mm" min="5" max="200" step="0.5" value="${sugH || ''}">
          </div>
        </div>
        <label class="field-check">
          <input type="checkbox" id="lock-ratio" ${project.lockAspectRatio !== false ? 'checked' : ''}>
          <span>Mantener proporción</span>
        </label>
        ${!project.widthMm ? `
          <div style="font-size:0.75rem; color:var(--text-muted); margin-top:4px; padding:6px 10px; background:rgba(201,169,110,0.07); border-radius:6px;">
            💡 Tamaño sugerido basado en la detección. Ajusta según el tamaño real que quieres cortar.
          </div>
        ` : ''}
 
        <!-- Agujero -->
        <div class="section-title" style="margin-top:20px;">Agujero superior</div>
        <div class="field" style="max-width:150px;">
          <label>Diámetro (mm)</label>
          <input type="number" id="hole-diam" min="0.5" max="10" step="0.5" value="${project.holes?.[0]?.diametrMm || 2}">
        </div>
 
      </div>
 
      <div class="screen-footer">
        <div class="btn-row">
          <button class="btn btn-secondary" id="btn-back2">← Detectar</button>
          <button class="btn btn-primary" id="btn-next">Diseñar →</button>
        </div>
      </div>
    `;
 
    this._setupEvents(el, project, color, type);
    this._initPreviewCanvas(el, color, type);
    return el;
  }
 
  // Estima tamaño en mm basado en piezas detectadas
  _estimateSize(project) {
    const parts = project.selectedParts?.filter(p => p.kept) || project.detectedParts?.filter(p => p.kept) || [];
    const bodyPart = parts.find(p => p.type === 'body') || parts[0];
    if (bodyPart?.bounds) {
      // La pieza "cuerpo floral" suele medir entre 30-60mm, estimamos proporcionalmente
      const aspectH = bodyPart.bounds.h / (bodyPart.bounds.w || 1);
      return { w: 40, h: Math.round(40 * aspectH * 2) / 2 || 40 };
    }
    return { w: 40, h: 40 };
  }
 
  _initPreviewCanvas(el, color, type) {
    const canvas = el.querySelector('#mat-preview-canvas');
    const W = (canvas.offsetWidth || 340);
    canvas.width = W;
    canvas.height = 120;
    this._previewCanvas = canvas;
    this._renderPreview(canvas, color, type);
  }
 
  _renderPreview(canvas, color, type) {
    const W = canvas.width;
    const H = canvas.height;
    const ctx = canvas.getContext('2d');
 
    // Fondo oscuro
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, W, H);
 
    // Forma de pendiente simplificada (elipse centrada)
    const cx = W / 2, cy = H / 2;
    const rx = Math.min(W * 0.35, 120), ry = Math.min(H * 0.42, 50);
 
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.clip();
 
    // Color base
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, W, H);
 
    // Efecto según tipo
    this._applyEffect(ctx, type, color, cx - rx, cy - ry, rx * 2, ry * 2);
 
    ctx.restore();
 
    // Contorno dorado
    ctx.save();
    ctx.strokeStyle = '#c9a96e66';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
 
    // Etiqueta del tipo
    ctx.save();
    ctx.font = '600 11px system-ui';
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.textAlign = 'right';
    ctx.fillText(type, W - 8, H - 8);
    ctx.restore();
  }
 
  _applyEffect(ctx, type, baseColor, x, y, w, h) {
    switch (type) {
      case 'BRILLANTE': {
        const gloss = ctx.createLinearGradient(x, y, x + w * 0.7, y + h * 0.5);
        gloss.addColorStop(0, 'rgba(255,255,255,0.45)');
        gloss.addColorStop(0.4, 'rgba(255,255,255,0.1)');
        gloss.addColorStop(1, 'rgba(0,0,0,0.1)');
        ctx.fillStyle = gloss;
        ctx.fillRect(x, y, w, h);
        break;
      }
      case 'MATE': {
        this._addNoise(ctx, w * 2, h * 2, 4, 0.09);
        const vig = ctx.createRadialGradient(x + w/2, y + h/2, 0, x + w/2, y + h/2, Math.max(w, h));
        vig.addColorStop(0.6, 'rgba(0,0,0,0)');
        vig.addColorStop(1, 'rgba(0,0,0,0.25)');
        ctx.fillStyle = vig;
        ctx.fillRect(x, y, w, h);
        break;
      }
      case 'ANTE': {
        this._addNoise(ctx, w * 2, h * 2, 6, 0.13);
        // Tono cálido ligeramente más claro en el centro
        const soft = ctx.createRadialGradient(x + w/2, y + h/3, 0, x + w/2, y + h/2, Math.max(w, h) * 0.8);
        soft.addColorStop(0, 'rgba(255,220,180,0.12)');
        soft.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = soft;
        ctx.fillRect(x, y, w, h);
        break;
      }
      case 'METALIZADO': {
        const met = ctx.createLinearGradient(x, y, x + w, y + h);
        met.addColorStop(0, 'rgba(255,255,255,0.55)');
        met.addColorStop(0.25, 'rgba(255,255,255,0.15)');
        met.addColorStop(0.5, 'rgba(0,0,0,0.1)');
        met.addColorStop(0.75, 'rgba(255,255,255,0.2)');
        met.addColorStop(1, 'rgba(255,255,255,0.4)');
        ctx.fillStyle = met;
        ctx.fillRect(x, y, w, h);
        // Líneas de reflejo metálico
        ctx.strokeStyle = 'rgba(255,255,255,0.25)';
        ctx.lineWidth = 1;
        for (let i = 0; i < 3; i++) {
          ctx.beginPath();
          ctx.moveTo(x + w * 0.1 * i, y);
          ctx.lineTo(x + w * (0.1 * i + 0.3), y + h);
          ctx.stroke();
        }
        break;
      }
      case 'TEXTURIZADO': {
        this._addNoise(ctx, w * 2, h * 2, 3, 0.15);
        // Líneas de textura
        ctx.save();
        ctx.globalAlpha = 0.08;
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 1;
        for (let i = -h; i < w + h; i += 7) {
          ctx.beginPath();
          ctx.moveTo(x + i, y);
          ctx.lineTo(x + i - h, y + h);
          ctx.stroke();
        }
        ctx.restore();
        break;
      }
      case 'LISO':
      default: {
        const vig = ctx.createRadialGradient(x + w/2, y + h/2, 0, x + w/2, y + h/2, Math.max(w, h) * 0.7);
        vig.addColorStop(0, 'rgba(255,255,255,0.08)');
        vig.addColorStop(1, 'rgba(0,0,0,0.2)');
        ctx.fillStyle = vig;
        ctx.fillRect(x, y, w, h);
        break;
      }
    }
  }
 
  _addNoise(ctx, W, H, scale, alpha) {
    const tmp = document.createElement('canvas');
    tmp.width = Math.max(1, Math.ceil(W / scale));
    tmp.height = Math.max(1, Math.ceil(H / scale));
    const tCtx = tmp.getContext('2d');
    const d = tCtx.createImageData(tmp.width, tmp.height);
    for (let i = 0; i < d.data.length; i += 4) {
      const v = Math.random() * 255 | 0;
      d.data[i] = d.data[i+1] = d.data[i+2] = v;
      d.data[i+3] = 255;
    }
    tCtx.putImageData(d, 0, 0);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(tmp, 0, 0, W, H);
    ctx.restore();
  }
 
  _setupEvents(el, project, initColor, initType) {
    el.querySelector('#btn-back').onclick = () => this.app.navigate('detect');
    el.querySelector('#btn-back2').onclick = () => this.app.navigate('detect');
    el.querySelector('#btn-save-mat').onclick = () => { this._save(el); this.app.showToast('Guardado'); };
    el.querySelector('#btn-next').onclick = () => { this._save(el); this.app.navigate('design'); };
 
    const picker = el.querySelector('#color-picker');
    const hexInput = el.querySelector('#hex-input');
    let currentColor = initColor;
    let currentType = initType;
 
    const setColor = color => {
      currentColor = color;
      picker.value = color;
      hexInput.value = color.replace('#', '').toUpperCase();
      if (this._previewCanvas) this._renderPreview(this._previewCanvas, color, currentType);
    };
 
    const setType = type => {
      currentType = type;
      if (this._previewCanvas) this._renderPreview(this._previewCanvas, currentColor, type);
    };
 
    picker.oninput = () => setColor(picker.value);
    hexInput.oninput = () => {
      const v = '#' + hexInput.value.replace(/[^0-9a-fA-F]/g, '').slice(0, 6);
      if (v.length === 7) setColor(v);
    };
 
    // Swatches de color
    el.querySelectorAll('.quick-color-swatch').forEach(swatch => {
      swatch.onclick = () => {
        el.querySelectorAll('.quick-color-swatch').forEach(s => s.style.outline = 'none');
        swatch.style.outline = '2px solid #c9a96e';
        swatch.style.outlineOffset = '2px';
        setColor(swatch.dataset.color);
      };
    });
 
    // Tipo de cuero
    el.querySelectorAll('.type-item').forEach(item => {
      item.onclick = () => {
        el.querySelectorAll('.type-item').forEach(i => i.classList.remove('selected'));
        item.classList.add('selected');
        setType(item.dataset.type);
      };
    });
 
    // Proporción bloqueada
    const widthInput = el.querySelector('#width-mm');
    const heightInput = el.querySelector('#height-mm');
    const lockCheck = el.querySelector('#lock-ratio');
    let ratio = (parseFloat(widthInput.value) && parseFloat(heightInput.value))
      ? parseFloat(heightInput.value) / parseFloat(widthInput.value)
      : 1;
 
    widthInput.oninput = () => {
      if (lockCheck.checked && widthInput.value) {
        heightInput.value = (Math.round(parseFloat(widthInput.value) * ratio * 2) / 2).toFixed(1);
      }
    };
    heightInput.oninput = () => {
      if (lockCheck.checked && heightInput.value) {
        widthInput.value = (Math.round(parseFloat(heightInput.value) / ratio * 2) / 2).toFixed(1);
      }
    };
    widthInput.onchange = () => {
      if (parseFloat(widthInput.value)) ratio = parseFloat(heightInput.value) / parseFloat(widthInput.value);
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
 
