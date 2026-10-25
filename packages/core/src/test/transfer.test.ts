import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatSize } from '../fileops';
import { setLanguage } from '../i18n';
import { createTransferMeter, formatRate, formatRemaining, formatTransfer, transferPercent } from '../transfer';

const MB = 1024 ** 2;

test('transfert : volume, débit et temps restant en une ligne', () => {
  setLanguage('fr');
  assert.equal(formatTransfer({ received: 48.2 * MB, total: 312 * MB, rate: 3.1 * MB, remaining: 85 }), '48,2 Mo sur 312 Mo · 3,1 Mo/s · environ 1 min');
  // Taille inconnue : volume et débit, ni total ni temps restant.
  assert.equal(formatTransfer({ received: 48.2 * MB, rate: 3.1 * MB }), '48,2 Mo · 3,1 Mo/s');
  // Débit pas encore mesuré.
  assert.equal(formatTransfer({ received: 51 * 1024, total: 312 * MB }), '51,0 ko sur 312 Mo');
  setLanguage('en');
  assert.equal(formatTransfer({ received: 48.2 * MB, total: 312 * MB, rate: 3.1 * MB, remaining: 85 }), '48.2 MB of 312 MB · 3.1 MB/s · about 1 min');
  setLanguage('fr');
});

test('transfert : volume fin à une décimale fixe, sans toucher à formatSize ordinaire', () => {
  setLanguage('fr');
  assert.equal(formatSize(48 * MB, true), '48,0 Mo');
  assert.equal(formatSize(48 * MB), '48 Mo');
  assert.equal(formatSize(312 * MB, true), '312 Mo');
  assert.equal(formatSize(1.5 * 1024 * MB, true), '1,5 Go');
  // Jamais quatre chiffres avant l'unité : dès 1000, l'unité au-dessus.
  assert.equal(formatSize(1021 * 1024), '1 Mo');
  assert.equal(formatSize(1021 * 1024, true), '1,0 Mo');
  assert.equal(formatRate(1021 * 1024), '1,0 Mo/s');
  assert.equal(formatSize(999 * 1024), '999 ko');
  assert.equal(formatSize(1010), '1 ko');
  assert.equal(formatSize(999), '999 octets');
});

test('transfert : temps restant arrondi pour ne pas trembler', () => {
  setLanguage('fr');
  assert.equal(formatRemaining(4), 'quelques secondes');
  assert.equal(formatRemaining(23), 'environ 25 s');
  assert.equal(formatRemaining(61), 'environ 1 min');
  assert.equal(formatRemaining(14 * 60 + 40), 'environ 15 min');
  assert.equal(formatRemaining(3590), 'environ 1 h');
  assert.equal(formatRemaining(80 * 60 + 70), 'environ 1 h 20 min');
  assert.equal(formatRemaining(Infinity), undefined);
  assert.equal(formatRemaining(10 * 24 * 3600), undefined);
  assert.equal(formatRate(3.1 * MB), '3,1 Mo/s');
});

test('transfert : pourcentage entier, borné, absent sans taille', () => {
  assert.equal(transferPercent({ received: 0, total: 100 }), 0);
  assert.equal(transferPercent({ received: 999, total: 1000 }), 99);
  assert.equal(transferPercent({ received: 1000, total: 1000 }), 100);
  assert.equal(transferPercent({ received: 5 }), undefined);
  assert.equal(transferPercent({ received: 5, total: 0 }), undefined);
});

test('transfert : débit lissé, dit après une seconde, temps restant au débit lissé', () => {
  const meter = createTransferMeter(0);
  assert.deepEqual(meter.update(0, 100 * MB, 0), { received: 0, total: 100 * MB });
  // Moins d'une seconde mesurée : pas de débit.
  assert.equal(meter.update(0.5 * MB, 100 * MB, 500).rate, undefined);
  // 1 Mo/s régulier pendant 10 s.
  let p = meter.update(1 * MB, 100 * MB, 1000);
  for (let s = 2; s <= 10; s++) p = meter.update(s * MB, 100 * MB, s * 1000);
  assert.ok(Math.abs(p.rate! - MB) < 1, `débit ${p.rate}`);
  assert.ok(Math.abs(p.remaining! - 90) < 0.01, `reste ${p.remaining}`);
  // Une rafale d'un quart de seconde à 8 Mo/s ne fait pas tout basculer.
  p = meter.update(12 * MB, 100 * MB, 10_250);
  assert.ok(p.rate! < 2 * MB, `débit après la rafale ${p.rate}`);
  // Un téléchargement qui cale : le débit baisse.
  const before = p.rate!;
  p = meter.update(12 * MB, 100 * MB, 13_250);
  assert.ok(p.rate! < before / 2, `débit calé ${p.rate}`);
});

test('transfert : taille inconnue, pas de temps restant ; pause, la mesure repart', () => {
  const meter = createTransferMeter(0);
  meter.update(0, undefined, 0);
  const p = meter.update(2 * MB, 0, 2000);
  assert.equal(p.total, undefined);
  assert.equal(p.remaining, undefined);
  assert.ok(p.rate! > 0);
  meter.pause();
  assert.equal(meter.update(3 * MB, undefined, 60_000).rate, undefined);
  assert.equal(meter.update(3.5 * MB, undefined, 60_500).rate, undefined);
  assert.ok(meter.update(4 * MB, undefined, 61_000).rate! > 0);
});
