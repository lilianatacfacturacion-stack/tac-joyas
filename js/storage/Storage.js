// Storage: localStorage para metadatos, IndexedDB para binarios (imágenes, canvas)

const DB_NAME = 'tac-joyas-db';
const DB_VERSION = 1;
const STORE_BLOBS = 'blobs';
const LS_PROJECTS = 'tj_projects';
const LS_MATERIALS = 'tj_materials';
const LS_HARDWARE = 'tj_hardware';
const LS_LAST = 'tj_last_project';

let _db = null;

function openDB() {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_BLOBS)) {
        db.createObjectStore(STORE_BLOBS, { keyPath: 'id' });
      }
    };
    req.onsuccess = e => { _db = e.target.result; resolve(_db); };
    req.onerror = e => reject(e.target.error);
  });
}

// ── Blobs (imágenes, canvas) ──────────────────────────────────────────────────

export async function saveBlob(id, dataUrl) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_BLOBS, 'readwrite');
    tx.objectStore(STORE_BLOBS).put({ id, data: dataUrl });
    tx.oncomplete = resolve;
    tx.onerror = e => reject(e.target.error);
  });
}

export async function loadBlob(id) {
  if (!id) return null;
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_BLOBS, 'readonly');
    const req = tx.objectStore(STORE_BLOBS).get(id);
    req.onsuccess = () => resolve(req.result?.data || null);
    req.onerror = e => reject(e.target.error);
  });
}

export async function deleteBlob(id) {
  if (!id) return;
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_BLOBS, 'readwrite');
    tx.objectStore(STORE_BLOBS).delete(id);
    tx.oncomplete = resolve;
    tx.onerror = e => reject(e.target.error);
  });
}

// ── Projects ──────────────────────────────────────────────────────────────────

export function loadProjects() {
  try {
    return JSON.parse(localStorage.getItem(LS_PROJECTS) || '[]');
  } catch { return []; }
}

export function saveProject(project) {
  project.updatedAt = new Date().toISOString();
  const projects = loadProjects();
  const idx = projects.findIndex(p => p.id === project.id);
  if (idx >= 0) projects[idx] = project.toJSON ? project.toJSON() : project;
  else projects.unshift(project.toJSON ? project.toJSON() : project);
  localStorage.setItem(LS_PROJECTS, JSON.stringify(projects));
  localStorage.setItem(LS_LAST, project.id);
}

export function loadProject(id) {
  return loadProjects().find(p => p.id === id) || null;
}

export function deleteProject(id) {
  const projects = loadProjects().filter(p => p.id !== id);
  localStorage.setItem(LS_PROJECTS, JSON.stringify(projects));
}

export function getLastProjectId() {
  return localStorage.getItem(LS_LAST);
}

// ── Materials ─────────────────────────────────────────────────────────────────

export function loadMaterials() {
  try { return JSON.parse(localStorage.getItem(LS_MATERIALS) || '[]'); }
  catch { return []; }
}

export function saveMaterial(mat) {
  const list = loadMaterials();
  const idx = list.findIndex(m => m.id === mat.id);
  if (idx >= 0) list[idx] = mat.toJSON ? mat.toJSON() : mat;
  else list.unshift(mat.toJSON ? mat.toJSON() : mat);
  localStorage.setItem(LS_MATERIALS, JSON.stringify(list));
}

// ── Hardware ──────────────────────────────────────────────────────────────────

export function loadHardware() {
  try { return JSON.parse(localStorage.getItem(LS_HARDWARE) || '[]'); }
  catch { return []; }
}

export function saveHardware(hw) {
  const list = loadHardware();
  const idx = list.findIndex(h => h.id === hw.id);
  if (idx >= 0) list[idx] = hw.toJSON ? hw.toJSON() : hw;
  else list.unshift(hw.toJSON ? hw.toJSON() : hw);
  localStorage.setItem(LS_HARDWARE, JSON.stringify(list));
}

// ── Export / Import ───────────────────────────────────────────────────────────

export async function exportProjectBundle(id) {
  const data = loadProject(id);
  if (!data) return null;

  const blobKeys = ['imageId', 'engravingGeometryId', 'cutGeometryId', 'previewId']
    .filter(k => data[k])
    .map(k => data[k]);

  const blobs = {};
  for (const key of blobKeys) {
    const val = await loadBlob(key);
    if (val) blobs[key] = val;
  }

  return JSON.stringify({ version: 1, project: data, blobs });
}

export async function importProjectBundle(jsonString) {
  const bundle = JSON.parse(jsonString);
  if (!bundle.project) throw new Error('Formato inválido');

  const newId = 'p_' + Date.now();
  const project = { ...bundle.project, id: newId };

  const keyMap = {};
  for (const [oldKey, dataUrl] of Object.entries(bundle.blobs || {})) {
    const newKey = oldKey.replace(bundle.project.id, newId);
    await saveBlob(newKey, dataUrl);
    keyMap[oldKey] = newKey;
  }

  for (const field of ['imageId', 'engravingGeometryId', 'cutGeometryId', 'previewId']) {
    if (project[field] && keyMap[project[field]]) {
      project[field] = keyMap[project[field]];
    }
  }

  saveProject(project);
  return project;
}
