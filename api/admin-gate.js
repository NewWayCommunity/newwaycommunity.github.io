/* Etapa 1 (sem login): palavra-chave certa gera um bilhete de uso único.
   POST /api/admin-gate  { keyword }  ->  { ticket, expiresAt }
   Erro nunca explica nada; o hash nunca sai daqui. */
'use strict';
const c = require('./_lib/core');

module.exports = c.endpoint(async (req, body) => {
  const keyword = body.keyword;
  if (typeof keyword !== 'string' || keyword.trim().length === 0 || keyword.length > c.MAX_KEYWORD_LENGTH) throw c.DENIED();

  const keys = ['ip_' + c.sha256Hex(c.clientIp(req))];
  if (!(await c.reserveAttempt(keys))) throw c.LOCKED();

  const cfgSnap = await c.db().collection('adminConfig').doc('auth').get();
  const cfg = cfgSnap.exists ? cfgSnap.data() : {};
  if (!c.keywordMatches(keyword, cfg)) throw c.DENIED();

  const ticket = c.crypto.randomBytes(32).toString('base64url');
  const expiresAt = Date.now() + c.GATE_TICKET_MS;
  // Guardamos só o hash do bilhete: quem ler o banco não consegue usá-lo.
  await c.db().collection('adminGates').doc(c.sha256Hex(ticket)).set({
    createdAt: c.FieldValue.serverTimestamp(),
    expiresAt: c.Timestamp.fromMillis(expiresAt)
  });

  await c.clearCounters(keys);
  return { ticket, expiresAt };
});
