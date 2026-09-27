
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyCEGeQkz5ghI28VXuJa0rkqOYcY6vI8CIs",
  authDomain: "primepathcommunity-86dd0.firebaseapp.com",
  projectId: "primepathcommunity-86dd0",
  storageBucket: "primepathcommunity-86dd0.firebasestorage.app",
  messagingSenderId: "146948112795",
  appId: "1:146948112795:web:c630f3b5e9e9fc6bf8613e",
  measurementId: "G-NHBHRVZXXW"
};

const ADMIN_HASH = "#BlackArch98";


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
  getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, collection, addDoc, updateDoc, deleteDoc, doc, getDoc,
  onSnapshot, serverTimestamp, writeBatch
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const app = initializeApp(FIREBASE_CONFIG);
analyticsIsSupported().then(ok => { if(ok) getAnalytics(app); }).catch(()=>{});
const auth = getAuth(app);
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

async function sha256Hex(text){
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

let adminKeywordHash = null;
async function loadAdminKeyword(){
  try{
    const docSnap = await getDoc(doc(db, "config", "admin"));
    const data = docSnap.data();
    adminKeywordHash = (data && data.keywordHash) ? data.keywordHash.trim().toLowerCase() : null;
  }catch(err){
    console.warn('Não foi possível carregar a palavra-chave do admin:', err);
  }
}
loadAdminKeyword();

let allGames = [];
let genreDocs = [];
let devByDocs = [];
let portByDocs = [];
let activeSection = SECTIONS[0];
let sortMode = "recent";
let editingGameId = null;
let visibleLinkRows = 1;
let gamesLoaded = false;
let adminSearchTerm = "";
let adminCategoryFilter = "all";

const sectionIcon = { "Jogos Android":"smartphone", "GoldSrc Engine":"terminal", "Source Engine":"engineering", "Apps Premium":"apps" };
const sectionIconSvg = {
  "GoldSrc Engine": `<svg class="ico nav-icon-svg" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M4,3.2 l0,3.25 l2.29,0 l3.5,5.66 l-5.51,8.61 l4.37,0 l3.43,-5.19 l3.28,5.19 l4.51,0 l0,-3.11 l-2.1,-0.04 l-3.53,-5.62 l5.48,-8.76 l-4.22,0 l-3.42,5.33 l-3.46,-5.33 z"/></svg>`,
  "Source Engine": `<svg class="ico nav-icon-svg" viewBox="0 0 128 128" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="m104.564 4.343-63.813.363c-13.179-.677-26.16 2.55-37.387 9.008l.011.01c-5.867 3.203-3.602 12.117 3.083 12.129 1.866 0 3.53-.79 4.709-2.043a55.05 55.05 0 0 1 47.029-2.464c28.133 11.546 41.626 43.84 30.08 71.973a54.8 54.8 0 0 1-13.307 19.27l.054.069c-6.767 3.899 4.552 15.634 8.693 9.013A67.4 67.4 0 0 0 99.93 98.103c.262-.63 26.411-64.325 26.475-64.496 4.458-10.876-.742-23.307-11.616-27.77-2.934-1.206-5.675-1.483-8.838-1.494zM32.36 37.063c-14.053 0-28.49 4.304-28.49 21.019 0 11.52 10.378 15.194 20.762 17.477 12.918 2.784 20.39 4.683 20.39 10.128 0 6.336-6.587 8.363-11.776 8.363-7.094 0-13.675-3.168-13.803-11.02H2.351c.763 17.345 15.573 23.04 30.773 23.04 14.939 0 29.883-5.567 29.883-22.788 0-12.16-10.256-15.958-20.768-18.363-10.256-2.405-20.39-3.29-20.39-9.75 0-5.317 5.953-6.08 10.011-6.08 6.453 0 11.77 1.905 12.277 8.865h17.094c-1.387-16.08-14.56-20.89-28.87-20.89z"/></svg>`
};

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
backdrop.onclick = closeDrawer;
document.addEventListener('keydown', e => { if(e.key === 'Escape'){ closeDrawer(); if(!document.getElementById('detailOverlay').classList.contains('hidden')) closeDetail(); document.getElementById('gameFormOverlay').classList.add('hidden'); } });

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
  const wrap = document.getElementById('genreCarousels');
  document.getElementById('emptyState').classList.add('hidden');
  const skeletonCard = `
    <div class="card skeleton-card" aria-hidden="true">
      <div class="skel" style="width:100%;aspect-ratio:1;border-radius:var(--shape-lg);"></div>
      <div class="skel" style="width:45%;height:10px;border-radius:999px;"></div>
      <div class="skel" style="width:80%;height:14px;"></div>
      <div class="meta-row">
        <div class="skel" style="width:32px;height:9px;"></div>
        <div class="skel" style="width:32px;height:9px;"></div>
      </div>
    </div>
  `;
  wrap.innerHTML = Array.from({length:rows}).map((_, i)=>`
    <div class="genre-row" aria-hidden="true">
      <h2 class="genre-title"><span class="skel" style="display:inline-block;width:${90 + i*20}px;height:17px;border-radius:999px;"></span></h2>
      <div class="carousel-track">${skeletonCard.repeat(perRow)}</div>
    </div>
  `).join('');
}
renderSkeletons();

