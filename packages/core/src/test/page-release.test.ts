// Page d'une release GitHub (scripts/page-release.mjs, appelé par scripts/publier.mjs) : le public
// est d'abord anglophone. Le 19/11/2026, des joueurs venus d'un groupe Facebook anglophone sont
// tombés sur des notes surtout en français, traduites de travers par leur navigateur. Invariant :
// la page commence par l'anglais, et aucune phrase française n'y figure sans son équivalent anglais.

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';
import { REPO_ROOT } from './i18n-scan';

interface Reference {
  version: string;
  url: string;
}
interface BodyInput {
  version: string;
  notes: string[];
  notesEn: string[];
  socle: string;
  installerName: string;
  appName: string;
  installerSha256: string;
  appSha256: string;
  reference?: Reference;
}
interface PageRelease {
  releaseBody(input: BodyInput): string;
  looksFrench(line: string): boolean;
  frenchOutsideQuotes(line: string): boolean;
  straightQuotes(text: string): string;
}
interface Traductions {
  fragmentProblems(root: string): string[];
}

const load = async () => (await import(pathToFileURL(path.join(REPO_ROOT, 'scripts', 'page-release.mjs')).href)) as PageRelease;
const loadTraductions = async () => (await import(pathToFileURL(path.join(REPO_ROOT, 'scripts', 'traductions.mjs')).href)) as Traductions;

const SHA_INSTALLER = 'a'.repeat(64);
const SHA_APP = 'b'.repeat(64);
const input = (reference?: Reference): BodyInput => ({
  version: '0.2.1-essai.10',
  notes: [
    'Le médecin des tables répare les « fichiers manquants » d’une table.',
    'Juke-box : « Tout lire » joue la playlist dans l’ordre.',
  ],
  notesEn: ['The table checker repairs a table\'s "missing files".', 'Juke-box: "Tout lire" (Play all) plays the playlist in order.'],
  socle: 'electron-39.2.0+exe-7',
  installerName: 'CyberPinball-Setup.exe',
  appName: 'CyberPinball-application.zip',
  installerSha256: SHA_INSTALLER,
  appSha256: SHA_APP,
  reference,
});
const REFERENCE = { version: '0.2.0', url: 'https://github.com/example/cyberpinball/releases/tag/v0.2.0' };

/** Liens, noms de fichiers, code et versions d'une ligne : ce qu'une traduction garde à l'identique. */
const anchors = (line: string) => [...line.matchAll(/\]\([^)]*\)|\*\*[^*\s]+\.[a-z]+\*\*|`[^`]*`|\d+\.\d+[\w.+-]*/g)].map((m) => m[0]);

/** Vérifie l'invariant sur un corps de release ; renvoie les problèmes trouvés. */
function problems(body: string, page: PageRelease): string[] {
  const found: string[] = [];
  const lines = body.split('\n');
  if (lines[0] !== '## English') found.push(`première ligne « ${lines[0]} » au lieu de « ## English »`);
  const fr = lines.indexOf('## Français');
  const rule = lines.indexOf('---');
  if (fr < 0 || rule < fr) return [...found, 'sections « ## English », « ## Français » puis « --- » attendues'];
  const english = lines.slice(1, fr);
  const french = lines.slice(fr + 1, rule);
  for (const line of english) if (page.frenchOutsideQuotes(line)) found.push(`français dans la section anglaise : ${line}`);
  const count = (part: string[]) => part.filter((l) => l.startsWith('- ')).length;
  if (count(english) !== count(french)) found.push(`${count(english)} point(s) en anglais, ${count(french)} en français`);
  // Pied : des paragraphes neutres (SHA-256) ou une phrase anglaise suivie de sa version française.
  const paragraphs = lines.slice(rule + 1).join('\n').split(/\n\s*\n/).map((p) => p.split('\n').filter(Boolean)).filter((p) => p.length);
  for (const p of paragraphs) {
    const frenchLines = p.filter((l) => page.looksFrench(l));
    if (!frenchLines.length) continue;
    const [en = '', frLine = ''] = p;
    if (p.length !== 2 || page.looksFrench(en) || !page.looksFrench(frLine)) {
      found.push(`paragraphe du pied sans « anglais puis français » : ${p.join(' / ')}`);
      continue;
    }
    if (JSON.stringify(anchors(en)) !== JSON.stringify(anchors(frLine))) found.push(`liens ou noms différents entre ${en} et ${frLine}`);
  }
  if (/[«»“”„’]/.test(body)) found.push('guillemets ou apostrophe typographiques dans un texte public');
  return found;
}

