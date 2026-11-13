// Phrases préparées des salons (rooms.ts, app/src/rooms-menu.ts), 13/11/2026 : figées dans le code à
// deux endroits qui divergeaient (« Merci ! » manquait au téléphone), elles deviennent un réglage de la
// borne (<données>\amis\salons.json), géré dans Réglages de la communauté > Phrases préparées. Ces tests
// fixent :
// - le stockage : celles d'origine par défaut, chaque phrase nettoyée comme une ligne (300 caractères,
//   une ligne), sans doublon, 20 au plus, un fichier abîmé relu sans faute ;
// - une seule source : l'écran Écrire dans le salon et le téléphone proposent la même liste ;
// - {table} suit la table choisie dans la roue, et la phrase se tait sans table ;
// - l'écran : ajouter, modifier, monter, descendre, supprimer (confirmé), rétablir ; l'ordre des
//   flippers suit l'affichage, et après chaque geste le curseur reste sur son élément ;
// - celles d'origine suivent la langue de la borne tant qu'on ne les modifie pas.

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { REPO_ROOT } from './i18n-scan';
import { setLanguage } from '../i18n';
import {
  cleanPhrases,
  DEFAULT_PHRASES,
  loadRooms,
  newRoomsState,
  phraseForTable,
  phrasesSetting,
  PHRASES_MAX,
  roomPhrases,
  roomsFile,
  saveRooms,
  type RoomsState,
} from '../rooms';

// ---------------------------------------------------------------------------
// Stockage

test('phrases : celles d’origine par défaut, un réglage qui leur est égal n’est pas gardé', () => {
  assert.deepEqual(roomPhrases(newRoomsState()), [...DEFAULT_PHRASES]);
  assert.equal(DEFAULT_PHRASES.length, 6);
  assert.ok(DEFAULT_PHRASES.includes('Merci !'), '« Merci ! » est là pour tous, téléphone compris');
  assert.equal(phrasesSetting([...DEFAULT_PHRASES]), undefined, 'égal à celles d’origine : rien de gardé, elles suivent la langue');
  const reordered = [...DEFAULT_PHRASES].reverse();
  assert.deepEqual(phrasesSetting(reordered), reordered);
  assert.deepEqual(phrasesSetting([]), [], 'toutes supprimées : la liste vide est gardée');
});

test('phrases : chacune nettoyée comme une ligne du salon, sans doublon, 20 au plus', () => {
  const many = Array.from({ length: 30 }, (_, i) => `Phrase ${i + 1}`);
  const out = cleanPhrases(['  Salut  ', 'Salut', 'une\nligne', 'x'.repeat(301), 'é'.repeat(300), '', '   ', 42, null, ...many])!;
  assert.equal(out[0], 'Salut', 'bords nettoyés');
  assert.equal(out[1], 'une ligne', 'une seule ligne');
  assert.equal(out[2], 'é'.repeat(300), '300 caractères passent');
  assert.ok(!out.includes('x'.repeat(301)), '301 caractères non');
  assert.equal(out.filter((p) => p === 'Salut').length, 1, 'pas de doublon');
  assert.equal(out.length, PHRASES_MAX);
  assert.equal(cleanPhrases('pas une liste'), undefined);
});

