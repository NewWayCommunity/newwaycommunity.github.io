/* Gera o hash da palavra-chave para guardar no Firestore (documento adminConfig/auth).
   Uso (na raiz do projeto, por exemplo no Termux):  node tools/gerar-hash.js
   A palavra-chave é digitada sem aparecer na tela e não fica salva em lugar nenhum. */
'use strict';

const crypto = require('node:crypto');

function askHidden(question) {
  return new Promise(resolve => {
    process.stdout.write(question);
    const stdin = process.stdin;
    let value = '';
    if (stdin.isTTY) stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    const onData = ch => {
      for (const c of ch) {
        if (c === '\r' || c === '\n' || c === '\u0004') {
          if (stdin.isTTY) stdin.setRawMode(false);
          stdin.pause();
          stdin.removeListener('data', onData);
          process.stdout.write('\n');
          return resolve(value);
        }
        if (c === '\u0003') process.exit(1);
        if (c === '\u007f' || c === '\b') value = value.slice(0, -1);
        else value += c;
      }
    };
    stdin.on('data', onData);
  });
}

(async () => {
  const a = await askHidden('Palavra-chave: ');
  if (a.length < 12) {
    console.error('Use pelo menos 12 caracteres. Uma frase longa é mais segura do que uma palavra curta.');
    process.exit(1);
  }
  const b = await askHidden('Repita a palavra-chave: ');
  if (a !== b) { console.error('As duas digitações são diferentes.'); process.exit(1); }

  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.createHash('sha256').update(salt + a.trim().toLowerCase(), 'utf8').digest('hex');

  console.log('\nCrie no Firestore o documento  adminConfig / auth  com estes campos (tipo string):\n');
  console.log('  hash     ' + hash);
  console.log('  salt     ' + salt);
  console.log('  adminUid <UID da conta admin em Authentication > Users; com mais de um admin, separe por vírgula>\n');
  console.log('A palavra-chave vale sem maiúsculas/minúsculas e sem espaços nas pontas.\n');
})();
