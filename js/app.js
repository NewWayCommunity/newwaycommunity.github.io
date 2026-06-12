const firebaseConfig = {
  apiKey: "AIzaSyC8J21BmeYHfco3X1qx6_KCi4RU1wqOoIo",
  authDomain: "new-way-community-7e8a0.firebaseapp.com",
  databaseURL: "https://new-way-community-7e8a0-default-rtdb.firebaseio.com",
  projectId: "new-way-community-7e8a0",
  storageBucket: "new-way-community-7e8a0.firebasestorage.app",
  messagingSenderId: "921355438217",
  appId: "1:921355438217:web:63bcae438ef6c14ee85e58"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.database();

let allGames     = [];
let isInitialLoad = true;
let isAdmin      = false;
let visibleCount = 8;
let lastCategoryList = "";
let searchTimer;
let currentDbRef = null; // referência Firebase ativa

/* ── SEÇÕES ─────────────────────────────────────────── */
const SECTIONS = {
  games_android:  'Jogos Android',
  games_emulator: 'Jogos de Emulador',
  games_apps:     'Apps Premium',
};

let currentSection = localStorage.getItem('nwc_section') || 'games_android';

function switchSection(section) {
  if (section === currentSection && !isInitialLoad) { closeSidebar(); return; }
  currentSection = section;
  localStorage.setItem('nwc_section', section);

  // Atualiza título
  document.getElementById('section-title').innerText = SECTIONS[section];

  // Atualiza item ativo na sidebar
  document.querySelectorAll('.sidebar-item').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.section === section);
  });

  closeSidebar();
  loadSection(section);
}

window.openSidebar  = () => {
  document.getElementById('sidebar').classList.add('open');
  document.getElementById('sidebar-overlay').classList.add('open');
};
window.closeSidebar = () => {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebar-overlay').classList.remove('open');
};

/* ── CACHE LOCAL ────────────────────────────────────── */
const CACHE_TTL = 5 * 60 * 1000;

function cacheKey(section) { return `nwc_cache_${section}`; }

function saveCache(section, games) {
  try {
    localStorage.setItem(cacheKey(section), JSON.stringify({ ts: Date.now(), games }));
  } catch (e) {}
}

function loadCache(section) {
  try {
    const raw = localStorage.getItem(cacheKey(section));
    if (!raw) return null;
    const { ts, games } = JSON.parse(raw);
    if (Date.now() - ts > CACHE_TTL) return null;
    return games;
  } catch (e) { return null; }
}

/* ── AUTH ───────────────────────────────────────────── */
firebase.auth().onAuthStateChanged(user => {
  isAdmin = !!user;
  const addBtn       = document.getElementById('add-btn');
  const authIcon     = document.getElementById('auth-icon');
  const deleteAllBtn = document.getElementById('delete-all-btn');
  if (addBtn)       addBtn.style.display       = isAdmin ? 'flex' : 'none';
  if (authIcon)     authIcon.innerText         = isAdmin ? 'logout' : 'admin_panel_settings';
  if (deleteAllBtn) deleteAllBtn.style.display = isAdmin ? 'flex' : 'none';
  renderGames();
});

function handleAuthAction() {
  if (isAdmin) {
    if (confirm("Deseja sair?")) firebase.auth().signOut();
  } else {
    document.getElementById('login-modal').classList.add('active');
  }
}

function closeLoginModal() {
  document.getElementById('login-modal').classList.remove('active');
}

function validateEmail(e) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}

function login() {
  const emailField = document.getElementById('login-email');
  const passField  = document.getElementById('login-pass');
  const email = emailField.value.trim();
  const pass  = passField.value;

  emailField.error = passField.error = false;
  emailField.errorText = passField.errorText = "";

  if (!email || !validateEmail(email)) {
    emailField.error = true; emailField.errorText = "E-mail inválido."; return;
  }
  if (!pass) {
    passField.error = true; passField.errorText = "Senha obrigatória."; return;
  }

  firebase.auth().signInWithEmailAndPassword(email, pass)
    .then(() => { closeLoginModal(); emailField.value = passField.value = ""; })
    .catch(err => { passField.error = true; passField.errorText = "Erro: " + err.message; });
}

