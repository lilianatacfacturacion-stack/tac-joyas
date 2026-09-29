import { DetectionProvider, DetectedPart } from './DetectionProvider.js';

/**
 * Proveedor manual/fallback.
 * Solo propone las piezas que existen con alta probabilidad:
 * - Cuerpo Floral (siempre)
 * - Agujero/Conector (si la imagen tiene zona clara arriba — casi siempre en pendientes)
 * El usuario puede añadir Anilla u otras piezas manualmente si las necesita.
 */
export class ManualDetection extends DetectionProvider {
  get name() { return 'manual'; }
  get requiresNetwork() { return false; }

  async detect(img) {
    const W = img.naturalWidth || img.width || 1;
    const H = img.naturalHeight || img.height || 1;

    const s = (x, y, w, h) => ({
      x: x / W, y: y / H, w: w / W, h: h / H
    });

    const cx = W / 2, cy = H / 2;
    const bodyW = W * 0.75;
    const bodyH = H * 0.70;

    const parts = [
      new DetectedPart({
        id: 'part_cuerpo',
        label: 'Cuerpo Floral',
        type: 'body',
        bounds: s(cx - bodyW/2, cy - bodyH/2 + H*0.06, bodyW, bodyH),
        color: '#c9a96e',
        kept: true,
      }),
    ];

    // Agujero/Conector solo si hay zona en la parte superior de la imagen
    // (heurística: la mayoría de pendientes tienen el agujero en la parte superior ~10-20% del alto)
    const hasHole = this._detectHoleZone(img, W, H);
    if (hasHole) {
      parts.push(new DetectedPart({
        id: 'part_agujero',
        label: 'Agujero / Conector',
        type: 'hole',
        bounds: s(cx - W*0.05, cy - bodyH/2 + H*0.02, W*0.10, H*0.07),
        color: '#5ce08a',
        kept: true,
      }));
    }

    // La Anilla NO se añade automáticamente — el usuario la añade si la pieza la tiene
    // porque muchos pendientes no tienen anilla separada del cuerpo

    return parts;
  }

  /**
   * Detecta si hay un agujero/conector en la zona superior de la imagen.
   * Busca una zona más oscura o diferente al fondo en el 20% superior central.
   */
  _detectHoleZone(img, W, H) {
    try {
      const tmp = document.createElement('canvas');
      tmp.width = W; tmp.height = H;
      const ctx = tmp.getContext('2d');
      ctx.drawImage(img, 0, 0);

      // Zona de búsqueda: franja central superior (20% alto, 20% ancho central)
      const zX = Math.round(W * 0.4);
      const zY = Math.round(H * 0.05);
      const zW = Math.round(W * 0.2);
      const zH = Math.round(H * 0.18);

      const data = ctx.getImageData(zX, zY, zW, zH).data;

      // Calcular luma media de la zona
      let lumaSum = 0;
      for (let i = 0; i < data.length; i += 4) {
        lumaSum += 0.299 * data[i] + 0.587 * data[i+1] + 0.114 * data[i+2];
      }
      const lumaMean = lumaSum / (data.length / 4);

      // Si la zona tiene píxeles oscuros (el objeto llega arriba), hay agujero probable
      // Fondo claro (>200 luma media) → probablemente no hay nada ahí → sin agujero
      return lumaMean < 180;
    } catch (e) {
      // Canvas tainted u otro error → asumir que sí hay agujero (caso conservador)
      return true;
    }
  }

  createManualPart(label, type, bounds) {
    return new DetectedPart({ label, type, bounds });
  }
}
