// Toute source de téléchargement de l'application passe par le gestionnaire de téléchargements
// (downloadmanager.ts). Comme guestmode.test.ts pour les entrées, ce test relève le code, pas un cas :
// - chaque endroit qui reçoit un fichier (téléchargement d'une page, corps d'une réponse HTTP écrit
//   sur le disque, fichier demandé à un ami) est inscrit ici avec ce qu'il est et par où il passe ;
//   un nouvel endroit fait échouer le test tant qu'on ne l'a pas inscrit, après l'avoir fait passer
//   par le gestionnaire (ou dit pourquoi ce n'est pas un téléchargement : un aperçu, un fichier local) ;
// - le seul code qui écrit sur le disque le corps d'une réponse HTTP est resumable.ts : toute adresse
//   directe reprend donc après une coupure ;
// - chaque appel de l'application à un téléchargement (VPinMediaDB, mise à jour, VPX, yt-dlp, ami,
//   page de site) est inscrit avec son suivi dans la file (track, add, transport).

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import { REPO_ROOT } from './i18n-scan';

/** Ce qui reçoit un fichier. */
const PRIMITIVES: { name: string; re: RegExp }[] = [
  { name: 'téléchargement du navigateur intégré', re: /'will-download'|\.downloadURL\(|createInterruptedDownload\(/g },
  { name: 'corps HTTP écrit sur le disque', re: /\.getReader\(\)|createWriteStream\(|\.arrayBuffer\(\)|\.blob\(\)/g },
  { name: 'fichier demandé à un ami', re: /t: 'file-get'/g },
];

/** Appels de l'application à un téléchargement : ils doivent être suivis dans la file. */
const CALLS = /\b(installMediaDb|stageMediaDbFile|downloadMediaDbFile|downloadUpdate|downloadAppPackage|installComponent|downloadComponent|fetchResumable|fetchFile)\(/g;
/** Ce qui fait entrer un téléchargement dans la file. */
const TRACKED = /\.track\(|\.add\(\{|trackInstall\(|track: |trackGrab: |friendTransport\(|httpTransport\(|siteTransport\b/;

/** Endroits relevés, avec ce qu'ils sont et par où ils passent (nombre d'occurrences de PRIMITIVES). */
const SOURCES: Record<string, { count: number; how: string }> = {
  'app/src/acquire-window.ts': {
    count: 4,
    how: 'pages des sites (will-download, downloadURL) : chaque téléchargement entre dans la file (events.track), repris par siteTransport (createInterruptedDownload) ; fetchImage : vignettes des résultats, aperçus, pas un téléchargement',
  },
  'app/src/friend-content.ts': { count: 1, how: 'fichier d’un ami : fetchFile, appelé par le transport des amis de la file (download-sources.ts)' },
  'app/src/media-convert.ts': { count: 4, how: 'conversion dans le rendu, protocole local /in et /out : rien ne vient du réseau' },
  'packages/core/src/friendlibrary.ts': { count: 2, how: 'définition et lecture du message file-get' },
  'packages/core/src/mediapack.ts': { count: 1, how: 'extraction d’un paquet de médias local' },
  'packages/core/src/resumable.ts': { count: 1, how: 'la reprise HTTP elle-même : seul code qui écrit le corps d’une réponse' },
};

/** Appels à un téléchargement dans l'application, par fichier, et comment ils entrent dans la file. */
const CALLERS: Record<string, { count: number; how: string }> = {
  'app/src/download-sources.ts': { count: 2, how: 'transports de la file : ami (fetchFile) et adresse directe (fetchResumable)' },
  'app/src/friend-content.ts': { count: 2, how: 'fetchFile lui-même (sa déclaration et sa définition)' },
  'app/src/install-vpx.ts': { count: 1, how: 'archive de VPX : manager.track' },
  'app/src/media-download.ts': { count: 3, how: 'plans de VPinMediaDB (une table, toutes les tables, après l’ajout) : trackInstall' },
  'app/src/media-search.ts': { count: 2, how: 'stage : un média demandé, suivi (track) ; stagePreviews : aperçus du plan, pas un téléchargement demandé' },
  'app/src/updates-menu.ts': { count: 2, how: 'mise à jour (installeur ou paquet léger) : manager.track' },
  'app/src/ytdlp-tool.ts': { count: 1, how: 'yt-dlp lui-même, dans la récupération suivie (trackGrab)' },
};

const strip = (text: string) =>
  text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => !/^\s*\/\//.test(l))
    .map((l) => l.replace(/\s\/\/ .*$/, ''))
    .join('\n');

function sources(dirs: string[]): { file: string; text: string }[] {
  const out: { file: string; text: string }[] = [];
  for (const dir of dirs) {
    const abs = path.join(REPO_ROOT, dir);
    for (const name of fs.readdirSync(abs)) {
      if (!name.endsWith('.ts') || name.endsWith('.d.ts')) continue;
      out.push({ file: `${dir}/${name}`, text: strip(fs.readFileSync(path.join(abs, name), 'utf8')) });
    }
  }
  return out;
}

const ALL = () => sources(['app/src', 'packages/core/src', 'packages/installer/src', 'packages/win-displays/src']);

test('toute source de téléchargement est relevée, avec ce qu’elle est et par où elle passe', () => {
  const found: Record<string, number> = {};
  for (const { file, text } of ALL()) {
    const n = PRIMITIVES.reduce((sum, p) => sum + (text.match(p.re)?.length ?? 0), 0);
    if (n) found[file] = n;
  }
  assert.deepEqual(
    found,
    Object.fromEntries(Object.entries(SOURCES).map(([f, s]) => [f, s.count])),
    'Une source de téléchargement nouvelle (ou retirée) : la faire passer par le gestionnaire de téléchargements (track, add, un transport), puis l’inscrire dans SOURCES avec ce qu’elle est.',
  );
});

test('le corps d’une réponse HTTP n’est écrit sur le disque que par la reprise (resumable.ts)', () => {
  const writers = ALL()
    .filter(({ text }) => /\.getReader\(\)|createWriteStream\(/.test(text))
    .map((s) => s.file)
    .filter((f) => f !== 'packages/core/src/mediapack.ts');
  assert.deepEqual(writers, ['packages/core/src/resumable.ts'], 'un téléchargement HTTP écrit à la main ne reprendrait pas après une coupure : passer par fetchResumable');
  // Les modules qui téléchargent une adresse directe passent tous par elle.
  for (const file of ['packages/core/src/mediadb.ts', 'packages/core/src/update.ts', 'packages/installer/src/download.ts', 'app/src/ytdlp-tool.ts']) {
    assert.match(fs.readFileSync(path.join(REPO_ROOT, file), 'utf8'), /fetchResumable\(/, `${file} : fetchResumable`);
  }
});

test('chaque appel de l’application à un téléchargement est suivi dans la file', () => {
  const found: Record<string, number> = {};
  for (const { file, text } of sources(['app/src'])) {
    const calls = (text.match(CALLS) ?? []).filter((c) => !/^(export )?(async )?function/.test(c));
    const defs = (text.match(/(async |function )(installMediaDb|fetchFile|stageMediaDbFile)\(/g) ?? []).length;
    const n = calls.length - defs;
    if (n > 0) found[file] = n;
  }
  assert.deepEqual(
    found,
    Object.fromEntries(Object.entries(CALLERS).map(([f, s]) => [f, s.count])),
    'Un appel nouveau à un téléchargement : le suivre dans la file (manager.track, ou un transport), puis l’inscrire dans CALLERS.',
  );
  for (const file of Object.keys(CALLERS)) {
    if (file === 'app/src/friend-content.ts' || file === 'app/src/ytdlp-tool.ts') continue;
    assert.match(fs.readFileSync(path.join(REPO_ROOT, file), 'utf8'), TRACKED, `${file} : son téléchargement entre dans la file`);
  }
  // Chaque plan de VPinMediaDB a son suivi.
  const media = strip(fs.readFileSync(path.join(REPO_ROOT, 'app/src/media-download.ts'), 'utf8'));
  assert.equal((media.match(/installMediaDb\(/g) ?? []).length, (media.match(/= trackInstall\(/g) ?? []).length, 'media-download.ts : un trackInstall par installMediaDb');
  // Les pages des sites et les récupérations yt-dlp : suivies par le catalogue.
  const catalog = fs.readFileSync(path.join(REPO_ROOT, 'app/src/catalog.ts'), 'utf8');
  assert.match(catalog, /track: ctx\.downloads/);
  assert.match(catalog, /trackGrab: ctx\.downloads/);
  // Les amis : réceptions par la file (manager.add), jamais par fetch ou fetchTable en direct.
  const friends = strip(fs.readFileSync(path.join(REPO_ROOT, 'app/src/friend-library-menu.ts'), 'utf8'));
  assert.doesNotMatch(friends, /content\s*\.\s*fetch(Table)?\(/, 'la bibliothèque d’un ami reçoit par la file');
  assert.equal((friends.match(/downloads\.manager\.add\(/g) ?? []).length, 2, 'médias et table d’un ami : deux téléchargements de la file');
});