function renderSectionNav(){
  const wrap = document.getElementById('sectionNav');
  wrap.innerHTML = SECTIONS.map(s=>{
    const count = allGames.filter(g=>g.category===s).length;
    return `
    <button class="nav-item ${s===activeSection?'active':''}" aria-current="${s===activeSection?'page':'false'}" data-section="${escapeHtml(s)}">
      ${sectionIconSvg[s] || `<span class="ico msi">${sectionIcon[s]||'folder'}</span>`} ${escapeHtml(s)}
      <span class="nav-count">${count}</span>
    </button>
  `;
  }).join('');
  wrap.querySelectorAll('.nav-item').forEach(btn=>{
    btn.onclick = ()=>{
      activeSection = btn.dataset.section;
      document.getElementById('sectionTitle').textContent = activeSection;
      document.getElementById('topTitle').textContent = activeSection;
      renderSectionNav();
      renderGrid();
      closeDrawer();
    };
  });
}
document.getElementById('topTitle').textContent = activeSection;

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

function startGamesListener(){
  onSnapshot(collection(db,'games'), (snap)=>{
    allGames = snap.docs.map(d=>({id:d.id, ...d.data()}));
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
  }, (err)=>{
    console.error('Erro ao carregar jogos:', err);
    gamesLoaded = true;
    document.getElementById('adminLoadMsg').textContent = 'Não foi possível carregar os jogos. Confira sua conexão e as regras do Firestore.';
    document.getElementById('emptyStateTitle').textContent = 'NÃO FOI POSSÍVEL CARREGAR OS JOGOS';
    document.getElementById('emptyStateSub').textContent = 'Verifique sua conexão e tente novamente em instantes.';
    document.getElementById('gameGrid').innerHTML = '';
    document.getElementById('emptyState').classList.remove('hidden');
  });
}

document.getElementById('sortSelect').addEventListener('change', (e)=>{ sortMode = e.target.value; renderGrid(); });
document.getElementById('searchInput').addEventListener('input', async (e)=>{
  const val = e.target.value.trim().toLowerCase();
  if(adminKeywordHash && val){
    const valHash = await sha256Hex(val);
    if(valHash === adminKeywordHash){
      e.target.value = '';
      window.location.hash = ADMIN_HASH;
      return;
    }
  }
  renderGrid();
});

