// Retour d'une partie solo (gamereturn.ts) : la carte de bilan ne montre que ce qui est connu (jamais
// un score inventé), n'existe pas pour une partie qui n'est pas finie (arrêt forcé, échec), et le
// record joue le miroir du lancement en cinéma au même rythme dans la feuille de style et sur le
// DMD. Le processus principal n'en garde qu'un état, sans minuteur ; les fenêtres jouent leur part.

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import { GAME_RETURN_GUARD_MS, GAME_RETURN_MS, GAME_RETURN_TIMELINE, GameReturn, gameDuration, gameReturnCard, type GameReturnFacts } from '../gamereturn';
import type { TableRecords } from '../highscores';
import { setLanguage } from '../i18n';
import { DMD_HEIGHT, DMD_LEVEL, DMD_WIDTH, dmdAnimation } from '../livedmd';
import { REPO_ROOT } from './i18n-scan';
import { menuRenderer } from './menu-renderer';

const read = (...parts: string[]) => fs.readFileSync(path.join(REPO_ROOT, ...parts), 'utf8').replace(/\r\n/g, '\n');
const board = (...scores: [number, string][]): TableRecords => ({ file: 'VPReg.stg', storage: 'Imaginaire', scores: scores.map(([score, initials], i) => ({ rank: i + 1, score, initials })) });
const BEFORE = board([75_000_000, 'AAA'], [52_000_000, 'BBB'], [31_500_000, 'CCC']);
const facts = (extra: Partial<GameReturnFacts> = {}): GameReturnFacts => ({ ok: true, forced: false, seconds: 754, entered: [], ...extra });
/** Espaces de groupement (insécables) ramenées à des espaces simples, pour comparer. */
const plain = (text: string | undefined) => text?.replace(/[  ]/g, ' ');

test('carte : rien pour une partie qui n’est pas finie, ni pour une partie jamais à l’écran', () => {
  setLanguage('fr');
  assert.equal(gameReturnCard(facts({ ok: false })), undefined, 'échec de VPX');
  assert.equal(gameReturnCard(facts({ forced: true })), undefined, 'arrêt forcé (Ctrl+Maj+K)');
  assert.equal(gameReturnCard(facts({ forced: true, entered: [{ rank: 1, score: 9, initials: 'JUL' }] })), undefined, 'même avec un score au tableau');
  assert.equal(gameReturnCard(facts({ seconds: 0 })), undefined, 'la fenêtre de jeu n’a jamais paru');
  assert.ok(gameReturnCard(facts({ seconds: 1 })));
});

test('carte : une table sans relevé n’affiche que la durée, jamais un score', () => {
  setLanguage('fr');
  const card = gameReturnCard(facts({ seconds: 1325 }))!;
  assert.deepEqual(card, { duration: '22 min 05 s', badges: [], celebrate: false });
  // Un tableau lu, mais rien d'entré pendant la partie : pas de score non plus (celui du tableau n'est pas celui de la partie).
  assert.equal(gameReturnCard(facts({ before: BEFORE, after: BEFORE }))!.record, undefined);
  assert.equal(gameDuration(45), '45 s');
  assert.equal(gameDuration(60), '1 min 00 s');
  assert.equal(gameDuration(3725), '1 h 02 min');
});

test('carte : un nouveau record, l’écart à l’ancien, le badge gagné ; NEW HIGH SCORE', () => {
  setLanguage('fr');
  const after = board([84_520_310, 'JUL'], [75_000_000, 'AAA'], [52_000_000, 'BBB']);
  const card = gameReturnCard(facts({ before: BEFORE, after, entered: [{ rank: 1, score: 84_520_310, initials: 'JUL' }], badges: ['grand-champion'] }))!;
  assert.equal(card.celebrate, true);
  assert.equal(card.record!.heading, 'Nouveau record');
  assert.equal(card.record!.dmd, 'NEW HIGH SCORE');
  assert.equal(plain(card.record!.score), '84 520 310');
  assert.equal(card.record!.value, 84_520_310);
  assert.equal(card.record!.initials, 'JUL');
  assert.equal(plain(card.record!.gap), '+9 520 310 sur l’ancien record');
  assert.deepEqual(card.badges, [{ icon: 'star', label: 'Grand Champion' }]);
});

