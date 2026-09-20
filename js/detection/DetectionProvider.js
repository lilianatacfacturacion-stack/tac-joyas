// Interfaz abstracta para detección de piezas.
// La lógica del resto de la app depende solo de esta interfaz,
// no del proveedor concreto (manual, IA local, API externa…)

export class DetectionProvider {
  /**
   * Detecta piezas en una imagen.
   * @param {HTMLImageElement|HTMLCanvasElement} img
   * @returns {Promise<DetectedPart[]>}
   */
  // eslint-disable-next-line no-unused-vars
  async detect(img) {
    throw new Error('DetectionProvider.detect() not implemented');
  }

  get name() { return 'abstract'; }
  get requiresNetwork() { return false; }
}

export class DetectedPart {
  constructor(data = {}) {
    this.id     = data.id     || `part_${Date.now()}_${Math.random().toString(36).slice(2,6)}`;
    this.label  = data.label  || 'Pieza';
    this.type   = data.type   || 'body'; // body | hole | connector | hardware | other
    this.bounds = data.bounds || { x: 0, y: 0, w: 0, h: 0 }; // fracción 0-1 del canvas
    this.color  = data.color  || '#c9a96e';
    this.kept   = data.kept   !== undefined ? data.kept : true;
    this.confidence = data.confidence || 1.0;
  }
}
