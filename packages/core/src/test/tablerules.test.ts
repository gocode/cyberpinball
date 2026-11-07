import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import {
  authorRuleBlocks,
  decodeEntities,
  fetchCachedText,
  looksEnglish,
  findRuleSheet,
  paginateRules,
  parseRuleSheet,
  parseRulesheetsList,
  primerUrl,
  RULESHEETS_LIST_URL,
  rulesCacheDir,
  rulesheetsUrl,
  ruleVideo,
} from '../tablerules';
import type { VpsGame } from '../vps';

// Pages écrites pour l'essai, sur le modèle des deux sites (titres, parties, listes, tableau) :
// aucune feuille réelle n'est recopiée.
const PRIMER = `<!DOCTYPE html><html><head><title>Alpha (1990)</title><style>h1{color:blue}</style></head><body>
<iframe src="header.html"></iframe>
<h1>Alpha (Williams, 1990)</h1>
<!-- end of header -->
<h2>Quick strategy synopsis</h2>
<p>Shoot the left ramp to light lock. Lock 3 balls &amp; start <strong>multiball</strong>.</p>
<h2>Shots and table features</h2>
<h3>Left ramp</h3>
<p>Each ramp scores 5,000&nbsp;points.</p>
<img src="alpha.jpg" alt="Alpha playfield">
<h3>Empty part</h3>
<h3>Bonus</h3>
<ul><li>Bonus advances on each lane.</li><li>Held from ball to ball.</li></ul>
<iframe src="footer.html"></iframe></body></html>`;

const SHEETS = `<html><body><header><h1 id="project_title">Pinball Rule Sheets</h1><h2>A repository</h2></header>
<section id="main_content"><h1>Beta</h1>
<ul><li><a href="#a">Game Information</a></li><li><a href="#b">Rules Overview</a></li><li><a href="#c">Modes</a></li></ul>
<h2 id="a">Game Information:</h2><ul><li>Lead Designer: Someone Example</li></ul>
<h2 id="b">Rules Overview:</h2><p>Start every mode to reach the wizard mode.</p>
<table><tr><td><img src="pro.webp"></td><td><img src="le.webp"></td></tr></table>
<h2 id="c">Modes:</h2><table><tr><th>Mode</th><th>Shot</th></tr><tr><td>Raid</td><td>Scoop</td></tr></table>
</section><footer><p>Published with GitHub Pages</p></footer><script>x()</script></body></html>`;

test('feuille de The Pinball Primer : titre, parties, listes, sans en-tête ni image', () => {
  const sheet = parseRuleSheet(PRIMER, 'primer', 'https://pinballprimer.github.io/alpha.html')!;
  assert.equal(sheet.title, 'Alpha (Williams, 1990)');
  assert.deepEqual(
    sheet.blocks.map((b) => [b.heading, b.level, b.lines]),
    [
      ['Quick strategy synopsis', 2, ['Shoot the left ramp to light lock. Lock 3 balls & start multiball.']],
      ['Shots and table features', 2, []],
      ['Left ramp', 3, ['Each ramp scores 5,000 points.']],
      ['Bonus', 3, ['• Bonus advances on each lane.', '• Held from ball to ball.']],
    ],
  );
});

test('feuille de Pinball Rule Sheets : sans le titre du site, le sommaire ni les cellules d’images', () => {
  const sheet = parseRuleSheet(SHEETS, 'rulesheets', 'https://pinballrulesheets.com/stern/beta-rulesheet')!;
  assert.equal(sheet.title, 'Beta');
  assert.deepEqual(
    sheet.blocks.map((b) => [b.heading, b.lines]),
    [
      ['Game Information', ['• Lead Designer: Someone Example']],
      ['Rules Overview', ['Start every mode to reach the wizard mode.']],
      ['Modes', ['Mode · Shot', 'Raid · Scoop']],
    ],
  );
});

test('page sans feuille : rien', () => {
  assert.equal(parseRuleSheet('<html><body><p>404</p></body></html>', 'primer', 'u'), undefined);
  assert.equal(parseRuleSheet('<h1>Titre seul</h1>', 'primer', 'u'), undefined);
});

test('entités HTML', () => {
  assert.equal(decodeEntities('A&amp;B &rsquo;x&rsquo; &#233;t&#xE9; &unknown; &lt;3'), 'A&B ’x’ été &unknown; <3');
});

