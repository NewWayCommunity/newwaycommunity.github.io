/* New Way Community — núcleo do backend do painel (Vercel Functions + Firebase Admin SDK).
   Tudo que decide acesso acontece aqui, nunca no JavaScript público do site. */
'use strict';

const crypto = require('node:crypto');
const { initializeApp, getApps, cert } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore, FieldValue, Timestamp } = require('firebase-admin/firestore');

/* ---------- ajustes ---------- */
const SESSION_MS = 8 * 60 * 60 * 1000;      // sessão administrativa dura 8 horas (ou até tocar em Sair)
const GATE_TICKET_MS = 10 * 60 * 1000;      // bilhete depois de acertar a palavra-chave
const MAX_LOGIN_AGE_MS = 15 * 60 * 1000;    // o login por e-mail e senha precisa ser recente
const MAX_ATTEMPTS = 5;                     // tentativas antes de bloquear
const WINDOW_MS = 15 * 60 * 1000;           // janela de contagem
const LOCK_BASE_MS = 15 * 60 * 1000;        // bloqueio inicial (dobra a cada reincidência, máx. 24 h)
const LOCK_MAX_MS = 24 * 60 * 60 * 1000;
const MAX_KEYWORD_LENGTH = 200;


/* ---------- Firebase Admin (credencial vem de variável de ambiente da Vercel) ---------- */
function ready() {
  if (!getApps().length) {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!raw) throw new Error('config-ausente');
    initializeApp({ credential: cert(JSON.parse(raw)) });
  }
}
const db = () => { ready(); return getFirestore(); };
const auth = () => { ready(); return getAuth(); };

/* ---------- erros e resposta ---------- */
class HttpError extends Error {
  constructor(status, code) { super(code); this.status = status; this.code = code; }
}
const DENIED = () => new HttpError(403, 'denied');
const LOCKED = () => new HttpError(429, 'locked');
const UNAUTH = () => new HttpError(401, 'unauthenticated');

/* Envolve cada endpoint: só POST, só da própria origem, sem cache, erros genéricos. */
function endpoint(fn) {
  return async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ error: 'method' }); }
    const origin = req.headers.origin;
    if (origin) {
      let same = false;
      try { same = new URL(origin).host === req.headers.host; } catch {}
      if (!same) return res.status(403).json({ error: 'denied' });
    }
    try {
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      return res.status(200).json(await fn(req, body));
    } catch (err) {
      if (err instanceof HttpError) return res.status(err.status).json({ error: err.code });
      console.error('erro-interno', err && err.code ? String(err.code) : String(err && err.message));
      return res.status(500).json({ error: 'internal' });
    }
  };
}

/* ---------- utilitários ---------- */
const sha256 = text => crypto.createHash('sha256').update(text, 'utf8').digest();
const sha256Hex = text => sha256(text).toString('hex');

function clientIp(req) {
  const h = req.headers;
  const raw = h['x-vercel-forwarded-for'] || h['x-real-ip'] || h['x-forwarded-for'] || 'desconhecido';
  return String(raw).split(',')[0].trim() || 'desconhecido';
}

/* Confere o token de login (ID token do Firebase Authentication) enviado no cabeçalho. */
async function verifyBearer(req) {
  const m = /^Bearer (.+)$/.exec(req.headers.authorization || '');
  if (!m) throw UNAUTH();
  try { return await auth().verifyIdToken(m[1]); } catch { throw UNAUTH(); }
}

/* ---------- palavra-chave ---------- */
// Aceita o hash feito com a palavra exatamente como digitada, sem espaços nas pontas, ou em minúsculas
// (o formato do New Way). Todas as variantes são sempre comparadas, sem parar na primeira que bate.
const normalizeKeyword = k => k.trim().toLowerCase();

function keywordMatches(keyword, cfg) {
  const salt = typeof cfg.salt === 'string' ? cfg.salt : '';
  const stored = Buffer.from(typeof cfg.hash === 'string' ? cfg.hash.trim().toLowerCase() : '', 'hex');
  let ok = false;
  for (const variant of new Set([keyword, keyword.trim(), normalizeKeyword(keyword)])) {
    const given = sha256(salt + variant);
    // Tempo constante. Se a configuração estiver ausente, o resultado é sempre falso.
    if (stored.length === given.length && crypto.timingSafeEqual(stored, given)) ok = true;
  }
  return ok;
}

/* ---------- limitação de tentativas ---------- */
/* A tentativa é contada ANTES de comparar. Pedidos paralelos não furam o limite, e quem está
   bloqueado é barrado mesmo acertando. */
async function reserveAttempt(keys) {
  const d = db();
  const refs = keys.map(k => d.collection('adminAuthLimits').doc(k));
  return d.runTransaction(async tx => {
    const now = Date.now();
    const snaps = await Promise.all(refs.map(r => tx.get(r)));
    const states = snaps.map(sn => (sn.exists ? sn.data() : {}));
    if (states.some(st => (st.lockedUntil || 0) > now)) return false;

    let allowed = true;
    refs.forEach((ref, i) => {
      const st = states[i];
      let count = st.count || 0;
      let start = st.windowStart || 0;
      if (now - start > WINDOW_MS) { count = 0; start = now; }
      count += 1;
      const next = { count, windowStart: start, strikes: st.strikes || 0, lockedUntil: 0, updatedAt: now };
      if (count > MAX_ATTEMPTS) {
        next.strikes += 1;
        next.lockedUntil = now + Math.min(LOCK_BASE_MS * 2 ** (next.strikes - 1), LOCK_MAX_MS);
        next.count = 0;
        allowed = false;
      }
      tx.set(ref, next);
    });
    return allowed;
  });
}

async function clearCounters(keys) {
  const d = db();
  await Promise.all(keys.map(k => d.collection('adminAuthLimits').doc(k).delete().catch(() => {})));
}

/* ---------- autorização das operações protegidas ---------- */
/* Token com claim de admin, sessão existente, dona do token, não expirada, conta ativa. */
async function requireAdmin(decoded) {
  if (!decoded || decoded.admin !== true || typeof decoded.sid !== 'string' || typeof decoded.adminUntil !== 'number') throw DENIED();
  if (decoded.adminUntil <= Date.now()) throw DENIED();

  const snap = await db().collection('adminSessions').doc(decoded.sid).get();
  const s = snap.exists ? snap.data() : null;
  if (!s || s.uid !== decoded.uid || !s.expiresAt || s.expiresAt.toMillis() <= Date.now()) throw DENIED();

  const user = await auth().getUser(decoded.uid).catch(() => null);
  if (!user || user.disabled) throw DENIED();
  return { uid: decoded.uid, sid: decoded.sid, expiresAt: s.expiresAt.toMillis() };
}

module.exports = {
  SESSION_MS, GATE_TICKET_MS, MAX_LOGIN_AGE_MS, MAX_KEYWORD_LENGTH,
  crypto, db, auth, FieldValue, Timestamp,
  HttpError, DENIED, LOCKED, UNAUTH, endpoint,
  sha256Hex, clientIp, verifyBearer, keywordMatches,
  reserveAttempt, clearCounters, requireAdmin
};
