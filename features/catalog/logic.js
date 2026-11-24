
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyCEGeQkz5ghI28VXuJa0rkqOYcY6vI8CIs",
  authDomain: "primepathcommunity-86dd0.firebaseapp.com",
  projectId: "primepathcommunity-86dd0",
  storageBucket: "primepathcommunity-86dd0.firebasestorage.app",
  messagingSenderId: "146948112795",
  appId: "1:146948112795:web:c630f3b5e9e9fc6bf8613e",
  measurementId: "G-NHBHRVZXXW"
};

const SECTIONS = ["Jogos Android", "GoldSrc Engine", "Source Engine", "Apps Premium"];
(function populateAdminCategoryFilter(){
  const sel = document.getElementById('adminCategoryFilter');
  SECTIONS.forEach(sec=>{
    const opt = document.createElement('option');
    opt.value = sec;
    opt.textContent = sec;
    sel.appendChild(opt);
  });
})();

const NEW_BADGE_DAYS = 2;
const LINK_UPDATE_BADGE_DAYS = 3;

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAnalytics, isSupported as analyticsIsSupported } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-analytics.js";
import {
  initializeAuth, indexedDBLocalPersistence, browserLocalPersistence,
  signInWithEmailAndPassword, signInWithCustomToken, signOut, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, collection, addDoc as fsAddDoc, updateDoc as fsUpdateDoc, deleteDoc as fsDeleteDoc, doc, getDoc,
  onSnapshot, serverTimestamp, writeBatch as fsWriteBatch
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const app = initializeApp(FIREBASE_CONFIG);
analyticsIsSupported().then(ok => { if(ok) getAnalytics(app); }).catch(()=>{});
// A sessão do painel continua depois de fechar o navegador, até vencer no servidor ou até tocar em Sair.
const auth = initializeAuth(app, { persistence: [indexedDBLocalPersistence, browserLocalPersistence] });
const db = getFirestore(app);

async function getDiscordWebhook(category){
  try{
    const docSnap = await getDoc(doc(db, "config", "discord"));
    const data = docSnap.data();
    if(!data) return null;
    if(category === 'Jogos Android') return data.androidWebhook;
    if(category === 'GoldSrc Engine') return data.goldsrcWebhook;
    if(category === 'Source Engine') return data.sourceWebhook;
    if(category === 'Apps Premium') return data.premiumWebhook;
    return null;
  }catch(err){
    console.warn('Não foi possível buscar o webhook:', err);
    return null;
  }
}

async function getDiscordDiretoWebhook(category){
  try{
    const docSnap = await getDoc(doc(db, "config", "discordDireto"));
    const data = docSnap.data();
    if(!data) return null;
    if(category === 'Jogos Android') return data.androidWebhook;
    if(category === 'GoldSrc Engine') return data.goldsrcWebhook;
    if(category === 'Source Engine') return data.sourceWebhook;
    if(category === 'Apps Premium') return data.premiumWebhook;
    return null;
  }catch(err){
    console.warn('Não foi possível buscar o webhook de link direto:', err);
    return null;
  }
}

/* ===== Catálogo para visitantes: cópia pronta no servidor, em vez de ler o Firestore inteiro a cada visita =====
   - Visitantes baixam /api/catalog (a Vercel guarda a resposta por uns minutos para todo mundo): custo ~zero no Firestore.
   - Quem tem sessão de administrador usa as escutas ao vivo do Firestore, só quando abre o painel.
   - Depois de salvar/apagar algo no painel, o servidor atualiza a cópia (uma vez, 20 s depois da última alteração).
   - Se a cópia não existir ou a API falhar, o site volta sozinho a ler o Firestore, como antes. */
let rebuildTimer = null;
let rebuildToken = '';
async function sendCatalogRebuild(keepalive){
  try{
    const token = rebuildToken || (auth.currentUser ? await auth.currentUser.getIdToken() : '');
    if(!token) return;
    await fetch('/api/catalog-rebuild', { method: 'POST', keepalive: !!keepalive, cache: 'no-store', credentials: 'omit', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: '{}' });
  }catch(err){}
}
function scheduleCatalogRebuild(){
  if(!auth.currentUser) return;
  clearTimeout(rebuildTimer);
  auth.currentUser.getIdToken().then(t => { rebuildToken = t; }).catch(()=>{});
  rebuildTimer = setTimeout(()=>{ rebuildTimer = null; sendCatalogRebuild(false); }, 20000);
}
// Se o painel for fechado antes dos 20 s, envia na hora para a cópia não ficar desatualizada.
document.addEventListener('visibilitychange', ()=>{
  if(document.visibilityState === 'hidden' && rebuildTimer){ clearTimeout(rebuildTimer); rebuildTimer = null; sendCatalogRebuild(true); }
});
async function addDoc(...args){ const r = await fsAddDoc(...args); scheduleCatalogRebuild(); return r; }
async function updateDoc(...args){ const r = await fsUpdateDoc(...args); scheduleCatalogRebuild(); return r; }
async function deleteDoc(...args){ const r = await fsDeleteDoc(...args); scheduleCatalogRebuild(); return r; }
function writeBatch(...args){
  const b = fsWriteBatch(...args);
  const commit = b.commit.bind(b);
  b.commit = async ()=>{ const r = await commit(); scheduleCatalogRebuild(); return r; };
  return b;
}

/* ===== Acesso ao painel: palavra-chave + login, tudo validado no backend (/api, Vercel Functions) =====
   1) Palavra-chave na busca + Enter  ->  /api/admin-gate devolve um bilhete de uso único.
   2) Login por e-mail e senha        ->  /api/admin-unlock troca o bilhete por uma sessão administrativa.
   As regras do Firestore só aceitam escrita com essa sessão. Nada aqui decide quem é admin. */
const API_CODES = { 401: 'unauthenticated', 403: 'permission-denied', 429: 'resource-exhausted' };
const apiError = code => Object.assign(new Error(code), { code });
async function api(name, body, withAuth){
  const headers = { 'Content-Type': 'application/json' };
  if(withAuth){
    const u = auth.currentUser;
    if(!u) throw apiError('unauthenticated');
    headers.Authorization = 'Bearer ' + await u.getIdToken();
  }
  let res;
  try{ res = await fetch('/api/' + name, { method: 'POST', headers, body: JSON.stringify(body || {}), cache: 'no-store', credentials: 'omit' }); }
  catch{ throw apiError('unavailable'); }
  let data = null;
  try{ data = await res.json(); }catch{}
  if(!res.ok) throw apiError(API_CODES[res.status] || 'internal');
  return data || {};
}

let gateTicket = null;      // bilhete de uso único: fica só na memória da página, nunca em storage
let adminOpen = false;      // o painel está aberto na tela
let adminTimer = null;
let authRun = 0;
let justUnlocked = false;
let loginBusy = false;
let gateBusy = false;
let loginDenied = false;
let adminSessionActive = false;   // há sessão administrativa confirmada
let liveStarted = false;          // escutas ao vivo do Firestore já abertas

let allGames = [];
let genreDocs = [];
let devByDocs = [];
let portByDocs = [];
let activeSection = SECTIONS[0];
let editingGameId = null;
let visibleLinkRows = 1;
let editingArchivedLinks = [];
let gamesLoaded = false;
let adminSearchTerm = "";
let adminCategoryFilter = "all";

const sectionIcon = { "Jogos Android":"smartphone", "GoldSrc Engine":"terminal", "Source Engine":"engineering", "Apps Premium":"apps" };
const sectionIconSvg = {
  "GoldSrc Engine": `<svg class="ico nav-icon-svg" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M4,3.2 l0,3.25 l2.29,0 l3.5,5.66 l-5.51,8.61 l4.37,0 l3.43,-5.19 l3.28,5.19 l4.51,0 l0,-3.11 l-2.1,-0.04 l-3.53,-5.62 l5.48,-8.76 l-4.22,0 l-3.42,5.33 l-3.46,-5.33 z"/></svg>`,
  "Source Engine": `<svg class="ico nav-icon-svg" viewBox="0 0 128 128" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="m104.564 4.343-63.813.363c-13.179-.677-26.16 2.55-37.387 9.008l.011.01c-5.867 3.203-3.602 12.117 3.083 12.129 1.866 0 3.53-.79 4.709-2.043a55.05 55.05 0 0 1 47.029-2.464c28.133 11.546 41.626 43.84 30.08 71.973a54.8 54.8 0 0 1-13.307 19.27l.054.069c-6.767 3.899 4.552 15.634 8.693 9.013A67.4 67.4 0 0 0 99.93 98.103c.262-.63 26.411-64.325 26.475-64.496 4.458-10.876-.742-23.307-11.616-27.77-2.934-1.206-5.675-1.483-8.838-1.494zM32.36 37.063c-14.053 0-28.49 4.304-28.49 21.019 0 11.52 10.378 15.194 20.762 17.477 12.918 2.784 20.39 4.683 20.39 10.128 0 6.336-6.587 8.363-11.776 8.363-7.094 0-13.675-3.168-13.803-11.02H2.351c.763 17.345 15.573 23.04 30.773 23.04 14.939 0 29.883-5.567 29.883-22.788 0-12.16-10.256-15.958-20.768-18.363-10.256-2.405-20.39-3.29-20.39-9.75 0-5.317 5.953-6.08 10.011-6.08 6.453 0 11.77 1.905 12.277 8.865h17.094c-1.387-16.08-14.56-20.89-28.87-20.89z"/></svg>`
};

const sectionShort = { "Jogos Android":"Android", "GoldSrc Engine":"GoldSrc", "Source Engine":"Source", "Apps Premium":"Apps" };
const sectionBlurb = { "Jogos Android":"Jogos para Android", "GoldSrc Engine":"Ports do GoldSrc Engine", "Source Engine":"Ports do Source Engine", "Apps Premium":"Apps premium para Android" };
const $ = (id)=> document.getElementById(id);
let viewMode = "home"; // home | section | favorites
let activeGenre = "all";
let prevViewState = { mode:"home", section:null };
function sectionIconHtml(s){ return sectionIconSvg[s] || `<span class="ico msi">${sectionIcon[s]||'folder'}</span>`; }
function genreKey(g){ return (g.genre && g.genre.trim()) || 'Outros'; }
function genreNamesOf(list){
  const counts = new Map();
  list.forEach(g=>{ const k = genreKey(g); counts.set(k, (counts.get(k)||0) + 1); });
  const names = Array.from(counts.keys()).sort((a,b)=>{
    if(a === 'Outros') return 1;
    if(b === 'Outros') return -1;
    return a.localeCompare(b,'pt-BR');
  });
  return { names, counts };
}

if('serviceWorker' in navigator){
  window.addEventListener('load', ()=>{
    navigator.serviceWorker.register('sw.js').catch(()=>{});
  });
}
let deferredInstallPrompt = null;
window.addEventListener('beforeinstallprompt', (e)=>{
  e.preventDefault();
  deferredInstallPrompt = e;
  document.getElementById('installBtn').classList.remove('hidden');
});
document.getElementById('installBtn').addEventListener('click', async ()=>{
  if(!deferredInstallPrompt) return;
  deferredInstallPrompt.prompt();
  await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  document.getElementById('installBtn').classList.add('hidden');
});
window.addEventListener('appinstalled', ()=>{
  document.getElementById('installBtn').classList.add('hidden');
});

const sidebar = document.getElementById('sidebar');
const backdrop = document.getElementById('sidebarBackdrop');
function openDrawer(){ sidebar.classList.add('open'); backdrop.classList.add('open'); document.getElementById('menuBtn').setAttribute('aria-expanded','true'); }
function closeDrawer(){ sidebar.classList.remove('open'); backdrop.classList.remove('open'); document.getElementById('menuBtn').setAttribute('aria-expanded','false'); }
document.getElementById('menuBtn').onclick = openDrawer;
$('closeDrawerBtn').onclick = closeDrawer;
backdrop.onclick = closeDrawer;
document.addEventListener('keydown', e => { if(e.key === 'Escape'){ closeDrawer(); if(!document.getElementById('detailOverlay').classList.contains('hidden')) closeDetail(); document.getElementById('gameFormOverlay').classList.add('hidden'); document.getElementById('archivedLinksOverlay').classList.add('hidden'); } });

function escapeHtml(str){
  const d = document.createElement('div');
  d.textContent = str ?? '';
  return d.innerHTML;
}
function timeValue(ts){
  if(!ts) return 0;
  if(typeof ts.toMillis === 'function') return ts.toMillis();
  if(typeof ts.seconds === 'number') return ts.seconds * 1000;
  return 0;
}
function isRecentlyAdded(g){
  const ms = timeValue(g.createdAt);
  if(!ms) return false;
  return (Date.now() - ms) < NEW_BADGE_DAYS*24*60*60*1000;
}
function isRecentlyLinkUpdated(g){
  const ms = timeValue(g.linksUpdatedAt);
  if(!ms) return false;
  return (Date.now() - ms) < LINK_UPDATE_BADGE_DAYS*24*60*60*1000;
}
function getLinks(g){
  if(Array.isArray(g.links) && g.links.length > 0){
    return g.links.filter(l => l && l.url).slice(0,4);
  }
  if(g.apkUrl) return [{ name:'', url: g.apkUrl }];
  return [];
}

function slugify(text){
  return (text || '')
    .toString()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
function gameShareHash(g){
  return `#jogo=${slugify(g.name)}-${g.id}`;
}
function buildShareUrl(g){
  return `${window.location.origin}${window.location.pathname}${gameShareHash(g)}`;
}
function buildDiscordEmbed(g, opts={}){
  return {
    title: g.name || 'Novo jogo',
    url: opts.direct ? g.directUrl : buildShareUrl(g),
    description: (g.description || '').slice(0, 300),
    color: opts.direct ? 0xFF7FB8 : 0xB69CFF,
    thumbnail: g.iconUrl ? { url: g.iconUrl } : undefined,
    image: g.bannerUrl ? { url: g.bannerUrl } : undefined,
    fields: [
      { name: 'Gênero', value: g.genre || '—', inline: true },
      { name: 'Versão', value: g.version || '—', inline: true },
      { name: 'Tamanho', value: g.fileSize || '—', inline: true },
      { name: 'Arquitetura', value: formatArchitectures(g.architectures), inline: true }
    ],
    footer: { text: opts.direct ? 'New Way Community • Link Direto' : 'New Way Community' },
    timestamp: new Date().toISOString()
  };
}

async function postToDiscord(g){
  const webhookUrl = await getDiscordWebhook(g.category);
  if(!webhookUrl) return 'not_configured';
  const embed = buildDiscordEmbed(g);
  try{
    const res = await fetch(`${webhookUrl}?wait=true`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ embeds: [embed] })
    });
    const data = await res.json().catch(()=>null);
    if(data && data.id && g.id){
      try{ await updateDoc(doc(db,'games',g.id), { discordMessageId: data.id }); }
      catch(err){ console.warn('Não foi possível salvar o ID da mensagem do Discord:', err); }
    }
    return 'ok';
  }catch(err){
    console.error('Não foi possível avisar o Discord:', err);
    return 'failed';
  }
}

