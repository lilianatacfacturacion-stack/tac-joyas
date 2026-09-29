// js/engines/DesignEngine.js

class DesignEngine {
  /**
   * Extract engraving lines from a relief/texture image.
   *
   * Strategy: adaptive local contrast thresholding.
   * The dark grooves of a clay/leather relief are DARKER than their
   * surrounding area. We find those dark valleys by comparing each pixel
   * to its local neighbourhood average. Pixels significantly darker than
   * their surroundings → engraving line (black). Bright flat areas → white.
   *
   * This works far better than plain Sobel on gradual-contrast relief images.
   *
   * @param {HTMLImageElement|HTMLCanvasElement} src
   * @param {Object} opts
   * @param {number} [opts.threshold=18]        local darkness offset (lower = more lines)
   * @param {number} [opts.blurRadius=8]        local average radius in pixels
   * @param {HTMLCanvasElement} [opts.silhouetteMask]  white=object, black=bg
   * @returns {HTMLCanvasElement}  black lines on white background
   */
  extractEngravingLines(src, opts = {}) {
    const threshold  = opts.threshold  ?? 18;
    const blurRadius = opts.blurRadius ?? 8;
    const mask       = opts.silhouetteMask ?? null;

    const W = src.naturalWidth  || src.width;
    const H = src.naturalHeight || src.height;

    // -- read source pixels --
    const srcCanvas = document.createElement('canvas');
    srcCanvas.width = W; srcCanvas.height = H;
    const srcCtx = srcCanvas.getContext('2d');
    srcCtx.drawImage(src, 0, 0);
    const srcPx = srcCtx.getImageData(0, 0, W, H).data;

    // -- read mask --
    let maskPx = null;
    if (mask) {
      maskPx = mask.getContext('2d').getImageData(0, 0, W, H).data;
    }

    // -- greyscale --
    const grey = new Float32Array(W * H);
    for (let i = 0; i < W * H; i++) {
      grey[i] = 0.299 * srcPx[i*4] + 0.587 * srcPx[i*4+1] + 0.114 * srcPx[i*4+2];
    }

    // -- box blur to get local average (SAT method for speed) --
    const local = this._boxBlurFloat(grey, W, H, blurRadius);

    // -- output --
    const out    = document.createElement('canvas');
    out.width = W; out.height = H;
    const outCtx = out.getContext('2d');
    const outImg = outCtx.createImageData(W, H);
    const o      = outImg.data;

    for (let i = 0; i < W * H; i++) {
      // pixels outside object mask → white
      if (maskPx && maskPx[i*4] === 0) {
        o[i*4]=255; o[i*4+1]=255; o[i*4+2]=255; o[i*4+3]=255;
        continue;
      }

      // dark groove: pixel is darker than local average by threshold
      const isDark = (local[i] - grey[i]) > threshold;
      const v = isDark ? 0 : 255;
      o[i*4]=v; o[i*4+1]=v; o[i*4+2]=v; o[i*4+3]=255;
    }

    outCtx.putImageData(outImg, 0, 0);
    return out;
  }

