import { Project } from './models/Project.js';
import { saveProject as storeSave, loadProject, getLastProjectId, loadProjects } from './storage/Storage.js';

import { HomeScreen }     from './screens/HomeScreen.js';
import { PhotoScreen }    from './screens/PhotoScreen.js';
import { DetectScreen }   from './screens/DetectScreen.js';
import { MaterialScreen } from './screens/MaterialScreen.js';
import { DesignScreen }   from './screens/DesignScreen.js';
import { HardwareScreen } from './screens/HardwareScreen.js';
import { ResultScreen }   from './screens/ResultScreen.js';

const ROUTE_MAP = {
  home:     HomeScreen,
  photo:    PhotoScreen,
  detect:   DetectScreen,
  material: MaterialScreen,
  design:   DesignScreen,
  hardware: HardwareScreen,
  result:   ResultScreen,
};

class App {
  constructor() {
    this.currentProject = null;
    this._root = document.getElementById('app');
    this._toast = null;
  }

  init() {
    // Toast element
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.id = 'app-toast';
    document.body.appendChild(toast);
    this._toast = toast;

    // PWA service worker
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js').catch(() => {});
    }

    this.navigate('home');
  }

  navigate(route) {
    const ScreenClass = ROUTE_MAP[route];
    if (!ScreenClass) { console.warn('Unknown route:', route); return; }

    const screen = new ScreenClass(this);
    const el = screen.render();

    this._root.innerHTML = '';
    this._root.appendChild(el);
    window.scrollTo(0, 0);
  }

  newProject() {
    this.currentProject = new Project({
      name: `Diseño ${loadProjects().length + 1}`,
    });
    this.saveProject();
    this.navigate('photo');
  }

  openProject(id) {
    const data = loadProject(id);
    if (!data) { this.showToast('Proyecto no encontrado'); return; }
    this.currentProject = new Project(data);
    // Navegar a la pantalla más avanzada del proyecto
    const step = this._lastStep(this.currentProject);
    this.navigate(step);
  }

  saveProject() {
    if (!this.currentProject) return;
    storeSave(this.currentProject);
  }

  showDesignsList() {
    const projects = loadProjects();
    if (projects.length === 0) { this.showToast('No tienes diseños guardados'); return; }
    // Reutilizar pantalla home con lista
    this.navigate('home');
  }

  showMaterialsList() {
    this.showToast('Biblioteca de cueros — próximamente');
  }

  showHardwareList() {
    this.showToast('Biblioteca de herrajes — próximamente');
  }

  showToast(msg, duration = 2200) {
    if (!this._toast) return;
    this._toast.textContent = msg;
    this._toast.classList.add('show');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => this._toast?.classList.remove('show'), duration);
  }

  _lastStep(project) {
    if (project.engravingGeometryId) return 'result';
    if (project.material?.color && project.widthMm) return 'design';
    if (project.detectedParts?.length) return 'material';
    if (project.imageId) return 'detect';
    return 'photo';
  }
}

// ── Bootstrap ──────────────────────────────────────────────────────────────────
const app = new App();
document.addEventListener('DOMContentLoaded', () => app.init());
