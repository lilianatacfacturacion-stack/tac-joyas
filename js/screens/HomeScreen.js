import { loadProjects, getLastProjectId, exportProjectBundle, importProjectBundle } from '../storage/Storage.js';

export class HomeScreen {
  constructor(app) { this.app = app; }

  render() {
    const projects = loadProjects();
    const lastId = getLastProjectId();
    const lastProject = lastId ? projects.find(p => p.id === lastId) : null;

    const el = document.createElement('div');
    el.className = 'screen';
    el.innerHTML = `
      <div class="home-hero">
        <div class="home-logo">✦ TAC JOYAS</div>
        <div class="home-sub">Diseño artesanal · Láser</div>
      </div>

      ${lastProject ? `
      <div style="padding: 0 24px 12px;">
        <div class="card" id="continue-banner" style="cursor:pointer; border-color: rgba(201,169,110,0.3);">
          <div style="display:flex; align-items:center; gap:12px;">
            <div style="font-size:1.8rem;">💍</div>
            <div style="flex:1;">
              <div style="font-size:0.7rem; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.08em; margin-bottom:2px;">Continuar diseño</div>
              <div style="font-weight:700;">${lastProject.name}</div>
            </div>
            <div style="color:var(--gold); font-size:1.2rem;">›</div>
          </div>
        </div>
      </div>
      ` : ''}

      <div class="home-cta">
        <button class="btn btn-primary btn-full" id="btn-new">
          <span>✦</span> NUEVA JOYA
        </button>
      </div>

      <div class="home-grid">
        <div class="home-tile" id="btn-designs">
          <div class="icon">📐</div>
          <span>Mis Diseños</span>
        </div>
        <div class="home-tile" id="btn-materials">
          <div class="icon">🎨</div>
          <span>Mis Cueros</span>
        </div>
        <div class="home-tile" id="btn-hardware">
          <div class="icon">🔩</div>
          <span>Mis Herrajes</span>
        </div>
      </div>

      ${projects.length > 0 ? `
      <div class="recent-projects">
        <h2>Diseños recientes</h2>
        ${projects.slice(0, 5).map(p => `
          <div class="project-card" data-id="${p.id}">
            <div class="project-thumb">💍</div>
            <div class="project-info">
              <div class="project-name">${p.name}</div>
              <div class="project-meta">${this._formatDate(p.updatedAt)}</div>
            </div>
            <div class="project-status">${this._statusLabel(p.status)}</div>
            <button class="btn btn-ghost" style="font-size:0.75rem;padding:4px 8px;" data-export-id="${p.id}">Exportar</button>
          </div>
        `).join('')}
      </div>
      ` : `
      <div class="empty" style="margin-top:20px;">
        <div class="icon">✦</div>
        <p>Crea tu primer diseño<br>pulsando <strong>NUEVA JOYA</strong></p>
      </div>
      `}

      <div style="padding: 0 24px 24px;">
        <div class="section-title" style="margin-top:20px;">Sincronizar entre dispositivos</div>
        <div class="btn-row" style="gap:8px; flex-wrap:wrap;">
          <button class="btn btn-secondary" id="btn-import-project" style="flex:1;">⬆ Importar diseño</button>
        </div>
        <input type="file" id="input-import-json" accept=".json" style="display:none;">
      </div>
    `;

    el.querySelector('#btn-new').onclick = () => this.app.newProject();
    el.querySelector('#btn-designs').onclick = () => this.app.showDesignsList();
    el.querySelector('#btn-materials').onclick = () => this.app.showMaterialsList();
    el.querySelector('#btn-hardware').onclick = () => this.app.showHardwareList();

    if (lastProject) {
      el.querySelector('#continue-banner').onclick = () => this.app.openProject(lastProject.id);
    }

    el.querySelectorAll('.project-card').forEach(card => {
      card.addEventListener('click', e => {
        if (e.target.closest('[data-export-id]')) return;
        this.app.openProject(card.dataset.id);
      });
    });

    el.querySelectorAll('[data-export-id]').forEach(btn => {
      btn.onclick = async (e) => {
        e.stopPropagation();
        const id = btn.dataset.exportId;
        const project = loadProjects().find(p => p.id === id);
        const bundle = await exportProjectBundle(id);
        if (!bundle) { this.app.showToast('Error al exportar'); return; }
        const blob = new Blob([bundle], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `tac-joya-${(project?.name || id).replace(/\s+/g, '-')}.json`;
        a.click();
        URL.revokeObjectURL(url);
        this.app.showToast('Diseño exportado');
      };
    });

    const importInput = el.querySelector('#input-import-json');
    el.querySelector('#btn-import-project').onclick = () => importInput.click();
    importInput.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const text = await file.text();
        await importProjectBundle(text);
        this.app.showToast('Diseño importado');
        this.app.navigate('home');
      } catch (err) {
        this.app.showToast('Error al importar: ' + err.message);
      }
    };

    return el;
  }

  _formatDate(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleDateString('es-ES', { day:'2-digit', month:'short', year:'numeric' });
  }

  _statusLabel(status) {
    const map = { draft: 'Borrador', designing: 'Diseñando', ready: 'Listo' };
    return map[status] || status;
  }
}
