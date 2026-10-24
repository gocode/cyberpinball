// Jeton GitHub de la publication (scripts/publier.mjs, scripts/decrire-github.mjs), dans
// l'ordre : CYBERPINBALL_GITHUB_TOKEN (sinon GITHUB_TOKEN, GH_TOKEN), puis le fichier
// %USERPROFILE%\.cyberpinball\jeton-github.txt, à côté de la clé de signature des mises à
// jour : hors du dépôt (public), commun à tous ses dossiers (worktrees compris).
//
// Le jeton : à grain fin, limité au dépôt gocode/cyberpinball, permissions « Contents » et
// « Administration » en lecture et écriture (création : https://github.com/settings/personal-access-tokens/new).
// Le fichier : le jeton seul, sur une ligne ; les lignes qui commencent par # sont ignorées.

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

export const TOKEN_FILE = path.join(os.homedir(), '.cyberpinball', 'jeton-github.txt');

/** Le jeton, ou undefined ; `source` dit d'où il vient (jamais le jeton lui-même). */
export function githubToken() {
  for (const name of ['CYBERPINBALL_GITHUB_TOKEN', 'GITHUB_TOKEN', 'GH_TOKEN']) {
    if (process.env[name]) return { token: process.env[name].trim(), source: `variable ${name}` };
  }
  if (fs.existsSync(TOKEN_FILE)) {
    const line = fs
      .readFileSync(TOKEN_FILE, 'utf8')
      .replace(/^﻿/, '')
      .split(/\r?\n/)
      .map((l) => l.trim())
      .find((l) => l && !l.startsWith('#'));
    if (line) return { token: line, source: TOKEN_FILE };
  }
  return undefined;
}

/** Message quand il manque. */
export function missingTokenMessage() {
  return `jeton GitHub absent : mettez-le dans ${TOKEN_FILE} (le jeton seul, sur une ligne), ou dans la variable CYBERPINBALL_GITHUB_TOKEN.`;
}
