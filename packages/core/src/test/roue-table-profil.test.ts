import assert from 'node:assert/strict';
import * as path from 'node:path';
import { test } from 'node:test';
import type { PresenceTable } from '../social';
import type { TableEntry } from '../tables';
import { REPO_ROOT } from './i18n-scan';

const { findWheelTable } = require(path.join(REPO_ROOT, 'app/dist/wheel-table.js')) as {
  findWheelTable(tables: readonly TableEntry[], wanted: PresenceTable): TableEntry | undefined;
};
const table = (title: string, vpsId?: string, manufacturer = 'Studio Exemple', year = 2025) => ({ title, info: { Info: { Title: title, ...(vpsId ? { VPSId: vpsId } : {}), Manufacturer: manufacturer, Year: year } } }) as TableEntry;

test('une table du moment reçue par titre retrouve une table portant une référence VPS', () => {
  const entry = table('Thunder Reef', 'reef-2025');
  assert.equal(findWheelTable([entry], { title: 'Thunder Reef' }), entry);
  assert.equal(findWheelTable([entry], { title: ' thunder reef ' }), entry);
  assert.equal(findWheelTable([entry], { title: 'Neon Abyss' }), undefined);
});

test('une référence précise ne retombe jamais sur un homonyme différent ; les métadonnées départagent les titres seuls', () => {
  const old = table('Thunder Reef', 'reef-old', 'Studio Ancien', 1991);
  const entry = table('Thunder Reef', 'reef-2025');
  assert.equal(findWheelTable([old, entry], { title: 'Autre titre', vpsId: 'reef-2025' }), entry);
  assert.equal(findWheelTable([old, entry], { title: 'Thunder Reef', vpsId: 'reef-missing' }), undefined);
  assert.equal(findWheelTable([old, entry], { title: 'Thunder Reef', manufacturer: 'Studio Exemple', year: 2025 }), entry);
  assert.equal(findWheelTable([old, entry], { title: 'Thunder Reef', year: 2001 }), undefined);
});
