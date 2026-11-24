// PuP-Packs des tables de Future Pinball (24/11/2026) : PinUP Player se retrouve par son inscription COM (LocalServer32),
// et une table « PinEvent » se devine à son nom pour prévenir, à l'ajout, qu'elle se joue sans ses vidéos sans lui.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { localServerExe, looksLikePupTable } from '../futurepinball-pup';

test('PinUP Player : l’exécutable tiré de LocalServer32, entre guillemets ou nu, sans ses arguments', () => {
  assert.equal(localServerExe('C:\\vPinball\\PinUPSystem\\PinUpPlayer.exe'), 'C:\\vPinball\\PinUPSystem\\PinUpPlayer.exe');
  assert.equal(localServerExe('"C:\\Program Files\\PinUP System\\PinUpPlayer.exe" /automation'), 'C:\\Program Files\\PinUP System\\PinUpPlayer.exe');
  assert.equal(localServerExe('  C:\\PinUPSystem\\PinUpPlayer.exe /automation '), 'C:\\PinUPSystem\\PinUpPlayer.exe');
});

test('table PinEvent devinée à son nom ; les noms ordinaires jamais', () => {
  for (const name of ['RetroFlair (PinEvent)', 'FP_PE_RetroFlair_BE.fpt', 'Retroflair Pin Event V2.fpt', 'Space Station (PuP-Pack)', 'Space_Station_PUP.fpt', 'Jaws PE.fpt'])
    assert.equal(looksLikePupTable(name), true, name);
  for (const name of ['Pepper Pinball.fpt', 'Puppet Master', 'Superman (Original 2019)', 'Speakeasy.fpt', 'Rocky.fpt'])
    assert.equal(looksLikePupTable(name), false, name);
});
