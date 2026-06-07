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

let allGames = [];
let isInitialLoad = true;
let isAdmin = false;
let lastAttemptedPass = "";
let visibleCount = 8;
let lastCategoryList = "";
let searchTimer;

/* ── CACHE LOCAL ────────────────────────────────────────
   Salva os jogos no localStorage com timestamp.
   Na próxima visita, exibe o cache instantaneamente
   enquanto busca atualizações em segundo plano.
────────────────────────────────────────────────────── */
const CACHE_KEY = 'nwc_games_cache';
const CACHE_TTL = 5 * 60 * 1000; // 5 minutos

function saveCache(games) {
  try {
    // Salva sem os banners para economizar memória e localStorage
    const slim = games.map(g => {
      const { banner, ...rest } = g;
      return rest;
    });
    localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), games: slim }));
  } catch (e) { /* localStorage cheio, ignora */ }
}

function loadCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const { ts, games } = JSON.parse(raw);
    if (Date.now() - ts > CACHE_TTL) return null; // expirado
    return games;
  } catch (e) { return null; }
}

/* ── AUTH ───────────────────────────────────────────── */
firebase.auth().onAuthStateChanged(user => {
  isAdmin = !!user;
  const addBtn = document.getElementById('add-btn');
  const authIcon = document.getElementById('auth-icon');
  if (addBtn) addBtn.style.display = isAdmin ? 'flex' : 'none';
  if (authIcon) authIcon.innerText = isAdmin ? 'logout' : 'admin_panel_settings';
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

function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function login() {
  const emailField = document.getElementById('login-email');
  const passField  = document.getElementById('login-pass');
  const email = emailField.value.trim();
  const pass  = passField.value;

  emailField.error = passField.error = false;
  emailField.errorText = passField.errorText = "";

  if (!email || !validateEmail(email)) {
    emailField.error = true;
    emailField.errorText = "E-mail inválido ou vazio.";
    return;
  }
  if (!pass) {
    passField.error = true;
    passField.errorText = "A senha não pode estar vazia.";
    return;
  }

  firebase.auth().signInWithEmailAndPassword(email, pass)
    .then(() => {
      closeLoginModal();
      emailField.value = passField.value = lastAttemptedPass = "";
    })
    .catch(err => {
      passField.error = true;
      lastAttemptedPass = pass;
      passField.errorText = "Erro ao entrar: " + err.message;
    });
}

/* ── TEMA ───────────────────────────────────────────── */
const themes = ['auto', 'light', 'dark'];
const themeIcons = { auto: 'brightness_auto', light: 'light_mode', dark: 'dark_mode' };

function applyTheme(theme) {
  const html = document.documentElement;
  const icon = document.getElementById('theme-icon');
  let target = theme === 'auto'
    ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    : theme;
  html.classList.remove('dark', 'light');
  html.classList.add(target);
  if (icon) icon.innerText = themeIcons[theme];
}

window.cycleTheme = () => {
  let current = localStorage.getItem('user-theme') || 'auto';
  let next = themes[(themes.indexOf(current) + 1) % themes.length];
  if (next === 'auto') localStorage.removeItem('user-theme');
  else localStorage.setItem('user-theme', next);
  applyTheme(next);
};

applyTheme(localStorage.getItem('user-theme') || 'auto');

/* ── FILTRO DE CATEGORIAS ───────────────────────────── */
function updateCategoryFilter() {
  const filterSelect = document.getElementById('filter-category');
  if (!filterSelect) return;
  const currentVal = filterSelect.value;
  const categories = [...new Set(allGames.map(g => g.category).filter(c => c))].sort();
  const catString = categories.join(",");

  if (lastCategoryList !== catString) {
    let options = `<md-select-option value="Todas" ${currentVal === 'Todas' ? 'selected' : ''}><div slot="headline">Todas</div></md-select-option>`;
    categories.forEach(cat => {
      options += `<md-select-option value="${cat}" ${currentVal === cat ? 'selected' : ''}><div slot="headline">${cat}</div></md-select-option>`;
    });
    filterSelect.innerHTML = options;
    lastCategoryList = catString;
  }
}

/* ── SKELETON LOADING ───────────────────────────────── */
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
  searchTimer = setTimeout(() => {
    visibleCount = 8;
    renderGames();
  }, 400);
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
      <div style="grid-column:1/-1;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:60px 20px;opacity:0.8;">
        <md-icon style="font-size:64px;width:64px;height:64px;color:var(--md-sys-color-error);">wifi_off</md-icon>
        <h2 style="font-family:inherit;margin:16px 0 8px 0;font-size:1.2rem;color:var(--md-sys-color-on-surface);">Sem conexão</h2>
        <p style="font-family:inherit;font-size:0.9rem;color:var(--md-sys-color-outline);text-align:center;">Verifique sua internet para carregar os jogos.</p>
      </div>`;
    if (loadMoreBtn) loadMoreBtn.style.display = 'none';
    if (searchInput) searchInput.disabled = true;
    if (categorySelect) categorySelect.disabled = true;
    return;
  }

  if (searchInput) searchInput.disabled = false;
  if (categorySelect) categorySelect.disabled = false;

  if (isInitialLoad) return;

  updateCategoryFilter();

  const searchTerm     = searchInput    ? searchInput.value.toLowerCase() : "";
  const categoryFilter = categorySelect ? categorySelect.value            : "Todas";

  const filtered = allGames.filter(g => {
    const matchesSearch   = g.name.toLowerCase().includes(searchTerm);
    const matchesCategory = categoryFilter === "Todas" || g.category === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  const sorted      = [...filtered].reverse().sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));
  const displayList = sorted.slice(0, visibleCount);

  let newHTML = "";
  displayList.forEach((game, idx) => {
    newHTML += `
      <md-elevated-card class="game-card ${game.pinned ? 'pinned' : ''}" style="animation-delay:${idx * 40}ms">
        ${game.pinned ? '<div class="pin-icon"><md-icon style="font-size:18px;">push_pin</md-icon></div>' : ''}
        ${isAdmin ? `
          <div class="admin-actions">
            <md-filled-icon-button onclick="editGame('${game.id}')" style="--md-filled-icon-button-container-width:32px;--md-filled-icon-button-container-height:32px;"><md-icon style="font-size:18px;">edit</md-icon></md-filled-icon-button>
            <md-filled-icon-button onclick="deleteGame('${game.id}')" style="--md-filled-icon-button-container-color:var(--md-sys-color-error);--md-filled-icon-button-container-width:32px;--md-filled-icon-button-container-height:32px;"><md-icon style="font-size:18px;">delete</md-icon></md-filled-icon-button>
          </div>` : ''}
        ${game._hasBanner !== false ? `<img data-game-id="${game.id}" loading="lazy" decoding="async" style="width:100%;aspect-ratio:16/9;object-fit:cover;display:block;background:var(--md-sys-color-surface-container-high);">` : \'\'}
        <div class="card-body">
          <p style="color:var(--md-sys-color-primary);font-size:11px;font-weight:bold;margin:0;text-transform:uppercase;">${game.category || 'Geral'}</p>
          <h3 style="margin:4px 0;">${game.name}</h3>
          <p style="margin:12px 0;font-size:14px;opacity:0.8;">${game.desc || ''}</p>
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            ${(game.linkObjects || (game.links || []).map((u,i)=>({label:`Link ${i+1}`,url:u}))).map(l => `<md-filled-tonal-button onclick="window.open('${l.url}')">${l.label}</md-filled-tonal-button>`).join('')}
          </div>
        </div>
      </md-elevated-card>`;
  });

  grid.innerHTML = newHTML || `<p style="grid-column:1/-1;text-align:center;padding:48px;opacity:0.6;">Nenhum jogo encontrado.</p>`;

  if (loadMoreBtn) {
    loadMoreBtn.style.display = sorted.length > visibleCount ? 'flex' : 'none';
  }
}

window.loadMore = () => {
  visibleCount += 8;
  renderGames();
};

/* ── FIREBASE: carrega com cache ────────────────────────
   1. Mostra skeletons imediatamente
   2. Se tiver cache válido, exibe na hora
   3. Busca do Firebase em background
   4. Atualiza a tela e salva novo cache
────────────────────────────────────────────────────── */
const cached = loadCache();
if (cached && cached.length > 0) {
  // Exibe cache instantaneamente
  allGames = cached;
  isInitialLoad = false;
  renderGames();
} else {
  // Sem cache: mostra skeletons enquanto carrega
  showSkeletons(8);
}

/* ── LAZY LOAD DE BANNERS ───────────────────────────────
   Busca o banner individualmente só quando o card
   entra na área visível da tela (IntersectionObserver).
────────────────────────────────────────────────────── */
const bannerObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (!entry.isIntersecting) return;
    const img = entry.target;
    const gameId = img.dataset.gameId;
    if (!gameId || img.dataset.loaded) return;
    img.dataset.loaded = '1';
    bannerObserver.unobserve(img);

    db.ref("games/" + gameId + "/banner").once("value", snap => {
      const bannerData = snap.val();
      if (bannerData) {
        img.style.opacity = '0';
        img.src = bannerData;
        img.onload = () => {
          img.style.transition = 'opacity 0.35s ease';
          img.style.opacity = '1';
        };
      }
    });
  });
}, { rootMargin: '300px' });

function observeBanners() {
  document.querySelectorAll('img[data-game-id]:not([data-loaded])').forEach(img => {
    bannerObserver.observe(img);
  });
}

/* ── FIREBASE: uma requisição, sem banners ──────────────
   Usa a SDK do Firebase mas filtra o campo banner
   antes de guardar em memória e no cache.
────────────────────────────────────────────────────── */
db.ref("games").once("value", snap => {
  const data = snap.val() || {};
  allGames = Object.keys(data).map(key => {
    const { banner, ...meta } = data[key];
    return { ...meta, id: key, _hasBanner: !!banner };
  });
  isInitialLoad = false;
  saveCache(allGames);
  renderGames();
  setTimeout(observeBanners, 50);

  db.ref("games").on("child_added", snap => {
    if (allGames.find(g => g.id === snap.key)) return;
    const { banner, ...meta } = snap.val();
    allGames.push({ ...meta, id: snap.key, _hasBanner: !!banner });
    saveCache(allGames);
    renderGames();
    setTimeout(observeBanners, 50);
  });

  db.ref("games").on("child_changed", snap => {
    const idx = allGames.findIndex(g => g.id === snap.key);
    const { banner, ...meta } = snap.val();
    const updated = { ...meta, id: snap.key, _hasBanner: !!banner };
    if (idx !== -1) allGames[idx] = updated;
    saveCache(allGames);
    renderGames();
    setTimeout(observeBanners, 50);
  });

  db.ref("games").on("child_removed", snap => {
    allGames = allGames.filter(g => g.id !== snap.key);
    saveCache(allGames);
    renderGames();
  });
});

window.addEventListener('online',  renderGames);
window.addEventListener('offline', renderGames);

/* ── MODAIS ─────────────────────────────────────────── */
window.openAddModal = () => {
  document.getElementById("modalTitle").innerText = "Adicionar Jogo";
  document.getElementById("gameId").value = "";
  document.getElementById("gameForm").reset();
  document.getElementById("linksContainer").innerHTML = "";
  document.getElementById('modal').classList.add('active');
};

window.closeModal = () => document.getElementById('modal').classList.remove('active');

window.editGame = (id) => {
  const game = allGames.find(g => g.id === id);
  document.getElementById("modalTitle").innerText = "Editar Jogo";
  document.getElementById("gameId").value   = game.id;
  document.getElementById("name").value     = game.name;
  document.getElementById("desc").value     = game.desc;
  document.getElementById("category").value = game.category || "";
  document.getElementById("pinned").checked = !!game.pinned;
  document.getElementById("linksContainer").innerHTML = "";
  if (game.links) game.links.forEach(l => addLinkField(l));
  if (game.linkObjects) game.linkObjects.forEach(l => addLinkField(l));
  document.getElementById('modal').classList.add('active');
};

window.deleteGame = (id) => {
  if (confirm("Deseja excluir?")) db.ref("games/" + id).remove();
};

window.addLinkField = (link = {}) => {
  const container = document.getElementById('linksContainer');
  if (container.querySelectorAll('.link-row').length >= 4) return;
  const label = typeof link === 'string' ? '' : (link.label || '');
  const url   = typeof link === 'string' ? link : (link.url || '');
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
  // Coleta links como objetos {label, url}
  const linkRows = Array.from(document.querySelectorAll('.link-row'));
  let linkObjects = [];
  let linkError = false;
  for (const row of linkRows) {
    const labelVal = row.querySelector('.link-label-input').value.trim();
    const urlVal   = row.querySelector('.link-url-input').value.trim();
    const labelEl  = row.querySelector('.link-label-input');
    const urlEl    = row.querySelector('.link-url-input');
    labelEl.error = urlEl.error = false;
    if (!labelVal) { labelEl.error = true; labelEl.errorText = "Nome obrigatório."; linkError = true; }
    if (!urlVal)   { urlEl.error   = true; urlEl.errorText   = "URL obrigatória.";  linkError = true; }
    if (labelVal && urlVal) linkObjects.push({ label: labelVal, url: urlVal });
  }
  if (linkError) return;
  // Compatibilidade reversa: mantém 'links' como array de URLs
  const links = linkObjects.map(l => l.url);
  const file     = document.getElementById("banner").files[0];

  nameField.error = descField.error = categoryField.error = false;

  if (!name || name.length > 30) {
    nameField.error = true;
    nameField.errorText = !name ? "O nome é obrigatório." : "Máximo 30 caracteres.";
    return;
  }
  if (desc.length > 60) {
    descField.error = true;
    descField.errorText = "Máximo 60 caracteres.";
    return;
  }
  if (category.length > 20) {
    categoryField.error = true;
    categoryField.errorText = "Máximo 20 caracteres.";
    return;
  }

  const pushData = (imgUrl) => {
    const data = { name, desc, category, links, linkObjects, pinned };
    if (imgUrl) {
      data.banner = imgUrl;
    } else if (id) {
      const oldGame = allGames.find(g => g.id === id);
      if (oldGame && oldGame.banner) data.banner = oldGame.banner;
    }
    if (id) db.ref("games/" + id).update(data);
    else    db.ref("games").push(data);
    closeModal();
  };

  if (file) {
    const reader = new FileReader();
    reader.onload = (e) => pushData(e.target.result);
    reader.readAsDataURL(file);
  } else {
    pushData(null);
  }
};

/* ── ESTRELAS ANIMADAS ──────────────────────────────── */
(function () {
  const canvas = document.createElement('canvas');
  canvas.id = 'stars-canvas';
  document.body.prepend(canvas);

  const ctx = canvas.getContext('2d');
  const STAR_COUNT = 120;
  const stars = [];

  function resize() {
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
  }

  function randomStar() {
    return {
      x:       Math.random() * canvas.width,
      y:       Math.random() * canvas.height,
      radius:  Math.random() * 1.4 + 0.3,
      speed:   Math.random() * 0.4 + 0.08,
      opacity: Math.random() * 0.6 + 0.3,
      twinkle: Math.random() * Math.PI * 2,
    };
  }

  function init() {
    resize();
    stars.length = 0;
    for (let i = 0; i < STAR_COUNT; i++) stars.push(randomStar());
  }

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const isDark = document.documentElement.classList.contains('dark');
    if (!isDark) { requestAnimationFrame(draw); return; }

    const now = Date.now() / 1000;
    stars.forEach(s => {
      const twinkleOpacity = s.opacity * (0.7 + 0.3 * Math.sin(now * 0.8 + s.twinkle));
      const hue = Math.random() > 0.7 ? '270, 80%, 90%' : '0, 0%, 100%';
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.radius, 0, Math.PI * 2);
      ctx.fillStyle = `hsla(${hue}, ${twinkleOpacity})`;
      ctx.fill();
      s.y += s.speed;
      if (s.y > canvas.height + 2) { s.y = -2; s.x = Math.random() * canvas.width; }
    });

    requestAnimationFrame(draw);
  }

  window.addEventListener('resize', () => {
    resize();
    stars.forEach(s => {
      if (s.x > canvas.width)  s.x = Math.random() * canvas.width;
      if (s.y > canvas.height) s.y = Mat