test('carte : une autre place, l’écart au record, les autres scores de la même partie ; HIGH SCORE #n', () => {
  setLanguage('fr');
  const after = board([75_000_000, 'AAA'], [52_000_000, 'BBB'], [44_210_000, 'JUL'], [31_500_000, 'ZOE']);
  const card = gameReturnCard(facts({ before: BEFORE, after, entered: [{ rank: 4, score: 31_500_000, initials: 'ZOE' }, { rank: 3, score: 44_210_000, initials: 'JUL' }] }))!;
  assert.equal(card.record!.rank, 3, 'la meilleure place de la partie');
  assert.equal(card.record!.heading, 'Tableau d’honneur');
  assert.equal(card.record!.place, '3e place');
  assert.equal(card.record!.dmd, 'HIGH SCORE #3');
  assert.equal(plain(card.record!.gap), 'À 30 790 000 du record');
  assert.equal(card.record!.others, 'Un autre score au tableau');
  setLanguage('en');
  const en = gameReturnCard(facts({ before: BEFORE, after, entered: [{ rank: 3, score: 44_210_000 }] }))!;
  assert.equal(en.record!.heading, 'High score table');
  assert.equal(en.record!.place, '#3');
  assert.equal(en.record!.gap, '30,790,000 short of the record');
  assert.equal(en.duration, '12 min 34 s');
  setLanguage('fr');
});

test('carte : le premier score d’un tableau connu vide, sans écart ; un tableau d’avant inconnu ne le dit pas', () => {
  setLanguage('fr');
  const empty: TableRecords = { file: 'VPReg.stg', storage: 'Imaginaire', scores: [] };
  const first = gameReturnCard(facts({ before: empty, after: board([1_234_560, 'AAA']), entered: [{ rank: 1, score: 1_234_560, initials: 'AAA' }] }))!;
  assert.equal(first.record!.heading, 'Premier score enregistré');
  assert.equal(first.record!.dmd, 'HIGH SCORE #1');
  assert.equal(first.record!.gap, undefined, 'aucune comparaison avec zéro');
  assert.equal(first.celebrate, true);
});

test('état : aucune méthode ne programme de minuteur ; garde, échéance et fondu se lisent avec l’heure', () => {
  let now = 10_000;
  const r = new GameReturn(() => now);
  assert.equal(r.view({ plateau: true, fronton: true }), undefined, 'rien avant un retour');
  const plainCard = gameReturnCard(facts())!;
  const id = r.show('neon.vpx', { title: 'Neon Galaxy' }, plainCard);
  assert.equal(r.table, 'neon.vpx');
  assert.deepEqual(r.view({ plateau: false, fronton: true }), undefined, 'sans record, le fronton n’a pas de part');
  const view = r.view({ plateau: true, fronton: true })!;
  assert.equal(view.id, id);
  assert.equal(view.startedAt, 10_000);
  assert.equal(view.ms, GAME_RETURN_MS.plain);
  assert.equal(view.fronton, false);
  assert.equal(r.impactAt, undefined, 'sans record, pas de knocker différé');
  assert.equal(r.listening(), false, 'la garde : le bouton qui a fermé VPX ne compte pas');
  now += GAME_RETURN_GUARD_MS;
  assert.equal(r.listening(), true);
  assert.equal(r.expired(), false);
  now = 10_000 + GAME_RETURN_MS.plain;
  assert.equal(r.expired(), true, 'son temps écoulé');
  assert.equal(r.dismiss(), true);
  assert.equal(r.dismiss(), false, 'une seule fois');
  assert.equal(r.open, false);
  assert.equal(r.table, undefined, 'Start ne rejoue plus une carte sur le départ');
  assert.equal(r.view({ plateau: true, fronton: false })!.leaving, true);
  assert.equal(r.faded(), false);
  now += GAME_RETURN_TIMELINE.fadeOut;
  assert.equal(r.faded(), true);
  r.clear();
  assert.equal(r.view({ plateau: true, fronton: false }), undefined);
  // Un record : le fronton a sa part, le knocker attend l'impact, la carte dure plus longtemps.
  const record = gameReturnCard(facts({ before: BEFORE, after: board([80_000_000, 'JUL']), entered: [{ rank: 1, score: 80_000_000, initials: 'JUL' }] }))!;
  const next = r.show('neon.vpx', { title: 'Neon Galaxy' }, record);
  assert.ok(next > id, 'chaque retour a son numéro');
  assert.equal(r.view({ plateau: false, fronton: true })!.fronton, true);
  assert.equal(r.impactAt, now + GAME_RETURN_TIMELINE.impact);
  assert.equal(r.endsAt, now + GAME_RETURN_MS.record);
  assert.equal(r.celebrating, true);
  const source = read('packages', 'core', 'src', 'gamereturn.ts')
    .split('\n')
    .filter((line) => !/^\s*(\/\/|\*|\/\*\*)/.test(line))
    .join('\n');
  assert.doesNotMatch(source, /setTimeout|setInterval|Promise|async |await /);
});

