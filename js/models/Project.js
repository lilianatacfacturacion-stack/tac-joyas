export class Project {
  constructor(data = {}) {
    this.id          = data.id          || `proj_${Date.now()}`;
    this.name        = data.name        || 'Nueva Joya';
    this.createdAt   = data.createdAt   || new Date().toISOString();
    this.updatedAt   = data.updatedAt   || new Date().toISOString();
    this.status      = data.status      || 'draft'; // draft | designing | ready

    // Imagen original (base64 en IndexedDB, referencia aquí)
    this.imageId     = data.imageId     || null;
    this.imageWidth  = data.imageWidth  || 0;
    this.imageHeight = data.imageHeight || 0;
    this.imageRotation = data.imageRotation || 0;
    this.imageCrop   = data.imageCrop   || null; // {x,y,w,h} en píxeles

    // Tipo de joya
    this.jewelryType = data.jewelryType || 'pendiente'; // pendiente | anillo | collar | ...

    // Piezas detectadas
    this.detectedParts  = data.detectedParts  || [];
    this.selectedParts  = data.selectedParts  || [];
    this.designMode     = data.designMode     || 'MANTENER'; // MANTENER | CREAR | AMBOS

    // Medidas reales
    this.widthMm        = data.widthMm        || null;
    this.heightMm       = data.heightMm       || null;
    this.lockAspectRatio = data.lockAspectRatio !== undefined ? data.lockAspectRatio : true;
    this.holes          = data.holes          || []; // [{id, diametrMm, x, y}]

    // Material
    this.material = data.material || {
      type: 'LISO',
      color: '#c2845a',
      name: '',
      notes: '',
    };

    // Geometría (datos canvas raster — imageData base64 en Storage)
    this.cutGeometryId      = data.cutGeometryId      || null; // contorno
    this.engravingGeometryId = data.engravingGeometryId || null; // grabado
    this.holesGeometryId    = data.holesGeometryId    || null;

    // Nivel de grabado visual
    this.engravingLevel = data.engravingLevel || 'MEDIO'; // SUAVE | MEDIO | FUERTE

    // Herrajes seleccionados
    this.hardware = data.hardware || [];

    // Preview guardada (thumbnail base64)
    this.previewId = data.previewId || null;
  }

  touch() {
    this.updatedAt = new Date().toISOString();
  }

  toJSON() {
    return { ...this };
  }
}
