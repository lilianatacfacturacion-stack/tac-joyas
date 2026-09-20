/**
 * DesignEngine
 * Extrae silueta exterior, dibujo interior y agujeros de la imagen original.
 * V1: operaciones sobre canvas 2D (raster).
 * La interfaz está preparada para sustituir por SVG/path en V2.
 */
export class DesignEngine {
  /**
   * Extrae el contorno de corte (silueta exterior) a partir de un canvas con la imagen.
   * Devuelve un canvas con fondo blanco y negro = contorno.
   * @param {HTMLCanvasElement} src
   * @param {object} opts
   * @returns {HTMLCanvasElement}
   */
  extractCutContour(src, opts = {}) {
    const { threshold = 30, blur = 1 } = opts;
    const W = src.width, H = src.height;
    const dst = createCanvas(W, H);
    const ctx = dst.getContext('2d');

    const srcCtx = src.getContext('2d');
    const imgData = srcCtx.getImageData(0, 0, W, H);
    const { data } = imgData;

    // Fondo blanco
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, W, H);

    // Canny simplificado: detección de diferencia con borde
    const out = ctx.createImageData(W, H);
    const o = out.data;

    const sobelX = [-1,0,1,-2,0,2,-1,0,1];
    const sobelY = [-1,-2,-1,0,0,0,1,2,1];

    for (let y = 1; y < H-1; y++) {
      for (let x = 1; x < W-1; x++) {
        let gx = 0, gy = 0;
        for (let ky = -1; ky <= 1; ky++) {
          for (let kx = -1; kx <= 1; kx++) {
            const idx = ((y+ky)*W + (x+kx)) * 4;
            const luma = (data[idx]*0.299 + data[idx+1]*0.587 + data[idx+2]*0.114);
            const ki = (ky+1)*3 + (kx+1);
            gx += luma * sobelX[ki];
            gy += luma * sobelY[ki];
          }
        }
        const mag = Math.sqrt(gx*gx + gy*gy);
        const i = (y*W+x)*4;
        const v = mag > threshold ? 0 : 255;
        o[i] = o[i+1] = o[i+2] = v;
        o[i+3] = 255;
      }
    }

    ctx.putImageData(out, 0, 0);
    if (blur > 0) this._blur(ctx, W, H, blur);
    return dst;
  }

  /**
   * Extrae el dibujo interior (líneas de grabado).
   * @param {HTMLCanvasElement} src
   * @param {object} opts
   * @returns {HTMLCanvasElement}
   */
  extractEngravingLines(src, opts = {}) {
    const { threshold = 60, invert = true } = opts;
    const W = src.width, H = src.height;
    const dst = createCanvas(W, H);
    const ctx = dst.getContext('2d');

    const srcCtx = src.getContext('2d');
    const imgData = srcCtx.getImageData(0, 0, W, H);
    const { data } = imgData;

    const out = ctx.createImageData(W, H);
    const o = out.data;

    // Umbralización + Sobel para líneas finas
    const sobelX = [-1,0,1,-2,0,2,-1,0,1];
    const sobelY = [-1,-2,-1,0,0,0,1,2,1];

    for (let y = 1; y < H-1; y++) {
      for (let x = 1; x < W-1; x++) {
        let gx = 0, gy = 0;
        for (let ky = -1; ky <= 1; ky++) {
          for (let kx = -1; kx <= 1; kx++) {
            const idx = ((y+ky)*W + (x+kx)) * 4;
            const luma = (data[idx]*0.299 + data[idx+1]*0.587 + data[idx+2]*0.114);
            const ki = (ky+1)*3 + (kx+1);
            gx += luma * sobelX[ki];
            gy += luma * sobelY[ki];
          }
        }
        const mag = Math.sqrt(gx*gx + gy*gy);
        const i = (y*W+x)*4;
        let v = mag > threshold ? 0 : 255;
        if (invert) v = 255 - v;
        o[i] = o[i+1] = o[i+2] = v;
        o[i+3] = 255;
      }
    }

    // Fondo blanco
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, W, H);
    ctx.putImageData(out, 0, 0);
    return dst;
  }

  /**
   * Operación suavizar: gaussian blur suave sobre canvas.
   */
  applySmooth(canvas) {
    const ctx = canvas.getContext('2d');
    this._blur(ctx, canvas.width, canvas.height, 1.5);
    return canvas;
  }

  /**
   * Operación simplificar: posterización (reduce tonos intermedios a B/N).
   */
  applySimplify(canvas, threshold = 128) {
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    const d = ctx.getImageData(0, 0, W, H);
    const px = d.data;
    for (let i = 0; i < px.length; i += 4) {
      const luma = px[i]*0.299 + px[i+1]*0.587 + px[i+2]*0.114;
      const v = luma < threshold ? 0 : 255;
      px[i] = px[i+1] = px[i+2] = v;
    }
    ctx.putImageData(d, 0, 0);
    return canvas;
  }

  // ── Privado ──────────────────────────────────────────────────────────────────

  _blur(ctx, W, H, radius) {
    // Box blur simple 3x3 aplicado N veces
    const passes = Math.round(radius);
    for (let p = 0; p < passes; p++) {
      const d = ctx.getImageData(0, 0, W, H);
      const src = new Uint8ClampedArray(d.data);
      const out = d.data;
      for (let y = 1; y < H-1; y++) {
        for (let x = 1; x < W-1; x++) {
          for (let c = 0; c < 3; c++) {
            let sum = 0;
            for (let dy = -1; dy <= 1; dy++)
              for (let dx = -1; dx <= 1; dx++)
                sum += src[((y+dy)*W+(x+dx))*4+c];
            out[(y*W+x)*4+c] = sum / 9;
          }
          out[(y*W+x)*4+3] = 255;
        }
      }
      ctx.putImageData(d, 0, 0);
    }
  }
}

function createCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}
