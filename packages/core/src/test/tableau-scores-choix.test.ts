// Portée et période du tableau des scores d'une table (fiche > « Tableau des scores »,
// app/src/scores-choice.ts) et de la vue Scores du téléphone (telephone-ranks.js). Décidé le
// 17/11/2026 : ouverture par défaut sur le classement mondial de la semaine ; le dernier choix du
// joueur est gardé et rouvert. Ces tests fixent la classe :
// - sans choix gardé : Mondial, Cette semaine ; sans classement mondial, Cette borne, mais pas
//   pendant le calcul de l'empreinte de la table (le classement va venir) ;
// - un choix gardé est rouvert tel quel, même si sa portée manque (sa raison s'affiche) ;
// - un fichier illisible ou un champ inconnu retombe sur le défaut, champ par champ ;
// - la borne et le téléphone partent du même défaut et connaissent les mêmes portées et périodes ;
// - l'écran de la fiche ne s'ouvre plus sur une portée écrite en dur.

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { REPO_ROOT } from './i18n-scan';
import { RANKING_SCOPES, SCORE_PERIODS, type RankingScope, type ScorePeriod } from '../index';

type Choice = { scope: RankingScope; period: ScorePeriod };

/* eslint-disable @typescript-eslint/no-require-imports */
const choice = require(path.join(REPO_ROOT, 'app', 'dist', 'scores-choice.js')) as {
  SCORES_CHOICE_DEFAULT: Choice;
  parseScoresChoice(raw: unknown): Partial<Choice>;
  readScoresChoice(dataDir: string): Partial<Choice>;
  writeScoresChoice(dataDir: string, c: Choice): void;
  openingScoresChoice(saved: Partial<Choice>, world: () => { unavailable?: string; pending?: true } | undefined): Choice;
};

const AVAILABLE = () => ({});
const MISSING = () => ({ unavailable: 'Partage désactivé : Communauté > Partage et réseau' });

test('tableau des scores : par défaut Mondial, Cette semaine ; sans classement mondial, Cette borne', () => {
  assert.deepEqual(choice.SCORES_CHOICE_DEFAULT, { scope: 'world', period: 'week' });
  assert.deepEqual(choice.openingScoresChoice({}, AVAILABLE), { scope: 'world', period: 'week' });
  assert.deepEqual(choice.openingScoresChoice({}, MISSING), { scope: 'cabinet', period: 'week' });
  assert.deepEqual(choice.openingScoresChoice({}, () => undefined), { scope: 'cabinet', period: 'week' }, 'pas de réseau des bornes');
  // L'empreinte de la table encore en calcul n'est pas une absence : le classement mondial va venir.
  assert.deepEqual(choice.openingScoresChoice({}, () => ({ unavailable: 'Empreinte de la table en calcul…', pending: true })), { scope: 'world', period: 'week' });
});

test('tableau des scores : le choix gardé est rouvert tel quel, sur toutes les tables', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-scores-choix-'));
  try {
    assert.deepEqual(choice.readScoresChoice(dir), {}, 'rien de gardé au départ');
    choice.writeScoresChoice(dir, { scope: 'friends', period: 'all' });
    const saved = choice.readScoresChoice(dir);
    assert.deepEqual(saved, { scope: 'friends', period: 'all' });
    // Le classement mondial manque : le choix du joueur l'emporte, l'écran dira pourquoi.
    assert.deepEqual(choice.openingScoresChoice(saved, MISSING), { scope: 'friends', period: 'all' });
    choice.writeScoresChoice(dir, { scope: 'world', period: 'today' });
    assert.deepEqual(choice.openingScoresChoice(choice.readScoresChoice(dir), MISSING), { scope: 'world', period: 'today' });
    // Un fichier abîmé : le défaut.
    fs.writeFileSync(path.join(dir, 'tableau-des-scores.json'), '{ pas du json');
    assert.deepEqual(choice.openingScoresChoice(choice.readScoresChoice(dir), AVAILABLE), { scope: 'world', period: 'week' });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('tableau des scores : un champ inconnu retombe sur le défaut, l’autre est gardé', () => {
  assert.deepEqual(choice.parseScoresChoice({ scope: 'galaxie', period: 'year' }), { period: 'year' });
  assert.deepEqual(choice.parseScoresChoice({ scope: 'country', period: 'mois' }), { scope: 'country' });
  assert.deepEqual(choice.parseScoresChoice(null), {});
  assert.deepEqual(choice.openingScoresChoice({ period: 'year' }, AVAILABLE), { scope: 'world', period: 'year' });
});

test('tableau des scores : la fiche lit le choix gardé, le téléphone part du même défaut', () => {
  const library = fs.readFileSync(path.join(REPO_ROOT, 'app', 'src', 'library.ts'), 'utf8');
  assert.doesNotMatch(library, /kind: 'scores', file: table\.file, period: 'all', scope: 'cabinet'/, 'plus de portée écrite en dur à l’ouverture');
  assert.match(library, /openingScoresChoice\(readScoresChoice\(host\.dataDir\)/);
  // Chaque changement d'onglet (clic, flippers, MagnaSave) est gardé.
  assert.equal((library.match(/keepScoresChoice\(/g) ?? []).length, 4, 'déclaration, clic, MagnaSave, flippers');

  const phone = fs.readFileSync(path.join(REPO_ROOT, 'app', 'renderer', 'telephone', 'telephone-ranks.js'), 'utf8');
  const list = (name: string) => JSON.parse((new RegExp(`const ${name} = (\\[[^\\]]*\\]);`).exec(phone)?.[1] ?? '[]').replace(/'/g, '"')) as string[];
  assert.deepEqual(list('RANKS_SCOPES'), [...RANKING_SCOPES]);
  assert.deepEqual(list('RANKS_PERIODS'), [...SCORE_PERIODS]);
  assert.match(phone, new RegExp(`scope: ranksFirst\\.scope \\?\\? '${choice.SCORES_CHOICE_DEFAULT.scope}'`));
  assert.match(phone, new RegExp(`period: ranksFirst\\.period \\?\\? '${choice.SCORES_CHOICE_DEFAULT.period}'`));
  assert.equal((phone.match(/ranksKeep\(\);/g) ?? []).length, 2, 'portée et période gardées au clic');
  // Au téléphone aussi, l'empreinte en calcul n'est pas une absence : la borne le lui dit.
  assert.match(phone, /world\?\.reason && !world\.pending/);
  assert.match(fs.readFileSync(path.join(REPO_ROOT, 'app', 'src', 'remote-ranks.ts'), 'utf8'), /pending: true as const/);
});
