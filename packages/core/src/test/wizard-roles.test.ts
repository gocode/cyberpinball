import assert from 'node:assert/strict';
import * as path from 'node:path';
import { test } from 'node:test';
import { REPO_ROOT } from './i18n-scan';

const { nextAssignableRole } = require(path.join(REPO_ROOT, 'app', 'dist', 'wizard-roles.js')) as {
  nextAssignableRole(after: number, count: number, hasOptions: (index: number) => boolean): number;
};

test('rôles : un écran indisponible ne supprime jamais les propositions des rôles suivants', () => {
  // Toutes les combinaisons de disponibilités, depuis chaque rôle : notamment
  // un seul écran, playfield pris, backglass impossible, DMD incrusté possible.
  for (let mask = 0; mask < 16; mask++) {
    const available = Array.from({ length: 4 }, (_, i) => (mask & (1 << i)) !== 0);
    for (let after = -1; after < 4; after++) {
      const expected = available.findIndex((yes, index) => yes && index > after);
      assert.equal(nextAssignableRole(after, 4, (i) => available[i]!), expected < 0 ? 4 : expected);
    }
  }
});