async function postToDiscordDireto(g){
  const webhookUrl = await getDiscordDiretoWebhook(g.category);
  if(!webhookUrl) return 'not_configured';
  if(!g.directUrl) return 'no_direct_url';
  const embed = buildDiscordEmbed(g, { direct: true });
  try{
    const res = await fetch(`${webhookUrl}?wait=true`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ embeds: [embed] })
    });
    const data = await res.json().catch(()=>null);
    if(data && data.id && g.id){
      try{ await updateDoc(doc(db,'games',g.id), { discordDiretoMessageId: data.id }); }
      catch(err){ console.warn('Não foi possível salvar o ID da mensagem direta do Discord:', err); }
    }
    return 'ok';
  }catch(err){
    console.error('Não foi possível avisar o Discord (link direto):', err);
    return 'failed';
  }
}

async function editDiscordMessage(g){
  if(!g.discordMessageId) return 'no_message';
  const webhookUrl = await getDiscordWebhook(g.category);
  if(!webhookUrl) return 'not_configured';
  const embed = buildDiscordEmbed(g);
  try{
    await fetch(`${webhookUrl}/messages/${g.discordMessageId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ embeds: [embed] })
    });
    return 'ok';
  }catch(err){
    console.error('Não foi possível editar a mensagem do Discord:', err);
    return 'failed';
  }
}

async function editDiscordDiretoMessage(g){
  if(!g.discordDiretoMessageId) return 'no_message';
  const webhookUrl = await getDiscordDiretoWebhook(g.category);
  if(!webhookUrl) return 'not_configured';
  const embed = buildDiscordEmbed(g, { direct: true });
  try{
    await fetch(`${webhookUrl}/messages/${g.discordDiretoMessageId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ embeds: [embed] })
    });
    return 'ok';
  }catch(err){
    console.error('Não foi possível editar a mensagem direta do Discord:', err);
    return 'failed';
  }
}

