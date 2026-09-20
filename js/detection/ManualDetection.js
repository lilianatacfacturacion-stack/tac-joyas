import { DetectionProvider, DetectedPart } from './DetectionProvider.js';

/**
 * Proveedor manual/fallback.
 * Para el Proyecto 001 (pendientes florales) propone partes preconfiguradas
 * centradas en la imagen. El usuario ajusta a mano.
 */
export class ManualDetection extends DetectionProvider {
  get name() { return 'manual'; }
  get requiresNetwork() { return false; }

  async detect(img) {
    // Propuesta inicial para pendientes florales: partes centradas
    const W = img.naturalWidth || img.width || 1;
    const H = img.naturalHeight || img.height || 1;

    // Escala para normalizar a fracción
    const s = (x, y, w, h) => ({
      x: x / W, y: y / H, w: w / W, h: h / H
    });

    const cx = W / 2, cy = H / 2;
    const bodyW = W * 0.55, bodyH = H * 0.65;

    return [
      new DetectedPart({
        id: 'part_cuerpo',
        label: 'Cuerpo Floral',
        type: 'body',
        bounds: s(cx - bodyW/2, cy - bodyH/2 + H*0.05, bodyW, bodyH),
        color: '#c9a96e',
        kept: true,
      }),
      new DetectedPart({
        id: 'part_agujero',
        label: 'Agujero / Conector',
        type: 'hole',
        bounds: s(cx - W*0.04, cy - bodyH/2 + H*0.02, W*0.08, H*0.06),
        color: '#5ce08a',
        kept: true,
      }),
      new DetectedPart({
        id: 'part_anilla',
        label: 'Anilla',
        type: 'connector',
        bounds: s(cx - W*0.05, cy - bodyH/2 - H*0.06, W*0.1, H*0.07),
        color: '#a0c4ff',
        kept: true,
      }),
    ];
  }

  /**
   * Para modo completamente manual: el usuario crea partes con un rectángulo
   * dibujado sobre el canvas.
   */
  createManualPart(label, type, bounds) {
    return new DetectedPart({ label, type, bounds });
  }
}
