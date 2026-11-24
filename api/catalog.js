/* Entrega o catálogo aos visitantes (sem login). A Vercel guarda a resposta por alguns minutos para todos,
   então o Firestore quase não é lido, não importa quantas pessoas visitem o site.
   GET /api/catalog?p=0  ->  { parts, count, builtAt, games, [genres, devs, ports só na parte 0] }
   Sem cópia ainda (503), o site volta a ler o Firestore sozinho. */
'use strict';
const c = require('./_lib/core');

module.exports = async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); res.setHeader('Cache-Control', 'no-store'); return res.status(405).json({ error: 'method' }); }
  try {
    const p = Number(new URL(req.url, 'http://x').searchParams.get('p') || '0');
    const col = c.db().collection('catalogSnapshot');
    const meta = await col.doc('meta').get();
    if (!meta.exists) { res.setHeader('Cache-Control', 'no-store'); return res.status(503).json({ error: 'sem-copia' }); }
    const m = meta.data();
    if (!Number.isInteger(p) || p < 0 || p >= m.parts) { res.setHeader('Cache-Control', 'no-store'); return res.status(404).json({ error: 'parte' }); }
    const part = await col.doc('p' + p).get();
    if (!part.exists) { res.setHeader('Cache-Control', 'no-store'); return res.status(503).json({ error: 'sem-copia' }); }

    // O texto já guardado é reaproveitado, sem converter de novo.
    const head = `{"parts":${m.parts},"count":${m.count},"builtAt":${m.builtAt},"games":${part.data().json}`;
    const tail = p === 0 && m.extra ? ',' + m.extra.slice(1, -1) + '}' : '}';
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    // 1 min no navegador, 2 min na rede da Vercel, e serve a versão antiga por até 10 min enquanto atualiza.
    res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=120, stale-while-revalidate=600');
    return res.status(200).send(head + tail);
  } catch (err) {
    console.error('catalog falhou', err && err.code ? String(err.code) : String(err && err.message));
    res.setHeader('Cache-Control', 'no-store');
    return res.status(500).json({ error: 'internal' });
  }
};