/* ── TEMA ───────────────────────────────────────────── */
const themes     = ['auto', 'light', 'dark'];
const themeIcons = { auto: 'brightness_auto', light: 'light_mode', dark: 'dark_mode' };

function applyTheme(theme) {
  const target = theme === 'auto'
    ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    : theme;
  document.documentElement.classList.remove('dark', 'light');
  document.documentElement.classList.add(target);
  const icon = document.getElementById('theme-icon');
  if (icon) icon.innerText = themeIcons[theme];
}

window.cycleTheme = () => {
  const current = localStorage.getItem('user-theme') || 'auto';
  const next = themes[(themes.indexOf(current) + 1) % themes.length];
  if (next === 'auto') localStorage.removeItem('user-theme');
  else localStorage.setItem('user-theme', next);
  applyTheme(next);
};

applyTheme(localStorage.getItem('user-theme') || 'auto');

/* ── DATA ───────────────────────────────────────────── */
function formatDate(ts) {
  if (!ts) return '';
  return new Date(ts).toLocaleDateString('pt-BR');
}

/* ── FILTRO DE CATEGORIAS ───────────────────────────── */
function updateCategoryFilter() {
  const sel = document.getElementById('filter-category');
  if (!sel) return;
  const currentVal = sel.value;
  const cats = [...new Set(allGames.map(g => g.category).filter(Boolean))].sort();
  const catStr = cats.join(",");
  if (lastCategoryList === catStr) return;
  let opts = `<md-select-option value="Todas" ${currentVal === 'Todas' ? 'selected' : ''}><div slot="headline">Todas</div></md-select-option>`;
  cats.forEach(c => {
    opts += `<md-select-option value="${c}" ${currentVal === c ? 'selected' : ''}><div slot="headline">${c}</div></md-select-option>`;
  });
  sel.innerHTML = opts;
  lastCategoryList = catStr;
}

/* ── SKELETON ───────────────────────────────────────── */
function showSkeletons(count = 8) {
  const grid = document.getElementById('games');
  if (!grid) return;
  let html = '';
  for (let i = 0; i < count; i++) {
    html += `
      <div class="game-card skeleton-card" style="pointer-events:none;">
        <div class="skeleton skeleton-banner"></div>
        <div class="card-body">
          <div class="skeleton skeleton-chip"></div>
          <div class="skeleton skeleton-title"></div>
          <div class="skeleton skeleton-text"></div>
          <div class="skeleton skeleton-text" style="width:70%"></div>
          <div style="display:flex;gap:8px;margin-top:12px;">
            <div class="skeleton skeleton-btn"></div>
            <div class="skeleton skeleton-btn"></div>
          </div>
        </div>
      </div>`;
  }
  grid.innerHTML = html;
}

/* ── PESQUISA ───────────────────────────────────────── */
window.handleSearch = () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => { visibleCount = 8; renderGames(); }, 400);
};

