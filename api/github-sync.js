/* Confere uma vez por dia (Vercel Cron) se saiu Release nova nos jogos cujo Link 1 é do GitHub e
   atualiza só o campo "version" da postagem. Não mexe em link, tamanho nem em nenhum outro campo.
   GET/POST /api/github-sync  + Authorization: Bearer <CRON_SECRET>
     ->  { ok, repos, games, processed, complete, updated, failed, rateLimited, tokenMissing, catalogRebuilt }
   Feita para centenas de repositórios: consulta vários ao mesmo tempo, respeita um limite de tempo e,
   se o GitHub limitar as consultas (ou o tempo acabar), guarda onde parou e continua dali na próxima vez.
   Sem CRON_SECRET configurado na Vercel, a função recusa tudo. A Vercel envia o cabeçalho sozinha. */
'use strict';
const crypto = require('node:crypto');
const c = require('./_lib/core');
const gh = require('./_lib/github');
const { rebuildCatalog } = require('./_lib/catalog');

const CONCURRENCY = 8;                                           // consultas ao GitHub ao mesmo tempo
const BUDGET_MS = Number(process.env.SYNC_BUDGET_MS) || 45000;   // para antes do limite da função (60 s)

const same = (a, b) => {
  const x = crypto.createHash('sha256').update(String(a)).digest();
  const y = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(x, y);
};

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method !== 'GET' && req.method !== 'POST') { res.setHeader('Allow', 'GET, POST'); return res.status(405).json({ error: 'method' }); }

  const secret = process.env.CRON_SECRET || '';
  const m = /^Bearer (.+)$/.exec(req.headers.authorization || '');
  if (secret.length < 16 || !m || !same(m[1], secret)) return res.status(401).json({ error: 'unauthorized' });

  const started = Date.now();
  try {
    const db = c.db();
    // Só os dois campos necessários (links e versão): menos dados por consulta.
    const snap = await db.collection('games').select('links', 'version').get();

    // Agrupa por repositório para consultar o GitHub uma vez só por repositório.
    const byRepo = new Map();
    let games = 0;
    snap.forEach(doc => {
      const d = doc.data() || {};
      const first = Array.isArray(d.links) && d.links[0] && d.links[0].url;
      const r = first ? gh.parseGithubRepo(first) : null;
      if (!r) return;
      games++;
      const key = (r.owner + '/' + r.repo).toLowerCase();
      if (!byRepo.has(key)) byRepo.set(key, { key, ...r, docs: [] });
      byRepo.get(key).docs.push({ ref: doc.ref, version: typeof d.version === 'string' ? d.version : '' });
    });
    const list = [...byRepo.values()].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));   // ordem estável

    // Retoma de onde parou na última vez (se parou), girando pela lista.
    const stateRef = db.collection('adminConfig').doc('githubSync');
    const stateSnap = await stateRef.get();
    let cursor = stateSnap.exists && Number.isInteger(stateSnap.data().cursor) ? stateSnap.data().cursor : 0;
    if (cursor < 0 || cursor >= list.length) cursor = 0;
    const order = list.slice(cursor).concat(list.slice(0, cursor));

    const token = process.env.GITHUB_TOKEN || '';
    let updated = 0, failed = 0, rateLimited = false, processed = 0;

    for (let i = 0; i < order.length && !rateLimited; i += CONCURRENCY) {
      if (Date.now() - started > BUDGET_MS) break;                // acabou o tempo: continua amanhã
      const chunk = order.slice(i, i + CONCURRENCY);
      const results = await Promise.all(chunk.map(async repo => {
        try {
          const rel = await gh.latestRelease(repo.owner, repo.repo, token);
          if (rel) {
            for (const g of repo.docs) {
              if (g.version !== rel.version) { await g.ref.update({ version: rel.version }); updated++; }
            }
          }
          return 'ok';
        } catch (err) {
          if (err instanceof gh.GithubLimit) return 'limit';
          failed++;
          return 'fail';
        }
      }));
      const firstLimit = results.indexOf('limit');
      if (firstLimit >= 0) { rateLimited = true; processed += firstLimit; } else { processed += chunk.length; }
    }

    const complete = processed >= order.length;
    const next = complete || list.length === 0 ? 0 : (cursor + processed) % list.length;
    await stateRef.set({ cursor: next, updatedAt: Date.now() });

    // Refaz a cópia do catálogo dos visitantes (mostra as versões novas e corrige qualquer defasagem do dia).
    let catalogRebuilt = false;
    try { await rebuildCatalog(); catalogRebuilt = true; } catch (err) { console.error('copia do catalogo falhou', err && err.code ? String(err.code) : String(err && err.message)); }

    return res.status(200).json({ ok: true, repos: list.length, games, processed, complete, updated, failed, rateLimited, tokenMissing: !token && list.length > 50, catalogRebuilt });
  } catch (err) {
    console.error('github-sync falhou', err && err.code ? String(err.code) : String(err && err.message));
    return res.status(500).json({ error: 'internal' });
  }
};