async function postToTelegram(g) {
    try {
        const docSnap = await getDoc(doc(db, "config", "telegram"));
        const data = docSnap.data();
        const BOT_TOKEN = data.botToken;
        const CHAT_ID = "-1004440097559";
        const imageUrl = g.bannerUrl || g.iconUrl;

        const threadMap = {
            "Jogos Android": 77,
            "GoldSrc Engine": 78,
            "Source Engine": 79,
            "Apps Premium": 80
        };
        const threadId = threadMap[g.category];

        const gameUrl = buildShareUrl(g);
        let caption = `<a href="${gameUrl}"><b>${escapeHtml(g.name)}</b></a>\n\n`;
        
        if (g.category) caption += `<b>Seção:</b> ${escapeHtml(g.category)}\n`;
        if (g.genre) caption += `<b>Gênero:</b> ${escapeHtml(g.genre)}\n`;
        if (g.devBy) caption += `<b>Dev by:</b> ${escapeHtml(g.devBy)}\n`;
        if (g.portBy) caption += `<b>Port by:</b> ${escapeHtml(g.portBy)}\n`;
        if (g.version) caption += `<b>Versão:</b> ${escapeHtml(g.version)}\n`;
        if (g.fileSize) caption += `<b>Tamanho:</b> ${escapeHtml(g.fileSize)}\n`;
        
        let archs = formatArchitectures(g.architectures);
        if (archs && archs !== '—') caption += `<b>Arquitetura:</b> ${escapeHtml(archs)}\n`;
        if (g.description && g.description.trim() !== '') {
            const cleanDesc = escapeHtml(g.description);
            const snippet = cleanDesc.slice(0, 300);
            caption += `\n${snippet}${cleanDesc.length > 300 ? '...' : ''}`;
        }

        let replyMarkup = "";
        if (g.links && g.links.length > 0) {
            const inlineKeyboard = g.links.map((link, index) => {
                let btnObj = { 
                    text: link.name ? link.name : (index === 0 ? "Baixar APK" : `Link ${index + 1}`), 
                    url: link.url 
                };
                return [btnObj];
            });
            replyMarkup = JSON.stringify({ inline_keyboard: inlineKeyboard });
        }

        const formData = new FormData();
        formData.append('chat_id', CHAT_ID);
        
        if (threadId) formData.append('message_thread_id', threadId);
        if (replyMarkup) formData.append('reply_markup', replyMarkup);

        if (imageUrl) {
            const imgResponse = await fetch(imageUrl);
            const imgBlob = await imgResponse.blob();
            
            formData.append('photo', imgBlob, 'image.jpg');
            formData.append('caption', caption);
            formData.append('parse_mode', 'HTML');

            await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`, {
                method: 'POST',
                body: formData 
            });
        } else {
            formData.append('text', caption);
            formData.append('parse_mode', 'HTML');
            
            await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
                method: 'POST',
                body: formData
            });
        }
    } catch (err) {
        console.error("Não foi possível avisar o Discord:", err);
    }
}

function idFromGameHash(hash){
  const raw = decodeURIComponent(hash.slice('#jogo='.length));
  const lastDash = raw.lastIndexOf('-');
  return lastDash === -1 ? raw : raw.slice(lastDash + 1);
}
async function shareGame(g){
  const url = buildShareUrl(g);
  if(navigator.share){
    try{ await navigator.share({ title: g.name, url }); }
    catch(err){  }
    return 'shared';
  }
  try{
    await navigator.clipboard.writeText(url);
    return 'copied';
  }catch(err){
    return 'failed';
  }
}

function sortGames(list){
  return [...list].sort((a,b)=>{
    const pa = a.pinned ? 1 : 0, pb = b.pinned ? 1 : 0;
    if(pa !== pb) return pb - pa;
    return timeValue(b.createdAt) - timeValue(a.createdAt);
  });
}

function getFavorites(){
  try{ return JSON.parse(localStorage.getItem('ppc_favorites') || '[]'); }
  catch(e){ return []; }
}
function isFavorite(id){ return getFavorites().includes(id); }
function toggleFavorite(id){
  const favs = getFavorites();
  const idx = favs.indexOf(id);
  if(idx === -1) favs.push(id); else favs.splice(idx,1);
  try{ localStorage.setItem('ppc_favorites', JSON.stringify(favs)); }catch(e){}
}

function renderSkeletons(rows=3, perRow=6){
  const wrap = $('genreCarousels');
  $('emptyState').classList.add('hidden');
  const skeletonCard = `
    <div class="card skeleton-card" aria-hidden="true">
      <div class="thumb"><div class="skel" style="width:100%;height:100%;border-radius:0;"></div></div>
      <div class="skel" style="width:50%;height:12px;border-radius:999px;margin-top:14px;"></div>
      <div class="skel" style="width:80%;height:16px;margin:9px 0;"></div>
      <div class="skel" style="width:60%;height:11px;"></div>
    </div>
  `;
  wrap.innerHTML = Array.from({length:rows}).map((_, i)=>`
    <div class="genre-row" aria-hidden="true">
      <h2 class="genre-title"><span class="skel" style="display:inline-block;width:${90 + i*20}px;height:17px;border-radius:999px;"></span></h2>
      <div class="carousel-track">${skeletonCard.repeat(perRow)}</div>
    </div>
  `).join('');
  $('homeContent').innerHTML = `
    <div class="hero skel" aria-hidden="true" style="border:0;cursor:default;"></div>
    <div class="home-row" aria-hidden="true"><div class="carousel-track">${skeletonCard.repeat(perRow)}</div></div>
  `;
}
renderSkeletons();

function setView(mode, section){
  if(mode === 'favorites' && viewMode !== 'favorites') prevViewState = { mode: viewMode, section: activeSection };
  viewMode = mode;
  if(section) activeSection = section;
  activeGenre = 'all';
  if(mode === 'home') $('searchInput').value = '';
  renderSectionNav();
  renderGrid();
  closeDrawer();
  window.scrollTo({ top:0, behavior:'smooth' });
}
function goHome(){ setView('home'); }

function renderSectionNav(){
  const favCount = getFavorites().filter(id => allGames.some(g=>g.id===id)).length;
  const countHtml = (n)=> gamesLoaded ? `<span class="nav-count">${n}</span>` : '';
  const wrap = $('sectionNav');
  wrap.innerHTML = `
    <button class="nav-item ${viewMode==='home'?'active':''}" data-nav="home" aria-current="${viewMode==='home'?'page':'false'}">
      <span class="ico msi">home</span> Início
    </button>
    ${SECTIONS.map(s=>{
      const count = allGames.filter(g=>g.category===s).length;
      const on = viewMode==='section' && s===activeSection;
      return `
      <button class="nav-item ${on?'active':''}" aria-current="${on?'page':'false'}" data-section="${escapeHtml(s)}">
        ${sectionIconHtml(s)} ${escapeHtml(s)}
        ${countHtml(count)}
      </button>`;
    }).join('')}
    <button class="nav-item ${viewMode==='favorites'?'active':''}" data-nav="favorites" aria-current="${viewMode==='favorites'?'page':'false'}">
      <span class="ico msi">favorite</span> Favoritos
      ${countHtml(favCount)}
    </button>
  `;
  wrap.querySelectorAll('[data-section]').forEach(btn=>{ btn.onclick = ()=> setView('section', btn.dataset.section); });
  wrap.querySelector('[data-nav="home"]').onclick = goHome;
  wrap.querySelector('[data-nav="favorites"]').onclick = ()=> setView('favorites');

  const pills = $('sectionPills');
  pills.innerHTML = SECTIONS.map(s=>{
    const on = viewMode==='section' && s===activeSection;
    return `<button class="pill ${on?'active':''}" role="tab" aria-selected="${on}" data-section="${escapeHtml(s)}">${sectionIconHtml(s)}<span>${escapeHtml(s)}</span></button>`;
  }).join('');
  pills.querySelectorAll('[data-section]').forEach(btn=>{ btn.onclick = ()=> setView('section', btn.dataset.section); });
}
renderSectionNav();

$('homeBtn').onclick = goHome;
$('topFavBtn').onclick = ()=>{
  if(viewMode === 'favorites') setView(prevViewState.mode || 'home', prevViewState.section);
  else setView('favorites');
};

function getAllGenreNames(){
  const merged = new Map();
  [...genreDocs.map(g=>g.name), ...allGames.map(g=>g.genre)].forEach(n=>{
    if(!n) return;
    const trimmed = n.trim();
    const key = trimmed.toLowerCase();
    if(trimmed && !merged.has(key)) merged.set(key, trimmed);
  });
  return Array.from(merged.values()).sort((a,b)=>a.localeCompare(b,'pt-BR'));
}
function renderGenreSuggestList(filterText){
  const listEl = document.getElementById('genreSuggestList');
  const names = getAllGenreNames();
  const filtered = filterText
    ? names.filter(n => n.toLowerCase().includes(filterText.toLowerCase()))
    : names;
  if(filtered.length === 0){
    listEl.classList.add('hidden');
    listEl.innerHTML = '';
    return;
  }
  listEl.innerHTML = filtered.map(n=>`<button type="button" class="genre-suggest-item" data-genre="${escapeHtml(n)}">${escapeHtml(n)}</button>`).join('');
  listEl.classList.remove('hidden');
  listEl.querySelectorAll('[data-genre]').forEach(btn=>{
    btn.addEventListener('mousedown', (e)=>{
      e.preventDefault(); // evita perder o foco do campo antes do clique registrar (essencial no mobile)
      document.getElementById('fGenre').value = btn.dataset.genre;
      listEl.classList.add('hidden');
    });
  });
}
document.getElementById('fGenre').addEventListener('input', (e)=> renderGenreSuggestList(e.target.value.trim()));
document.getElementById('fGenre').addEventListener('focus', (e)=> renderGenreSuggestList(e.target.value.trim()));
document.getElementById('fGenre').addEventListener('blur', ()=>{
  setTimeout(()=> document.getElementById('genreSuggestList').classList.add('hidden'), 150);
});
async function ensureGenreExists(name){
  if(!name) return;
  const key = name.trim().toLowerCase();
  const exists = getAllGenreNames().some(n => n.toLowerCase() === key);
  if(exists) return;
  try{ await addDoc(collection(db,'genres'), { name: name.trim(), createdAt: serverTimestamp() }); }
  catch(err){ console.error('Não foi possível salvar o gênero novo:', err); }
}
function startGenresListener(){
  onSnapshot(collection(db,'genres'), (snap)=>{
    genreDocs = snap.docs.map(d=>({id:d.id, ...d.data()}));
  }, (err)=>{ console.error('Erro ao carregar gêneros:', err); });
}

function getAllDevByNames(){
  const merged = new Map();
  [...devByDocs.map(d=>d.name), ...allGames.map(g=>g.devBy)].forEach(n=>{
    if(!n) return;
    const trimmed = n.trim();
    const key = trimmed.toLowerCase();
    if(trimmed && !merged.has(key)) merged.set(key, trimmed);
  });
  return Array.from(merged.values()).sort((a,b)=>a.localeCompare(b,'pt-BR'));
}
function renderDevBySuggestList(filterText){
  const listEl = document.getElementById('devBySuggestList');
  const names = getAllDevByNames();
  const filtered = filterText
    ? names.filter(n => n.toLowerCase().includes(filterText.toLowerCase()))
    : names;
  if(filtered.length === 0){
    listEl.classList.add('hidden');
    listEl.innerHTML = '';
    return;
  }
  listEl.innerHTML = filtered.map(n=>`<button type="button" class="genre-suggest-item" data-devby="${escapeHtml(n)}">${escapeHtml(n)}</button>`).join('');
  listEl.classList.remove('hidden');
  listEl.querySelectorAll('[data-devby]').forEach(btn=>{
    btn.addEventListener('mousedown', (e)=>{
      e.preventDefault();
      document.getElementById('fDevBy').value = btn.dataset.devby;
      listEl.classList.add('hidden');
    });
  });
}
document.getElementById('fDevBy').addEventListener('input', (e)=> renderDevBySuggestList(e.target.value.trim()));
document.getElementById('fDevBy').addEventListener('focus', (e)=> renderDevBySuggestList(e.target.value.trim()));
document.getElementById('fDevBy').addEventListener('blur', ()=>{
  setTimeout(()=> document.getElementById('devBySuggestList').classList.add('hidden'), 150);
});
async function ensureDevByExists(name){
  if(!name) return;
  const key = name.trim().toLowerCase();
  const exists = getAllDevByNames().some(n => n.toLowerCase() === key);
  if(exists) return;
  try{ await addDoc(collection(db,'devs'), { name: name.trim(), createdAt: serverTimestamp() }); }
  catch(err){ console.error('Não foi possível salvar o desenvolvedor novo:', err); }
}
function startDevsListener(){
  onSnapshot(collection(db,'devs'), (snap)=>{
    devByDocs = snap.docs.map(d=>({id:d.id, ...d.data()}));
  }, (err)=>{ console.error('Erro ao carregar desenvolvedores:', err); });
}

function getAllPortByNames(){
  const merged = new Map();
  [...portByDocs.map(d=>d.name), ...allGames.map(g=>g.portBy)].forEach(n=>{
    if(!n) return;
    const trimmed = n.trim();
    const key = trimmed.toLowerCase();
    if(trimmed && !merged.has(key)) merged.set(key, trimmed);
  });
  return Array.from(merged.values()).sort((a,b)=>a.localeCompare(b,'pt-BR'));
}
function renderPortBySuggestList(filterText){
  const listEl = document.getElementById('portBySuggestList');
  const names = getAllPortByNames();
  const filtered = filterText
    ? names.filter(n => n.toLowerCase().includes(filterText.toLowerCase()))
    : names;
  if(filtered.length === 0){
    listEl.classList.add('hidden');
    listEl.innerHTML = '';
    return;
  }
  listEl.innerHTML = filtered.map(n=>`<button type="button" class="genre-suggest-item" data-portby="${escapeHtml(n)}">${escapeHtml(n)}</button>`).join('');
  listEl.classList.remove('hidden');
  listEl.querySelectorAll('[data-portby]').forEach(btn=>{
    btn.addEventListener('mousedown', (e)=>{
      e.preventDefault();
      document.getElementById('fPortBy').value = btn.dataset.portby;
      listEl.classList.add('hidden');
    });
  });
}
document.getElementById('fPortBy').addEventListener('input', (e)=> renderPortBySuggestList(e.target.value.trim()));
document.getElementById('fPortBy').addEventListener('focus', (e)=> renderPortBySuggestList(e.target.value.trim()));
document.getElementById('fPortBy').addEventListener('blur', ()=>{
  setTimeout(()=> document.getElementById('portBySuggestList').classList.add('hidden'), 150);
});
async function ensurePortByExists(name){
  if(!name) return;
  const key = name.trim().toLowerCase();
  const exists = getAllPortByNames().some(n => n.toLowerCase() === key);
  if(exists) return;
  try{ await addDoc(collection(db,'ports'), { name: name.trim(), createdAt: serverTimestamp() }); }
  catch(err){ console.error('Não foi possível salvar o port novo:', err); }
}
function startPortsListener(){
  onSnapshot(collection(db,'ports'), (snap)=>{
    portByDocs = snap.docs.map(d=>({id:d.id, ...d.data()}));
  }, (err)=>{ console.error('Erro ao carregar ports:', err); });
}

function applyGames(list){
  allGames = list;
  gamesLoaded = true;
  document.getElementById('adminLoadMsg').textContent = '';
  renderSectionNav();
  renderGrid();
  renderAdminList();
  if(pendingDeepLinkId){
    const idToOpen = pendingDeepLinkId;
    pendingDeepLinkId = null;
    openGameDeepLink(idToOpen);
  }
}
function startGamesListener(){
  onSnapshot(collection(db,'games'), (snap)=>{
    applyGames(snap.docs.map(d=>({id:d.id, ...d.data()})));
  }, (err)=>{
    console.error('Erro ao carregar jogos:', err);
    gamesLoaded = true;
    document.getElementById('adminLoadMsg').textContent = 'Não foi possível carregar os jogos. Confira sua conexão e as regras do Firestore.';
    document.getElementById('emptyStateTitle').textContent = 'NÃO FOI POSSÍVEL CARREGAR OS JOGOS';
    document.getElementById('emptyStateSub').textContent = 'Verifique sua conexão e tente novamente em instantes.';
    document.getElementById('gameGrid').innerHTML = '';
    $('homeContent').innerHTML = '';
    $('genreCarousels').innerHTML = '';
    document.getElementById('emptyState').classList.remove('hidden');
  });
}

document.getElementById('searchInput').addEventListener('input', ()=>{ renderGrid(); });

/* Entrada discreta do painel: palavra-chave na busca + Enter, só quando nenhum jogo combina com o texto.
   Nada é conferido aqui: o servidor decide. Se não bater, a busca segue normal, sem aviso nenhum. */
document.getElementById('searchInput').addEventListener('keydown', async (e)=>{
  if(e.key !== 'Enter' || gateBusy || !gamesLoaded) return;
  const raw = e.target.value;
  const term = raw.trim().toLowerCase();
  if(term.length < 6 || raw.length > 200) return;
  if(allGames.some(g => (g.name||'').toLowerCase().includes(term))) return;
  gateBusy = true;
  try{
    const data = await api('admin-gate', { keyword: raw });
    gateTicket = { t: data.ticket, e: data.expiresAt };
    e.target.value = '';
    renderGrid();
    openAdminLogin();
  }catch(err){ /* sem pista nenhuma para quem só está pesquisando */ }
  finally{ gateBusy = false; }
});

function cardHtml(g){
  const sec = sectionShort[g.category] || g.category || 'Jogo';
  const tagText = g.genre ? `${escapeHtml(sec)} <i>•</i> ${escapeHtml(g.genre)}` : escapeHtml(sec);
  return `
    <div class="card ${g.pinned?'pinned':''}" data-id="${g.id}" tabindex="0" role="button">
      <div class="thumb">
        <div class="icon">${g.iconUrl ? `<img src="${g.iconUrl}" alt="" loading="lazy">` : '<span class="msi">videogame_asset</span>'}</div>
        ${isRecentlyAdded(g)?'<span class="badge-new">Novo</span>':''}
        ${g.pinned?'<span class="pin-badge msi" title="Fixado">push_pin</span>':''}
        <button class="fav-btn ${isFavorite(g.id)?'active':''}" data-fav="${g.id}" aria-label="Favoritar" title="Favoritar"><span class="msi">favorite</span></button>
      </div>
      <div class="tag-row"><span class="tag">${tagText}</span></div>
      <h3>${escapeHtml(g.name||'Sem nome')}</h3>
      <div class="meta-row">
        <span class="mono version">v${escapeHtml(g.version||'1.0')}</span>
        <span class="mono filesize"><span class="msi msi-inline">sd_storage</span> ${escapeHtml(g.fileSize || '—')}</span>
      </div>
    </div>
  `;
}
function afterFavChange(id){
  if(viewMode === 'favorites'){
    renderGrid();
  }else{
    document.querySelectorAll('.fav-btn[data-fav]').forEach(b=>{
      if(b.dataset.fav === id) b.classList.toggle('active', isFavorite(id));
    });
  }
  renderSectionNav();
}
function attachCardHandlers(container){
  container.querySelectorAll('.card').forEach(card=>{
    const open = ()=> openDetail(card.dataset.id);
    card.onclick = open;
    card.onkeydown = (e)=>{ if(e.key==='Enter') open(); };
  });
  container.querySelectorAll('[data-fav]').forEach(btn=>{
    btn.onclick = (e)=>{
      e.stopPropagation();
      toggleFavorite(btn.dataset.fav);
      afterFavChange(btn.dataset.fav);
    };
  });
}

function renderCarousels(){
  const wrap = document.getElementById('genreCarousels');
  const empty = document.getElementById('emptyState');
  const sectionGames = sortGames(allGames).filter(g=> g.category === activeSection);

  if(sectionGames.length === 0){
    wrap.innerHTML = '';
    document.getElementById('emptyStateTitle').textContent = 'NENHUM JOGO POR AQUI AINDA';
    document.getElementById('emptyStateSub').textContent = 'Assim que os jogos forem publicados, eles aparecem aqui.';
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');

  const recentlyUpdatedGames = sectionGames
    .filter(isRecentlyLinkUpdated)
    .sort((a,b)=> timeValue(b.linksUpdatedAt) - timeValue(a.linksUpdatedAt));
  const updatedIds = new Set(recentlyUpdatedGames.map(g=>g.id));
  const pinnedGames = sectionGames.filter(g=>g.pinned);
  const unpinnedGames = sectionGames.filter(g=>!g.pinned && !updatedIds.has(g.id));

  const groups = new Map();
  unpinnedGames.forEach(g=>{
    const genre = (g.genre && g.genre.trim()) || 'Outros';
    if(!groups.has(genre)) groups.set(genre, []);
    groups.get(genre).push(g);
  });
  const genreNames = Array.from(groups.keys()).sort((a,b)=>{
    if(a === 'Outros') return 1;
    if(b === 'Outros') return -1;
    return a.localeCompare(b,'pt-BR');
  });

  let html = '';
  if(recentlyUpdatedGames.length > 0){
    html += `
      <div class="genre-row">
        <h2 class="genre-title"><span class="ttl-ico"><span class="msi">update</span></span> Atualizados recentemente <span class="genre-count">${recentlyUpdatedGames.length}</span></h2>
        <div class="carousel-track">${recentlyUpdatedGames.map(cardHtml).join('')}</div>
      </div>
    `;
  }
  if(pinnedGames.length > 0){
    html += `
      <div class="genre-row">
        <h2 class="genre-title"><span class="ttl-ico"><span class="msi">push_pin</span></span> Fixados <span class="genre-count">${pinnedGames.length}</span></h2>
        <div class="carousel-track">${pinnedGames.map(cardHtml).join('')}</div>
      </div>
    `;
  }
  html += genreNames.map(genre=>`
    <div class="genre-row">
      <h2 class="genre-title">${escapeHtml(genre)} <span class="genre-count">${groups.get(genre).length}</span></h2>
      <div class="carousel-track">${groups.get(genre).map(cardHtml).join('')}</div>
    </div>
  `).join('');

  wrap.innerHTML = html;
  attachCardHandlers(wrap);
}

function showEmpty(title, sub){
  $('emptyStateTitle').textContent = title;
  $('emptyStateSub').textContent = sub;
  $('emptyState').classList.remove('hidden');
}

function heroHtml(g){
  const sec = sectionShort[g.category] || g.category || 'Jogo';
  const label = g.genre ? `${sec} • ${g.genre}` : sec;
  const hasBanner = !!g.bannerUrl;
  return `
    <article class="hero ${hasBanner?'':'no-banner'}" data-hero="${g.id}" role="button" tabindex="0" aria-label="${escapeHtml(g.name||'Destaque')}">
      <div class="hero-bg">${hasBanner ? `<img src="${g.bannerUrl}" alt="">` : ''}</div>
      ${!hasBanner && g.iconUrl ? `<img class="hero-icon" src="${g.iconUrl}" alt="">` : ''}
      <div class="hero-shade"></div>
      <div class="hero-body">
        <div class="hero-tags">
          <span class="chip chip-accent"><span class="msi">local_fire_department</span> Destaque</span>
          <span class="chip">${escapeHtml(label)}</span>
        </div>
        <h2>${escapeHtml(g.name||'Sem nome')}</h2>
        <div class="hero-meta">
          <span class="mono">v${escapeHtml(g.version||'1.0')}</span>
          <span class="mono"><span class="msi">sd_storage</span> ${escapeHtml(g.fileSize || '—')}</span>
        </div>
        <button type="button" class="btn btn-filled hero-btn" data-open="${g.id}"><span class="msi">download</span> Ver e baixar</button>
      </div>
    </article>
  `;
}

function renderHome(){
  const wrap = $('homeContent');
  const sorted = sortGames(allGames);
  if(sorted.length === 0){
    wrap.innerHTML = '';
    showEmpty('NENHUM JOGO POR AQUI AINDA', 'Assim que os jogos forem publicados, eles aparecem aqui.');
    return;
  }
  $('emptyState').classList.add('hidden');

  const featured = sorted.find(g=>g.pinned && g.bannerUrl) || sorted.find(g=>g.pinned) || sorted.find(g=>g.bannerUrl) || sorted[0];

  const catHtml = SECTIONS.map(s=>{
    const list = allGames.filter(g=>g.category===s);
    const { names } = genreNamesOf(list);
    const shown = names.filter(n=>n!=='Outros').slice(0,4);
    const sub = shown.length ? shown.join(', ') + (names.length > shown.length ? '…' : '') : sectionBlurb[s];
    return `
      <button type="button" class="cat-card" data-goto="${escapeHtml(s)}">
        <span class="cat-icon">${sectionIconHtml(s)}</span>
        <span class="cat-text"><strong>${escapeHtml(s)}</strong><small>${escapeHtml(sub)}</small></span>
        <span class="count-badge">${list.length}</span>
      </button>`;
  }).join('');

  const weekAgo = Date.now() - 7*24*60*60*1000;
  const byNew = [...allGames].sort((a,b)=> timeValue(b.createdAt) - timeValue(a.createdAt));
  let recent = byNew.filter(g=> timeValue(g.createdAt) >= weekAgo);
  let recentSub = 'Publicados nos últimos 7 dias';
  if(recent.length === 0){ recent = byNew; recentSub = 'Últimos jogos publicados'; }
  recent = recent.slice(0,12);

  wrap.innerHTML = `
    ${heroHtml(featured)}
    <section class="cat-list" aria-label="Categorias">${catHtml}</section>
    <section class="home-row">
      <h2 class="genre-title"><span class="ttl-ico"><span class="msi">schedule</span></span> Lançamentos recentes</h2>
      <p class="row-sub">${recentSub}</p>
      <div class="carousel-track">${recent.map(cardHtml).join('')}</div>
    </section>
  `;

  const hero = wrap.querySelector('[data-hero]');
  const openHero = ()=> openDetail(hero.dataset.hero);
  hero.onclick = openHero;
  hero.onkeydown = (e)=>{ if(e.key==='Enter') openHero(); };
  wrap.querySelectorAll('[data-goto]').forEach(btn=>{ btn.onclick = ()=> setView('section', btn.dataset.goto); });
  attachCardHandlers(wrap);
}

function paintSectionHead({ iconHtml, title, count, sub }){
  $('sectionIcon').innerHTML = iconHtml;
  $('sectionTitle').textContent = title;
  $('sectionCount').textContent = count;
  $('sectionSub').textContent = sub;
}

function renderGenrePills(list, names, counts){
  const wrap = $('genrePills');
  if(list.length === 0){ wrap.innerHTML = ''; return; }
  wrap.innerHTML = `
    <button type="button" class="genre-chip ${activeGenre==='all'?'active':''}" role="tab" aria-selected="${activeGenre==='all'}" data-gi="all">Todos <span class="chip-n">${list.length}</span></button>
    ${names.map((n,i)=>`<button type="button" class="genre-chip ${activeGenre===n?'active':''}" role="tab" aria-selected="${activeGenre===n}" data-gi="${i}">${escapeHtml(n)} <span class="chip-n">${counts.get(n)}</span></button>`).join('')}
  `;
  wrap.querySelectorAll('.genre-chip').forEach(btn=>{
    btn.onclick = ()=>{
      activeGenre = btn.dataset.gi === 'all' ? 'all' : names[parseInt(btn.dataset.gi,10)];
      renderGrid();
    };
  });
}

function renderGrid(){
  if(!gamesLoaded) return;
  const searchTerm = $('searchInput').value.trim().toLowerCase();
  const favMode = viewMode === 'favorites';
  const scoped = viewMode === 'section';
  const flat = !!searchTerm || favMode;
  const homeEl = $('homeView');
  const secEl = $('sectionView');
  const grid = $('gameGrid');
  const carousels = $('genreCarousels');
  const empty = $('emptyState');

  $('topFavBtn').classList.toggle('active', favMode);

  if(viewMode === 'home' && !flat){
    homeEl.classList.remove('hidden');
    secEl.classList.add('hidden');
    renderHome();
    return;
  }
  homeEl.classList.add('hidden');
  secEl.classList.remove('hidden');

  if(flat){
    carousels.classList.add('hidden');
    grid.classList.remove('hidden');
    $('genrePills').innerHTML = '';
    const filtered = sortGames(allGames).filter(g=>{
      const matchesSection = !scoped || g.category === activeSection;
      const matchesSearch = !searchTerm || (g.name||'').toLowerCase().includes(searchTerm);
      const matchesFav = !favMode || isFavorite(g.id);
      return matchesSection && matchesSearch && matchesFav;
    });
    if(favMode){
      paintSectionHead({ iconHtml:'<span class="ico msi">favorite</span>', title:'Favoritos', count:filtered.length, sub: searchTerm ? `Favoritos com "${$('searchInput').value.trim()}"` : 'Jogos que você salvou' });
    }else if(scoped){
      paintSectionHead({ iconHtml:sectionIconHtml(activeSection), title:activeSection, count:filtered.length, sub:`Resultados para "${$('searchInput').value.trim()}"` });
    }else{
      paintSectionHead({ iconHtml:'<span class="ico msi">search</span>', title:'Resultados', count:filtered.length, sub:`Busca por "${$('searchInput').value.trim()}" em todas as seções` });
    }
    if(filtered.length === 0){
      grid.innerHTML = '';
      showEmpty(favMode ? 'NENHUM FAVORITO POR AQUI' : 'NENHUM JOGO ENCONTRADO', favMode ? 'Toque no coração de um jogo pra salvá-lo aqui.' : 'Tente buscar por outro termo.');
      return;
    }
    empty.classList.add('hidden');
    grid.innerHTML = filtered.map(cardHtml).join('');
    attachCardHandlers(grid);
    return;
  }

  // visão de seção (com filtro por gênero)
  const sectionList = allGames.filter(g=>g.category === activeSection);
  const { names, counts } = genreNamesOf(sectionList);
  if(activeGenre !== 'all' && !names.includes(activeGenre)) activeGenre = 'all';
  paintSectionHead({
    iconHtml: sectionIconHtml(activeSection),
    title: activeSection,
    count: sectionList.length,
    sub: activeGenre === 'all' ? 'Todos os gêneros' : activeGenre
  });
  renderGenrePills(sectionList, names, counts);

  if(activeGenre === 'all'){
    grid.classList.add('hidden');
    carousels.classList.remove('hidden');
    renderCarousels();
    return;
  }
  carousels.classList.add('hidden');
  grid.classList.remove('hidden');
  empty.classList.add('hidden');
  const filtered = sortGames(sectionList).filter(g=> genreKey(g) === activeGenre);
  grid.innerHTML = filtered.map(cardHtml).join('');
  attachCardHandlers(grid);
}

function renderDownloadArea(g){
  const area = document.getElementById('downloadArea');
  const links = getLinks(g);

  if(links.length === 0){
    area.innerHTML = `<div class="empty-note" style="text-align:center;margin-bottom:10px;">Nenhum link de download disponível ainda.</div>`;
    return;
  }

  if(links.length === 1){
    const label = links[0].name || 'Baixar APK';
    area.innerHTML = `<a class="btn-download" href="${links[0].url}" target="_blank" rel="noopener" id="dl-0"><span class="msi msi-inline" style="font-size:18px;vertical-align:-3px;">download</span> ${escapeHtml(label)}</a>`;
    return;
  }

  area.innerHTML = `
    <button class="btn-download" id="showLinksBtn"><span class="msi msi-inline" style="font-size:18px;vertical-align:-3px;">download</span> Mostrar mais links (${links.length})</button>
    <div class="links-list hidden" id="linksList" style="margin-top:10px;">
      ${links.map((l,i)=>`
        <a class="link-item" href="${l.url}" target="_blank" rel="noopener" id="dl-${i}">
          <span>${escapeHtml(l.name || ('Link ' + (i+1)))}</span>
          <span class="msi">download</span>
        </a>
      `).join('')}
    </div>
  `;
  document.getElementById('showLinksBtn').addEventListener('click', (e)=>{
    document.getElementById('linksList').classList.remove('hidden');
    e.currentTarget.remove();
  });
}
function openDetail(id){
  const g = allGames.find(x=>x.id===id);
  if(!g) return;
  document.getElementById('detailPanel').innerHTML = `
    <button class="close-btn" id="closeDetailBtn" aria-label="Fechar detalhes" title="Fechar detalhes"><span class="msi">close</span></button>
    <button class="detail-fav-btn ${isFavorite(g.id)?'active':''}" id="detailFavBtn" data-fav="${g.id}" aria-label="Favoritar"><span class="msi">favorite</span></button>
    <button class="detail-share-btn" id="detailShareBtn" aria-label="Compartilhar" title="Compartilhar"><span class="msi">share</span></button>
    <div class="banner-wrap ${g.bannerUrl ? '' : 'empty'}">
      ${g.bannerUrl ? `<img src="${g.bannerUrl}" alt="">` : '<span class="msi">image</span>'}
    </div>
    <div class="detail-body">
      <div class="detail-head">
        <div class="icon">${g.iconUrl ? `<img src="${g.iconUrl}" alt="">` : '<span class="msi">videogame_asset</span>'}</div>
        <div>
          <h2>${escapeHtml(g.name)}</h2>
          <div class="tag-row"><span class="tag">${escapeHtml(g.genre || g.category || 'Jogo')}</span>${g.portStatus === 'official' ? '<span class="tag tag-official">Official Port</span>' : g.portStatus === 'unofficial' ? '<span class="tag tag-unofficial">Unofficial Port</span>' : ''}${isRecentlyAdded(g)?'<span class="tag tag-new">Novo</span>':''}</div>
        </div>
      </div>
      <div class="stat-grid">
        <div class="stat"><div class="num mono">v${escapeHtml(g.version||'1.0')}</div><div class="lab">Versão</div></div>
        <div class="stat"><div class="num mono"><span class="msi msi-inline">sd_storage</span> ${escapeHtml(g.fileSize||'—')}</div><div class="lab">Tamanho</div></div>
        <div class="stat"><div class="num mono">${escapeHtml(formatArchitectures(g.architectures))}</div><div class="lab">Arquitetura</div></div>
      </div>
      ${(g.devBy || g.portBy) ? `<div class="credits-row">${g.devBy ? `<span><b>Dev by:</b> ${escapeHtml(g.devBy)}</span>` : ''}${g.portBy ? `<span><b>Port by:</b> ${escapeHtml(g.portBy)}</span>` : ''}</div>` : ''}
      <div class="desc">${escapeHtml(g.description||'Sem descrição ainda.')}</div>
      <div id="downloadArea"></div>
    </div>
  `;
  document.getElementById('closeDetailBtn').onclick = closeDetail;
  document.getElementById('detailOverlay').classList.remove('hidden');
  renderDownloadArea(g);

  document.getElementById('detailFavBtn').onclick = (e)=>{
    e.stopPropagation();
    toggleFavorite(g.id);
    e.currentTarget.classList.toggle('active');
    afterFavChange(g.id);
  };

  document.getElementById('detailShareBtn').onclick = async (e)=>{
    const btn = e.currentTarget;
    const original = btn.innerHTML;
    const result = await shareGame(g);
    if(result === 'copied'){
      btn.innerHTML = '<span class="msi">check</span>';
      setTimeout(()=>{ btn.innerHTML = original; }, 2000);
    }else if(result === 'failed'){
      btn.innerHTML = '<span class="msi">error</span>';
      setTimeout(()=>{ btn.innerHTML = original; }, 2000);
    }
  };
}
function closeDetail(){
  document.getElementById('detailOverlay').classList.add('hidden');
  if(window.location.hash.startsWith('#jogo=')) window.location.hash = '';
}
document.getElementById('detailOverlay').addEventListener('click', (e)=>{
  if(e.target.id === 'detailOverlay') closeDetail();
});

let pendingDeepLinkId = null;
function showAdmin(){
  if(adminSessionActive) startLiveListeners();
  document.getElementById('publicView').classList.add('hidden');
  document.getElementById('adminView').classList.remove('hidden');
  if(!adminOpen){
    adminOpen = true;
    try{ history.pushState({ nwcAdmin: true }, ''); }catch(err){}   // o botão Voltar do celular fecha o painel
  }
  window.scrollTo(0, 0);
}
function showPublic(){
  document.getElementById('adminView').classList.add('hidden');
  document.getElementById('publicView').classList.remove('hidden');
  adminOpen = false;
}
function openGameDeepLink(id){
  const g = allGames.find(x=>x.id===id);
  if(!g) return;
  activeSection = g.category || SECTIONS[0];
  viewMode = 'section';
  activeGenre = 'all';
  renderSectionNav();
  renderGrid();
  openDetail(id);
}
document.getElementById('backToSiteBtn').onclick = ()=>{
  if(history.state && history.state.nwcAdmin){ history.back(); } else { showPublic(); }
};
window.addEventListener('popstate', ()=>{ if(adminOpen) showPublic(); });
window.addEventListener('hashchange', routeCheck);
function routeCheck(){
  const hash = window.location.hash;
  if(!adminOpen) showPublic();
  if(hash.startsWith('#jogo=')){
    const id = idFromGameHash(hash);
    if(gamesLoaded) openGameDeepLink(id);
    else pendingDeepLinkId = id;
  }
}

/* ---------- login em duas etapas ---------- */
const AUTH_MSG = {
  'auth/too-many-requests': 'Muitas tentativas. Espere alguns minutos e tente de novo.',
  'auth/network-request-failed': 'Sem conexão. Confira a internet e tente de novo.',
  'auth/user-disabled': 'Esta conta foi desativada.'
};
const UNLOCK_MSG = {
  'resource-exhausted': 'Muitas tentativas. Espere um pouco e tente de novo.',
  'unavailable': 'Sem conexão com o servidor. Confira a internet e tente de novo.'
};
function setLoginMsg(text, kind){
  const msg = document.getElementById('loginMsg');
  msg.innerHTML = text ? `<div class="msg ${kind || 'err'}">${escapeHtml(text)}</div>` : '';
}
function setLoginBusy(on, text){
  loginBusy = on;
  const btn = document.getElementById('loginBtn');
  btn.disabled = on;
  btn.textContent = on ? text : 'Entrar';
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function adminClaims(user){
  const r = await user.getIdTokenResult();
  const c = r.claims || {};
  return { admin: c.admin === true, until: typeof c.adminUntil === 'number' ? c.adminUntil : 0 };
}
async function logoutAdmin(){
  try{ await api('admin-logout', {}, true); }catch(err){}
  try{ await signOut(auth); }catch(err){}
}
// Abre a tela do painel (mostra o login, ou o painel direto se já houver sessão administrativa).
function openAdminLogin(){
  setLoginMsg('');
  showAdmin();
  if(auth.currentUser) handleAuth(auth.currentUser);
}

document.getElementById('loginBtn').onclick = async ()=>{
  if(loginBusy) return;
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  setLoginMsg('');
  if(!gateTicket || gateTicket.e <= Date.now()){
    gateTicket = null;
    setLoginMsg('O acesso expirou. Digite a palavra-chave na busca do site de novo.');
    setTimeout(()=>{ if(adminOpen && !auth.currentUser) showPublic(); }, 2200);
    return;
  }
  if(!email || !password){ setLoginMsg('Preencha o e-mail e a senha.'); return; }
  setLoginBusy(true, 'Entrando...');
  try{
    await signInWithEmailAndPassword(auth, email, password);
    document.getElementById('loginPassword').value = '';
    // onAuthStateChanged assume daqui e troca o bilhete pela sessão administrativa.
  }catch(err){
    setLoginBusy(false);
    setLoginMsg(AUTH_MSG[err && err.code] || 'Não foi possível entrar. Confira e-mail e senha.');
  }
};
document.getElementById('logoutBtn').onclick = async ()=>{ await logoutAdmin(); showPublic(); };

/* Decide o que mostrar. Isto é só visual: quem libera ou nega leitura e escrita de verdade
   são o backend e as regras do Firestore, que conferem o token e a sessão a cada operação. */
async function handleAuth(user){
  const mine = ++authRun;
  const loginBox = document.getElementById('loginBox');
  const dashBox = document.getElementById('dashboardBox');
  const returnBtn = document.getElementById('adminReturnBtn');
  const toLogin = ()=>{
    loginBox.classList.remove('hidden');
    dashBox.classList.add('hidden');
    returnBtn.classList.add('hidden');
    document.getElementById('gameFormOverlay').classList.add('hidden');
  };
  clearTimeout(adminTimer);
  adminSessionActive = false;

  if(!user){
    toLogin();
    if(adminOpen && !gateTicket && !loginDenied) showPublic();   // sem bilhete não há o que fazer na tela de login
    return;
  }

  let info = null;
  try{ info = await adminClaims(user); }catch(err){}
  if(mine !== authRun) return;

  // Só e-mail e senha, sem sessão administrativa: troca o bilhete da palavra-chave pela sessão.
  if(!info || !info.admin){
    toLogin();
    if(!gateTicket || gateTicket.e <= Date.now()){
      gateTicket = null;
      loginDenied = true;
      setLoginBusy(false);
      setLoginMsg('Acesso negado. Use a palavra-chave na busca do site.');
      await logoutAdmin();
      setTimeout(()=>{ loginDenied = false; if(adminOpen) showPublic(); }, 1800);
      return;
    }
    const t = gateTicket.t;
    gateTicket = null;                       // uso único
    setLoginBusy(true, 'Verificando...');
    justUnlocked = true;
    try{
      const data = await api('admin-unlock', { ticket: t }, true);
      await signInWithCustomToken(auth, data.token);   // troca para o token com a sessão administrativa
      handleAuth(auth.currentUser);                    // garante a atualização da tela mesmo sem novo evento do Firebase
    }catch(err){
      justUnlocked = false;
      loginDenied = true;
      setLoginBusy(false);
      setLoginMsg(UNLOCK_MSG[err && err.code] || 'Acesso negado.');
      await logoutAdmin();
      setTimeout(()=>{ loginDenied = false; if(adminOpen) showPublic(); }, 1800);
    }
    return;
  }

  // Sessão administrativa vencida.
  if(info.until <= Date.now()){
    await logoutAdmin();
    if(mine === authRun) showPublic();
    return;
  }

  // Confirma no servidor que a sessão continua valendo (logout em outra aba, conta desativada).
  try{ await api('admin-session', {}, true); }
  catch(err){
    if(mine !== authRun) return;
    if(err && (err.code === 'permission-denied' || err.code === 'unauthenticated')){
      await logoutAdmin();
      if(mine === authRun) showPublic();
      return;
    }
    // Falha de rede: segue; as regras do Firestore continuam mandando.
  }
  if(mine !== authRun) return;

  if(justUnlocked){
    justUnlocked = false;
    setLoginMsg('Acesso autorizado. Abrindo o painel...', 'ok');
    await sleep(700);
    if(mine !== authRun) return;
  }
  setLoginBusy(false);
  setLoginMsg('');
  adminSessionActive = true;
  if(adminOpen) startLiveListeners();        // o painel usa os dados ao vivo do Firestore
  loginBox.classList.add('hidden');
  dashBox.classList.remove('hidden');
  returnBtn.classList.remove('hidden');      // botão para voltar ao painel sem digitar a palavra-chave
  renderAdminList();
  adminTimer = setTimeout(async ()=>{
    await logoutAdmin();
    showPublic();
  }, Math.max(0, Math.min(info.until - Date.now(), 2147483000)));
}
onAuthStateChanged(auth, handleAuth);

document.getElementById('adminReturnBtn').onclick = async ()=>{
  try{
    await api('admin-session', {}, true);   // o servidor confirma a sessão antes de abrir
    showAdmin();
  }catch(err){
    if(err && (err.code === 'permission-denied' || err.code === 'unauthenticated')){
      document.getElementById('adminReturnBtn').classList.add('hidden');
      await logoutAdmin();
      alert('Sua sessão terminou. Use a palavra-chave de novo.');
    }else{
      showAdmin();                          // sem conexão: abre mesmo assim; as regras seguem mandando
    }
  }
};

function setBtnIcon(btn, iconName, label){
  btn.innerHTML = `<span class="msi">${iconName}</span>`;
  btn.title = label;
  btn.setAttribute('aria-label', label);
}

function setAdminCount(n){
  const el = $('adminItemsCount');
  if(el) el.textContent = n;
}
function renderAdminStats(){
  const wrap = $('adminStats');
  if(!wrap) return;
  const val = (n)=> gamesLoaded ? n : '—';
  const sectionCards = SECTIONS.map(s=>({
    lab: sectionShort[s] || s,
    icon: sectionIconSvg[s] ? sectionIconSvg[s].replace('class="ico nav-icon-svg"','class="stat-svg"') : `<span class="msi">${sectionIcon[s]||'folder'}</span>`,
    num: val(allGames.filter(g=>g.category===s).length)
  }));
  const cards = [
    ...sectionCards,
    { lab:'Total de jogos', icon:'<span class="msi">inventory_2</span>', num: val(allGames.length) },
    { lab:'Fixados', icon:'<span class="msi">push_pin</span>', num: val(allGames.filter(g=>g.pinned).length) }
  ];
  wrap.innerHTML = cards.map(c=>`
    <div class="stat-card">
      <div class="stat-card-lab">${c.icon} ${escapeHtml(c.lab)}</div>
      <div class="stat-card-num">${c.num}</div>
    </div>
  `).join('');
}

function renderAdminList(){
  const card = document.getElementById('gameListCard');
  if(!auth.currentUser) return;
  renderAdminStats();
  if(!gamesLoaded){
    setAdminCount(0);
    card.innerHTML = Array.from({length:3}).map(()=>`
      <div class="admin-row game-row">
        <div class="skel" style="width:40%;height:16px;"></div>
        <div class="skel" style="width:120px;height:30px;border-radius:999px;"></div>
      </div>
    `).join('');
    return;
  }
  if(allGames.length === 0){
    setAdminCount(0);
    card.innerHTML = `<div class="empty-note">Nenhum jogo publicado ainda. Clique em "Novo jogo" pra começar.</div>`;
    return;
  }
  const term = adminSearchTerm.trim().toLowerCase();
  const list = sortGames(allGames)
    .filter(g => adminCategoryFilter === 'all' || g.category === adminCategoryFilter)
    .filter(g => !term || (g.name||'').toLowerCase().includes(term));
  setAdminCount(list.length);
  if(list.length === 0){
    const filterLabel = adminCategoryFilter === 'all' ? '' : ` em ${escapeHtml(adminCategoryFilter)}`;
    card.innerHTML = term
      ? `<div class="empty-note">Nenhum jogo encontrado pra "${escapeHtml(adminSearchTerm)}"${filterLabel}.</div>`
      : `<div class="empty-note">Nenhum jogo${filterLabel} ainda.</div>`;
    return;
  }
  card.innerHTML = list.map(g=>`
    <div class="admin-row game-row">
      <div class="thumb-sm">${g.iconUrl ? `<img src="${g.iconUrl}" alt="" loading="lazy">` : '<span class="msi">videogame_asset</span>'}</div>
      <div class="name">${g.pinned?'<span class="msi msi-inline">push_pin</span> ':''}${escapeHtml(g.name)}
        <small>${escapeHtml(sectionShort[g.category] || g.category || '—')}${g.genre ? ' • ' + escapeHtml(g.genre) : ''} • v${escapeHtml(g.version||'1.0')}</small>
      </div>
      <div class="actions">
        <button class="icon-act${g.pinned?' active':''}" data-pin="${g.id}" data-pinned="${g.pinned?1:0}" title="${g.pinned ? 'Desafixar' : 'Fixar'}" aria-label="${g.pinned ? 'Desafixar' : 'Fixar'}"><span class="msi">push_pin</span></button>
        <button class="icon-act" data-resend="${g.id}" title="Reenviar" aria-label="Reenviar"><span class="msi">campaign</span></button>
        <button class="icon-act" data-direto="${g.id}" title="Link Direto" aria-label="Link Direto"><span class="msi">link</span></button>
        <button class="icon-act" data-edit="${g.id}" title="Editar" aria-label="Editar"><span class="msi">edit</span></button>
        <button class="icon-act danger" data-del="${g.id}" title="Excluir" aria-label="Excluir"><span class="msi">delete</span></button>
      </div>
    </div>
  `).join('');
  card.querySelectorAll('[data-edit]').forEach(btn=>{ btn.onclick = ()=> openForm(btn.dataset.edit); });
  card.querySelectorAll('[data-pin]').forEach(btn=>{
    btn.onclick = async ()=>{
      const current = btn.dataset.pinned === '1';
      btn.disabled = true;
      try{
        await updateDoc(doc(db,'games',btn.dataset.pin), { pinned: !current });
      }catch(err){
        alert('Não foi possível atualizar. Tente novamente.');
      }finally{
        btn.disabled = false;
      }
    };
  });
  card.querySelectorAll('[data-resend]').forEach(btn=>{
    btn.onclick = async ()=>{
      const g = allGames.find(x=>x.id===btn.dataset.resend);
      if(!g) return;
      btn.disabled = true;
      setBtnIcon(btn, 'hourglass_empty', 'Enviando...');
      const result = await postToDiscord(g);
      await postToTelegram(g);
      if(result === 'ok') setBtnIcon(btn, 'check_circle', 'Enviado!');
      else if(result === 'not_configured') setBtnIcon(btn, 'link_off', 'Webhook não configurado');
      else setBtnIcon(btn, 'error', 'Falhou, tente de novo');
      setTimeout(()=>{ setBtnIcon(btn, 'campaign', 'Reenviar'); btn.disabled = false; }, 2200);
    };
  });
  card.querySelectorAll('[data-direto]').forEach(btn=>{
    btn.onclick = async ()=>{
      const g = allGames.find(x=>x.id===btn.dataset.direto);
      if(!g) return;
      btn.disabled = true;
      setBtnIcon(btn, 'hourglass_empty', 'Enviando...');
      const result = await postToDiscordDireto(g);
      if(result === 'ok') setBtnIcon(btn, 'check_circle', 'Enviado!');
      else if(result === 'not_configured') setBtnIcon(btn, 'link_off', 'Webhook não configurado');
      else if(result === 'no_direct_url') setBtnIcon(btn, 'priority_high', 'Sem link direto cadastrado');
      else setBtnIcon(btn, 'error', 'Falhou, tente de novo');
      setTimeout(()=>{ setBtnIcon(btn, 'link', 'Link Direto'); btn.disabled = false; }, 2200);
    };
  });
  card.querySelectorAll('[data-del]').forEach(btn=>{
    btn.onclick = async ()=>{
      if(!confirm('Excluir este jogo? Essa ação não pode ser desfeita.')) return;
      try{ await deleteDoc(doc(db,'games',btn.dataset.del)); }
      catch(err){ alert('Não foi possível excluir. Tente novamente.'); }
    };
  });
}

document.getElementById('newGameBtn').onclick = ()=> openForm(null);
document.getElementById('adminSearchInput').addEventListener('input', (e)=>{
  adminSearchTerm = e.target.value;
  renderAdminList();
});
document.getElementById('adminCategoryFilter').addEventListener('change', (e)=>{
  adminCategoryFilter = e.target.value;
  renderAdminList();
});
document.getElementById('cancelFormBtn').onclick = ()=>{ document.getElementById('gameFormOverlay').classList.add('hidden'); };
document.getElementById('closeFormBtn').onclick = ()=>{ document.getElementById('gameFormOverlay').classList.add('hidden'); };
document.getElementById('gameFormOverlay').addEventListener('click', (e)=>{
  if(e.target.id === 'gameFormOverlay') document.getElementById('gameFormOverlay').classList.add('hidden');
});

function updateLinkPreview(inputId, previewId){
  const url = document.getElementById(inputId).value.trim();
  const wrap = document.getElementById(previewId);
  const img = wrap.querySelector('img');
  if(url){
    img.src = url;
    wrap.classList.add('show');
  }else{
    img.src = '';
    wrap.classList.remove('show');
  }
}
document.getElementById('fIconUrl').addEventListener('input', ()=> updateLinkPreview('fIconUrl','iconPreview'));
document.getElementById('fBannerUrl').addEventListener('input', ()=> updateLinkPreview('fBannerUrl','bannerPreview'));

function updateCharCounters(){
  const name = document.getElementById('fName');
  const desc = document.getElementById('fDescription');
  document.getElementById('fNameCount').textContent = `${name.value.length}/${name.maxLength}`;
  document.getElementById('fDescCount').textContent = `${desc.value.length}/${desc.maxLength}`;
}
document.getElementById('fName').addEventListener('input', updateCharCounters);
document.getElementById('fDescription').addEventListener('input', updateCharCounters);

function updateLinkRowsUI(){
  for(let i=2;i<=4;i++){
    const wrap = document.getElementById('linkRowWrap'+i);
    const delBtn = document.getElementById('linkDelBtn'+i);
    if(i <= visibleLinkRows){
      wrap.classList.remove('hidden');
      delBtn.classList.toggle('hidden', i !== visibleLinkRows);
    }else{
      wrap.classList.add('hidden');
      document.getElementById('fLinkName'+i).value = '';
      document.getElementById('fLinkUrl'+i).value = '';
    }
  }
  document.getElementById('addLinkBtn').classList.toggle('hidden', visibleLinkRows >= 4);
}
document.getElementById('addLinkBtn').addEventListener('click', ()=>{
  if(visibleLinkRows >= 4) return;
  visibleLinkRows++;
  updateLinkRowsUI();
  document.getElementById('fLinkName'+visibleLinkRows).focus();
});
document.querySelectorAll('.link-del-btn').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    const row = parseInt(btn.dataset.row, 10);
    if(row !== visibleLinkRows) return;
    visibleLinkRows--;
    updateLinkRowsUI();
  });
});

/* ===== GitHub Releases: com um link do GitHub no Link 1, a versão vem da última Release =====
   Usa os campos que já existem: o Link 1 guarda o endereço do repositório ou da Release, e a Versão
   (e o Tamanho, se estiver vazio) são preenchidos a partir dela. O servidor também confere uma vez
   por dia e atualiza a Versão sozinho quando sai uma Release nova (api/github-sync.js). */
function parseGithubRepo(url){
  let u;
  try{ u = new URL(url); }catch(err){ return null; }
  if(u.protocol !== 'https:' || (u.hostname !== 'github.com' && u.hostname !== 'www.github.com')) return null;
  const parts = u.pathname.split('/').filter(Boolean);
  if(parts.length < 2) return null;
  const owner = parts[0];
  const repo = parts[1].replace(/\.git$/i, '');
  if(!/^[A-Za-z0-9_.-]{1,100}$/.test(owner) || !/^[A-Za-z0-9_.-]{1,100}$/.test(repo)) return null;
  return { owner, repo };
}
function cleanReleaseVersion(tag){
  return String(tag || '').trim().replace(/^[vV](?=\d)/, '').slice(0, 60);
}
function formatBytes(n){
  if(!(n > 0)) return '';
  const mb = n / 1048576;
  if(mb < 1024) return Math.max(1, Math.round(mb)) + ' MB';
  return (mb / 1024).toFixed(1).replace(/\.0$/, '') + ' GB';
}
const ghHint = document.createElement('div');
ghHint.className = 'hint';
ghHint.style.cssText = 'display:none;margin-top:6px;margin-bottom:10px;';
document.getElementById('linkRowWrap1').insertAdjacentElement('afterend', ghHint);
let ghRun = 0;
let ghLastUrl = '';          // evita consultar o GitHub duas vezes pelo mesmo link (colar + sair do campo)
function setGhHint(text){
  ghHint.textContent = text || '';
  ghHint.style.display = text ? 'block' : 'none';
}
function resetGhHint(){ ghRun++; ghLastUrl = ''; setGhHint(''); }
async function fillFromGithubRelease(){
  const url = document.getElementById('fLinkUrl1').value.trim();
  const repo = parseGithubRepo(url);
  if(!repo){ ghRun++; ghLastUrl = ''; setGhHint(''); return; }
  if(url === ghLastUrl) return;
  ghLastUrl = url;
  const mine = ++ghRun;
  setGhHint('Lendo a última Release do GitHub...');
  try{
    const res = await fetch(`https://api.github.com/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.repo)}/releases?per_page=10`, { headers: { Accept: 'application/vnd.github+json' } });
    if(mine !== ghRun) return;
    if(res.status === 404){ ghLastUrl = ''; setGhHint('Repositório não encontrado ou sem Releases públicas. A versão continua manual.'); return; }
    if(res.status === 403 || res.status === 429){ ghLastUrl = ''; setGhHint('O GitHub limitou as consultas por agora. Tente de novo em alguns minutos ou preencha a versão à mão.'); return; }
    if(!res.ok) throw new Error('http ' + res.status);
    const list = await res.json();
    if(mine !== ghRun) return;
    const rel = Array.isArray(list) ? list.find(r => r && !r.draft) : null;
    if(!rel){ setGhHint('Esse repositório ainda não tem nenhuma Release publicada. A versão continua manual.'); return; }
    const version = cleanReleaseVersion(rel.tag_name || rel.name);
    if(!version){ setGhHint('A última Release não tem nome de versão. A versão continua manual.'); return; }
    document.getElementById('fVersion').value = version;
    const apks = (rel.assets || []).filter(a => /\.apk$/i.test((a && a.name) || ''));
    const sizeInput = document.getElementById('fFileSize');
    let sizeFilled = false;
    if(apks.length === 1 && !sizeInput.value.trim()){
      sizeInput.value = formatBytes(apks[0].size);
      sizeFilled = true;
    }
    let msg = `Versão ${version}${sizeFilled ? ' e tamanho ' + sizeInput.value : ''} preenchida pela última Release do GitHub${rel.prerelease ? ' (pré-lançamento)' : ''}.`;
    if(apks.length > 1) msg += ` Há ${apks.length} APKs nessa Release, então o tamanho não foi preenchido.`;
    msg += ' O site confere Releases novas uma vez por dia e atualiza a versão sozinho.';
    setGhHint(msg);
  }catch(err){
    if(mine === ghRun){ ghLastUrl = ''; setGhHint('Não consegui ler o GitHub agora. A versão continua manual.'); }
  }
}
document.getElementById('fLinkUrl1').addEventListener('change', fillFromGithubRelease);
document.getElementById('fLinkUrl1').addEventListener('paste', ()=> setTimeout(fillFromGithubRelease, 60));

document.querySelectorAll('.arch-chip').forEach(chip=>{
  chip.addEventListener('click', ()=> chip.classList.toggle('active'));
});
function getSelectedArchitectures(){
  return Array.from(document.querySelectorAll('.arch-chip.active')).map(el => el.dataset.arch);
}
function setSelectedArchitectures(archs){
  const set = new Set(archs || []);
  document.querySelectorAll('.arch-chip').forEach(chip=>{
    chip.classList.toggle('active', set.has(chip.dataset.arch));
  });
}
function formatArchitectures(archs){
  if(!archs || archs.length === 0) return '—';
  return archs.map(a => a.replace(/\s*bits?/i,'').trim()).join('/') + ' bits';
}

function updateArchivedNotes(){
  for(let i=1;i<=4;i++){
    const note = document.getElementById('linkArchivedNote'+i);
    const count = editingArchivedLinks.filter(l => l.row === i).length;
    if(count > 0){
      note.textContent = count === 1 ? '1 link antigo guardado aqui (visível só pra você em "Links guardados").' : `${count} links antigos guardados aqui (visível só pra você em "Links guardados").`;
      note.classList.add('show');
    }else{
      note.textContent = '';
      note.classList.remove('show');
    }
  }
}
document.querySelectorAll('.link-archive-btn').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    const row = parseInt(btn.dataset.row, 10);
    const nameInput = document.getElementById('fLinkName'+row);
    const urlInput = document.getElementById('fLinkUrl'+row);
    const url = urlInput.value.trim();
    if(!url){
      alert('Não tem nenhum link nesse campo pra guardar.');
      return;
    }
    editingArchivedLinks.push({ row, name: nameInput.value.trim(), url, archivedAt: new Date().toISOString() });
    nameInput.value = '';
    urlInput.value = '';
    updateArchivedNotes();
  });
});

