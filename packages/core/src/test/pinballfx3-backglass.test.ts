// Frontons de Pinball FX3 (packages/core/src/pinballfx3-backglass.ts, app/src/pinballfx3-backglass.ts) :
// catalogue d'archive.org, image au nom du .pxp, jamais une image existante remplacée. Sur un dossier
// et un réseau simulés : rien ne sort de la machine.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import {
  backglassDownloadUrl,
  parseBackglassMetadata,
  PINBALLFX3_BACKGLASS_ALIASES,
  PINBALLFX3_HOME_IMAGE,
  pinballFx3BackglassImage,
  pinballFx3BackglassPlan,
} from '..';
import { REPO_ROOT } from './i18n-scan';

// Extrait de la réponse de https://archive.org/metadata/FX3_202201 (20/11/2026).
const METADATA = {
  files: [
    { name: 'FX3 Backglass art/Alien_Isolation.png', size: '1951781', md5: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', format: 'PNG' },
    { name: 'FX3 Backglass art/STARWARS_Episode_7.png', size: '100', format: 'PNG' },
    { name: 'FX3 Backglass art/JunkYard.png', size: '100', format: 'PNG' },
    { name: 'FX3 Backglass art/pinballfx3.png', size: '100', format: 'PNG' },
    { name: 'FX3 Backglass art/Aliens2.png', size: '100', format: 'PNG' },
    { name: '__ia_thumb.jpg', size: '100', format: 'Item Tile' },
    { name: 'FX3_202201_meta.xml', size: '100', format: 'Metadata' },
  ],
};

function tablesDir(files: string[]): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cyberpinball-fx3-frontons-'));
  for (const f of files) fs.writeFileSync(path.join(dir, f), 'x');
  return dir;
}

