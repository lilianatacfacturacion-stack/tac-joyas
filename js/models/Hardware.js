export const HARDWARE_TYPES = [
  { id: 'GANCHO',    label: 'Gancho',    icon: '🪝' },
  { id: 'POSTE',     label: 'Poste',     icon: '📌' },
  { id: 'ARO',       label: 'Aro',       icon: '⭕' },
  { id: 'BARRA',     label: 'Barra',     icon: '➖' },
  { id: 'ANILLA',    label: 'Anilla',    icon: '🔗' },
  { id: 'CADENA',    label: 'Cadena',    icon: '⛓️' },
  { id: 'CONECTOR',  label: 'Conector',  icon: '🔩' },
  { id: 'COLGANTE',  label: 'Colgante',  icon: '💎' },
  { id: 'OTRO',      label: 'Otro',      icon: '✨' },
];

export const HARDWARE_FINISHES = [
  { id: 'ACERO',    label: 'Acero',    color: '#b0bec5' },
  { id: 'PLATA',    label: 'Plata',    color: '#e0e0e0' },
  { id: 'DORADO',   label: 'Dorado',   color: '#c9a96e' },
  { id: 'ORO_ROSA', label: 'Oro Rosa', color: '#e8b4b8' },
  { id: 'NEGRO',    label: 'Negro',    color: '#333' },
  { id: 'OTRO',     label: 'Otro',     color: '#888' },
];

export class Hardware {
  constructor(data = {}) {
    this.id        = data.id        || `hw_${Date.now()}`;
    this.nombre    = data.nombre    || '';
    this.categoria = data.categoria || 'GANCHO';
    this.acabado   = data.acabado   || 'DORADO';
    this.fotoId    = data.fotoId    || null;
    this.anchoMm   = data.anchoMm   || null;
    this.altoMm    = data.altoMm    || null;
    this.notas     = data.notas     || '';
    this.createdAt = data.createdAt || new Date().toISOString();
  }

  get icon() {
    return HARDWARE_TYPES.find(t => t.id === this.categoria)?.icon || '✨';
  }

  toJSON() { return { ...this }; }
}
