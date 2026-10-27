// La marque et les afficheurs à points dans la direction artistique (retour du 27/10/2026 : un
// fronton en grosses capitales génériques, un DMD orange dans une police à points quelconque).
// Partout où Cyber Pinball écrit la marque ou dessine un afficheur, la règle est la même :
// - la marque ne s'écrit que par ses composants (wordmarkBox, stackedWordmark, blitBrand ;
//   brandPage du DMD vivant), jamais comme un titre de jeu ;
// - les afficheurs écrivent avec « Saira Points » (dmdfont.ts), la même police dans le processus
//   principal et dans les fenêtres (police-points.js, copie tenue à jour), jamais avec une police
//   de texte dessinée sur canvas ;
// - leur couleur par défaut est celle de la DA (jeton dmd), la même partout, et le réglage
//   « Couleur du DMD » la remplace, lu, gardé et envoyé aux fenêtres.
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import { DEFAULT_DMD_COLOR, DMD_COLOR_MIN_PEAK, DMD_COLOR_PRESETS, dmdColorLabel, dmdColorReadable, normalizeDmdColor, parseDmdColor } from '../dmdcolor';
import { DMD_FONT_ROWS } from '../dmdfont';
import { setLanguage } from '../i18n';
import { DEFAULT_MENU_MEDIA_SETTINGS, normalizeMenuMediaSettings, type MenuMediaSettings } from '../mediaview';
import { REPO_ROOT } from './i18n-scan';

const RENDERER = path.join(REPO_ROOT, 'app', 'renderer');
const read = (...parts: string[]) => fs.readFileSync(path.join(REPO_ROOT, ...parts), 'utf8');

test('police à points : la copie des fenêtres (police-points.js) est celle du cœur', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { CYBER_POINTS } = require(path.join(RENDERER, 'police-points.js')) as { CYBER_POINTS: unknown };
  assert.deepEqual(JSON.parse(JSON.stringify(CYBER_POINTS)), JSON.parse(JSON.stringify(DMD_FONT_ROWS)), 'copie en retard : npm run build && node scripts/police-points.mjs');
});

test('police à points : chaque page qui dessine un afficheur charge la police avant fallback.js', () => {
  for (const page of fs.readdirSync(RENDERER).filter((f) => f.endsWith('.html'))) {
    const html = fs.readFileSync(path.join(RENDERER, page), 'utf8');
    const fallback = html.indexOf('src="fallback.js"');
    if (fallback < 0) continue;
    const points = html.indexOf('src="police-points.js"');
    assert.ok(points >= 0 && points < fallback, `${page} : police-points.js doit précéder fallback.js`);
  }
});

test('afficheurs à points : aucun texte dessiné sur canvas avec une police de texte', () => {
  const js = read('app', 'renderer', 'fallback.js');
  assert.ok(!/fillText|strokeText|measureText/.test(js), 'fallback.js écrit les afficheurs point par point (police-points.js)');
});

test('marque : écrite seulement par ses composants, jamais comme un titre de jeu', () => {
  const js = read('app', 'renderer', 'fallback.js');
  assert.ok(!/CYBER PINBALL/.test(js.replace(/^\s*(\/\/|\*).*$/gm, '')), 'fallback.js : pas de « CYBER PINBALL » en un seul texte (titre de secours)');
  for (const line of js.split('\n').filter((l) => /'PINBALL'/.test(l))) assert.match(line, /cp-pin|brandPinball/, `fallback.js : PINBALL hors de la marque : ${line.trim()}`);
  const dmd = read('packages', 'core', 'src', 'livedmd.ts');
  for (const line of dmd.split('\n').filter((l) => /'(CYBER|PINBALL)'/.test(l))) assert.match(line, /DMD_FONT_BRAND/, `livedmd.ts : la marque hors de sa police : ${line.trim()}`);
});

