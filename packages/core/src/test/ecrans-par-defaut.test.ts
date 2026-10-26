// Écrans de la borne hors du menu des tables. Signalement du 26/10/2026 : dans les
// menus de Cyber Pinball (menu système, réglages…), le fronton, le DMD et le topper restaient
// sur la dernière table de la roue, sa vidéo en lecture. Chaque fenêtre recevait les médias de
// la table choisie quelle que soit la phase. Désormais chaque phase dit de quelle table elle
// parle (screensTable) ; sans table, l'affichage par défaut de Cyber Pinball (defaultMediaView),
// en silence. Ces tests fixent l'invariant pour toute phase et tout écran à venir.

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import { withDmdKind } from '../dmdscreen';
import { toPhysicalScreen } from '../fingerprint';
import { MEDIA_TYPES } from '../medias';
import { defaultMediaView, MenuMedias } from '../mediaview';
import { MENU_PHASES, screensTable, type MenuPhase, type ScreensContext } from '../menumoments';
import { ROLES, type Cabinet } from '../model';
import type { TableEntry } from '../tables';
import { devPcDisplays, emptyCabinet } from './fixtures';
import { REPO_ROOT } from './i18n-scan';

const table = (title: string) => ({ file: `C:\\Tables\\${title}.vpx`, title }) as TableEntry;
const selected = table('Neon Galaxy');
const playing = table('Rocket Rally');
const about = table('Atlantis Deep');

/** Phases qui parlent de la table choisie ou jouée, sans écran ouvert par-dessus. */
const TABLE_PHASES: readonly MenuPhase[] = ['menu', 'loading', 'playing'];

test('écrans de la borne : hors du menu des tables, aucune phase ne garde la table de la roue', () => {
  for (const phase of MENU_PHASES) {
    const shown = screensTable({ phase, help: false, selected, playing: phase === 'menu' ? undefined : playing });
    if (TABLE_PHASES.includes(phase)) assert.ok(shown, `${phase} : la table choisie ou jouée`);
    else assert.equal(shown, undefined, `${phase} : affichage par défaut, pas « ${shown?.title} »`);
  }
  // Aide des commandes par-dessus le menu des tables : affichage par défaut.
  assert.equal(screensTable({ phase: 'menu', help: true, selected }), undefined);
  // Menu des tables, chargement et partie : la table choisie, puis celle qu'on joue.
  assert.equal(screensTable({ phase: 'menu', help: false, selected }), selected);
  assert.equal(screensTable({ phase: 'loading', help: false, selected, playing }), playing);
  assert.equal(screensTable({ phase: 'playing', help: false, selected, playing }), playing);
});

test('écrans de la borne : un écran qui parle d’une table garde ses médias, celle dont il parle', () => {
  // Fiche, médias du jeu, fichiers, parcours (menu système), partie échouée (message).
  assert.equal(screensTable({ phase: 'library', help: false, selected, about }), about);
  assert.equal(screensTable({ phase: 'message', help: false, selected, about }), about);
  // Confirmation de sortie : jamais une table.
  assert.equal(screensTable({ phase: 'confirmQuit', help: false, selected, about }), undefined);
});

test('écrans de la borne : réglages de VPX par-dessus le menu, généraux ou d’une table', () => {
  const base: ScreensContext = { phase: 'menu', help: false, selected };
  assert.equal(screensTable({ ...base, overlay: {} }), undefined, 'réglages généraux : affichage par défaut');
  assert.equal(screensTable({ ...base, phase: 'library', about, overlay: { about } }), about, 'réglages de la table de la fiche');
  // Une partie lancée reste à l'écran : les réglages ne s'ouvrent pas pendant une partie.
  assert.equal(screensTable({ ...base, phase: 'playing', playing, overlay: {} }), playing);
});

function poste(): Cabinet {
  const cabinet = emptyCabinet();
  cabinet.screens = devPcDisplays().map(toPhysicalScreen);
  cabinet.roles = { playfield: cabinet.screens[1]!.fingerprint, backglass: cabinet.screens[0]!.fingerprint, dmd: cabinet.screens[3]!.fingerprint, topper: cabinet.screens[2]!.fingerprint };
  cabinet.playfield = { flipperEdge: 'bottom' };
  return cabinet;
}