function openArchivedLinksOverlay(){
  const list = document.getElementById('archivedLinksList');
  const gamesWithArchived = allGames.filter(g => Array.isArray(g.archivedLinks) && g.archivedLinks.length > 0);
  if(gamesWithArchived.length === 0){
    list.innerHTML = `<div class="empty-note">Nenhum link guardado ainda.</div>`;
  }else{
    list.innerHTML = sortGames(gamesWithArchived).map(g => `
      <div class="archived-game-group">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:8px;flex-wrap:wrap;">
          <div class="name">${escapeHtml(g.name)}</div>
          ${g.archivedLinks.length > 1 ? `<button type="button" class="btn btn-tonal btn-sm" data-restore-all-game="${g.id}">Retornar todos</button>` : ''}
        </div>
        ${g.archivedLinks.slice().sort((a,b)=>(a.row||0)-(b.row||0)).map(l => `
          <div class="archived-link-item">
            <div style="color:var(--md-on-surface-variant);font-size:11px;margin-bottom:2px;">Link ${l.row||'?'}${l.name ? ' • '+escapeHtml(l.name) : ''}</div>
            <div>${escapeHtml(l.url)}</div>
            <button type="button" class="btn btn-tonal btn-sm" style="margin-top:8px;" data-restore-game="${g.id}" data-restore-idx="${g.archivedLinks.indexOf(l)}">Retornar link</button>
          </div>
        `).join('')}
      </div>
    `).join('');
    list.querySelectorAll('[data-restore-game]').forEach(btn=>{
      btn.onclick = ()=> restoreArchivedLink(btn.dataset.restoreGame, parseInt(btn.dataset.restoreIdx, 10));
    });
    list.querySelectorAll('[data-restore-all-game]').forEach(btn=>{
      btn.onclick = ()=> restoreAllArchivedLinks(btn.dataset.restoreAllGame);
    });
  }
  document.getElementById('archivedLinksOverlay').classList.remove('hidden');
}

