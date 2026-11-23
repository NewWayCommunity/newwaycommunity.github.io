/* Encerra a sessão no servidor: depois disso as regras do Firestore passam a negar tudo.
   POST /api/admin-logout  + Authorization: Bearer <ID token> */
'use strict';
const c = require('./_lib/core');

module.exports = c.endpoint(async req => {
  const decoded = await c.verifyBearer(req);
  if (decoded.admin === true && typeof decoded.sid === 'string') {
    await c.db().collection('adminSessions').doc(decoded.sid).delete().catch(() => {});
  }
  return { ok: true };
});
