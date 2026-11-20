// Date du jour des scripts (scripts/date-locale.mjs) : celle du poste, jamais la date UTC. Publiée
// juste après minuit en France, la 0.2.1 (20/11/2026) passait pour sortie la veille, et publier.mjs
// signalait à tort la date de ses Nouveautés.

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';
import { REPO_ROOT } from './i18n-scan';

const SCRIPTS = path.join(REPO_ROOT, 'scripts');

test('date du jour des scripts : à l’heure locale, même juste après minuit', async () => {
  const { localDate } = (await import(pathToFileURL(path.join(SCRIPTS, 'date-locale.mjs')).href)) as { localDate(date?: Date): string };
  assert.equal(localDate(new Date(2026, 10, 20, 0, 30)), '2026-11-20');
  assert.equal(localDate(new Date(2026, 10, 19, 23, 59)), '2026-11-19');
  assert.equal(localDate(new Date(2027, 0, 1, 0, 0)), '2027-01-01');
  assert.match(localDate(), /^\d{4}-\d{2}-\d{2}$/);
});

test('aucun script ne prend la date du jour en UTC (toISOString().slice(0, 10))', () => {
  const offenders: string[] = [];
  for (const name of fs.readdirSync(SCRIPTS)) {
    if (!/\.(mjs|js|cjs)$/.test(name)) continue;
    const text = fs.readFileSync(path.join(SCRIPTS, name), 'utf8');
    if (/toISOString\(\)\s*\.\s*(slice|substring|substr)\(\s*0\s*,\s*10\s*\)|toISOString\(\)\s*\.\s*split\(\s*'T'\s*\)/.test(text)) offenders.push(name);
  }
  assert.deepEqual(offenders, [], 'date du jour : localDate() de scripts/date-locale.mjs');
});
