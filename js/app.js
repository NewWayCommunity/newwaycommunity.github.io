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

const themes = ['auto', 'light', 'dark'];
const themeIcons = { auto: 'brightness_auto', light: 'light_mode', dark: 'dark_mode' };

function applyTheme(theme) {
    const html = document.documentElement;
    let target = theme;
    if (theme === 'auto') {
        target = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    html.classList.remove('dark', 'light');
    html.classList.add(target);
    const icon = document.getElementById('theme-icon');
    if (icon) icon.innerText = themeIcons[theme];
}

window.cycleTheme = () => {
    let current = localStorage.getItem('user-theme') || 'auto';
    let next = themes[(themes.indexOf(current) + 1) % themes.length];
    localStorage.setItem('user-theme', next);
    applyTheme(next);
};

applyTheme(localStorage.getItem('user-theme') || 'auto');
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if ((localStorage.getItem('user-theme') || 'auto') === 'auto') applyTheme('auto');
});

function renderGames() {
    const grid = document.getElementById('games');
    const searchTerm = document.getElementById('search').value.toLowerCase();
    if (isInitialLoad) return;
    const filtered = allGames.filter(g => 
        g.name.toLowerCase().includes(searchTerm) || 
        (g.desc && g.desc.toLowerCase().includes(searchTerm))
    );
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
            <img src="${game.banner}">
            <div class="card-body">
                <h3>${game.name}</h3>
                <p style="margin:12px 0; font-size:14px; opacity:0.8; color: var(--md-sys-color-on-surface-variant);">${game.desc || ''}</p>
                <div style="display:flex; gap:8px; flex-wrap:wrap;">
                    ${(game.links || []).map((l, i) => `<md-filled-tonal-button onclick="window.open('${l}')">Link ${i+1}</md-filled-tonal-button>`).join('')}
                </div>
            </div>
        `;
        grid.appendChild(card);
    });
}

db.ref("games").on("value", snap => {
    const data = snap.val() || {};
    allGames = Object.keys(data).map(key => ({...data[key], id: key}));
    isInitialLoad = false;
    renderGames();
});

window.openAddModal = () => document.getElementById('modal').classList.add('active');
window.closeModal = () => document.getElementById('modal').classList.remove('active');

window.addLinkField = () => {
    const container = document.getElementById('linksContainer');
    if (container.querySelectorAll('.link-input').length >= 4) return;
    const row = document.createElement('div');
    row.style = "display:flex; align-items:center; gap:8px;";
    row.innerHTML = `
        <md-outlined-text-field label="URL" class="link-input" style="flex:1"></md-outlined-text-field>
        <md-icon-button type="button" onclick="this.parentElement.remove(); document.getElementById('addLinkBtn').disabled = false;">
            <md-icon>delete</md-icon>
        </md-icon-button>
    `;
    container.appendChild(row);
    if (container.querySelectorAll('.link-input').length >= 4) document.getElementById('addLinkBtn').disabled = true;
};

window.saveGame = () => {
    const name = document.getElementById("name").value;
    const desc = document.getElementById("desc").value;
    const links = Array.from(document.querySelectorAll(".link-input")).map(i => i.value).filter(v => v);
    const file = document.getElementById("banner").files[0];
    if (!name || !file) return alert("Eksik bilgi!");
    const reader = new FileReader();
    reader.onload = (e) => {
        db.ref("games").push({ name, desc, links, banner: e.target.result, pinned: false });
        closeModal();
        document.getElementById('gameForm').reset();
        document.getElementById('linksContainer').innerHTML = "";
        document.getElementById('addLinkBtn').disabled = false;
    };
    reader.readAsDataURL(file);
};
