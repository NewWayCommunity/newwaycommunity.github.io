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
  if (pass === lastAttemptedPass && passField.errorText === "Senha incorreta.") {
    passField.error = true;
    passField.errorText = "Altere a senha antes de tentar novamente.";
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
      if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        passField.errorText = "Senha incorreta.";
      } else if (err.code === 'auth/user-not-found') {
        passField.errorText = "Usuário não encontrado.";
      } else {
        passField.errorText = "Erro ao entrar: " + err.message;
      }
    });
}

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

window.matchMedia('(prefers-color-scheme: dark').addEventListener('change', () => {
  if ((localStorage.getItem('user-theme') || 'auto') === 'auto') applyTheme('auto');
});

function renderGames() {
  const grid = document.getElementById('games');
  const searchTerm = document.getElementById('search').value.toLowerCase();
  const selectedCategory = document.getElementById('categoryFilter')?.value || "";

  if (isInitialLoad) return;

  const filtered = allGames.filter(g =>
    g.name.toLowerCase().includes(searchTerm) &&
    (!selectedCategory || g.category === selectedCategory)
  );

  grid.innerHTML = "";

  const sorted = [...filtered].reverse().sort((a, b) =>
    (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0)
  );

  sorted.forEach(game => {
    const card = document.createElement('md-elevated-card');
    card.className = `game-card ${game.pinned ? 'pinned' : ''}`;

    card.innerHTML = `
      ${game.pinned ? '<div class="pin-icon"><md-icon>push_pin</md-icon></div>' : ''}

      ${isAdmin ? `
        <div class="admin-actions">
          <md-filled-icon-button onclick="editGame('${game.id}')">
            <md-icon>edit</md-icon>
          </md-filled-icon-button>

          <md-filled-icon-button onclick="deleteGame('${game.id}')"
            style="--md-filled-icon-button-container-color: var(--md-sys-color-error);">
            <md-icon>delete</md-icon>
          </md-filled-icon-button>
        </div>` : ""}

      ${game.banner ? `<img src="${game.banner}">` : ""}

      <div class="card-body">
        <h3>${game.name}</h3>

        <p style="font-size:14px; opacity:0.8;">
          ${game.desc || ''}
        </p>

        ${game.category ? `<p style="font-size:12px; opacity:0.6;">${game.category}</p>` : ""}

        <div style="display:flex; gap:8px; flex-wrap:wrap;">
          ${(game.links || []).map((l, i) =>
            `<md-filled-tonal-button onclick="window.open('${l}')">
              Link ${i + 1}
            </md-filled-tonal-button>`
          ).join('')}
        </div>
      </div>
    `;

    grid.appendChild(card);
  });
}

// 🔥 ATUALIZA CATEGORIAS
function updateCategories() {
  const select = document.getElementById("categoryFilter");
  if (!select) return;

  const categories = [...new Set(allGames.map(g => g.category).filter(Boolean))];

  select.innerHTML = '<md-select-option value="">Todas</md-select-option>';

  categories.forEach(cat => {
    select.innerHTML += `<md-select-option value="${cat}">${cat}</md-select-option>`;
  });
}

db.ref("games").on("value", snap => {
  const data = snap.val() || {};
  allGames = Object.keys(data).map(key => ({ ...data[key], id: key }));
  isInitialLoad = false;

  updateCategories(); // 🔥 aqui
  renderGames();
});

window.openAddModal = () => {
  document.getElementById("modalTitle").innerText = "Adicionar Jogo";
  document.getElementById("gameId").value = "";
  document.getElementById("gameForm").reset();
  document.getElementById("linksContainer").innerHTML = "";
  document.getElementById('modal').classList.add('active');
};

window.closeModal = () =>
  document.getElementById('modal').classList.remove('active');

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

window.deleteGame = (id) => {
  if (confirm("Deseja excluir?"))
    db.ref("games/" + id).remove();
};

window.addLinkField = (val = "") => {
  const container = document.getElementById('linksContainer');

  const input = document.createElement('md-outlined-text-field');
  input.label = "URL";
  input.value = val;
  input.classList.add("link-input");

  container.appendChild(input);
};

window.saveGame = () => {
  const id = document.getElementById("gameId").value;
  const name = document.getElementById("name").value.trim();
  const desc = document.getElementById("desc").value;
  const category = document.getElementById("category").value;
  const pinned = document.getElementById("pinned")?.checked || false;

  const links = Array.from(document.querySelectorAll(".link-input"))
    .map(i => i.value)
    .filter(v => v);

  const file = document.getElementById("banner").files[0];

  if (!name) {
    alert("Nome obrigatório!");
    return;
  }

  const pushData = (img) => {
    const data = { name, desc, category, links, pinned };
    if (img) data.banner = img;

    if (id) {
      db.ref("games/" + id).update(data);
    } else {
      db.ref("games").push(data);
    }

    closeModal();
  };

  if (file) {
    const reader = new FileReader();
    reader.onload = e => pushData(e.target.result);
    reader.readAsDataURL(file);
  } else {
    pushData(null);
  }
};