/* ── RENDER ─────────────────────────────────────────── */
function renderGames() {
  const grid           = document.getElementById('games');
  const loadMoreBtn    = document.getElementById('load-more-btn');
  const searchInput    = document.getElementById('search');
  const categorySelect = document.getElementById('filter-category');

  if (!grid) return;

  if (!navigator.onLine) {
    grid.innerHTML = `
      <div style="grid-column:1/-1;display:flex;flex-direction:column;align-items:center;padding:60px 20px;">
        <md-icon style="font-size:64px;width:64px;height:64px;color:var(--md-sys-color-error);">wifi_off</md-icon>
        <h2 style="font-family:inherit;margin:16px 0 8px;font-size:1.2rem;">Sem conexão</h2>
        <p style="font-family:inherit;font-size:0.9rem;color:var(--md-sys-color-outline);text-align:center;">Verifique sua internet.</p>
      </div>`;
    if (loadMoreBtn)    loadMoreBtn.style.display = 'none';
    if (searchInput)    searchInput.disabled = true;
    if (categorySelect) categorySelect.disabled = true;
    return;
  }

  if (searchInput)    searchInput.disabled = false;
  if (categorySelect) categorySelect.disabled = false;
  if (isInitialLoad)  return;

  updateCategoryFilter();

  const searchTerm     = searchInput    ? searchInput.value.toLowerCase() : "";
  const categoryFilter = categorySelect ? categorySelect.value            : "Todas";

  const filtered = allGames.filter(g =>
    g.name.toLowerCase().includes(searchTerm) &&
    (categoryFilter === "Todas" || g.category === categoryFilter)
  );

  const sorted      = [...filtered].reverse().sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));
  const displayList = sorted.slice(0, visibleCount);

  let newHTML = "";
  displayList.forEach((game, idx) => {
    const linkButtons = (game.linkObjects || (game.links || []).map((u, i) => ({ label: `Link ${i + 1}`, url: u })))
      .map(l => `<md-filled-tonal-button onclick="window.open('${l.url}')">${l.label}</md-filled-tonal-button>`)
      .join('');

    newHTML += `
      <md-elevated-card class="game-card ${game.pinned ? 'pinned' : ''}" style="animation-delay:${idx * 40}ms">
        ${game.pinned ? '<div class="pin-icon"><md-icon style="font-size:18px;">push_pin</md-icon></div>' : ''}
        ${isAdmin ? `
          <div class="admin-actions">
            <md-filled-icon-button onclick="editGame('${game.id}')" style="--md-filled-icon-button-container-width:32px;--md-filled-icon-button-container-height:32px;"><md-icon style="font-size:18px;">edit</md-icon></md-filled-icon-button>
            <md-filled-icon-button onclick="deleteGame('${game.id}')" style="--md-filled-icon-button-container-color:var(--md-sys-color-error);--md-filled-icon-button-container-width:32px;--md-filled-icon-button-container-height:32px;"><md-icon style="font-size:18px;">delete</md-icon></md-filled-icon-button>
          </div>` : ''}
        ${game.banner ? `<img src="${game.banner}" loading="lazy" decoding="async" style="width:100%;aspect-ratio:16/9;object-fit:cover;display:block;">` : ''}
        <div class="card-body">
          <p style="color:var(--md-sys-color-primary);font-size:11px;font-weight:bold;margin:0;text-transform:uppercase;">${game.category || 'Geral'}</p>
          <h3 style="margin:4px 0;">${game.name}</h3>
          <p style="margin:12px 0;font-size:14px;opacity:0.8;">${game.desc || ''}</p>
          ${game.createdAt ? `<p style="margin:0 0 12px;font-size:11px;opacity:0.45;display:flex;align-items:center;gap:4px;"><md-icon style="font-size:13px;width:13px;height:13px;">calendar_today</md-icon>${formatDate(game.createdAt)}</p>` : ''}
          <div style="display:flex;gap:8px;flex-wrap:wrap;">${linkButtons}</div>
        </div>
      </md-elevated-card>`;
  });

  grid.innerHTML = newHTML || `<p style="grid-column:1/-1;text-align:center;padding:48px;opacity:0.6;">Nenhum item encontrado.</p>`;
  if (loadMoreBtn) loadMoreBtn.style.display = sorted.length > visibleCount ? 'flex' : 'none';
}

window.loadMore = () => { visibleCount += 8; renderGames(); };

/* ── CARREGA SEÇÃO DO FIREBASE ──────────────────────── */
function loadSection(section) {
  // Desliga listeners da seção anterior
  if (currentDbRef) { currentDbRef.off(); currentDbRef = null; }

  allGames      = [];
  isInitialLoad = true;
  visibleCount  = 8;
  lastCategoryList = "";

  // Limpa filtro
  const sel = document.getElementById('filter-category');
  if (sel) { sel.innerHTML = `<md-select-option value="Todas" selected><div slot="headline">Todas</div></md-select-option>`; }

  // Tenta carregar do cache primeiro
  const cached = loadCache(section);
  if (cached && cached.length > 0) {
    allGames = cached;
    isInitialLoad = false;
    renderGames();
  } else {
    showSkeletons(8);
  }

  currentDbRef = db.ref(section);

  currentDbRef.once("value", snap => {
    const data = snap.val() || {};
    allGames = Object.keys(data).map(key => ({ ...data[key], id: key }));
    isInitialLoad = false;
    saveCache(section, allGames);
    renderGames();

    currentDbRef.on("child_added", snap => {
      if (allGames.find(g => g.id === snap.key)) return;
      allGames.push({ ...snap.val(), id: snap.key });
      saveCache(section, allGames);
      renderGames();
    });

    currentDbRef.on("child_changed", snap => {
      const idx = allGames.findIndex(g => g.id === snap.key);
      if (idx !== -1) allGames[idx] = { ...snap.val(), id: snap.key };
      saveCache(section, allGames);
      renderGames();
    });

    currentDbRef.on("child_removed", snap => {
      allGames = allGames.filter(g => g.id !== snap.key);
      saveCache(section, allGames);
      renderGames();
    });
  });
}