function restoreArchivedLink(gameId, idx){
  const g = allGames.find(x=>x.id===gameId);
  if(!g || !Array.isArray(g.archivedLinks) || !g.archivedLinks[idx]) return;
  const entry = g.archivedLinks[idx];

  document.getElementById('archivedLinksOverlay').classList.add('hidden');
  if(editingGameId !== gameId) openForm(gameId);

  const row = Math.min(4, Math.max(1, entry.row || 1));
  visibleLinkRows = Math.max(visibleLinkRows, row);
  updateLinkRowsUI();
  document.getElementById('fLinkName'+row).value = entry.name || '';
  document.getElementById('fLinkUrl'+row).value = entry.url || '';

  editingArchivedLinks = editingArchivedLinks.filter(l => !(l.row === entry.row && l.url === entry.url && l.archivedAt === entry.archivedAt));
  updateArchivedNotes();
}
document.getElementById('viewArchivedLinksBtn').onclick = openArchivedLinksOverlay;
document.getElementById('closeArchivedLinksBtn').onclick = ()=> document.getElementById('archivedLinksOverlay').classList.add('hidden');
document.getElementById('archivedLinksOverlay').addEventListener('click', (e)=>{
  if(e.target.id === 'archivedLinksOverlay') document.getElementById('archivedLinksOverlay').classList.add('hidden');
});