test('phrases : gardées dans salons.json, relues dans l’ordre ; un fichier abîmé ne casse rien', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-phrases-'));
  try {
    const mine: RoomsState = { ...newRoomsState(), phrases: ['On fait un tournoi ?', 'Bien joué !', 'Quelqu’un sur {table} ?'] };
    saveRooms(dir, mine);
    assert.deepEqual(loadRooms(dir).phrases, mine.phrases);
    // Écrit à la main ou abîmé : les phrases fautives écartées, le reste gardé.
    fs.writeFileSync(roomsFile(dir), JSON.stringify({ enabled: true, phrases: ['Bonne partie !', 'a'.repeat(400), 7, 'Bonne partie !'] }));
    assert.deepEqual(loadRooms(dir).phrases, ['Bonne partie !']);
    // Pas une liste : celles d'origine.
    fs.writeFileSync(roomsFile(dir), JSON.stringify({ phrases: { 0: 'x' } }));
    assert.deepEqual(roomPhrases(loadRooms(dir)), [...DEFAULT_PHRASES]);
    // Fichier tronqué : l'état neuf, celles d'origine.
    fs.writeFileSync(roomsFile(dir), '{"phrases": ["Sal');
    assert.deepEqual(roomPhrases(loadRooms(dir)), [...DEFAULT_PHRASES]);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('{table} : la table choisie dans la roue ; sans table, la phrase se tait', () => {
  assert.equal(phraseForTable('Quelqu’un sur {table} ?', 'Atlas Rising'), 'Quelqu’un sur Atlas Rising ?');
  assert.equal(phraseForTable('{table} puis {table}', 'X'), 'X puis X');
  assert.equal(phraseForTable('Quelqu’un sur {table} ?', undefined), undefined);
  assert.equal(phraseForTable('Bien joué !', undefined), 'Bien joué !');
});

// ---------------------------------------------------------------------------
// L'écran, avec une bibliothèque et un réseau d'essai

interface Action {
  label: string;
  detail?: string;
  tone?: string;
  key?: string;
  run: () => void;
}
interface Built {
  heading: string;
  subheading?: string;
  lead?: string;
  sections: { title?: string; kind?: string; rows: { text: string; detail?: string; tone?: string; action?: number }[] }[];
  actions: Action[];
  back: () => void;
}

/* eslint-disable @typescript-eslint/no-require-imports */
const { createRoomsMenu } = require(path.join(REPO_ROOT, 'app', 'dist', 'rooms-menu.js')) as {
  createRoomsMenu(host: object): {
    settingsItem: { run(): void; detail: string };
    openRoom(room: string, back: () => void): void;
    remote(): { phrases: string[] };
  };
};
/* eslint-enable @typescript-eslint/no-require-imports */

function harness(opts: { table?: string } = {}) {
  let rooms: RoomsState = { ...newRoomsState(), rulesAt: '2026-11-13T19:00:00Z' };
  let table = opts.table;
  // L'écran montré, son rang de curseur, et les ouvertures (pour suivre le curseur après chaque geste).
  let screen: { build: () => Built; at: number } | undefined;
  let prompt: { heading: string; value: string; done: (v: string | undefined) => void } | undefined;
  const library = {
    openCustom(build: () => Built, at?: number) {
      // Comme library.ts : le même écran redessiné garde son curseur ; un rang donné est obéi.
      if (screen && screen.build === build && at === undefined) return;
      screen = { build, at: at ?? 0 };
      prompt = undefined;
    },
    openSystem() {
      screen = undefined;
    },
    isShowing: (build: () => Built) => screen?.build === build,
    openPrompt(heading: string, _label: string, value: string, done: (v: string | undefined) => void) {
      prompt = { heading, value, done };
      screen = undefined;
    },
  };
  const me = { enabled: true, name: 'Moi', key: { publicKey: 'a'.repeat(64) }, blocked: [] as string[], friends: [], requests: [] };
  const net = {
    state: () => me,
    country: () => 'FR',
    rooms: () => rooms,
    setRooms: (change: Partial<RoomsState>) => (rooms = { ...rooms, ...change }),
    status: () => ({ running: true }),
    moderation: () => ({ acts: [], reports: [] }),
    amModerator: () => false,
    onRoomLines: () => () => undefined,
    roomOpen: () => undefined,
    roomPresent: () => [],
    roomMoves: () => [],
    avatarFile: () => undefined,
    roomSend: () => ({ reason: 'text' }),
  };
  const menu = createRoomsMenu({
    library,
    net,
    openProfile: () => undefined,
    openFriend: () => undefined,
    currentTable: () => (table ? { title: table } : undefined),
    phoneLinked: () => false,
  });
  const built = () => {
    assert.ok(screen, 'un écran est montré');
    return screen.build();
  };
  const labels = () => built().actions.map((a) => a.label);
  const run = (label: string) => {
    const i = labels().indexOf(label);
    assert.ok(i >= 0, `action « ${label} » : ${labels().join(' | ')}`);
    // Le joueur y amène le curseur, puis Start.
    screen!.at = i;
    built().actions[i]!.run();
  };
  const answer = (value: string | undefined) => {
    assert.ok(prompt, 'le clavier à l’écran est ouvert');
    const p = prompt;
    prompt = undefined;
    p.done(value);
  };
  return {
    menu,
    built,
    labels,
    run,
    answer,
    prompt: () => prompt,
    cursor: () => labels()[screen!.at],
    phrases: () => roomPhrases(rooms),
    stored: () => rooms.phrases,
    setTable: (t: string | undefined) => (table = t),
  };
}

const LIST_ACTIONS = ['Ajouter une phrase…', 'Rétablir celles d’origine…', 'Retour'];

test('Réglages de la communauté > Phrases préparées : la liste, puis les actions, dans l’ordre de l’affichage', () => {
  setLanguage('fr');
  const h = harness({ table: 'Atlas Rising' });
  h.menu.settingsItem.run();
  assert.match(h.menu.settingsItem.detail, /phrases préparées/);
  const settings = h.built();
  const entry = settings.actions.find((a) => a.label === 'Phrases préparées');
  assert.ok(entry, 'l’entrée est dans les réglages de la communauté');
  assert.match(entry.detail ?? '', /^6 phrases, en badges/);
  h.run('Phrases préparées');
  const b = h.built();
  assert.equal(b.heading, 'Phrases préparées');
  const rows = b.sections.flatMap((s) => s.rows).filter((r) => r.action !== undefined);
  assert.deepEqual(rows.map((r) => r.text), [...DEFAULT_PHRASES]);
  // Les flippers : les phrases de haut en bas (actions 0 à 5), puis les actions, sans saut.
  assert.deepEqual(rows.map((r) => r.action), [0, 1, 2, 3, 4, 5]);
  assert.deepEqual(h.labels().slice(6), LIST_ACTIONS);
  assert.equal(rows[1]!.detail, 'Avec la table choisie : Quelqu’un sur Atlas Rising ?');
  // Déjà celles d'origine : « Rétablir » grisé avec sa raison, et Start le laisse là.
  const restore = b.actions[7]!;
  assert.equal(restore.tone, 'quiet');
  assert.equal(restore.detail, 'Ce sont déjà celles d’origine');
  restore.run();
  assert.equal(h.cursor(), 'Rétablir celles d’origine…');
  // Retour : sur « Phrases préparées » dans les réglages.
  h.run('Retour');
  assert.equal(h.cursor(), 'Phrases préparées');
});

test('ajouter : clavier à l’écran ou téléphone, mêmes règles que l’envoi ; le curseur reste sur « Ajouter »', () => {
  setLanguage('fr');
  const h = harness();
  h.menu.settingsItem.run();
  h.run('Phrases préparées');
  h.run('Ajouter une phrase…');
  assert.equal(h.prompt()?.heading, 'Ajouter une phrase');
  h.answer('  On fait un tournoi ?  ');
  assert.deepEqual(h.phrases(), [...DEFAULT_PHRASES, 'On fait un tournoi ?']);
  assert.equal(h.cursor(), 'Ajouter une phrase…');
  assert.equal(h.built().sections[0]!.rows[0]!.text, 'Phrase ajoutée à la fin de la liste');
  // Plus de celles d'origine : « Rétablir » devient possible.
  assert.equal(h.built().actions.find((a) => a.label === 'Rétablir celles d’origine…')?.tone, undefined);
  // Trop longue, vide, en double : refusées, la raison en clair, rien de changé.
  for (const [value, why] of [
    ['x'.repeat(301), 'Phrase vide ou trop longue : 300 caractères au plus'],
    ['   ', 'Phrase vide ou trop longue : 300 caractères au plus'],
    ['Bien joué !', 'Cette phrase est déjà dans la liste'],
  ] as const) {
    h.run('Ajouter une phrase…');
    h.answer(value);
    assert.equal(h.phrases().length, 7, value);
    assert.equal(h.cursor(), 'Ajouter une phrase…');
    const notice = h.built().sections[0]!.rows[0]!;
    assert.deepEqual([notice.text, notice.tone], [why, 'warning']);
  }
  // Annulé (Exit au clavier) : rien, retour sur « Ajouter ».
  h.run('Ajouter une phrase…');
  h.answer(undefined);
  assert.equal(h.phrases().length, 7);
  assert.equal(h.cursor(), 'Ajouter une phrase…');
});

test('vingt phrases au plus : « Ajouter » grisé avec sa raison', () => {
  setLanguage('fr');
  const h = harness();
  h.menu.settingsItem.run();
  h.run('Phrases préparées');
  for (let i = h.phrases().length; i < PHRASES_MAX; i++) {
    h.run('Ajouter une phrase…');
    h.answer(`Phrase ${i}`);
  }
  assert.equal(h.phrases().length, PHRASES_MAX);
  const add = h.built().actions.find((a) => a.label === 'Ajouter une phrase…')!;
  assert.equal(add.tone, 'quiet');
  assert.equal(add.detail, '20 phrases au plus : supprimez-en une d’abord');
  add.run();
  assert.equal(h.prompt(), undefined, 'pas de clavier');
  assert.equal(h.cursor(), 'Ajouter une phrase…');
});

test('une phrase : modifier, monter, descendre (le curseur reste), supprimer après confirmation, rétablir', () => {
  setLanguage('fr');
  const h = harness();
  h.menu.settingsItem.run();
  h.run('Phrases préparées');
  h.run('Merci !');
  let b = h.built();
  assert.equal(b.heading, 'Phrase préparée');
  assert.equal(b.subheading, '5 sur 6');
  assert.deepEqual(h.labels(), ['Modifier…', 'Monter', 'Descendre', 'Supprimer…', 'Retour']);
  // Monter : même écran, curseur sur « Monter ».
  h.run('Monter');
  h.run('Monter');
  assert.deepEqual(h.phrases().slice(2, 4), ['Merci !', 'Bien joué !']);
  assert.equal(h.built().subheading, '3 sur 6');
  assert.equal(h.cursor(), 'Monter', 'même écran redessiné : le curseur reste sur « Monter »');
  h.run('Descendre');
  assert.deepEqual(h.phrases().slice(2, 4), ['Bien joué !', 'Merci !']);
  // En haut : « Monter » grisé avec sa raison.
  for (let i = 0; i < 6; i++) h.run('Monter');
  b = h.built();
  assert.equal(b.subheading, '1 sur 6');
  assert.equal(b.actions[1]!.tone, 'quiet');
  assert.equal(b.actions[1]!.detail, 'Déjà la première');
  // Modifier : le texte affiché au clavier ; la nouvelle phrase prend sa place.
  h.run('Modifier…');
  assert.equal(h.prompt()?.value, 'Merci !');
  h.answer('Merci beaucoup !');
  assert.equal(h.phrases()[0], 'Merci beaucoup !');
  assert.equal(h.cursor(), 'Modifier…');
  // Inchangée : celle d'origine reste sous sa clé.
  h.run('Retour');
  assert.equal(h.cursor(), 'Merci beaucoup !', 'retour à la liste sur cette phrase');
  h.run('Bien joué !');
  h.run('Modifier…');
  h.answer('Bien joué !');
  assert.ok(h.phrases().includes('Bien joué !'));
  // Supprimer : confirmation, puis la liste sur la phrase qui prend sa place.
  h.run('Supprimer…');
  assert.equal(h.built().heading, 'Supprimer cette phrase ?');
  assert.equal(h.cursor(), 'Annuler', 'confirmation : Annuler par défaut');
  h.run('Annuler');
  assert.equal(h.cursor(), 'Supprimer…');
  assert.equal(h.phrases().length, 6);
  const at = h.phrases().indexOf('Bien joué !');
  h.run('Supprimer…');
  h.run('Supprimer');
  assert.ok(!h.phrases().includes('Bien joué !'));
  assert.equal(h.built().heading, 'Phrases préparées');
  assert.equal(h.cursor(), h.phrases()[at], 'le curseur sur la phrase suivante');
  assert.equal(h.built().sections[0]!.rows[0]!.text, 'Phrase supprimée');
  // Rétablir : confirmation, puis celles d'origine, plus rien de gardé ; le curseur sur « Rétablir ».
  h.run('Rétablir celles d’origine…');
  assert.equal(h.built().heading, 'Rétablir les phrases d’origine ?');
  h.run('Rétablir');
  assert.equal(h.stored(), undefined);
  assert.deepEqual(h.phrases(), [...DEFAULT_PHRASES]);
  assert.equal(h.cursor(), 'Rétablir celles d’origine…');
});

test('toutes supprimées : la liste le dit, Écrire dans le salon aussi, le téléphone n’a plus de badge', () => {
  setLanguage('fr');
  const h = harness();
  h.menu.settingsItem.run();
  h.run('Phrases préparées');
  while (h.phrases().length) {
    h.built().actions[0]!.run();
    h.run('Supprimer…');
    h.run('Supprimer');
  }
  assert.deepEqual(h.stored(), []);
  assert.equal(h.cursor(), 'Ajouter une phrase…');
  assert.match(h.built().sections.flatMap((s) => s.rows).map((r) => r.text).join('|'), /Aucune phrase : « Ajouter une phrase… » en crée une/);
  assert.deepEqual(h.menu.remote().phrases, []);
  h.menu.openRoom('pays-FR', () => undefined);
  h.run('Écrire dans le salon');
  assert.equal(h.labels()[0], 'Gérer les phrases…');
  assert.equal(h.built().sections.find((s) => s.kind === 'chips')?.rows[0]?.text, 'Aucune phrase préparée');
});

test('Écrire dans le salon : les phrases de la borne, « Gérer les phrases… » juste après, et le téléphone a les mêmes', () => {
  setLanguage('fr');
  const h = harness({ table: 'Atlas Rising' });
  h.menu.openRoom('pays-FR', () => undefined);
  h.run('Écrire dans le salon');
  const chips = () => h.built().sections.find((s) => s.kind === 'chips')!.rows.map((r) => r.text);
  const expected = ['Qui veut faire une partie ?', 'Quelqu’un sur Atlas Rising ?', 'Bien joué !', 'J’arrive dans 5 minutes', 'Merci !', 'Bonne soirée !'];
  assert.deepEqual(chips(), expected);
  assert.deepEqual(h.menu.remote().phrases, expected, 'une seule source : le téléphone a « Merci ! » aussi');
  // Juste après les phrases, aux flippers : « Gérer les phrases… ».
  assert.equal(h.labels()[6], 'Gérer les phrases…');
  h.run('Gérer les phrases…');
  assert.equal(h.built().heading, 'Phrases préparées');
  h.run('Ajouter une phrase…');
  h.answer('Une revanche sur {table} ?');
  h.run('Retour');
  assert.equal(h.built().heading, 'Écrire dans le salon');
  assert.equal(h.cursor(), 'Gérer les phrases…', 'retour sur le raccourci, même avec une phrase de plus');
  assert.equal(chips().at(-1), 'Une revanche sur Atlas Rising ?', '{table} marche aussi dans mes phrases');
  // Sans table choisie : les phrases qui en parlent se taisent, à la borne comme au téléphone.
  h.setTable(undefined);
  assert.deepEqual(h.menu.remote().phrases, expected.filter((p) => !p.includes('Atlas')));
});

test('celles d’origine suivent la langue de la borne ; les miennes restent telles que je les ai écrites', () => {
  setLanguage('fr');
  const h = harness({ table: 'Atlas Rising' });
  h.menu.settingsItem.run();
  h.run('Phrases préparées');
  h.run('Ajouter une phrase…');
  h.answer('Partie à quatre ?');
  setLanguage('en');
  try {
    assert.deepEqual(h.menu.remote().phrases, ['Who wants a game?', 'Anyone on Atlas Rising?', 'Well played!', 'Be there in 5 minutes', 'Thanks!', 'Have a good evening!', 'Partie à quatre ?']);
  } finally {
    setLanguage('fr');
  }
});