test('texte de l’auteur rangé dans la table : sans la carte désignée, en parties', () => {
  const rules = '![Rules](RulesCard)\r\n# Multiball\r\nShoot the ramp three times\r\nto lock a ball.\r\n\r\nModes:\r\n- Raid at the scoop\r\n- Tank at the ramp';
  assert.deepEqual(authorRuleBlocks(rules), [
    { heading: 'Multiball', level: 2, lines: ['Shoot the ramp three times to lock a ball.'] },
    { heading: 'Modes', level: 2, lines: ['• Raid at the scoop', '• Tank at the ramp'] },
  ]);
  // Titre souligné, à l'ancienne.
  assert.deepEqual(authorRuleBlocks(['Preliminaries', '=============', 'The display is a two-line version of the game, sixteen characters per line.'].join('\n')), [
    { heading: 'Preliminaries', level: 2, lines: ['The display is a two-line version of the game, sixteen characters per line.'] },
  ]);
  assert.equal(looksEnglish(authorRuleBlocks(rules)), true);
  assert.equal(looksEnglish([{ lines: ['Tirer la rampe gauche trois fois pour verrouiller une bille et lancer le Multiball.'] }]), false);
  // Une carte seule, ou trois mots : rien à lire.
  assert.deepEqual(authorRuleBlocks('![x](RulesCard)'), []);
  assert.deepEqual(authorRuleBlocks('See the card'), []);
  assert.deepEqual(authorRuleBlocks(undefined), []);
});

test('pages : une partie trop longue continue sur la suivante, marquée « suite »', () => {
  const line = 'Lorem ipsum dolor sit amet. '.repeat(10).trim();
  const blocks = [
    { heading: 'Un', level: 2, lines: [line, line, line] },
    { heading: 'Deux', level: 2, lines: [line] },
  ];
  const pages = paginateRules(blocks, 700);
  assert.ok(pages.length >= 2);
  assert.equal(pages[0]![0]!.heading, 'Un');
  const cont = pages.flat().filter((b) => b.heading === 'Un');
  assert.ok(cont.length >= 2 && cont.slice(1).every((b) => b.more));
  // Aucune ligne perdue ni répétée.
  assert.deepEqual(pages.flat().flatMap((b) => b.lines), [line, line, line, line]);
  // Une ligne plus longue que la page est coupée entre deux phrases.
  const long = paginateRules([{ lines: ['Phrase courte. '.repeat(200).trim()] }], 600);
  assert.ok(long.length > 2);
  assert.ok(long.flat().flatMap((b) => b.lines).every((l) => l.length <= 600));
});

const GAME: VpsGame = {
  id: 'alpha',
  name: 'Godzilla (Premium)',
  manufacturer: 'Stern',
  year: 2021,
  tutorialFiles: [
    { title: 'Godzilla - VPX Table Overview', youtubeId: 'AAAAAAAAAAA' },
    { title: 'Godzilla tutorial', url: 'https://www.youtube.com/watch?v=BBBBBBBBBBB' },
    { title: 'Pinball Primer: Godzilla', url: 'https://pinballprimer.github.io/godzilla_X1.html' },
    { url: 'https://vpuniverse.com/files/file/1-godzilla-video-instruction/' },
  ],
};

test('VPS : page de The Pinball Primer, et vidéo (un tutoriel avant une présentation)', () => {
  assert.equal(primerUrl(GAME), 'https://pinballprimer.github.io/godzilla_X1.html');
  assert.equal(primerUrl({ id: 'x', name: 'X' }), undefined);
  assert.deepEqual(ruleVideo(GAME), { youtubeId: 'BBBBBBBBBBB', title: 'Godzilla tutorial', authors: undefined, url: 'https://www.youtube.com/watch?v=BBBBBBBBBBB' });
  assert.equal(ruleVideo({ id: 'x', name: 'X', tutorialFiles: [{ url: 'https://vpuniverse.com/files/file/2/' }] }), undefined);
});

const LIST = `<a href="/">Home</a><a href="#heading--stern">Stern Pinball</a>
<a href="/stern/stern-godzilla-rulesheet">Godzilla</a>
<a href="/stern/avengers-infinity-quest-rulesheet">Avengers: Infinity Quest</a>
<a href="/stern/iron-maiden-pinball-rulesheet">Iron Maiden</a>
<a href="/jersey-jack/jjp-wonka-rulesheet">Willy Wonka &amp; the Chocolate Factory</a>`;

