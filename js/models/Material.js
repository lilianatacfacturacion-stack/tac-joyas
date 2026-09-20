export const LEATHER_TYPES = [
  'LISO', 'MATE', 'BRILLANTE', 'ANTE', 'METALIZADO', 'TEXTURIZADO', 'OTRO'
];

export class Material {
  constructor(data = {}) {
    this.id       = data.id       || `mat_${Date.now()}`;
    this.nombre   = data.nombre   || '';
    this.tipo     = data.tipo     || 'LISO';
    this.color    = data.color    || '#c2845a';
    this.textureId = data.textureId || null; // IndexedDB key
    this.notas    = data.notas    || '';
    this.createdAt = data.createdAt || new Date().toISOString();
  }

  toJSON() { return { ...this }; }
}