async function restoreAllGamesArchivedLinks(){
  const gamesWithArchived = allGames.filter(g => Array.isArray(g.archivedLinks) && g.archivedLinks.length > 0);
  if(gamesWithArchived.length === 0) return;
  const total = gamesWithArchived.reduce((n,g)=>n+g.archivedLinks.length, 0);
  const ok = confirm(`Isso vai devolver ${total} link(s) guardado(s) de ${gamesWithArchived.length} jogo(s) de uma vez, direto no banco — sem precisar abrir e salvar cada jogo. Quer continuar?`);
  if(!ok) return;

  const btn = document.getElementById('restoreAllGamesBtn');
  btn.disabled = true;
  btn.textContent = 'Restaurando...';

  try{
    await Promise.all(gamesWithArchived.map(g=>{
      const newLinks = (g.links||[]).map(l=>({ name: l.name||'', url: l.url||'' }));
      const entries = g.archivedLinks.slice().sort((a,b)=> new Date(a.archivedAt||0) - new Date(b.archivedAt||0));
      entries.forEach(entry=>{
        const row = Math.min(4, Math.max(1, entry.row || 1));
        while(newLinks.length < row) newLinks.push({ name:'', url:'' });
        newLinks[row-1] = { name: entry.name||'', url: entry.url||'' };
      });
      return updateDoc(doc(db,'games',g.id), { links: newLinks, archivedLinks: [] });
    }));
    document.getElementById('archivedLinksOverlay').classList.add('hidden');
    if(editingGameId && gamesWithArchived.some(g=>g.id===editingGameId)){
      resetForm();
      document.getElementById('gameFormOverlay').classList.add('hidden');
    }
  }catch(err){
    alert('Deu erro ao restaurar: ' + (err && err.message ? err.message : err));
  }finally{
    btn.disabled = false;
    btn.textContent = 'Retornar todos os links (todos os jogos)';
  }
}
document.getElementById('restoreAllGamesBtn').onclick = restoreAllGamesArchivedLinks;