test('catalogue : les images de l’item, avec taille et MD5, sans la vignette ni les métadonnées', () => {
  const files = parseBackglassMetadata(METADATA);
  assert.deepEqual(files.map((f) => path.posix.basename(f.name)), ['Alien_Isolation.png', 'STARWARS_Episode_7.png', 'JunkYard.png', 'pinballfx3.png', 'Aliens2.png']);
  assert.deepEqual(files[0], { name: 'FX3 Backglass art/Alien_Isolation.png', size: 1951781, md5: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' });
  assert.equal(backglassDownloadUrl(files[0]!), 'https://archive.org/download/FX3_202201/FX3%20Backglass%20art/Alien_Isolation.png');
  assert.deepEqual(parseBackglassMetadata({}), []);
  assert.deepEqual(parseBackglassMetadata('pas du JSON'), []);
});

test('plan : image au nom du .pxp, deux noms du catalogue rapprochés, accueil compris, image existante gardée', () => {
  const dir = tablesDir(['Alien_Isolation.pxp', 'STARWARS_Episode7.pxp', 'WMS_Junkyard.pxp', 'Looter.pxp', 'Aliens.pxp', 'Aliens.JPG']);
  const plan = pinballFx3BackglassPlan(dir, ['Alien_Isolation', 'STARWARS_Episode7', 'WMS_Junkyard', 'Looter', 'Aliens'], parseBackglassMetadata(METADATA));
  assert.deepEqual(
    plan.steps.map((s) => [s.target, path.basename(s.dest)]),
    [
      [PINBALLFX3_HOME_IMAGE, 'PinballFX3.png'],
      ['Alien_Isolation', 'Alien_Isolation.png'],
      ['STARWARS_Episode7', 'STARWARS_Episode7.png'],
      ['WMS_Junkyard', 'WMS_Junkyard.png'],
    ],
  );
  assert.deepEqual(plan.present, ['Aliens'], 'image du joueur, d’une autre extension et casse : gardée');
  assert.deepEqual(plan.missing, ['Looter']);
  assert.equal(PINBALLFX3_BACKGLASS_ALIASES['STARWARS_Episode7'], 'STARWARS_Episode_7');
  assert.equal(pinballFx3BackglassImage(dir, 'aliens'), path.join(dir, 'Aliens.JPG'));
  assert.equal(pinballFx3BackglassImage(dir, 'Looter'), undefined, 'le .pxp n’est pas une image');
});

interface BackglassModule {
  installPinballFx3Backglasses(
    install: { tablesDir: string },
    opts: { workDir: string; fetch: typeof fetch; onProgress?(done: number, total: number): void },
  ): Promise<{ placed: string[]; present: string[]; missing: string[]; failed: { target: string; reason: string }[] }>;
}

test('téléchargement : MD5 vérifié, rien de remplacé, échec repris à l’essai suivant', async () => {
  const app = require(path.join(REPO_ROOT, 'app', 'dist', 'pinballfx3-backglass.js')) as BackglassModule;
  const body = (s: string) => Buffer.from(s);
  const good = body('IMAGE-ALIEN');
  const md5 = createHash('md5').update(good).digest('hex');
  const meta = {
    files: [
      { name: 'FX3 Backglass art/Alien_Isolation.png', size: String(good.length), md5 },
      { name: 'FX3 Backglass art/Archer.png', size: '4', md5: createHash('md5').update(body('ARCH')).digest('hex') },
      { name: 'FX3 Backglass art/Atlantis.png', size: '4', md5: createHash('md5').update(body('ATLA')).digest('hex') },
    ],
  };
  let archerFails = true;
  const asked: string[] = [];
  const fakeFetch = (async (url: string | URL) => {
    const u = String(url);
    asked.push(u);
    if (u.endsWith('/metadata/FX3_202201')) return new Response(JSON.stringify(meta), { status: 200 });
    if (u.endsWith('/Alien_Isolation.png')) return new Response(good, { status: 200 });
    if (u.endsWith('/Archer.png')) return archerFails ? new Response('', { status: 503 }) : new Response(body('ARCH'), { status: 200 });
    if (u.endsWith('/Atlantis.png')) return new Response(body('FAUX'), { status: 200 }); // contenu altéré
    return new Response('', { status: 404 });
  }) as typeof fetch;
  const dir = tablesDir(['Alien_Isolation.pxp', 'Archer.pxp', 'Atlantis.pxp', 'Aliens.pxp', 'Aliens.jpg']);
  const workDir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'cyberpinball-fx3-work-')), 'parts');
  const progress: [number, number][] = [];
  const first = await app.installPinballFx3Backglasses({ tablesDir: dir }, { workDir, fetch: fakeFetch, onProgress: (d, n) => progress.push([d, n]) });
  assert.deepEqual(first.placed, ['Alien_Isolation']);
  assert.deepEqual(fs.readFileSync(path.join(dir, 'Alien_Isolation.png')), good);
  assert.deepEqual(first.failed.map((f) => f.target).sort(), ['Archer', 'Atlantis']);
  assert.ok(!fs.existsSync(path.join(dir, 'Atlantis.png')), 'MD5 faux : rien de déposé');
  assert.deepEqual(first.present, ['Aliens'], 'l’image du joueur reste');
  assert.equal(fs.readFileSync(path.join(dir, 'Aliens.jpg'), 'utf8'), 'x');
  assert.ok(first.missing.includes('PinballFX3'));
  assert.deepEqual(progress.at(-1), [3, 3]);
  assert.ok(fs.existsSync(workDir), 'échecs : les partiels restent pour la reprise');
  // Essai suivant : Archer passe, Alien_Isolation n'est plus redemandé (déjà là).
  archerFails = false;
  asked.length = 0;
  const second = await app.installPinballFx3Backglasses({ tablesDir: dir }, { workDir, fetch: fakeFetch });
  assert.deepEqual(second.placed, ['Archer']);
  assert.ok(second.present.includes('Alien_Isolation'));
  assert.ok(!asked.some((u) => u.endsWith('/Alien_Isolation.png')));
  // Aucune adresse hors du catalogue.
  assert.ok(asked.every((u) => u.startsWith('https://archive.org/')));
});
