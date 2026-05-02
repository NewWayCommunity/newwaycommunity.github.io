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

firebase.auth().onAuthStateChanged(user => {
  isAdmin = !!user;
  document.getElementById('add-btn').style.display = isAdmin ? 'flex' : 'none';
  document.getElementById('auth-icon').innerText = isAdmin ? 'logout' : 'admin_panel_settings';
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

function login() {
  const email = document.getElementById('login-email').value;
  const pass = document.getElementById('login-pass').value;
  firebase.auth().signInWithEmailAndPassword(email, pass)
    .then(() => {
      closeLoginModal();
      document.getElementById('login-email').value = "";
      document.getElementById('login-pass').value = "";
    })
    .catch(err => alert(err.message));
}

const themes = ['auto', 'light', 'dark'];
const themeIcons = { auto: 'brightness_auto', light: 'light_mode', dark: 'dark_mode' };

function applyTheme(theme) {
  const html = document.documentElement;
  let target = theme;
  if (theme === 'auto') target = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  html.classList.remove('dark', 'light');
  html.classList.add(target);
  document.getElementById('theme-icon').innerText = themeIcons[theme];
}

window.cycleTheme = () => {
  let current = localStorage.getItem('user-theme') || 'auto';
  let next = themes[(themes.indexOf(current) + 1) % themes.length];
  localStorage.setItem('user-theme', next);
  applyTheme(next);
};
applyTheme(localStorage.getItem('user-theme') || 'auto');

function renderGames() {
  const grid = document.getElementById('games');
  const searchTerm = document.getElementById('search').value.toLowerCase();
  if (isInitialLoad) return;
  const filtered = allGames.filter(g => g.name.toLowerCase().includes(searchTerm));
  grid.innerHTML = "";
  if (filtered.length === 0) {
    grid.innerHTML = `<p style="grid-column: 1/-1; text-align: center; opacity: 0.6;">Nenhum jogo encontrado.</p>`;
    return;
  }
  filtered.sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0)).forEach(game => {
    const card = document.createElement('md-elevated-card');
    card.className = `game-card ${game.pinned ? 'pinned' : ''}`;
    card.innerHTML = `
            ${game.pinned ? '<div class="pin-icon">push_pin</div>' : ''}
            ${isAdmin ? `
                <div style="position:absolute; top:8px; left:8px; z-index:10; display:flex; gap:4px;">
                    <md-filled-icon-button onclick="editGame('${game.id}')" style="--md-filled-icon-button-container-width: 32px; --md-filled-icon-button-container-height: 32px;"><md-icon style="font-size:18px;">edit</md-icon></md-filled-icon-button>
                    <md-filled-icon-button onclick="deleteGame('${game.id}')" style="--md-filled-icon-button-container-color: var(--md-sys-color-error); --md-filled-icon-button-container-width: 32px; --md-filled-icon-button-container-height: 32px;"><md-icon style="font-size:18px;">delete</md-icon></md-filled-icon-button>
                </div>` : ''}
            <img src="${game.banner}">
            <div class="card-body">
                <h3>${game.name}</h3>
                <p style="margin:12px 0; font-size:14px; opacity:0.8; color: var(--md-sys-color-on-surface-variant);">${game.desc || ''}</p>
                <div style="display:flex; gap:8px; flex-wrap:wrap;">
                    ${(game.links || []).map((l, i) => `<md-filled-tonal-button onclick="window.open('${l}')">Link ${i + 1}</md-filled-tonal-button>`).join('')}
                </div>
            </div>`;
    grid.appendChild(card);
  });
}

db.ref("games").on("value", snap => {
  const data = snap.val() || {};
  allGames = Object.keys(data).map(key => ({ ...data[key], id: key }));
  isInitialLoad = false;
  renderGames();
});

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
  document.getElementById("pinned").checked = !!game.pinned;
  document.getElementById("linksContainer").innerHTML = "";
  if (game.links) game.links.forEach(l => addLinkField(l));
  document.getElementById('modal').classList.add('active');
};

window.deleteGame = (id) => { if (confirm("Excluir?")) db.ref("games/" + id).remove(); };

window.addLinkField = (val = "") => {
  const container = document.getElementById('linksContainer');
  if (container.querySelectorAll('.link-input').length >= 4) return;
  const row = document.createElement('div');
  row.style = "display:flex; align-items:center; gap:8px; margin-bottom:8px;";
  row.innerHTML = `
        <md-outlined-text-field label="URL" class="link-input" style="flex:1" value="${val}"></md-outlined-text-field>
        <md-icon-button type="button" onclick="this.parentElement.remove(); document.getElementById('addLinkBtn').disabled = false;">
            <md-icon>delete</md-icon>
        </md-icon-button>`;
  container.appendChild(row);
  if (container.querySelectorAll('.link-input').length >= 4) document.getElementById('addLinkBtn').disabled = true;
};

window.saveGame = () => {
  const id = document.getElementById("gameId").value;
  const name = document.getElementById("name").value;
  const desc = document.getElementById("desc").value;
  const pinned = document.getElementById("pinned").checked;
  const links = Array.from(document.querySelectorAll(".link-input")).map(i => i.value).filter(v => v);
  const file = document.getElementById("banner").files[0];
  const pushData = (imgUrl) => {
    const data = { name, desc, links, pinned };
    if (imgUrl) data.banner = imgUrl;
    if (id) db.ref("games/" + id).update(data);
    else db.ref("games").push(data);
    closeModal();
  };
  if (file) {
    const reader = new FileReader();
    reader.onload = (e) => pushData(e.target.result);
    reader.readAsDataURL(file);
  } else pushData(null);
};
