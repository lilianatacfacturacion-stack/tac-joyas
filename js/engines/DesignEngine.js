// js/engines/DesignEngine.js

class DesignEngine {
  /**
   * Extract engraving lines using Sobel edge detection.
   * If opts.silhouetteMask is provided (white=object, black=bg),
   * pixels outside the object are set to white (no engraving).
   *
   * @param {HTMLImageElement|HTMLCanvasElement} src
   * @param {Object} opts
   * @param {number} [opts.threshold=60]      - Sobel magnitude threshold (0-255)
   * @param {HTMLCanvasElement} [opts.silhouetteMask] - optional mask canvas
   * @returns {HTMLCanvasElement}
   */
  extractEngravingLines(src, opts = {}) {
    const threshold = opts.threshold ?? 60;
    const mask = opts.silhouetteMask ?? null;

    const W = src.naturalWidth || src.width;
    const H = src.naturalHeight || src.height;

    // Read source pixels
    const srcCanvas = document.createElement('canvas');
    srcCanvas.width = W; srcCanvas.height = H;
    const srcCtx = srcCanvas.getContext('2d');
    srcCtx.drawImage(src, 0, 0);
    const srcData = srcCtx.getImageData(0, 0, W, H).data;

    // Read mask pixels if provided
    let maskData = null;
    if (mask) {
      const mCtx = mask.getContext('2d');
      maskData = mCtx.getImageData(0, 0, W, H).data;
    }

    // Compute greyscale
    const grey = new Float32Array(W * H);
    for (let i = 0; i < W * H; i++) {
      const r = srcData[i * 4];
      const g = srcData[i * 4 + 1];
      const b = srcData[i * 4 + 2];
      grey[i] = 0.299 * r + 0.587 * g + 0.114 * b;
    }

    // Sobel
    const out = document.createElement('canvas');
    out.width = W; out.height = H;
    const outCtx = out.getContext('2d');
    const outImg = outCtx.createImageData(W, H);
    const o = outImg.data;

    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = y * W + x;

        // If mask says this pixel is background → white output (no engraving)
        if (maskData && maskData[i * 4] === 0) {
          o[i * 4 + 0] = 255;
          o[i * 4 + 1] = 255;
          o[i * 4 + 2] = 255;
          o[i * 4 + 3] = 255;
          continue;
        }

        // Border pixels → white
        if (x === 0 || x === W - 1 || y === 0 || y === H - 1) {
          o[i * 4 + 0] = 255;
          o[i * 4 + 1] = 255;
          o[i * 4 + 2] = 255;
          o[i * 4 + 3] = 255;
          continue;
        }

        const tl = grey[(y-1)*W+(x-1)], tc = grey[(y-1)*W+x], tr = grey[(y-1)*W+(x+1)];
        const ml = grey[y*W+(x-1)],                            mr = grey[y*W+(x+1)];
        const bl = grey[(y+1)*W+(x-1)], bc = grey[(y+1)*W+x], br = grey[(y+1)*W+(x+1)];

        const gx = -tl - 2*ml - bl + tr + 2*mr + br;
        const gy = -tl - 2*tc - tr + bl + 2*bc + br;
        const mag = Math.sqrt(gx*gx + gy*gy);

        // Invert: edges = black, smooth areas = white
        const v = mag > threshold ? 0 : 255;
        o[i * 4 + 0] = v;
        o[i * 4 + 1] = v;
        o[i * 4 + 2] = v;
        o[i * 4 + 3] = 255;
      }
    }

    outCtx.putImageData(outImg, 0, 0);
    return out;
  }

  /**
   * Extract cut contour.
   * If src has alpha channel (PNG without background), threshold alpha directly
   * for a clean silhouette edge — much cleaner than Sobel on an alpha-masked image.
   * Otherwise fall back to Sobel with a low threshold.
   *
   * @param {HTMLImageElement|HTMLCanvasElement} src
   * @param {Object} opts
   * @param {number} [opts.threshold=30]
   * @returns {HTMLCanvasElement}
   */
  extractCutContour(src, opts = {}) {
    const threshold = opts.threshold ?? 30;

    const W = src.naturalWidth || src.width;
    const H = src.naturalHeight || src.height;

    const tmp = document.createElement('canvas');
    tmp.width = W; tmp.height = H;
    const tCtx = tmp.getContext('2d');
    tCtx.drawImage(src, 0, 0);
    const srcData = tCtx.getImageData(0, 0, W, H);
    const pixels = srcData.data;

    // Check if image has meaningful alpha
    let hasAlpha = false;
    for (let i = 3; i < pixels.length; i += 4) {
      if (pixels[i] < 245) { hasAlpha = true; break; }
    }

    const out = document.createElement('canvas');
    out.width = W; out.height = H;
    const outCtx = out.getContext('2d');
    const outImg = outCtx.createImageData(W, H);
    const o = outImg.data;

    // Fill white
    for (let i = 0; i < W * H; i++) {
      o[i*4]=255; o[i*4+1]=255; o[i*4+2]=255; o[i*4+3]=255;
    }

    if (hasAlpha) {
      // Build object mask from alpha, then find boundary pixels
      const isMask = new Uint8Array(W * H);
      for (let i = 0; i < W * H; i++) {
        isMask[i] = pixels[i * 4 + 3] > 10 ? 1 : 0;
      }
      for (let y = 1; y < H - 1; y++) {
        for (let x = 1; x < W - 1; x++) {
          const i = y * W + x;
          if (!isMask[i]) continue;
          const isEdge = !isMask[(y-1)*W+x] || !isMask[(y+1)*W+x]
                      || !isMask[y*W+(x-1)] || !isMask[y*W+(x+1)];
          if (isEdge) {
            o[i*4]=0; o[i*4+1]=0; o[i*4+2]=0; o[i*4+3]=255;
          }
        }
      }
    } else {
      // Sobel with low threshold
      const grey = new Float32Array(W * H);
      for (let i = 0; i < W * H; i++) {
        grey[i] = 0.299*pixels[i*4] + 0.587*pixels[i*4+1] + 0.114*pixels[i*4+2];
      }
      for (let y = 1; y < H - 1; y++) {
        for (let x = 1; x < W - 1; x++) {
          const i = y * W + x;
          const tl=grey[(y-1)*W+(x-1)], tc=grey[(y-1)*W+x], tr=grey[(y-1)*W+(x+1)];
          const ml=grey[y*W+(x-1)],                          mr=grey[y*W+(x+1)];
          const bl=grey[(y+1)*W+(x-1)], bc=grey[(y+1)*W+x], br=grey[(y+1)*W+(x+1)];
          const gx = -tl-2*ml-bl+tr+2*mr+br;
          const gy = -tl-2*tc-tr+bl+2*bc+br;
          const mag = Math.sqrt(gx*gx+gy*gy);
          if (mag > threshold) {
            o[i*4]=0; o[i*4+1]=0; o[i*4+2]=0; o[i*4+3]=255;
          }
        }
      }
    }

    outCtx.putImageData(outImg, 0, 0);
    return out;
  }

  /**
   * Apply a single 3×3 box blur pass in-place on a canvas.
   */
  applySmooth(canvas) {
    const W = canvas.width, H = canvas.height;
    this._blur(canvas.getContext('2d'), W, H, 1);
  }

  /**
   * Posterize to pure B/W in-place.
   */
  applySimplify(canvas, threshold = 128) {
    const ctx = canvas.getContext('2d');
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const v = (d[i] + d[i+1] + d[i+2]) / 3 > threshold ? 255 : 0;
      d[i] = d[i+1] = d[i+2] = v;
    }
    ctx.putImageData(img, 0, 0);
  }

  _blur(ctx, W, H, passes) {
    for (let p = 0; p < passes; p++) {
      const img = ctx.getImageData(0, 0, W, H);
      const src = img.data;
      const dst = new Uint8ClampedArray(src.length);
      for (let y = 1; y < H - 1; y++) {
        for (let x = 1; x < W - 1; x++) {
          for (let c = 0; c < 3; c++) {
            let s = 0;
            for (let dy = -1; dy <= 1; dy++) {
              for (let dx = -1; dx <= 1; dx++) {
                s += src[((y+dy)*W+(x+dx))*4+c];
              }
            }
            dst[(y*W+x)*4+c] = s / 9;
          }
          dst[(y*W+x)*4+3] = 255;
        }
      }
      img.data.set(dst);
      ctx.putImageData(img, 0, 0);
    }
  }
}

export const designEngine = new DesignEngine();