test('release complète : anglais en tête, français ensuite, pied bilingue', async () => {
  const page = await load();
  const body = page.releaseBody(input());
  assert.deepEqual(problems(body, page), []);
  assert.match(body, /^## English\n\n- The table checker/);
  assert.ok(body.indexOf('## English') < body.indexOf('## Français'));
  assert.match(body, /\*\*CyberPinball-Setup-complet\.exe\*\*: includes the official Visual Pinball X archive/);
  assert.match(body, /\(VPX license\)\.\n.*\(licence de VPX\)\./);
});

test('release rapide : installeurs repris, lien vers leur release dans les deux langues', async () => {
  const page = await load();
  const body = page.releaseBody(input(REFERENCE));
  assert.deepEqual(problems(body, page), []);
  assert.equal(body.split(`[0.2.0](${REFERENCE.url})`).length - 1, 2);
  assert.ok(!body.includes('Setup-complet'));
});

test('les sommes SHA-256 et les noms de fichiers restent tels quels', async () => {
  const page = await load();
  for (const reference of [undefined, REFERENCE]) {
    const body = page.releaseBody(input(reference));
    assert.ok(body.includes(`SHA-256 (CyberPinball-Setup.exe): \`${SHA_INSTALLER}\``));
    assert.ok(body.includes(`SHA-256 (CyberPinball-application.zip): \`${SHA_APP}\``));
    assert.equal(body.split('**CyberPinball-application.zip**').length - 1, 2);
  }
});

test('guillemets droits dans les nouveautés publiées', async () => {
  const page = await load();
  const body = page.releaseBody(input());
  assert.ok(body.includes('- Le médecin des tables répare les "fichiers manquants" d\'une table.'));
  assert.equal(page.straightQuotes('« Tout lire » d’abord, “ici”'), '"Tout lire" d\'abord, "ici"');
});

test('refus sans nouveautés anglaises, ou en nombre différent', async () => {
  const page = await load();
  assert.throws(() => page.releaseBody({ ...input(), notesEn: [] }), /anglais/);
  assert.throws(() => page.releaseBody({ ...input(), notesEn: ['Only one.'] }), /2 nouveauté\(s\) en français, 1 en anglais/);
});

test('le contrôle repère un corps qui commence par le français ou un pied non traduit', async () => {
  const page = await load();
  const good = page.releaseBody(input());
  const frenchFirst = good.replace('## English', '## Anglais');
  assert.ok(problems(frenchFirst, page).some((p) => p.startsWith('première ligne')));
  const untranslated = `${good}\n\nLes bornes sans Internet prennent l'installeur complet.`;
  assert.ok(problems(untranslated, page).some((p) => p.startsWith('paragraphe du pied')));
  const frenchInEnglish = good.replace('- The table checker', '- Le médecin des tables');
  assert.ok(problems(frenchInEnglish, page).some((p) => p.startsWith('français dans la section anglaise')));
});

test('détection du français dans une nouveauté anglaise, libellés cités exceptés', async () => {
  const page = await load();
  assert.ok(page.frenchOutsideQuotes('Le médecin des tables répare une table.'));
  assert.ok(page.frenchOutsideQuotes('System menu > Friends > Partage et réseau'));
  assert.ok(!page.frenchOutsideQuotes('System menu > Friends > "Partage et réseau" (Sharing and network)'));
  assert.ok(!page.frenchOutsideQuotes('The wheel shows the table\'s colour, see `réglages.json`.'));
});

test('changements/*.md : un point anglais en français est refusé', async () => {
  const { fragmentProblems } = await loadTraductions();
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-page-release-'));
  try {
    fs.mkdirSync(path.join(root, 'changements'));
    const write = (en: string) =>
      fs.writeFileSync(path.join(root, 'changements', 'essai.md'), `## Français\n\n- Le médecin des tables répare une table.\n\n## English\n\n- ${en}\n`);
    write('Le médecin des tables répare une table.');
    assert.ok(fragmentProblems(root).some((p) => p.includes('point anglais avec du français')));
    write('The "Médecin des tables" (table checker) repairs a table.');
    assert.deepEqual(fragmentProblems(root), []);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