function cardHtml(g){
  return `
    <div class="card ${g.pinned?'pinned':''}" data-id="${g.id}" tabindex="0" role="button">
      ${g.pinned?'<span class="pin-badge msi" title="Fixado">push_pin</span>':''}
      <button class="fav-btn ${isFavorite(g.id)?'active':''}" data-fav="${g.id}" aria-label="Favoritar" title="Favoritar"><span class="msi">favorite</span></button>
      <div class="icon">${g.iconUrl ? `<img src="${g.iconUrl}" alt="">` : '<span class="msi">videogame_asset</span>'}</div>
      <div class="tag-row">
        <span class="tag">${escapeHtml(g.genre || g.category || 'Jogo')}</span>
        ${isRecentlyAdded(g)?'<span class="tag tag-new">Novo</span>':''}
      </div>
      <h3>${escapeHtml(g.name||'Sem nome')}</h3>
      <div class="meta-row">
        <span class="mono version">v${escapeHtml(g.version||'1.0')}</span>
        <span class="mono filesize"><span class="msi msi-inline">sd_storage</span> ${escapeHtml(g.fileSize || '—')}</span>
      </div>
    </div>
  `;
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
      renderGrid();
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
        <h2 class="genre-title"><span class="msi msi-inline" style="font-size:16px;vertical-align:-2px;">update</span> Atualizados recentemente <span class="genre-count">${recentlyUpdatedGames.length}</span></h2>
        <div class="carousel-track">${recentlyUpdatedGames.map(cardHtml).join('')}</div>
      </div>
    `;
  }
  if(pinnedGames.length > 0){
    html += `
      <div class="genre-row">
        <h2 class="genre-title"><span class="msi msi-inline" style="font-size:16px;vertical-align:-2px;">push_pin</span> Fixados <span class="genre-count">${pinnedGames.length}</span></h2>
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

function renderGrid(){
  if(!gamesLoaded) return;
  const searchTerm = document.getElementById('searchInput').value.trim().toLowerCase();
  const showFavoritesOnly = sortMode === 'favorites';
  const useFlatList = !!searchTerm || showFavoritesOnly;
  const grid = document.getElementById('gameGrid');
  const carousels = document.getElementById('genreCarousels');
  const empty = document.getElementById('emptyState');

  grid.classList.toggle('hidden', !useFlatList);
  carousels.classList.toggle('hidden', useFlatList);

  if(!useFlatList){
    renderCarousels();
    return;
  }

  const filtered = sortGames(allGames).filter(g=>{
    const matchesSection = g.category === activeSection;
    const matchesSearch = !searchTerm || (g.name||'').toLowerCase().includes(searchTerm);
    const matchesFav = !showFavoritesOnly || isFavorite(g.id);
    return matchesSection && matchesSearch && matchesFav;
  });
  if(filtered.length === 0){
    grid.innerHTML = '';
    document.getElementById('emptyStateTitle').textContent = showFavoritesOnly ? 'NENHUM FAVORITO POR AQUI' : 'NENHUM JOGO ENCONTRADO';
    document.getElementById('emptyStateSub').textContent = showFavoritesOnly ? 'Toque no coração de um jogo pra salvá-lo aqui.' : 'Tente buscar por outro termo.';
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');
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
          <div class="tag-row"><span class="tag">${escapeHtml(g.genre || g.category || 'Jogo')}</span>${isRecentlyAdded(g)?'<span class="tag tag-new">Novo</span>':''}</div>
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
    renderGrid();
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
  document.getElementById('publicView').classList.add('hidden');
  document.getElementById('adminView').classList.remove('hidden');
}
function showPublic(){
  document.getElementById('adminView').classList.add('hidden');
  document.getElementById('publicView').classList.remove('hidden');
}
function openGameDeepLink(id){
  const g = allGames.find(x=>x.id===id);
  if(!g) return;
  activeSection = g.category || SECTIONS[0];
  document.getElementById('sectionTitle').textContent = activeSection;
  document.getElementById('topTitle').textContent = activeSection;
  renderSectionNav();
  renderGrid();
  openDetail(id);
}
document.getElementById('backToSiteBtn').onclick = ()=>{ window.location.hash = ''; };
window.addEventListener('hashchange', routeCheck);
function routeCheck(){
  const hash = window.location.hash;
  if(hash === ADMIN_HASH){
    showAdmin();
    return;
  }
  showPublic();
  if(hash.startsWith('#jogo=')){
    const id = idFromGameHash(hash);
    if(gamesLoaded) openGameDeepLink(id);
    else pendingDeepLinkId = id;
  }
}

document.getElementById('loginBtn').onclick = async ()=>{
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  const msg = document.getElementById('loginMsg');
  msg.innerHTML = '';
  try{ await signInWithEmailAndPassword(auth, email, password); }
  catch(err){ msg.innerHTML = `<div class="msg err">Não foi possível entrar. Confira e-mail e senha.</div>`; }
};
document.getElementById('logoutBtn').onclick = ()=> signOut(auth);

onAuthStateChanged(auth, (user)=>{
  const loginBox = document.getElementById('loginBox');
  const dashBox = document.getElementById('dashboardBox');
  const returnBtn = document.getElementById('adminReturnBtn');
  if(user){
    loginBox.classList.add('hidden');
    dashBox.classList.remove('hidden');
    returnBtn.classList.remove('hidden');
    renderAdminList();
  }else{
    loginBox.classList.remove('hidden');
    dashBox.classList.add('hidden');
    returnBtn.classList.add('hidden');
    document.getElementById('gameFormOverlay').classList.add('hidden');
  }
});
document.getElementById('adminReturnBtn').onclick = ()=>{ window.location.hash = ADMIN_HASH; };

function setBtnIcon(btn, iconName, label){
  btn.innerHTML = `<span class="msi">${iconName}</span>`;
  btn.title = label;
  btn.setAttribute('aria-label', label);
}

function renderAdminList(){
  const card = document.getElementById('gameListCard');
  if(!auth.currentUser) return;
  if(!gamesLoaded){
    card.innerHTML = Array.from({length:3}).map(()=>`
      <div class="admin-row game-row">
        <div class="skel" style="width:40%;height:16px;"></div>
        <div class="skel" style="width:120px;height:30px;border-radius:999px;"></div>
      </div>
    `).join('');
    return;
  }
  if(allGames.length === 0){
    card.innerHTML = `<div class="empty-note">Nenhum jogo publicado ainda. Clique em "Novo jogo" pra começar.</div>`;
    return;
  }
  const term = adminSearchTerm.trim().toLowerCase();
  const list = sortGames(allGames)
    .filter(g => adminCategoryFilter === 'all' || g.category === adminCategoryFilter)
    .filter(g => !term || (g.name||'').toLowerCase().includes(term));
  if(list.length === 0){
    const filterLabel = adminCategoryFilter === 'all' ? '' : ` em ${escapeHtml(adminCategoryFilter)}`;
    card.innerHTML = term
      ? `<div class="empty-note">Nenhum jogo encontrado pra "${escapeHtml(adminSearchTerm)}"${filterLabel}.</div>`
      : `<div class="empty-note">Nenhum jogo${filterLabel} ainda.</div>`;
    return;
  }
  card.innerHTML = list.map(g=>`
    <div class="admin-row game-row">
      <div class="name">${g.pinned?'<span class="msi msi-inline">push_pin</span>':''} ${escapeHtml(g.name)} <span class="mono" style="color:var(--md-on-surface-variant);font-weight:400;">v${escapeHtml(g.version||'1.0')}</span>
        <span class="cat-tag">${escapeHtml(g.category||'—')}</span>
      </div>
      <div class="actions">
        <button class="btn btn-tonal icon-btn-sm${g.pinned?' active':''}" data-pin="${g.id}" data-pinned="${g.pinned?1:0}" title="${g.pinned ? 'Desafixar' : 'Fixar'}" aria-label="${g.pinned ? 'Desafixar' : 'Fixar'}"><span class="msi">push_pin</span></button>
        <button class="btn btn-tonal icon-btn-sm" data-resend="${g.id}" title="Reenviar" aria-label="Reenviar"><span class="msi">campaign</span></button>
        <button class="btn btn-outlined icon-btn-sm" data-direto="${g.id}" title="Link Direto" aria-label="Link Direto"><span class="msi">link</span></button>
        <button class="btn btn-tonal icon-btn-sm" data-edit="${g.id}" title="Editar" aria-label="Editar"><span class="msi">edit</span></button>
        <button class="btn btn-error icon-btn-sm" data-del="${g.id}" title="Excluir" aria-label="Excluir"><span class="msi">delete</span></button>
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

function resetForm(){
  editingGameId = null;
  document.getElementById('fName').value = '';
  document.getElementById('fSection').value = SECTIONS[0];
  document.getElementById('fFileSize').value = '';
  setSelectedArchitectures([]);
  document.getElementById('fGenre').value = '';
  document.getElementById('fDevBy').value = '';
  document.getElementById('fPortBy').value = '';
  document.getElementById('fVersion').value = '';
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
}

function openForm(gameId){
  resetForm();
  const overlay = document.getElementById('gameFormOverlay');
  overlay.classList.remove('hidden');
  overlay.scrollTop = 0;
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
    document.getElementById('fVersion').value = g.version || '';
    document.getElementById('fDescription').value = g.description || '';
    document.getElementById('fIconUrl').value = g.iconUrl || '';
    document.getElementById('fBannerUrl').value = g.bannerUrl || '';
    document.getElementById('fDirectUrl').value = g.directUrl || '';
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
    const payload = { name, category, genre, devBy, portBy, version, description, iconUrl, bannerUrl, directUrl, fileSize, links, architectures };

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
startGenresListener();
startDevsListener();
startPortsListener();
startGamesListener();