test('affichage par défaut : chaque écran a le sien, la marque dessinée sans aucun fichier de table', () => {
  for (const kind of ['dmd', 'fulldmd'] as const) {
    const cabinet = withDmdKind(poste(), kind);
    for (const { id: role } of ROLES) {
      const view = defaultMediaView(role, cabinet);
      assert.equal(view.role, role);
      assert.equal(view.url, undefined, `${role} : aucun fichier`);
      assert.equal(view.source, 'fallback');
      assert.equal(view.brand, true);
      // Sans titre de jeu, le repli dessine la marque (fallback.js : g.title || BRAND).
      assert.equal(view.card.title, '');
      assert.notEqual(view.fallback, 'none', `${role} : un dessin par défaut`);
      assert.equal(view.fallback, MEDIA_TYPES.find((t) => t.type === view.type)?.fallback);
    }
    // L'afficheur suit son écran : DMD seul ou FullDMD.
    assert.equal(defaultMediaView('dmd', cabinet).type, kind === 'dmd' ? 'DMD' : 'FullDMD');
  }
  // Le menu a la même chose, d'après son modèle de borne.
  const medias = new MenuMedias({ root: undefined, dataDir: path.join(REPO_ROOT, 'tmp', 'sans-donnees'), cabinet: withDmdKind(poste(), 'fulldmd'), rotation: 0, b2s: false });
  assert.deepEqual(medias.defaultMedia('dmd'), defaultMediaView('dmd', withDmdKind(poste(), 'fulldmd')));
});

test('affichage par défaut : le rendu a un composant pour chaque écran (media.js et fallback.js)', () => {
  const media = fs.readFileSync(path.join(REPO_ROOT, 'app', 'renderer', 'media.js'), 'utf8');
  const fallback = fs.readFileSync(path.join(REPO_ROOT, 'app', 'renderer', 'fallback.js'), 'utf8');
  const kinds = Object.fromEntries([...media.matchAll(/^\s+'([\w-]+)': '(\w+)',$/gm)].map((m) => [m[1], m[2]]));
  const exported = /window\.CyberFallback = \{([^}]+)\}/.exec(fallback)?.[1] ?? '';
  for (const type of ['DMD', 'FullDMD'] as const) {
    for (const { id: role } of ROLES) {
      const view = defaultMediaView(role, withDmdKind(poste(), type === 'DMD' ? 'dmd' : 'fulldmd'));
      let kind = kinds[view.fallback!];
      assert.ok(kind, `${role} : repli « ${view.fallback} » inconnu de media.js`);
      if (kind === 'dmd' && view.type === 'FullDMD') kind = 'fullDmd';
      assert.match(exported, new RegExp(`\\b${kind},`), `${role} : composant « ${kind} » absent de fallback.js`);
    }
  }
  // Sans titre, chaque composant dessine la marque, jamais un écran vide ou clair.
  for (const brand of ["g.title || BRAND", 'brandPage(matrix', 'wordmarkBox(']) assert.ok(fallback.includes(brand), brand);
});

test('menu : les médias et le son de chaque fenêtre passent par screensTable', () => {
  const frontend = fs.readFileSync(path.join(REPO_ROOT, 'app', 'src', 'frontend.ts'), 'utf8');
  // Les phases du menu sont celles de screensTable : une nouvelle phase y déclare sa table.
  assert.match(frontend, /^type Phase = MenuPhase;\r?$/m);
  assert.match(frontend, /medias: subject \? mediasOf\(subject\) : defaults,/);
  // Seule exception : rien pendant qu'un écran fait écouter des sons (menumoments.test.ts, « un seul son »).
  assert.match(frontend, /function soundView\(\) \{\r?\n(\s*\/\/.*\r?\n)*\s*const table = (state\.phase === 'library' && library\.previewsSound\(\) \? undefined : )?screensSubject\(\);/);
  // Aucune autre fenêtre du menu ne reçoit les médias de la table choisie directement.
  assert.doesNotMatch(frontend, /medias: table \? mediasOf\(table\)/);
  // Menu système : un écran ne parle d'une table que s'il le déclare (library.ts, tableOf).
  const library = fs.readFileSync(path.join(REPO_ROOT, 'app', 'src', 'library.ts'), 'utf8');
  assert.match(library, /table: \(\) => tableOf\(screen\),/);
});
