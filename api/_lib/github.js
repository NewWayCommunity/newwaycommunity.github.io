/* Ajuda para ler a última Release de um repositório do GitHub (usada por api/github-sync.js).
   O mesmo critério está em features/catalog/logic.js, no formulário do painel. */
'use strict';

class GithubLimit extends Error {}

// Aceita endereços do repositório ou da Release: github.com/dono/repo, /releases, /releases/tag/v1...
function parseGithubRepo(url) {
  let u;
  try { u = new URL(String(url)); } catch { return null; }
  if (u.protocol !== 'https:' || (u.hostname !== 'github.com' && u.hostname !== 'www.github.com')) return null;
  const parts = u.pathname.split('/').filter(Boolean);
  if (parts.length < 2) return null;
  const owner = parts[0];
  const repo = parts[1].replace(/\.git$/i, '');
  if (!/^[A-Za-z0-9_.-]{1,100}$/.test(owner) || !/^[A-Za-z0-9_.-]{1,100}$/.test(repo)) return null;
  return { owner, repo };
}

// "v4.3.0-rc02" -> "4.3.0-rc02" (tira o "v" só quando vem um número depois)
function cleanReleaseVersion(tag) {
  return String(tag || '').trim().replace(/^[vV](?=\d)/, '').slice(0, 60);
}

/* Versão da Release publicada mais recente (a primeira que não é rascunho; pré-lançamentos entram).
   Devolve null se o repositório não existe ou não tem Release. */
async function latestRelease(owner, repo, token) {
  const headers = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'newwaycommunity-version-sync',
    'X-GitHub-Api-Version': '2022-11-28'
  };
  if (token) headers.Authorization = 'Bearer ' + token;
  const res = await fetch(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/releases?per_page=10`,
    { headers, signal: AbortSignal.timeout(8000) });
  if (res.status === 404) return null;
  if (res.status === 403 || res.status === 429) throw new GithubLimit('limite');
  if (!res.ok) throw new Error('http ' + res.status);
  const list = await res.json();
  const rel = Array.isArray(list) ? list.find(r => r && !r.draft) : null;
  const version = rel ? cleanReleaseVersion(rel.tag_name || rel.name) : '';
  return version ? { version, prerelease: !!rel.prerelease } : null;
}

module.exports = { GithubLimit, parseGithubRepo, cleanReleaseVersion, latestRelease };