  /**
   * Box blur on a Float32Array using summed-area table. Fast O(WH).
   */
  _boxBlurFloat(grey, W, H, r) {
    // Build SAT
    const sat = new Float64Array((W+1) * (H+1));
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        sat[(y+1)*(W+1)+(x+1)] =
          grey[y*W+x]
          + sat[y*(W+1)+(x+1)]
          + sat[(y+1)*(W+1)+x]
          - sat[y*(W+1)+x];
      }
    }
    const out = new Float32Array(W * H);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const x0 = Math.max(0, x-r),   y0 = Math.max(0, y-r);
        const x1 = Math.min(W-1, x+r), y1 = Math.min(H-1, y+r);
        const area = (x1-x0+1) * (y1-y0+1);
        const sum  = sat[(y1+1)*(W+1)+(x1+1)]
                   - sat[y0*(W+1)+(x1+1)]
                   - sat[(y1+1)*(W+1)+x0]
                   + sat[y0*(W+1)+x0];
        out[y*W+x] = sum / area;
      }
    }
    return out;
  }

  /**
   * Extract cut contour.
   * With alpha PNG → boundary of the alpha mask.
   * Without alpha → Sobel with low threshold on greyscale.
   */
  extractCutContour(src, opts = {}) {
    const threshold = opts.threshold ?? 30;
    const W = src.naturalWidth || src.width;
    const H = src.naturalHeight || src.height;

    const tmp = document.createElement('canvas');
    tmp.width = W; tmp.height = H;
    const tCtx = tmp.getContext('2d');
    tCtx.drawImage(src, 0, 0);
    const pixels = tCtx.getImageData(0, 0, W, H).data;

    let hasAlpha = false;
    for (let i = 3; i < pixels.length; i += 4) {
      if (pixels[i] < 245) { hasAlpha = true; break; }
    }

    const out    = document.createElement('canvas');
    out.width = W; out.height = H;
    const outCtx = out.getContext('2d');
    const outImg = outCtx.createImageData(W, H);
    const o      = outImg.data;

    for (let i = 0; i < W * H; i++) {
      o[i*4]=255; o[i*4+1]=255; o[i*4+2]=255; o[i*4+3]=255;
    }

    if (hasAlpha) {
      const isMask = new Uint8Array(W * H);
      for (let i = 0; i < W * H; i++) isMask[i] = pixels[i*4+3] > 10 ? 1 : 0;
      for (let y = 1; y < H-1; y++) {
        for (let x = 1; x < W-1; x++) {
          const i = y*W+x;
          if (!isMask[i]) continue;
          if (!isMask[(y-1)*W+x] || !isMask[(y+1)*W+x] ||
              !isMask[y*W+(x-1)] || !isMask[y*W+(x+1)]) {
            o[i*4]=0; o[i*4+1]=0; o[i*4+2]=0; o[i*4+3]=255;
          }
        }
      }
    } else {
      const grey = new Float32Array(W * H);
      for (let i = 0; i < W*H; i++) {
        grey[i] = 0.299*pixels[i*4] + 0.587*pixels[i*4+1] + 0.114*pixels[i*4+2];
      }
      for (let y = 1; y < H-1; y++) {
        for (let x = 1; x < W-1; x++) {
          const i = y*W+x;
          const tl=grey[(y-1)*W+(x-1)], tc=grey[(y-1)*W+x], tr=grey[(y-1)*W+(x+1)];
          const ml=grey[y*W+(x-1)],                          mr=grey[y*W+(x+1)];
          const bl=grey[(y+1)*W+(x-1)], bc=grey[(y+1)*W+x], br=grey[(y+1)*W+(x+1)];
          const gx=-tl-2*ml-bl+tr+2*mr+br, gy=-tl-2*tc-tr+bl+2*bc+br;
          if (Math.sqrt(gx*gx+gy*gy) > threshold) {
            o[i*4]=0; o[i*4+1]=0; o[i*4+2]=0; o[i*4+3]=255;
          }
        }
      }
    }

    outCtx.putImageData(outImg, 0, 0);
    return out;
  }

  /**
   * In-place box blur pass on canvas (for the "Suavizar" button).
   */
  applySmooth(canvas) {
    this._blur(canvas.getContext('2d'), canvas.width, canvas.height, 1);
  }

  /**
   * Posterize to pure B/W in-place.
   */
  applySimplify(canvas, threshold = 128) {
    const ctx = canvas.getContext('2d');
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const v = (d[i]+d[i+1]+d[i+2])/3 > threshold ? 255 : 0;
      d[i]=d[i+1]=d[i+2]=v;
    }
    ctx.putImageData(img, 0, 0);
  }

  _blur(ctx, W, H, passes) {
    for (let p = 0; p < passes; p++) {
      const img = ctx.getImageData(0, 0, W, H);
      const src = img.data;
      const dst = new Uint8ClampedArray(src.length);
      for (let y = 1; y < H-1; y++) {
        for (let x = 1; x < W-1; x++) {
          for (let c = 0; c < 3; c++) {
            let s = 0;
            for (let dy = -1; dy <= 1; dy++)
              for (let dx = -1; dx <= 1; dx++)
                s += src[((y+dy)*W+(x+dx))*4+c];
            dst[(y*W+x)*4+c] = s/9;
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
