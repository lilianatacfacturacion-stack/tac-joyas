import { saveBlob } from '../storage/Storage.js';

export class PhotoScreen {
  constructor(app) {
    this.app = app;
    this._img = null;
    this._scale = 1;
    this._offsetX = 0;
    this._offsetY = 0;
    this._rotation = 0;
    this._pinchDist = null;
    this._lastPan = null;
  }

  render() {
    const el = document.createElement('div');
    el.className = 'screen';
    el.innerHTML = `
      <div class="screen-header">
        <button class="btn btn-icon" id="btn-back">←</button>
        <h1>① FOTO</h1>
        <button class="btn btn-ghost" id="btn-save-photo" style="display:none;">Usar →</button>
      </div>
      <div class="step-bar">
        <div class="step-dot active"></div>
        <div class="step-dot"></div><div class="step-dot"></div>
        <div class="step-dot"></div><div class="step-dot"></div><div class="step-dot"></div>
      </div>

      <div class="screen-body" id="photo-body">
        <div class="photo-actions" id="photo-choose">
          <div class="photo-action-btn" id="btn-camera">
            <div class="icon">📷</div>
            <span>Hacer Foto</span>
          </div>
          <div class="photo-action-btn" id="btn-gallery">
            <div class="icon">🖼️</div>
            <span>Elegir Imagen</span>
          </div>
        </div>
        <div class="photo-preview-wrap" id="photo-preview" style="display:none; flex:1;">
          <div class="photo-canvas-container" id="canvas-container">
            <canvas id="photo-canvas"></canvas>
          </div>
          <div class="photo-tools">
            <button class="btn btn-icon" id="btn-rotate" title="Rotar 90°">↻</button>
            <button class="btn btn-secondary btn-icon" id="btn-reset" title="Restablecer">⊡</button>
            <button class="btn btn-ghost" id="btn-change">Cambiar foto</button>
          </div>
        </div>
      </div>

      <div class="screen-footer" id="photo-footer" style="display:none;">
        <div class="btn-row">
          <button class="btn btn-secondary" id="btn-back2">← Atrás</button>
          <button class="btn btn-primary" id="btn-next-detect">Detectar piezas →</button>
        </div>
      </div>

      <input type="file" id="file-input" accept="image/*" style="display:none;" capture="environment">
      <input type="file" id="gallery-input" accept="image/*" style="display:none;">
    `;

    this._setupEvents(el);
    return el;
  }

  _setupEvents(el) {
    el.querySelector('#btn-back').onclick = () => this.app.navigate('home');
    el.querySelector('#btn-back2').onclick = () => this.app.navigate('home');

    const fileInput = el.querySelector('#file-input');
    const galleryInput = el.querySelector('#gallery-input');

    el.querySelector('#btn-camera').onclick = () => fileInput.click();
    el.querySelector('#btn-gallery').onclick = () => galleryInput.click();

    fileInput.onchange = e => this._loadFile(e.target.files[0], el);
    galleryInput.onchange = e => this._loadFile(e.target.files[0], el);

    el.querySelector('#btn-rotate').onclick = () => {
      this._rotation = (this._rotation + 90) % 360;
      this._drawCanvas(el);
    };

    el.querySelector('#btn-reset').onclick = () => {
      this._scale = 1; this._offsetX = 0; this._offsetY = 0; this._rotation = 0;
      this._fitToContainer(el);
      this._drawCanvas(el);
    };

    el.querySelector('#btn-change').onclick = () => {
      this._img = null;
      el.querySelector('#photo-choose').style.display = '';
      el.querySelector('#photo-preview').style.display = 'none';
      el.querySelector('#photo-footer').style.display = 'none';
    };

    el.querySelector('#btn-next-detect').onclick = () => this._saveAndContinue(el);

    // Touch/mouse para zoom y pan
    this._setupCanvasInteraction(el);
  }

  _loadFile(file, el) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        this._img = img;
        this._rotation = 0;
        this._scale = 1;
        this._offsetX = 0;
        this._offsetY = 0;

