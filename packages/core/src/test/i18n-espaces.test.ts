import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EN_PARTS } from '../i18n/en';

// Un morceau de phrase traduit (« ou », « et », « · ») sert à joindre des textes : la traduction
// doit garder les espaces qui l'entourent, sinon l'anglais colle les mots (« LedWiz orPinscape »).
// La ponctuation française (« : », « ; », « ! ») perd légitimement son espace d'avant : seul un
// espace devant une lettre ou un chiffre est exigé au début.
test('i18n : une traduction garde les espaces qui entourent un morceau de phrase', () => {
  const faults: string[] = [];
  for (const [part, catalog] of Object.entries(EN_PARTS)) {
    for (const [fr, en] of Object.entries(catalog)) {
      if (typeof en !== 'string') continue;
      if (/\s$/u.test(fr) && !/\s$/u.test(en)) faults.push(`${part} : « ${fr} » -> « ${en} » perd son espace final`);
      if (/^\s+[\p{L}\p{N}]/u.test(fr) && !/^\s/u.test(en)) faults.push(`${part} : « ${fr} » -> « ${en} » perd son espace initial`);
    }
  }
  assert.deepEqual(faults, []);
});
