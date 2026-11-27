// États des propositions (Retours et propositions) : chacun se reconnaît d'un coup d'œil.
// Le 19/11/2026, tous s'écrivaient dans le même badge gris (et « Nouvelle » ne s'affichait pas) :
// on ne les distinguait pas. Ce test fixe :
// - deux états n'ont jamais la même icône, ni le même couple ton et remplissage ;
// - chaque icône existe dans le registre (icons.js), chaque ton et remplissage a sa règle (library.css) ;
// - la liste porte la pastille d'état sur chaque proposition, « Nouvelle » comprise, et ne la répète
//   pas dans les badges ; la fiche montre la même pastille avec ce que l'état veut dire, en français
//   comme en anglais.

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { REPO_ROOT } from './i18n-scan';
import { PROPOSAL_STATUS_VIEW, PROPOSAL_STATUSES, type Proposal } from '../feedback';
import { setLanguage } from '../i18n';
import { fakeFeedbackService } from './doublures';

const APP_DIST = path.join(REPO_ROOT, 'app', 'dist');

type Status = { text: string; icon: string; tone: string; fill: string };
type Row = { text: string; detail?: string; badges?: string[]; status?: Status; action?: number };
type Build = () => { sections: { rows: Row[] }[]; actions: { key?: string; run(): void }[] };

/* eslint-disable @typescript-eslint/no-require-imports */
const { createFeedbackMenu } = require(path.join(APP_DIST, 'feedback-menu.js')) as {
  createFeedbackMenu(ctx: object): { open(back?: () => void): void };
};
/* eslint-enable @typescript-eslint/no-require-imports */

test('deux états n’ont jamais le même aspect', () => {
  const icons = new Set<string>();
  const looks = new Set<string>();
  for (const s of PROPOSAL_STATUSES) {
    const v = PROPOSAL_STATUS_VIEW[s];
    assert.ok(!icons.has(v.icon), `${s} : icône ${v.icon} déjà prise par un autre état`);
    assert.ok(!looks.has(`${v.tone}/${v.fill}`), `${s} : ton ${v.tone} et remplissage ${v.fill} déjà pris par un autre état`);
    icons.add(v.icon);
    looks.add(`${v.tone}/${v.fill}`);
  }
});

test('icônes au registre, tons et remplissages dessinés', () => {
  const registry = fs.readFileSync(path.join(REPO_ROOT, 'app', 'renderer', 'icons.js'), 'utf8');
  const css = fs.readFileSync(path.join(REPO_ROOT, 'app', 'renderer', 'library.css'), 'utf8');
  for (const s of PROPOSAL_STATUSES) {
    const v = PROPOSAL_STATUS_VIEW[s];
    assert.match(registry, new RegExp(`^\\s+'?${v.icon}'?:`, 'm'), `${s} : icône ${v.icon} absente de icons.js`);
    assert.ok(css.includes(`.lib-status.tone-${v.tone} {`), `${s} : pas de règle .lib-status.tone-${v.tone}`);
    if (v.fill === 'solid') assert.ok(css.includes(`.lib-status.fill-solid.tone-${v.tone} {`), `${s} : pas de fond plein pour le ton ${v.tone}`);
    if (v.fill === 'dashed') assert.ok(css.includes('.lib-status.fill-dashed {'), `${s} : pas de règle des pointillés`);
  }
  const js = fs.readFileSync(path.join(REPO_ROOT, 'app', 'renderer', 'library.js'), 'utf8');
  assert.match(js, /lib-status tone-\$\{status\.tone\} fill-\$\{status\.fill\}/, 'library.js ne dessine plus la pastille d’état');
});

function proposals(): Proposal[] {
  return PROPOSAL_STATUSES.map((status, i) => ({
    id: `prop00000${i}`,
    kind: 'feature',
    title: `Idée numéro ${i + 1} pour essayer`,
    text: 'Une description inventée.',
    lang: 'fr',
    votes: 10 - i,
    status,
    at: 1763000000000,
    updated: 1763000000000,
    merged: 0,
    ...(i === 2 ? { voted: true } : {}),
  }));
}

for (const lang of ['fr', 'en'] as const) {
  test(`liste et fiche : la pastille de chaque état (${lang})`, () => {
    setLanguage(lang);
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-etats-'));
    let shown: Build | undefined;
    try {
      const list = proposals();
      const menu = createFeedbackMenu({
        dataDir,
        service: fakeFeedbackService({ list: () => list, net: () => 'ok', supporters: () => ({ state: 'offline' }) }),
        version: '9.9.9',
        language: () => lang,
        openCustom: (build: Build) => (shown = build),
        openSystem: () => undefined,
        prompt: () => undefined,
        showing: (build: Build) => shown === build,
        techReport: () => undefined,
        log: () => undefined,
      });
      menu.open();
      const rows = shown!().sections.flatMap((s) => s.rows);
      assert.equal(rows.length, PROPOSAL_STATUSES.length);
      PROPOSAL_STATUSES.forEach((s, i) => {
        const view = PROPOSAL_STATUS_VIEW[s];
        const row = rows[i];
        assert.deepEqual(row?.status, { text: view.label, icon: view.icon, tone: view.tone, fill: view.fill }, `${s} : pastille`);
        assert.ok(!(row?.badges ?? []).includes(view.label), `${s} : l'état répété dans les badges`);
      });
      assert.equal(rows[2]?.badges?.length, 1, 'le vote reste dans son badge');
      if (lang === 'en') assert.deepEqual(rows.map((r) => r.status?.text), ['New', 'Under review', 'Planned', 'In development', 'In pre-release', 'Done', 'Not planned']);

      // La fiche de la proposition « Prévue » : la même pastille, et ce que l'état veut dire.
      shown!().actions.find((a) => a.key === 'feedback:prop000002')!.run();
      const state = shown!().sections.flatMap((s) => s.rows).find((r) => r.status);
      assert.ok(state, 'la fiche montre l’état');
      assert.equal(state.status!.text, PROPOSAL_STATUS_VIEW.planned.label);
      assert.equal(state.detail, PROPOSAL_STATUS_VIEW.planned.meaning);
      if (lang === 'en') assert.equal(state.detail, 'Accepted: it will come in a future version');
    } finally {
      setLanguage('fr');
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  });
}
