/* Etapa 2 (logado por e-mail e senha): troca o bilhete por uma sessão administrativa.
   POST /api/admin-unlock  { ticket }  + Authorization: Bearer <ID token>  ->  { token, expiresAt } */
'use strict';
const c = require('./_lib/core');

module.exports = c.endpoint(async (req, body) => {
  const decoded = await c.verifyBearer(req);

  const ticket = body.ticket;
  if (typeof ticket !== 'string' || ticket.length < 20 || ticket.length > 100) throw c.DENIED();

  const keys = ['uid_' + c.sha256Hex(decoded.uid), 'ip_' + c.sha256Hex(c.clientIp(req))];
  if (!(await c.reserveAttempt(keys))) throw c.LOCKED();

  // O bilhete é queimado em qualquer tentativa: se algo der errado, é preciso digitar a palavra-chave de novo.
  const gateRef = c.db().collection('adminGates').doc(c.sha256Hex(ticket));
  const ticketOk = await c.db().runTransaction(async tx => {
    const snap = await tx.get(gateRef);
    if (!snap.exists) return false;
    const exp = snap.data().expiresAt;
    tx.delete(gateRef);
    return !!exp && exp.toMillis() > Date.now();
  });
  if (!ticketOk) throw c.DENIED();

  // Precisa ter entrado por e-mail e senha, e há pouco tempo.
  const provider = decoded.firebase && decoded.firebase.sign_in_provider;
  const authTimeMs = (typeof decoded.auth_time === 'number' ? decoded.auth_time : 0) * 1000;
  if (provider !== 'password' || Date.now() - authTimeMs > c.MAX_LOGIN_AGE_MS) throw c.DENIED();

  const cfgSnap = await c.db().collection('adminConfig').doc('auth').get();
  const cfg = cfgSnap.exists ? cfgSnap.data() : {};
  // Um ou mais administradores: `adminUid` pode ter vários UIDs separados por vírgula (ou use a lista `adminUids`).
  const admins = [].concat(Array.isArray(cfg.adminUids) ? cfg.adminUids : [], typeof cfg.adminUid === 'string' ? cfg.adminUid.split(/[\s,;]+/) : [])
    .filter(x => typeof x === 'string' && x.length > 0);
  if (!admins.includes(decoded.uid)) throw c.DENIED();

  // Confirma a identidade no Firebase Authentication: a conta admin precisa existir e estar ativa.
  const user = await c.auth().getUser(decoded.uid).catch(() => null);
  if (!user || user.disabled) throw c.DENIED();

  const sid = c.crypto.randomBytes(24).toString('base64url');
  const expiresAt = Date.now() + c.SESSION_MS;
  await c.db().collection('adminSessions').doc(sid).set({
    uid: user.uid,
    createdAt: c.FieldValue.serverTimestamp(),
    expiresAt: c.Timestamp.fromMillis(expiresAt),
    ipHash: c.sha256Hex(c.clientIp(req)).slice(0, 16)
  });
  const token = await c.auth().createCustomToken(user.uid, { admin: true, sid, adminUntil: expiresAt });

  await c.clearCounters(keys);
  return { token, expiresAt };
});
