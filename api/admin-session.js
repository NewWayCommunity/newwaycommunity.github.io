/* Confirma, no servidor, que a sessão administrativa atual continua valendo.
   POST /api/admin-session  + Authorization: Bearer <ID token>  ->  { ok, expiresAt } */
'use strict';
const c = require('./_lib/core');

module.exports = c.endpoint(async req => {
  const s = await c.requireAdmin(await c.verifyBearer(req));
  return { ok: true, expiresAt: s.expiresAt };
});