function restoreAllArchivedLinks(gameId){
  const g = allGames.find(x=>x.id===gameId);
  if(!g || !Array.isArray(g.archivedLinks) || g.archivedLinks.length===0) return;

  document.getElementById('archivedLinksOverlay').classList.add('hidden');
  if(editingGameId !== gameId) openForm(gameId);

  const entries = g.archivedLinks.slice().sort((a,b)=> new Date(a.archivedAt||0) - new Date(b.archivedAt||0));
  let maxRow = visibleLinkRows;
  entries.forEach(entry=>{ maxRow = Math.max(maxRow, Math.min(4, Math.max(1, entry.row || 1))); });
  visibleLinkRows = maxRow;
  updateLinkRowsUI();
  entries.forEach(entry=>{
    const row = Math.min(4, Math.max(1, entry.row || 1));
    document.getElementById('fLinkName'+row).value = entry.name || '';
    document.getElementById('fLinkUrl'+row).value = entry.url || '';
  });

  editingArchivedLinks = [];
  updateArchivedNotes();
}

function resetForm(){
  resetGhHint();
  editingGameId = null;
  editingArchivedLinks = [];
  document.getElementById('fName').value = '';
  document.getElementById('fSection').value = SECTIONS[0];
  document.getElementById('fFileSize').value = '';
  setSelectedArchitectures([]);
  document.getElementById('fGenre').value = '';
  document.getElementById('fDevBy').value = '';
  document.getElementById('fPortBy').value = '';
  document.getElementById('fVersion').value = '';
  document.getElementById('fPortStatus').value = '';
  document.getElementById('fDescription').value = '';
  document.getElementById('fIconUrl').value = '';
  document.getElementById('fBannerUrl').value = '';
  document.getElementById('fDirectUrl').value = '';
  for(let i=1;i<=4;i++){
    document.getElementById('fLinkName'+i).value = '';
    document.getElementById('fLinkUrl'+i).value = '';
  }
  visibleLinkRows = 1;
  updateLinkRowsUI();
  document.getElementById('formMsg').innerHTML = '';
  updateLinkPreview('fIconUrl','iconPreview');
  updateLinkPreview('fBannerUrl','bannerPreview');
  updateCharCounters();
  updateArchivedNotes();
}

