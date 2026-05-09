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
  const passField = document.getElementById('login-pass');
  const email = emailField.value.trim();
  const pass = passField.value;

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

const themes = ['auto', 'light', 'dark'];
const themeIcons = { auto: 'brightness_auto', light: 'light_mode', dark: 'dark_mode' };

function applyTheme(theme) {
  const html = document.documentElement;
  const icon = document.getElementById('theme-icon');
  let target = theme === 'auto' ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : theme;
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

window.handleSearch = () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    visibleCount = 8;
    renderGames();
  }, 400);
};

function renderGames() {
  const grid = document.getElementById('games');
  const loadMoreBtn = document.getElementById('load-more-btn');
  const searchInput = document.getElementById('search');
  const categorySelect = document.getElementById('filter-category');

  if (!grid) return;

  if (!navigator.onLine) {
    grid.innerHTML = `
      <div style="grid-column: 1/-1; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 60px 20px; opacity: 0.8;">
        <md-icon style="font-size: 64px; width: 64px; height: 64px; color: var(--md-sys-color-error);">wifi_off</md-icon>
        <h2 style="font-family: inherit; margin: 16px 0 8px 0; font-size: 1.2rem; color: var(--md-sys-color-on-surface);">Sem conexão</h2>
        <p style="font-family: inherit; font-size: 0.9rem; color: var(--md-sys-color-outline); text-align: center;">Verifique sua internet para carregar os jogos.</p>
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

  const searchTerm = searchInput ? searchInput.value.toLowerCase() : "";
  const categoryFilter = categorySelect ? categorySelect.value : "Todas";

  const filtered = allGames.filter(g => {
    const matchesSearch = g.name.toLowerCase().includes(searchTerm);
    const matchesCategory = categoryFilter === "Todas" || g.category === categoryFilter;
    return matchesSearch && matchesCategory;
  });
  
  const sorted = [...filtered].reverse().sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));
  const displayList = sorted.slice(0, visibleCount);
  
  let newHTML = "";
  displayList.forEach(game => {
    newHTML += `
      <md-elevated-card class="game-card ${game.pinned ? 'pinned' : ''}">
        ${game.pinned ? '<div class="pin-icon"><md-icon style="font-size:18px;">push_pin</md-icon></div>' : ''}
        ${isAdmin ? `
          <div class="admin-actions">
            <md-filled-icon-button onclick="editGame('${game.id}')" style="--md-filled-icon-button-container-width: 32px; --md-filled-icon-button-container-height: 32px;"><md-icon style="font-size:18px;">edit</md-icon></md-filled-icon-button>
            <md-filled-icon-button onclick="deleteGame('${game.id}')" style="--md-filled-icon-button-container-color: var(--md-sys-color-error); --md-filled-icon-button-container-width: 32px; --md-filled-icon-button-container-height: 32px;"><md-icon style="font-size:18px;">delete</md-icon></md-filled-icon-button>
          </div>` : ''}
        ${game.banner ? `<img src="${game.banner}" loading="lazy" decoding="async" style="content-visibility: auto;">` : ''}
        <div class="card-body">
          <p style="color: var(--md-sys-color-primary); font-size: 11px; font-weight: bold; margin: 0; text-transform: uppercase;">${game.category || 'Geral'}</p>
          <h3 style="margin: 4px 0;">${game.name}</h3>
          <p style="margin:12px 0; font-size:14px; opacity:0.8;">${game.desc || ''}</p>
          <div style="display:flex; gap:8px; flex-wrap:wrap;">
            ${(game.links || []).map((l, i) => `<md-filled-tonal-button onclick="window.open('${l}')">Link ${i + 1}</md-filled-tonal-button>`).join('')}
          </div>
        </div>
      </md-elevated-card>`;
  });
  grid.innerHTML = newHTML || `<p style="grid-column: 1/-1; text-align: center; padding: 48px; opacity: 0.6;">Nenhum jogo encontrado.</p>`;

  if (loadMoreBtn) {
    loadMoreBtn.style.display = sorted.length > visibleCount ? 'flex' : 'none';
  }
}

window.loadMore = () => {
  visibleCount += 8;
  renderGames();
};

db.ref("games").on("value", snap => {
  const data = snap.val() || {};
  allGames = Object.keys(data).map(key => ({ ...data[key], id: key }));
  isInitialLoad = false;
  renderGames();
});

window.addEventListener('online', renderGames);
window.addEventListener('offline', renderGames);

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
  document.getElementById("gameId").value = game.id;
  document.getElementById("name").value = game.name;
  document.getElementById("desc").value = game.desc;
  document.getElementById("category").value = game.category || "";
  document.getElementById("pinned").checked = !!game.pinned;
  document.getElementById("linksContainer").innerHTML = "";
  if (game.links) game.links.forEach(l => addLinkField(l));
  document.getElementById('modal').classList.add('active');
};

window.deleteGame = (id) => { if (confirm("Deseja excluir?")) db.ref("games/" + id).remove(); };

window.addLinkField = (val = "") => {
  const container = document.getElementById('linksContainer');
  if (container.querySelectorAll('.link-input').length >= 4) return;
  const row = document.createElement('div');
  row.style = "display:flex; align-items:center; gap:8px; margin-bottom:8px;";
  row.innerHTML = `<md-outlined-text-field label="URL" class="link-input" style="flex:1" value="${val}"></md-outlined-text-field>
    <md-icon-button type="button" onclick="this.parentElement.remove(); document.getElementById('addLinkBtn').disabled = false;"><md-icon>delete</md-icon></md-icon-button>`;
  container.appendChild(row);
  if (container.querySelectorAll('.link-input').length >= 4) document.getElementById('addLinkBtn').disabled = true;
};

window.saveGame = () => {
  const id = document.getElementById("gameId").value;
  const nameField = document.getElementById("name");
  const descField = document.getElementById("desc");
  const categoryField = document.getElementById("category");
  
  const name = nameField.value.trim();
  const desc = descField.value.trim();
  const category = categoryField.value.trim() || "Geral";
  const pinned = document.getElementById("pinned").checked;
  const links = Array.from(document.querySelectorAll(".link-input")).map(i => i.value).filter(v => v);
  const file = document.getElementById("banner").files[0];

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
    const data = { name, desc, category, links, pinned };
    if (imgUrl) {
      data.banner = imgUrl;
    } else if (id) {
      const oldGame = allGames.find(g => g.id === id);
      if (oldGame && oldGame.banner) data.banner = oldGame.banner;
    }
    if (id) db.ref("games/" + id).update(data); else db.ref("games").push(data);
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