test('couleur du DMD : une seule couleur par défaut, celle de la DA, partout', () => {
  assert.equal(DEFAULT_DMD_COLOR, '#8be23a');
  assert.equal(DMD_COLOR_PRESETS[0]!.hex, DEFAULT_DMD_COLOR, 'le premier préréglage est celui de la DA');
  const fallback = /const DMD_COLOR = '(#[0-9a-f]{6})'/.exec(read('app', 'renderer', 'fallback.js'));
  assert.equal(fallback?.[1], DEFAULT_DMD_COLOR, 'fallback.js');
  const theme = /--dmd:\s*(#[0-9a-f]{6})/.exec(read('app', 'renderer', 'theme.css'));
  assert.equal(theme?.[1], DEFAULT_DMD_COLOR, 'theme.css');
  const tokens = JSON.parse(read('docs', 'design-system', 'tokens.json')) as { color: { tokens?: { name: string; value: string }[] } };
  const all = JSON.stringify(tokens);
  assert.match(all, new RegExp(`"name":"dmd","value":"${DEFAULT_DMD_COLOR}"`), 'design system : jeton dmd');
  assert.equal(DEFAULT_MENU_MEDIA_SETTINGS.dmdColor, DEFAULT_DMD_COLOR);
});

test('couleur du DMD : préréglages lisibles et distincts, tirés des couleurs de la DA', () => {
  const hexes = DMD_COLOR_PRESETS.map((p) => p.hex);
  assert.equal(new Set(hexes).size, hexes.length);
  for (const p of DMD_COLOR_PRESETS) assert.ok(dmdColorReadable(p.hex), `${p.id} trop sombre`);
  // L'orange des afficheurs à plasma reste proposé aux puristes.
  assert.ok(hexes.includes('#ff8a1f'));
  // Chaque préréglage est une couleur du design system, ou la sarcelle lumineuse de ses dessins (fallback.css, icône).
  const da = (read('docs', 'design-system', 'tokens.json') + read('app', 'renderer', 'fallback.css') + read('app', 'renderer', 'icone.svg')).toLowerCase();
  for (const hex of hexes) assert.ok(da.includes(hex), `${hex} n'est pas une couleur de la DA`);
});

test('couleur du DMD : couleur libre écrite en hexadécimal, une couleur trop sombre refusée', () => {
  assert.equal(parseDmdColor('#8BE23A'), '#8be23a');
  assert.equal(parseDmdColor(' 8be23a '), '#8be23a');
  assert.equal(parseDmdColor('#f80'), '#ff8800');
  assert.equal(parseDmdColor('vert'), undefined);
  assert.equal(parseDmdColor('#12345'), undefined);
  assert.equal(parseDmdColor(42), undefined);
  assert.ok(dmdColorReadable('#ff0000'));
  assert.ok(!dmdColorReadable('#202020'), 'gris très sombre');
  assert.ok(!dmdColorReadable(`#${(DMD_COLOR_MIN_PEAK - 1).toString(16).padStart(2, '0')}0000`));
  assert.equal(normalizeDmdColor('#101010'), DEFAULT_DMD_COLOR);
  assert.equal(normalizeDmdColor(undefined), DEFAULT_DMD_COLOR);
  assert.equal(normalizeDmdColor('#A1B2C3'), '#a1b2c3');
  setLanguage('fr');
  assert.equal(dmdColorLabel('#8be23a'), 'Vert signal');
  assert.equal(dmdColorLabel('#a1b2c3'), 'couleur libre #A1B2C3');
});

test('couleur du DMD : lue de medias.json, gardée, une valeur invalide revient au défaut', () => {
  assert.equal(normalizeMenuMediaSettings({ dmdColor: '#36C9B4' }).dmdColor, '#36c9b4');
  assert.equal(normalizeMenuMediaSettings({ dmdColor: 'orange' }).dmdColor, DEFAULT_DMD_COLOR);
  assert.equal(normalizeMenuMediaSettings({}).dmdColor, DEFAULT_DMD_COLOR);
  // Une borne d'avant ce réglage (pas de champ) passe à la couleur de la DA.
  const before = { ...DEFAULT_MENU_MEDIA_SETTINGS } as Partial<MenuMediaSettings>;
  delete before.dmdColor;
  assert.equal(normalizeMenuMediaSettings(before).dmdColor, DEFAULT_DMD_COLOR);
});

interface BuiltLike {
  heading: string;
  actions: { label: string; detail?: string; tone?: string; run: () => void }[];
  back: () => void;
}

test('réglage « Couleur du DMD » : préréglage, couleur libre, couleur refusée ; envoyé aux fenêtres', () => {
  setLanguage('fr');
  const { createMenuSettings, MENU_SETTINGS_ROWS } = require(path.join(REPO_ROOT, 'app', 'dist', 'menu-settings.js')) as {
    createMenuSettings(host: unknown): { run(): void };
    MENU_SETTINGS_ROWS: readonly string[];
  };
  let settings: MenuMediaSettings = { ...DEFAULT_MENU_MEDIA_SETTINGS };
  const opened: { build: () => BuiltLike; at: number }[] = [];
  const prompts: { value: string; done: (v: string | undefined) => void; lead?: string }[] = [];
  createMenuSettings({
    library: {
      openCustom: (build: () => BuiltLike, at = 0) => opened.push({ build, at }),
      openSystem() {},
      openPrompt: (_h: string, _l: string, value: string, done: (v: string | undefined) => void, lead?: string) => prompts.push({ value, done, lead }),
    },
    settings: () => settings,
    save: (next: MenuMediaSettings) => (settings = next),
    output: () => undefined,
    preview() {},
    wakeDevices: () => [],
    sleepAllowed: () => true,
  }).run();
  const row = MENU_SETTINGS_ROWS.indexOf('dmdColor');
  assert.ok(row >= 0);
  const main = opened[0]!.build;
  assert.equal(main().actions[row]!.label, 'Couleur du DMD : Vert signal');
  main().actions[row]!.run();
  const colors = opened.at(-1)!.build();
  assert.equal(colors.heading, 'Couleur du DMD');
  assert.deepEqual(
    colors.actions.slice(0, DMD_COLOR_PRESETS.length).map((a) => a.label),
    DMD_COLOR_PRESETS.map((p) => p.label),
  );
  assert.equal(colors.actions[0]!.tone, 'ok', 'le choix actuel est marqué');
  // Un préréglage : enregistré, retour sur la ligne.
  colors.actions[DMD_COLOR_PRESETS.findIndex((p) => p.id === 'plasma')]!.run();
  assert.equal(settings.dmdColor, '#ff8a1f');
  assert.equal(opened.at(-1)!.at, row);
  assert.equal(main().actions[row]!.label, 'Couleur du DMD : Orange plasma');
  // Couleur libre : clavier à l'écran, valeur actuelle proposée.
  main().actions[row]!.run();
  opened.at(-1)!.build().actions[DMD_COLOR_PRESETS.length]!.run();
  assert.equal(prompts.at(-1)!.value, '#FF8A1F');
  prompts.at(-1)!.done('#123');
  assert.match(prompts.at(-1)!.lead ?? '', /trop sombre/);
  assert.equal(settings.dmdColor, '#ff8a1f', 'couleur refusée : rien n’est enregistré');
  prompts.at(-1)!.done('bleu');
  assert.match(prompts.at(-1)!.lead ?? '', /n’est pas une couleur/);
  prompts.at(-1)!.done('a1b2c3');
  assert.equal(settings.dmdColor, '#a1b2c3');
  assert.equal(opened.at(-1)!.at, row);
  assert.equal(main().actions[row]!.label, 'Couleur du DMD : couleur libre #A1B2C3');
  const again = (main().actions[row]!.run(), opened.at(-1)!);
  assert.equal(again.at, DMD_COLOR_PRESETS.length, 'une couleur libre rouvre la liste sur « Couleur libre »');
  assert.equal(again.build().actions[DMD_COLOR_PRESETS.length]!.tone, 'ok');
  // Abandon de la saisie : retour à la liste, rien de changé.
  again.build().actions[DMD_COLOR_PRESETS.length]!.run();
  prompts.at(-1)!.done(undefined);
  assert.equal(settings.dmdColor, '#a1b2c3');

  // La couleur part dans l'état de chaque fenêtre, et la fenêtre l'applique avant de poser l'afficheur.
  const main_ts = read('app', 'src', 'frontend.ts');
  assert.match(main_ts, /dmdColor: mediaSettings\.dmdColor/);
  // FullDMD sans table : pas de bande du DMD vivant, la marque du repli sur toute la grille de 160 × 90.
  assert.match(main_ts, /if \(!table && menuDmdKind === 'fulldmd' && state\.phase !== 'loading'\) return undefined;/);
  const front = read('app', 'renderer', 'frontend.js');
  assert.ok(front.indexOf('setDmdColor?.(s.dmdColor)') >= 0 && front.indexOf('setDmdColor?.(s.dmdColor)') < front.indexOf('syncLiveDmd(s.game'), 'frontend.js : couleur posée avant le DMD vivant');
});
