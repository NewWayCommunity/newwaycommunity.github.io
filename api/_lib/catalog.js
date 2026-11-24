/* Cópia do catálogo para os visitantes.
   Em vez de cada visita ler todos os jogos do Firestore, o servidor guarda uma cópia pronta (coleção
   catalogSnapshot, fechada para clientes) e a entrega por /api/catalog, com cache da Vercel.
   A cópia é refeita quando o painel salva algo (api/catalog-rebuild.js) e todo dia pelo agendamento. */
'use strict';
const c = require('./core');

const PART_BYTES = 600 * 1024;   // cada parte fica bem abaixo do limite de 1 MiB por documento do Firestore
// Campos que só o painel usa: não vão para a cópia pública (menos dados e menos exposição).
const PRIVATE_FIELDS = ['discordMessageId', 'discordDiretoMessageId', 'archivedLinks'];

// Timestamps do Firestore viram { seconds, nanoseconds }, que o site já entende.
function plain(v) {
  if (v === null || typeof v !== 'object') return v;
  if (typeof v.toMillis === 'function' && typeof v.seconds === 'number') return { seconds: v.seconds, nanoseconds: v.nanoseconds || 0 };
  if (Array.isArray(v)) return v.map(plain);
  const o = {};
  for (const [k, x] of Object.entries(v)) o[k] = plain(x);
  return o;
}

const rows = snap => { const out = []; snap.forEach(d => out.push({ id: d.id, ...plain(d.data() || {}) })); return out; };

/* Lê tudo uma vez, divide em partes por tamanho e grava. Primeiro as partes, depois a ficha (meta):
   quem lê nunca vê uma ficha apontando para partes que ainda não existem. */
async function rebuildCatalog() {
  const db = c.db();
  const [gSnap, geSnap, deSnap, poSnap] = await Promise.all([
    db.collection('games').get(), db.collection('genres').get(), db.collection('devs').get(), db.collection('ports').get()
  ]);
  const games = rows(gSnap).map(g => { for (const k of PRIVATE_FIELDS) delete g[k]; return g; });

  const parts = [];
  let cur = [], size = 0;
  for (const g of games) {
    const s = Buffer.byteLength(JSON.stringify(g));
    if (cur.length && size + s > PART_BYTES) { parts.push(cur); cur = []; size = 0; }
    cur.push(g); size += s;
  }
  if (cur.length || !parts.length) parts.push(cur);

  const col = db.collection('catalogSnapshot');
  const metaRef = col.doc('meta');
  const old = await metaRef.get();
  const oldParts = old.exists && Number.isInteger(old.data().parts) ? old.data().parts : 0;

  for (let i = 0; i < parts.length; i++) await col.doc('p' + i).set({ json: JSON.stringify(parts[i]) });
  const extra = JSON.stringify({ genres: rows(geSnap), devs: rows(deSnap), ports: rows(poSnap) });
  await metaRef.set({ parts: parts.length, count: games.length, builtAt: Date.now(), extra });
  for (let i = parts.length; i < oldParts; i++) await col.doc('p' + i).delete().catch(() => {});

  return { count: games.length, parts: parts.length };
}

module.exports = { rebuildCatalog, plain, PART_BYTES };