/** Départ d'une animation de frontend.css (« calc((N - var(--ge)) * 1ms) ») pour un sélecteur. */
function cssStart(css: string, selector: string): number {
  // La première règle de ce sélecteur qui pose un départ (une règle de géométrie partagée peut la précéder).
  let m: RegExpExecArray | null = null;
  for (let at = css.indexOf(`${selector} {`); at >= 0 && !m; at = css.indexOf(`${selector} {`, at + 1)) {
    m = /animation-delay: calc\(\((\d+) - var\(--ge\)\) \* 1ms\)/.exec(css.slice(at, css.indexOf('}', at)));
  }
  assert.ok(m, `${selector} : départ compté depuis le retour`);
  return Number(m![1]);
}

test('rythme : la feuille de style suit GAME_RETURN_TIMELINE, que suit aussi le DMD', () => {
  const css = read('app', 'renderer', 'frontend.css');
  const T = GAME_RETURN_TIMELINE;
  assert.equal(cssStart(css, '.bilan-fronton .gr-logo'), T.ignite);
  assert.equal(cssStart(css, '.bilan-fronton .gr-lift'), T.lift);
  assert.equal(cssStart(css, '.bilan-fronton .gr-flight'), T.drop);
  assert.equal(cssStart(css, '.bilan-record .gr-flight'), T.land);
  assert.equal(cssStart(css, '.bilan-record .gr-ring'), T.impact);
  assert.equal(cssStart(css, '.bilan-record .gr-panel'), T.impact);
  assert.match(css, new RegExp(`\\.bilan\\.gr-fin,\\n\\.bilan-fronton\\.gr-fin \\{\\n\\s+animation: cine-fin ${T.fadeOut}ms`));
  // Le passage sur le DMD tombe entre la sortie du fronton et l'entrée sur le plateau.
  assert.ok(T.dmdPass > T.drop && T.dmdPass < T.land + 100);
  assert.match(read('app', 'renderer', 'frontend.js'), new RegExp(`BILAN_FADE_MS = ${T.fadeOut}`));
  // Une seule onde : une seule animation gr-onde, à la pose.
  const section = css.slice(css.indexOf('/* ---------- Retour de partie'), css.indexOf('/* ---------- Mode attente'));
  assert.equal([...section.matchAll(/animation: gr-onde /g)].length, 1);
  // Aucune animation remplie vers l'arrière ne se montre avant son départ (cinema.test.ts).
  for (const [, name] of section.matchAll(/animation: ((?:gr|cine)-[\w-]+) [^;]*\b(?:both|backwards)\b[^;]*;/g)) {
    const at = css.indexOf(`@keyframes ${name} {`);
    assert.ok(at >= 0, `@keyframes ${name}`);
    const first = /\n\s+(from|0%)[^{]*\{([^}]*)\}/.exec(css.slice(at, css.indexOf('\n}', at)));
    const opacity = /opacity: ([\d.]+)/.exec(first?.[2] ?? '');
    if (opacity) assert.equal(Number(opacity[1]), 0, `${name} : visible avant son départ`);
  }
});

test('DMD : noir pendant la chute, le disque descend, un éclat en bas, puis l’en-tête qui clignote et le score', () => {
  const anim = dmdAnimation('record', { label: '84,520,310', head: 'NEW HIGH SCORE' });
  const { dmdPass, dmdPassLength, dmdFlash } = GAME_RETURN_TIMELINE;
  assert.equal(anim.duration, undefined, 'tient tant que la carte est là');
  const lit = (dots: Uint8Array, rows: number[]) => rows.reduce((n, y) => n + dots.slice(y * DMD_WIDTH, (y + 1) * DMD_WIDTH).filter((v) => v >= 9).length, 0);
  assert.equal(anim.dots(dmdPass - 10).filter((v) => v > 0).length, 0, 'noir jusqu’au passage');
  const early = anim.dots(dmdPass + dmdPassLength * 0.15);
  const late = anim.dots(dmdPass + dmdPassLength * 0.85);
  assert.ok(lit(early, [0, 1, 2]) > lit(late, [0, 1, 2]), 'il entre par le haut');
  assert.ok(lit(late, [DMD_HEIGHT - 3, DMD_HEIGHT - 2]) > lit(early, [DMD_HEIGHT - 3, DMD_HEIGHT - 2]), 'il sort par le bas');
  const flash = anim.dots(dmdPass + dmdPassLength + 5);
  const bright = [...flash.keys()].filter((i) => flash[i] === DMD_LEVEL.accent);
  assert.ok(bright.length > 0 && bright.every((i) => Math.floor(i / DMD_WIDTH) >= DMD_HEIGHT - 3), 'l’éclat en bas');
  const reveal = dmdPass + dmdPassLength + dmdFlash;
  const head = (dots: Uint8Array) => lit(dots, [3, 4, 5, 6, 7, 8, 9]);
  const score = (dots: Uint8Array) => lit(dots, [16, 18, 20, 22, 24]);
  assert.ok(head(anim.dots(reveal + 10)) > 0 && score(anim.dots(reveal + 10)) > 0, 'en-tête et score');
  assert.equal(head(anim.dots(reveal + 300)), 0, 'l’en-tête clignote');
  assert.ok(score(anim.dots(reveal + 300)) > 0, 'le score reste');
  assert.ok(head(anim.dots(reveal + 5000)) > 0, 'puis il reste allumé');
  // L'en-tête dit la place hors de la première (HIGH SCORE #3), et tient en petit.
  const third = dmdAnimation('record', { label: '44,210,000', head: 'HIGH SCORE #3' });
  assert.ok(head(third.dots(reveal + 5000)) > 0);
});

