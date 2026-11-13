// Banc du DMD qui remplit sa fenêtre redimensionnée en partie : lecture du journal du plugin (sans VPX).

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { lireJournal, rempliDansFenetre } from './banc-dmd.mjs';

test('banc du DMD : mesures de la sonde et diffusions lues dans le journal du plugin', () => {
  const journal = [
    'debut suivi=1 sonde=1',
    'diffusion t=0.00 fenetre=512x128 n=1',
    'sonde t=0.05 sortie=512x128 rempli=-1.000 zone=0.000,0.000,0.000,0.000 afficheur=0.0,0.0,0.0,0.0 source=0.0x0.0',
    'sonde t=2.10 sortie=512x128 rempli=1.000 zone=0.000,0.000,1.000,1.000 afficheur=0.0,0.0,128.0,32.0 source=128.0x32.0',
    'taille t=5.40 cadre=768x128 client=512x128 sdl=512x128->768x128 resultat=ok',
    'diffusion t=5.59 fenetre=768x128 n=2',
    'sonde t=5.60 sortie=768x128 rempli=0.999 zone=0.000,0.000,0.999,1.000 afficheur=0.0,0.0,191.9,32.0 source=192.0x32.0',
    'fin diffusions=2 tailles=1',
  ].join('\n');
  const { sondes, diffusions } = lireJournal(journal);
  assert.equal(sondes.length, 3);
  assert.deepEqual(sondes.at(-1), { t: 5.6, width: 768, height: 128, rempli: 0.999 });
  assert.deepEqual(diffusions.map((d) => [d.width, d.height]), [[512, 128], [768, 128]]);
});

test('banc du DMD : la part de la fenêtre posée, quand VPX dessine encore à l’ancienne taille', () => {
  // Suivi éteint : VPX dessine toujours en 512 × 128 dans une fenêtre de 768 × 128, les deux tiers.
  assert.ok(Math.abs(rempliDansFenetre({ width: 512, height: 128, rempli: 1 }, { width: 768, height: 128 }) - 2 / 3) < 1e-9);
  // Fenêtre plus petite que la surface : seule la part visible compte, la fenêtre est pleine.
  assert.equal(rempliDansFenetre({ width: 512, height: 128, rempli: 1 }, { width: 448, height: 128 }), 1);
  // Surface à la bonne taille, mise en page 4:1 gardée dans une fenêtre 6:1.
  assert.equal(rempliDansFenetre({ width: 768, height: 128, rempli: 0.667 }, { width: 768, height: 128 }), 0.667);
  assert.equal(rempliDansFenetre(undefined, { width: 768, height: 128 }), undefined);
  assert.equal(rempliDansFenetre({ width: 512, height: 128, rempli: -1 }, { width: 512, height: 128 }), undefined);
});