        el.querySelector('#photo-choose').style.display = 'none';
        el.querySelector('#photo-preview').style.display = 'flex';
        el.querySelector('#photo-footer').style.display = '';

        this._fitToContainer(el);
        this._drawCanvas(el);
      };
      img.src = e.target.result;
      this._originalDataUrl = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  _fitToContainer(el) {
    const container = el.querySelector('#canvas-container');
    const rect = container.getBoundingClientRect();
    const CW = rect.width || 360;
    const CH = rect.height || 400;

    const canvas = el.querySelector('#photo-canvas');
    canvas.width = CW;
    canvas.height = CH;

    if (!this._img) return;
    const iw = (this._rotation % 180 === 0) ? this._img.naturalWidth : this._img.naturalHeight;
    const ih = (this._rotation % 180 === 0) ? this._img.naturalHeight : this._img.naturalWidth;
    this._scale = Math.min(CW / iw, CH / ih) * 0.9;
  }

  _drawCanvas(el) {
    const canvas = el.querySelector('#photo-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);

    if (!this._img) return;

    ctx.save();
    ctx.translate(W/2 + this._offsetX, H/2 + this._offsetY);
    ctx.rotate(this._rotation * Math.PI / 180);
    ctx.scale(this._scale, this._scale);

    const iw = this._img.naturalWidth, ih = this._img.naturalHeight;
    ctx.drawImage(this._img, -iw/2, -ih/2, iw, ih);
    ctx.restore();
  }

  _setupCanvasInteraction(el) {
    let canvas;
    const getCanvas = () => canvas || (canvas = el.querySelector('#photo-canvas'));

    // Pinch zoom
    const onTouchStart = e => {
      if (e.touches.length === 2) {
        this._pinchDist = this._getTouchDist(e);
      } else if (e.touches.length === 1) {
        this._lastPan = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      }
    };
    const onTouchMove = e => {
      e.preventDefault();
      if (e.touches.length === 2) {
        const dist = this._getTouchDist(e);
        if (this._pinchDist) {
          this._scale *= dist / this._pinchDist;
          this._scale = Math.max(0.2, Math.min(8, this._scale));
        }
        this._pinchDist = dist;
        this._drawCanvas(el);
      } else if (e.touches.length === 1 && this._lastPan) {
        this._offsetX += e.touches[0].clientX - this._lastPan.x;
        this._offsetY += e.touches[0].clientY - this._lastPan.y;
        this._lastPan = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        this._drawCanvas(el);
      }
    };
    const onTouchEnd = () => { this._pinchDist = null; this._lastPan = null; };

    // Wheel zoom (desktop)
    const onWheel = e => {
      e.preventDefault();
      this._scale *= e.deltaY < 0 ? 1.1 : 0.9;
      this._scale = Math.max(0.2, Math.min(8, this._scale));
      this._drawCanvas(el);
    };

    const container = el.querySelector('#canvas-container');
    container.addEventListener('touchstart', onTouchStart, { passive: false });
    container.addEventListener('touchmove', onTouchMove, { passive: false });
    container.addEventListener('touchend', onTouchEnd);
    container.addEventListener('wheel', onWheel, { passive: false });
  }

  _getTouchDist(e) {
    const dx = e.touches[0].clientX - e.touches[1].clientX;
    const dy = e.touches[0].clientY - e.touches[1].clientY;
    return Math.sqrt(dx*dx + dy*dy);
  }

  async _saveAndContinue(el) {
    if (!this._img || !this._originalDataUrl) return;
    const btn = el.querySelector('#btn-next-detect');
    btn.textContent = 'Guardando…';
    btn.disabled = true;

    const project = this.app.currentProject;
    project.imageId = project.imageId || `img_${project.id}`;
    project.imageWidth = this._img.naturalWidth;
    project.imageHeight = this._img.naturalHeight;
    project.imageRotation = this._rotation;

    await saveBlob(project.imageId, this._originalDataUrl);
    this.app.saveProject();
    this.app.navigate('detect');
  }
}
