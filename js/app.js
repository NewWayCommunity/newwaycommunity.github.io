const firebaseConfig = {
  apiKey: "AIzaSyC8J21BmeYHfco3X1qx6_KCi4RU1wqOoIo",
  authDomain: "new-way-community-7e8a0.firebaseapp.com",
  databaseURL: "https://new-way-community-7e8a0-default-rtdb.firebaseio.com",
  projectId: "new-way-community-7e8a0",
  storageBucket: "new-way-community-7e8a0.firebasestorage.app",
  messagingSenderId: "921355438217",
  appId: "1:921355438217:web:63bcae438ef6c14ee85e58"
};

// Inicialização segura do Firebase (Mantido 100% original)
if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}
const db = firebase.database();

let allGames     = [];
let isInitialLoad = true;
let isAdmin      = false;
let visibleCount = 8;
let lastCategoryList = "";
let searchTimer;
let currentDbRef = null;

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
  
  // Atualiza UI dos botões da sidebar/menu de forma reativa
  document.querySelectorAll('.sidebar-item, .nav-item').forEach(btn => {
    if (btn.getAttribute('data-section') === section) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  if (currentDbRef) currentDbRef.off();
  
  const gamesGrid = document.querySelector('.games-grid');
  if (gamesGrid) gamesGrid.innerHTML = '<div class="skeleton-wrapper"></div>'; // Placeholder suave
  
  currentDbRef = db.ref(section);
  currentDbRef.on('value', snapshot => {
    allGames = [];
    snapshot.forEach(child => {
      allGames.push({ id: child.key, ...child.val() });
    });
    // Ordenação: Fixados (pinned) primeiro
    allGames.sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));
    renderGames();
    isInitialLoad = false;
  });
  
  closeSidebar();
}

/* ── CORREÇÃO DE BUG: VALIDAÇÃO MATERIAL WEB COMPONENT ── */
function validateField(field, condition, errorMessage) {
  if (condition) {
    field.error = true;
    // CORREÇÃO: Componentes @material/web usam 'supportingText' para mensagens de erro visíveis
    field.supportingText = errorMessage;
    return false;
  } else {
    field.error = false;
    field.supportingText = "";
    return true;
  }
}

/* ── OTIMIZAÇÃO DO CANVAS DE ESTRELAS (ANTI-LAG) ─────── */
const canvas = document.getElementById('starsCanvas');
if (canvas) {
  const ctx = canvas.getContext('2d');
  const stars = [];
  let animationFrameId = null;

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }

  function randomStar() {
    return {
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      radius: Math.random() * 1.2 + 0.4,
      speed: Math.random() * 0.4 + 0.1,
      opacity: Math.random() * 0.6 + 0.3,
      twinkle: Math.random() * Math.PI * 2,
    };
  }

  function init() { 
    resize(); 
    stars.length = 0; 
    for (let i = 0; i < 100; i++) stars.push(randomStar()); 
  }

  function draw() {
    // CORREÇÃO: Se não estiver no modo escuro, cancela o loop completamente economizando CPU/Bateria
    if (!document.documentElement.classList.contains('dark')) {
      animationFrameId = null;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      return; 
    }
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const now = Date.now() / 1000;
    
    stars.forEach(s => {
      const op = s.opacity * (0.7 + 0.3 * Math.sin(now * 0.8 + s.twinkle));
      // Cores mágicas do tema roxo/neon sutil
      const hue = Math.random() > 0.8 ? '275, 85%, 85%' : '0, 0%, 100%';
      ctx.beginPath(); 
      ctx.arc(s.x, s.y, s.radius, 0, Math.PI * 2);
      ctx.fillStyle = `hsla(${hue}, ${op})`; 
      ctx.fill();
      
      s.y += s.speed;
      if (s.y > canvas.height + 2) { 
        s.y = -2; 
        s.x = Math.random() * canvas.width; 
      }
    });
    animationFrameId = requestAnimationFrame(draw);
  }

  window.addEventListener('resize', () => {
    resize();
    if (document.documentElement.classList.contains('dark') && !animationFrameId) {
      animationFrameId = requestAnimationFrame(draw);
    }
  });

  // Listener inteligente para pausar/retomar baseado na troca de tema
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.attributeName === 'class') {
        const isDark = document.documentElement.classList.contains('dark');
        if (isDark && !animationFrameId) {
          animationFrameId = requestAnimationFrame(draw);
        } else if (!isDark && animationFrameId) {
          cancelAnimationFrame(animationFrameId);
          animationFrameId = null;
          ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
      }
    });
  });
  observer.observe(document.documentElement, { attributes: true });

  init();
  if (document.documentElement.classList.contains('dark')) {
    animationFrameId = requestAnimationFrame(draw);
  }
}