window.addEventListener('online',  renderGames);
window.addEventListener('offline', renderGames);

/* ── MODAIS ─────────────────────────────────────────── */
window.openAddModal = () => {
  document.getElementById("modalTitle").innerText = `Adicionar em ${SECTIONS[currentSection]}`;
  document.getElementById("gameId").value = "";
  document.getElementById("gameForm").reset();
  document.getElementById("linksContainer").innerHTML = "";
  document.getElementById("banner-url").value = "";
  document.getElementById('modal').classList.add('active');
};

window.closeModal = () => document.getElementById('modal').classList.remove('active');

window.editGame = (id) => {
  const game = allGames.find(g => g.id === id);
  document.getElementById("modalTitle").innerText = "Editar";
  document.getElementById("gameId").value   = game.id;
  document.getElementById("name").value     = game.name;
  document.getElementById("desc").value     = game.desc || "";
  document.getElementById("category").value = game.category || "";
  document.getElementById("pinned").checked = !!game.pinned;
  document.getElementById("linksContainer").innerHTML = "";
  const linksToLoad = game.linkObjects || (game.links || []).map((u, i) => ({ label: `Link ${i + 1}`, url: u }));
  linksToLoad.forEach(l => addLinkField(l));
  const bannerField = document.getElementById("banner-url");
  if (bannerField) bannerField.value = (game.banner && !game.banner.startsWith('data:')) ? game.banner : '';
  document.getElementById('modal').classList.add('active');
};

window.deleteGame = (id) => {
  if (confirm("Deseja excluir?")) db.ref(`${currentSection}/${id}`).remove();
};

window.deleteAllGames = () => {
  if (!confirm(`Apagar TODOS os itens de "${SECTIONS[currentSection]}"?`)) return;
  if (!confirm("Segunda confirmação: tem certeza?")) return;
  db.ref(currentSection).remove().then(() => {
    allGames = [];
    localStorage.removeItem(`nwc_cache_${currentSection}`);
    renderGames();
  });
};

window.addLinkField = (link = {}) => {
  const container = document.getElementById('linksContainer');
  if (container.querySelectorAll('.link-row').length >= 4) return;
  const label = typeof link === 'string' ? '' : (link.label || '');
  const url   = typeof link === 'string' ? link : (link.url   || '');
  const row = document.createElement('div');
  row.className = 'link-row';
  row.style = "display:flex;flex-direction:column;gap:6px;margin-bottom:12px;padding:12px;border-radius:12px;background:rgba(255,255,255,0.04);border:1px solid var(--md-sys-color-outline-variant);";
  row.innerHTML = `
    <md-outlined-text-field label="Nome do link *" class="link-label-input" maxlength="20" value="${label}" style="width:100%"></md-outlined-text-field>
    <div style="display:flex;gap:8px;align-items:center;">
      <md-outlined-text-field label="URL *" class="link-url-input" style="flex:1" value="${url}"></md-outlined-text-field>
      <md-icon-button type="button" onclick="this.closest('.link-row').remove();document.getElementById('addLinkBtn').disabled=false;"><md-icon>delete</md-icon></md-icon-button>
    </div>`;
  container.appendChild(row);
  if (container.querySelectorAll('.link-row').length >= 4)
    document.getElementById('addLinkBtn').disabled = true;
};