function openForm(gameId){
  resetForm();
  const overlay = document.getElementById('gameFormOverlay');
  overlay.classList.remove('hidden');
  overlay.scrollTop = 0;
  document.getElementById('gameFormBox').scrollTop = 0;
  if(gameId){
    const g = allGames.find(x=>x.id===gameId);
    editingGameId = gameId;
    document.getElementById('formTitle').textContent = 'Editar jogo';
    document.getElementById('fName').value = g.name || '';
    document.getElementById('fSection').value = g.category || SECTIONS[0];
    document.getElementById('fFileSize').value = g.fileSize || '';
    setSelectedArchitectures(g.architectures || []);
    document.getElementById('fGenre').value = g.genre || '';
    document.getElementById('fDevBy').value = g.devBy || '';
    document.getElementById('fPortBy').value = g.portBy || '';
    document.getElementById('fPortStatus').value = g.portStatus || '';
    document.getElementById('fVersion').value = g.version || '';
    document.getElementById('fDescription').value = g.description || '';
    document.getElementById('fIconUrl').value = g.iconUrl || '';
    document.getElementById('fBannerUrl').value = g.bannerUrl || '';
    document.getElementById('fDirectUrl').value = g.directUrl || '';
    editingArchivedLinks = Array.isArray(g.archivedLinks) ? [...g.archivedLinks] : [];
    updateArchivedNotes();
    const links = getLinks(g);
    visibleLinkRows = Math.max(1, Math.min(4, links.length));
    for(let i=1;i<=4;i++){
      const link = links[i-1];
      document.getElementById('fLinkName'+i).value = link ? (link.name||'') : '';
      document.getElementById('fLinkUrl'+i).value = link ? (link.url||'') : '';
    }
    updateLinkRowsUI();
    updateLinkPreview('fIconUrl','iconPreview');
    updateLinkPreview('fBannerUrl','bannerPreview');
    updateCharCounters();
  }else{
    document.getElementById('formTitle').textContent = 'Novo jogo';
  }
}

document.getElementById('saveGameBtn').onclick = async ()=>{
  const name = document.getElementById('fName').value.trim();
  const category = document.getElementById('fSection').value;
  const genre = document.getElementById('fGenre').value.trim();
  const devBy = document.getElementById('fDevBy').value.trim();
  const portBy = document.getElementById('fPortBy').value.trim();
  const portStatus = document.getElementById('fPortStatus').value;
  const fileSize = document.getElementById('fFileSize').value.trim();
  const version = document.getElementById('fVersion').value.trim();
  const description = document.getElementById('fDescription').value.trim();
  const iconUrl = document.getElementById('fIconUrl').value.trim();
  const bannerUrl = document.getElementById('fBannerUrl').value.trim();
  const directUrl = document.getElementById('fDirectUrl').value.trim();
  const msg = document.getElementById('formMsg');
  msg.innerHTML = '';

  if(!name){
    msg.innerHTML = `<div class="msg err">Dá um nome pro jogo antes de salvar.</div>`;
    return;
  }

  const links = [];
  for(let i=1;i<=4;i++){
    const linkName = document.getElementById('fLinkName'+i).value.trim();
    const linkUrl = document.getElementById('fLinkUrl'+i).value.trim();
    if(linkUrl) links.push({ name: linkName, url: linkUrl });
  }
  const architectures = getSelectedArchitectures();

  const saveBtn = document.getElementById('saveGameBtn');
  saveBtn.disabled = true;
  saveBtn.textContent = 'Salvando...';

  try{
    const payload = { name, category, genre, devBy, portBy, portStatus, version, description, iconUrl, bannerUrl, directUrl, fileSize, links, architectures, archivedLinks: editingArchivedLinks };

    if(editingGameId){
      const existing = allGames.find(x=>x.id===editingGameId);
      const linksChanged = !!existing && JSON.stringify(existing.links||[]) !== JSON.stringify(payload.links||[]);
      const updatePayload = linksChanged ? { ...payload, linksUpdatedAt: serverTimestamp() } : payload;
      await updateDoc(doc(db,'games',editingGameId), updatePayload);
      const gameData = { id: editingGameId, ...payload };
      if(existing && existing.discordMessageId){
        await editDiscordMessage({ ...gameData, discordMessageId: existing.discordMessageId });
      }
      if(existing && existing.discordDiretoMessageId){
        await editDiscordDiretoMessage({ ...gameData, discordDiretoMessageId: existing.discordDiretoMessageId });
      }
    }else{
      const newDocRef = await addDoc(collection(db,'games'), { ...payload, pinned: false, createdAt: serverTimestamp() });
      const gameData = { id: newDocRef.id, ...payload };
      postToDiscord(gameData);
      postToTelegram(gameData);
    }
    await ensureGenreExists(genre);
    await ensureDevByExists(devBy);
    await ensurePortByExists(portBy);
    msg.innerHTML = `<div class="msg ok">Jogo salvo com sucesso.</div>`;
    setTimeout(()=> document.getElementById('gameFormOverlay').classList.add('hidden'), 600);
  }catch(err){
    console.error(err);
    msg.innerHTML = `<div class="msg err">Algo deu errado ao salvar. Tente novamente.</div>`;
  }finally{
    saveBtn.disabled = false;
    saveBtn.textContent = 'Salvar jogo';
  }
};

document.getElementById('sectionTitle').textContent = activeSection;
renderSectionNav();
routeCheck();

function startLiveListeners(){
  if(liveStarted) return;
  liveStarted = true;
  startGenresListener();
  startDevsListener();
  startPortsListener();
  startGamesListener();
}
async function fetchCatalogPart(i){
  const res = await fetch('/api/catalog?p=' + i);
  if(!res.ok) throw new Error('catalogo ' + res.status);
  return res.json();
}
async function loadCatalogFromServer(){
  let first = await fetchCatalogPart(0);
  const total = Number.isInteger(first.parts) && first.parts > 0 ? first.parts : 1;
  let rest = await Promise.all(Array.from({ length: total - 1 }, (_, i) => fetchCatalogPart(i + 1)));
  // Se a cópia foi atualizada no meio do download, as partes são de versões diferentes: baixa de novo uma vez.
  if(rest.some(r => r.builtAt !== first.builtAt)){
    first = await fetchCatalogPart(0);
    rest = await Promise.all(Array.from({ length: (first.parts || 1) - 1 }, (_, i) => fetchCatalogPart(i + 1)));
  }
  const seen = new Set();
  const games = [first, ...rest].flatMap(p => p.games || []).filter(g => g && g.id && !seen.has(g.id) && seen.add(g.id));
  if(liveStarted) return;                  // um admin abriu o painel e já recebe os dados ao vivo
  genreDocs = Array.isArray(first.genres) ? first.genres : [];
  devByDocs = Array.isArray(first.devs) ? first.devs : [];
  portByDocs = Array.isArray(first.ports) ? first.ports : [];
  applyGames(games);
}
loadCatalogFromServer().catch(()=>{ startLiveListeners(); });   // sem cópia ou sem API: lê o Firestore, como antes