// ---------------------------------------------------------------------------
// Fenêtres (app/renderer/frontend.js, syncBilan) : le vrai rendu dans linkedom.

function menu(role: string, bilan: Record<string, unknown> | undefined) {
  return {
    role,
    phase: 'menu',
    help: false,
    count: 3,
    position: 2,
    table: { title: 'Neon Galaxy', manufacturer: 'Williams', year: '1992', subtitle: 'Williams · 1992' },
    neighbors: [],
    menuLayout: 'medaillons',
    medias: {},
    preload: [],
    bilan,
    footer: [],
    menuKeys: [],
    gameKeys: [],
    loadingKeys: { title: '', rows: [] },
    nav: { confirm: 'Digit1', exit: 'Escape' },
  };
}

function bilan(card: ReturnType<typeof gameReturnCard>, extra: Record<string, unknown> = {}) {
  return { title: 'Neon Galaxy', logo: 'cyber-media://fichier/wheel.png', ...card, id: 1, startedAt: Date.now() - 3000, ms: card!.celebrate ? GAME_RETURN_MS.record : GAME_RETURN_MS.plain, plateau: true, fronton: false, ...extra };
}

function page(role = 'playfield', zones: unknown[] = []) {
  const p = menuRenderer({ location: { search: `?role=${role}&zones=${encodeURIComponent(JSON.stringify(zones))}` } });
  const Media = Object.getPrototypeOf(p.document.createElement('video'));
  Media.play = () => Promise.resolve();
  Media.pause = () => {};
  return p;
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

test('plateau : la carte dans #bilan, la durée seule sans relevé ; Start et Exit envoient leur touche', () => {
  setLanguage('fr');
  const { send, document } = page();
  send(menu('playfield', bilan(gameReturnCard(facts({ seconds: 1325 })))));
  const stage = document.querySelector('#bilan > .bilan')!;
  assert.ok(stage, 'carte posée');
  assert.ok(!stage.classList.contains('bilan-record'));
  assert.equal(stage.querySelector('.gr-kicker')!.textContent, 'Partie terminée');
  assert.equal(stage.querySelector('.gr-figure')!.textContent, '22 min 05 s');
  assert.equal(stage.querySelector('.gr-gap'), null);
  assert.ok(stage.querySelector('.gr-logo img'), 'le logo du jeu');
  const acts = [...stage.querySelectorAll('.gr-actions .hint')].map((h) => [h.textContent, JSON.parse((h as unknown as { dataset: { act: string } }).dataset.act).code]);
  assert.deepEqual(acts, [['StartRejouer', 'Digit1'], ['ExitRoue', 'Escape']]);
  assert.equal(document.documentElement.classList.contains('bilan-open'), true, 'l’aide du menu se retire derrière la carte');
  assert.equal(document.querySelector('.bilan-fronton'), null);
});

test('fronton : la chute du logo pour un record seulement ; la carte du record sur le plateau', () => {
  setLanguage('fr');
  const record = gameReturnCard(facts({ before: BEFORE, after: board([80_000_000, 'JUL']), entered: [{ rank: 1, score: 80_000_000, initials: 'JUL' }] }));
  const bg = page('backglass', [{ role: 'backglass', zone: { x: 0, y: 0, width: 1, height: 1 } }]);
  bg.send(menu('backglass', bilan(record, { plateau: false, fronton: true })));
  assert.ok(bg.document.querySelector('.zone-backglass > .bilan-fronton .gr-flight .gr-lift .gr-logo'));
  assert.equal(bg.document.getElementById('bilan')!.children.length, 0, 'pas de carte sur le fronton');
  const pf = page();
  pf.send(menu('playfield', bilan(record)));
  const card = pf.document.querySelector('#bilan > .bilan.bilan-record')!;
  assert.equal(card.querySelector('.gr-kicker')!.textContent, 'Nouveau record');
  assert.equal(plain(card.querySelector('.gr-score')!.textContent ?? ''), '80 000 000');
  assert.equal(card.querySelector('.gr-initials')!.textContent, 'JUL');
  assert.ok(card.querySelector('.gr-ring'), 'l’onde de la pose');
});

test('départ : fondu puis retrait, sans se reposer ; un autre état la retire aussitôt', async () => {
  setLanguage('fr');
  const { send, document } = page();
  const view = bilan(gameReturnCard(facts()));
  send(menu('playfield', view));
  assert.ok(document.querySelector('#bilan > .bilan'));
  send(menu('playfield', { ...view, leaving: true }));
  assert.ok(document.querySelector('#bilan > .bilan.gr-fin'), 'fondu');
  assert.equal(document.documentElement.classList.contains('bilan-open'), false, 'l’aide revient avec la roue');
  await wait(GAME_RETURN_TIMELINE.fadeOut + 60);
  assert.equal(document.querySelector('.bilan'), null, 'retirée après le fondu');
  send(menu('playfield', { ...view, leaving: true }));
  assert.equal(document.querySelector('.bilan'), null, 'un état tardif ne la repose pas');
  send(menu('playfield', { ...view, id: 2 }));
  assert.ok(document.querySelector('#bilan > .bilan'), 'retour suivant');
  send({ ...menu('playfield', undefined), phase: 'loading' });
  assert.equal(document.querySelector('.bilan'), null, 'Rejouer : elle part sans fondu');
});

// ---------------------------------------------------------------------------
// Processus principal (app/src/frontend.ts).

/** Corps d'une fonction de frontend.ts, jusqu'à l'accolade qui la ferme en début de ligne. */
function body(source: string, signature: string): string {
  const start = source.indexOf(signature);
  assert.ok(start >= 0, signature);
  return source.slice(start, start + source.slice(start).search(/\n\}\n/));
}