window.saveGame = () => {
  const id            = document.getElementById("gameId").value;
  const nameField     = document.getElementById("name");
  const descField     = document.getElementById("desc");
  const categoryField = document.getElementById("category");

  const name     = nameField.value.trim();
  const desc     = descField.value.trim();
  const category = categoryField.value.trim() || "Geral";
  const pinned   = document.getElementById("pinned").checked;

  nameField.error = descField.error = categoryField.error = false;

  if (!name || name.length > 30) {
    nameField.error = true;
    nameField.errorText = !name ? "Nome obrigatório." : "Máximo 30 caracteres.";
    return;
  }
  if (desc.length > 60) {
    descField.error = true; descField.errorText = "Máximo 60 caracteres."; return;
  }
  if (category.length > 20) {
    categoryField.error = true; categoryField.errorText = "Máximo 20 caracteres."; return;
  }

  const linkRows = Array.from(document.querySelectorAll('.link-row'));
  let linkObjects = [], linkError = false;
  for (const row of linkRows) {
    const labelEl  = row.querySelector('.link-label-input');
    const urlEl    = row.querySelector('.link-url-input');
    const labelVal = labelEl.value.trim();
    const urlVal   = urlEl.value.trim();
    labelEl.error = urlEl.error = false;
    if (!labelVal) { labelEl.error = true; labelEl.errorText = "Nome obrigatório."; linkError = true; }
    if (!urlVal)   { urlEl.error   = true; urlEl.errorText   = "URL obrigatória.";  linkError = true; }
    if (labelVal && urlVal) linkObjects.push({ label: labelVal, url: urlVal });
  }
  if (linkError) return;

  const links     = linkObjects.map(l => l.url);
  const bannerUrl = document.getElementById("banner-url").value.trim();
  const createdAt = id ? (allGames.find(g => g.id === id)?.createdAt || Date.now()) : Date.now();

  const data = { name, desc, category, links, linkObjects, pinned, createdAt };
  if (bannerUrl) {
    data.banner = bannerUrl;
  } else if (id) {
    const old = allGames.find(g => g.id === id);
    if (old && old.banner) data.banner = old.banner;
  }

  if (id) db.ref(`${currentSection}/${id}`).update(data);
  else    db.ref(currentSection).push(data);
  closeModal();
};

/* ── ESTRELAS ANIMADAS ──────────────────────────────── */
(function () {
  const canvas = document.createElement('canvas');
  canvas.id = 'stars-canvas';
  document.body.prepend(canvas);
  const ctx = canvas.getContext('2d');
  const stars = [];

  function resize() { canvas.width = window.innerWidth; canvas.height = window.innerHeight; }

  function randomStar() {
    return {
      x: Math.random() * canvas.width, y: Math.random() * canvas.height,
      radius: Math.random() * 1.4 + 0.3, speed: Math.random() * 0.4 + 0.08,
      opacity: Math.random() * 0.6 + 0.3, twinkle: Math.random() * Math.PI * 2,
    };
  }

  function init() { resize(); stars.length = 0; for (let i = 0; i < 120; i++) stars.push(randomStar()); }

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!document.documentElement.classList.contains('dark')) { requestAnimationFrame(draw); return; }
    const now = Date.now() / 1000;
    stars.forEach(s => {
      const op = s.opacity * (0.7 + 0.3 * Math.sin(now * 0.8 + s.twinkle));
      const hue = Math.random() > 0.7 ? '270, 80%, 90%' : '0, 0%, 100%';
      ctx.beginPath(); ctx.arc(s.x, s.y, s.radius, 0, Math.PI * 2);
      ctx.fillStyle = `hsla(${hue}, ${op})`; ctx.fill();
      s.y += s.speed;
      if (s.y > canvas.height + 2) { s.y = -2; s.x = Math.random() * canvas.width; }
    });
    requestAnimationFrame(draw);
  }

  window.addEventListener('resize', () => {
    resize();
    stars.forEach(s => {
      if (s.x > canvas.width)  s.x = Math.random() * canvas.width;
      if (s.y > canvas.height) s.y = Math.random() * canvas.height;
    });
  });

  init(); draw();
})();

//* ── INIT ───────────────────────────────────────────── */
// Inicializa o título e item ativo da sidebar
document.getElementById('section-title').innerText = SECTIONS[currentSection];
document.querySelectorAll('.sidebar-item').forEach(btn => {
  btn.classList.toggle('active', btn.dataset.section === currentSection);
});

// Carrega a seção salva (ou padrão)
loadSection(currentSection);