test('liste de pinballrulesheets.com : même fabricant et titre entier, édition ignorée', () => {
  const list = parseRulesheetsList(LIST);
  assert.equal(list.length, 4);
  assert.equal(rulesheetsUrl(list, GAME), 'https://pinballrulesheets.com/stern/stern-godzilla-rulesheet');
  // Le titre principal de la feuille ne suffit pas : « Avengers: Infinity Quest » (2020) n'est pas « The Avengers » (2012).
  assert.equal(rulesheetsUrl(list, { id: 'a', name: 'The Avengers (Pro)', manufacturer: 'Stern', year: 2012 }), undefined);
  // Stern Electronics (avant 1999) n'est pas Stern Pinball.
  assert.equal(rulesheetsUrl(list, { id: 'i', name: 'Iron Maiden', manufacturer: 'Stern', year: 1982 }), undefined);
  assert.equal(rulesheetsUrl(list, { id: 'i2', name: 'Iron Maiden', manufacturer: 'Stern', year: 2018 }), 'https://pinballrulesheets.com/stern/iron-maiden-pinball-rulesheet');
  assert.equal(rulesheetsUrl(list, { id: 'g', name: 'Godzilla', manufacturer: 'Bandai', year: 1990 }), undefined);
  assert.equal(
    rulesheetsUrl(list, { id: 'w', name: 'Willy Wonka & the Chocolate Factory', manufacturer: 'Jersey Jack Pinball', year: 2019 }),
    'https://pinballrulesheets.com/jersey-jack/jjp-wonka-rulesheet',
  );
});

function fakeFetch(pages: Record<string, string | number>) {
  const calls: string[] = [];
  const impl = (async (url: string | URL | Request) => {
    const u = String(url);
    calls.push(u);
    const page = pages[u];
    if (page === undefined) throw new TypeError('fetch failed');
    if (typeof page === 'number') return new Response('', { status: page });
    return new Response(page, { status: 200 });
  }) as typeof fetch;
  return { impl, calls };
}

test('cache : une page lue sert sans réseau ; une page absente (404) n’est pas redemandée', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'regles-'));
  try {
    const net = fakeFetch({ 'https://a.example/x': 'bonjour', 'https://a.example/gone': 404 });
    assert.deepEqual(await fetchCachedText(dir, 'https://a.example/x', { fetch: net.impl }), { status: 'ok', html: 'bonjour' });
    assert.deepEqual(await fetchCachedText(dir, 'https://a.example/gone', { fetch: net.impl }), { status: 'missing' });
    // Récente : servie du cache, sans réseau.
    const offline = fakeFetch({});
    assert.deepEqual(await fetchCachedText(dir, 'https://a.example/x', { fetch: offline.impl }), { status: 'ok', html: 'bonjour' });
    assert.deepEqual(await fetchCachedText(dir, 'https://a.example/gone', { fetch: offline.impl }), { status: 'missing' });
    assert.equal(offline.calls.length, 0);
    // Trop vieille et hors ligne : la copie gardée sert quand même.
    const later = new Date(Date.now() + 90 * 24 * 3600 * 1000);
    assert.deepEqual(await fetchCachedText(dir, 'https://a.example/x', { fetch: offline.impl, now: later }), { status: 'ok', html: 'bonjour', stale: true });
    assert.deepEqual(await fetchCachedText(dir, 'https://a.example/jamais', { fetch: offline.impl }), { status: 'offline' });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('feuille d’un jeu : The Pinball Primer d’abord, sinon pinballrulesheets.com ; hors ligne sans copie', async () => {
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'regles-'));
  try {
    const net = fakeFetch({ 'https://pinballprimer.github.io/godzilla_X1.html': PRIMER, [RULESHEETS_LIST_URL]: LIST, 'https://pinballrulesheets.com/stern/stern-godzilla-rulesheet': SHEETS });
    const primer = await findRuleSheet(data, GAME, { fetch: net.impl });
    assert.equal(primer.status, 'ok');
    assert.equal(primer.sheet?.site, 'primer');
    assert.ok(fs.readdirSync(rulesCacheDir(data)).length >= 1);
    // Sans page de The Pinball Primer : la liste de pinballrulesheets.com.
    const noPrimer = { ...GAME, id: 'b', tutorialFiles: [] };
    const sheets = await findRuleSheet(data, noPrimer, { fetch: net.impl });
    assert.equal(sheets.sheet?.site, 'rulesheets');
    assert.equal(sheets.sheet?.title, 'Beta');
    // Aucun site n'a ce jeu.
    assert.deepEqual(await findRuleSheet(data, { id: 'z', name: 'Zeta', manufacturer: 'Original' }, { fetch: net.impl }), { status: 'none' });
    // Hors ligne et rien de gardé : le dire, pour réessayer plus tard.
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'regles-'));
    try {
      assert.deepEqual(await findRuleSheet(empty, GAME, { fetch: fakeFetch({}).impl }), { status: 'offline' });
    } finally {
      fs.rmSync(empty, { recursive: true, force: true });
    }
  } finally {
    fs.rmSync(data, { recursive: true, force: true });
  }
});