test('frontend.ts : pas de bilan pour un arrêt forcé, une partie entre amis, un réglage ; le knocker d’un record attend la pose', () => {
  const main = read('app', 'src', 'frontend.ts');
  const play = body(main, 'async function play(');
  // Le raccourci « Arrêter une partie bloquée » marque la partie, avant de l'arrêter.
  assert.match(play, /forceStop = \(\) => \{\n\s+if \(!guest\.knock\('game\.force-stop'\)\) return;\n\s+forced = true;/);
  assert.match(play, /globalShortcut\.register\(accelerator\(SHORTCUTS\.forceStop\), \(\) => forceStop\?\.\(\)\)/);
  // Le bilan dit tout ce que le retour sait : arrêt forcé, échec, durée, records d'avant et d'après.
  assert.match(play, /const card = !double && !relaunching && !recorded && !invite && !results && state\.phase === 'menu' \? gameReturnCard\(\{ ok: result\.ok, forced, seconds: result\.seconds, entered, before: recordsBefore, after: recordsAfter, badges: earned \}\)/);
  // Le réglage de l'affichage revient avant (il n'a pas de bilan).
  assert.ok(play.indexOf("if (mode === 'display') return") < play.indexOf('const card = '));
  // Le knocker : à l'impact pour la carte d'un record, aussitôt sinon.
  assert.match(play, /if \(!card\?\.celebrate && \(double \?/);
  const pump = body(main, 'function pumpGameReturn(');
  assert.match(pump, /knockerAt !== undefined && now >= knockerAt/);
  // Un arrêt forcé reçu par une fenêtre du menu (partie simulée) passe par le même chemin.
  assert.match(body(main, 'function handleKey('), /matchesShortcut\(input, SHORTCUTS\.forceStop\)\) forceStop\?\.\(\)/);
  // La carte du retour passe avant tout autre bouton du menu, Tab compris.
  const keys = body(main, 'function handleKey(');
  assert.ok(keys.indexOf('gameReturnKey(input, is)') > 0 && keys.indexOf('gameReturnKey(input, is)') < keys.indexOf('CONFIG_KEY'));
});
