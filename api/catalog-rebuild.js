/* Atualiza a cópia do catálogo. Pode pedir:
   - quem tem sessão de administrador (o painel faz isso sozinho depois de salvar), com Authorization: Bearer <ID token>;
   - você, pelo Termux, com Authorization: Bearer <CRON_SECRET> (útil para gerar a primeira cópia depois do deploy).
   POST /api/catalog-rebuild  ->  { ok, count, parts } (ou { ok, skipped }) */
'use strict';
const crypto = require('node:crypto');
const c = require('./_lib/core');
const { rebuildCatalog } = require('./_lib/catalog');

const MIN_GAP_MS = 5000;   // pedidos colados demais não refazem tudo de novo

const same = (a, b) => {
  const x = crypto.createHash('sha256').update(String(a)).digest();
  const y = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(x, y);
};

module.exports = c.endpoint(async req => {
  const secret = process.env.CRON_SECRET || '';
  const m = /^Bearer (.+)$/.exec(req.headers.authorization || '');
  const bySecret = secret.length >= 16 && !!m && same(m[1], secret);
  if (!bySecret) await c.requireAdmin(await c.verifyBearer(req));

  const meta = await c.db().collection('catalogSnapshot').doc('meta').get();
  if (meta.exists && Date.now() - (meta.data().builtAt || 0) < MIN_GAP_MS) return { ok: true, skipped: true };
  const r = await rebuildCatalog();
  return { ok: true, ...r };
});
