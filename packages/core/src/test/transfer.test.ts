import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatSize } from '../fileops';
import { setLanguage } from '../i18n';
import * as vm from 'node:vm';
import { parseHTML } from 'linkedom';
import { createTransferMeter, expectedSizeFromPage, formatRate, formatRemaining, formatTransfer, PAGE_SIZE_PROBE, parseShownSize, transferPercent, type PageSizeHint } from '../transfer';

const MB = 1024 ** 2;

test('transfert : volume, débit et temps restant en une ligne', () => {
  setLanguage('fr');
  assert.equal(formatTransfer({ received: 48.2 * MB, total: 312 * MB, rate: 3.1 * MB, remaining: 85 }), '48,2 Mo sur 312 Mo · 3,1 Mo/s · environ 1 min');
  // Taille inconnue : volume et débit, ni total ni temps restant.
  assert.equal(formatTransfer({ received: 48.2 * MB, rate: 3.1 * MB }), '48,2 Mo reçus, taille non annoncée · 3,1 Mo/s');
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

test('taille approchée : lue sur la page du site quand la réponse ne la donne pas', () => {
  setLanguage('fr');
  // « environ », un pourcentage, jamais 100 % avant la fin.
  const p = { received: 48.2 * MB, total: 312 * MB, approx: true, rate: 3.1 * MB, remaining: 85 };
  assert.equal(formatTransfer(p), '48,2 Mo sur environ 312 Mo · 3,1 Mo/s · environ 1 min');
  assert.equal(formatTransfer(p, true), '15 % · 48,2 Mo sur environ 312 Mo · 3,1 Mo/s · environ 1 min');
  assert.equal(transferPercent({ received: 312 * MB, total: 312 * MB, approx: true }), 99);
  assert.equal(transferPercent({ received: 312 * MB, total: 312 * MB }), 100);
  // Le compteur garde « approx » ; dépassée de plus de 3 %, la taille approchée est abandonnée.
  const meter = createTransferMeter(0);
  assert.deepEqual(meter.update(10 * MB, 100 * MB, 0, true), { received: 10 * MB, total: 100 * MB, approx: true });
  assert.equal(meter.update(104 * MB, 100 * MB, 500, true).total, undefined);
  setLanguage('en');
  assert.equal(formatTransfer({ received: 48.2 * MB, total: 312 * MB, approx: true }), '48.2 MB of about 312 MB');
  assert.equal(formatTransfer({ received: 48.2 * MB }), '48.2 MB received, size not announced');
  setLanguage('fr');
});

test('taille affichée sur la page : lue, rapprochée du fichier téléchargé', () => {
  assert.equal(parseShownSize('212.6 MB'), Math.round(212.6 * MB));
  assert.equal(parseShownSize('40,81 Mo'), Math.round(40.81 * MB));
  assert.equal(parseShownSize('40.81MB'), Math.round(40.81 * MB));
  assert.equal(parseShownSize('1 234 KB'), 1234 * 1024);
  assert.equal(parseShownSize('1.2 GB'), Math.round(1.2 * 1024 * MB));
  assert.equal(parseShownSize('12 tables'), undefined);
  // Fiche à un fichier (vpuniverse : « Size », vpforums : « File Size ») : le libellé suffit.
  assert.equal(expectedSizeFromPage([{ size: '48.13 MB', context: 'Size 48.13 MB' }], 'mm.zip'), Math.round(48.13 * MB));
  assert.equal(expectedSizeFromPage([{ size: '40.81 MB', context: 'File Size: 40.81 MB' }, { size: '2 KB', context: 'avatar.png 2 KB uploaded' }], 'mm.zip'), Math.round(40.81 * MB));
  // Plusieurs fichiers : celui dont le nom est à côté.
  const several = [
    { size: '212.6 MB', context: 'Medieval Madness VPW 2.0.zip 212.6 MB Download' },
    { size: '4.2 MB', context: 'Medieval Madness.directb2s 4.2 MB Download' },
    { size: '216.8 MB', context: 'Size 216.8 MB' },
  ];
  assert.equal(expectedSizeFromPage(several, 'Medieval Madness.directb2s'), Math.round(4.2 * MB));
  assert.equal(expectedSizeFromPage(several, 'Medieval Madness VPW 2.0.zip'), Math.round(212.6 * MB));
  // « taille » ailleurs dans la phrase d'un autre fichier : ce n'est pas un libellé.
  assert.equal(expectedSizeFromPage([{ size: '24 Mo', context: 'Table simulée (24 Mo, taille connue) Médias (taille inconnue)' }], 'Medias-sans-taille.zip'), undefined);
  // Deux tailles libellées, aucun nom : on ne devine pas.
  assert.equal(expectedSizeFromPage([{ size: '1 MB', context: 'Size 1 MB' }, { size: '2 MB', context: 'Size 2 MB' }], 'x.zip'), undefined);
  assert.equal(expectedSizeFromPage([], 'x.zip'), undefined);
});

test('taille affichée sur la page : le script de page, sur une fiche vpuniverse et une fiche vpforums', () => {
  const run = (html: string) => {
    const { document } = parseHTML(html);
    return JSON.parse(JSON.stringify(vm.runInNewContext(PAGE_SIZE_PROBE, { document }))) as PageSizeHint[];
  };
  // Fiche Invision (vpuniverse) : barre latérale « Size », et la fenêtre « Download » qui liste les fichiers.
  const ips = run(`<html><body><div class="ipsLayout"><h1>Medieval Madness (Williams 1997)</h1>
    <ul class="ipsDataList"><li class="ipsDataItem"><span class="ipsDataItem_generic"><strong>Views</strong></span><span class="ipsDataItem_generic">12 345</span></li>
    <li class="ipsDataItem"><span class="ipsDataItem_generic"><strong>Size</strong></span><span class="ipsDataItem_generic cFileInfoData">216.8 MB</span></li></ul>
    <ul><li class="ipsDataItem"><div class="ipsDataItem_main"><h4>Medieval Madness VPW 2.0.zip</h4><p class="ipsDataItem_meta">212.6 MB</p></div><a href="?do=download&r=1">Download</a></li>
    <li class="ipsDataItem"><div class="ipsDataItem_main"><h4>Medieval Madness.directb2s</h4><p class="ipsDataItem_meta">4.2 MB</p></div><a href="?do=download&r=2">Download</a></li></ul>
    <script>var big = "999 MB";</script></div></body></html>`);
  assert.equal(expectedSizeFromPage(ips, 'Medieval Madness.directb2s'), Math.round(4.2 * MB));
  assert.equal(expectedSizeFromPage(ips, 'Medieval Madness VPW 2.0.zip'), Math.round(212.6 * MB));
  assert.ok(!ips.some((h) => h.size.startsWith('999')), 'les scripts de la page ne comptent pas');
  // Fiche IP.Downloads (vpforums) : tableau « File Size ».
  const ipb = run(`<html><body><table class="ipb_table"><tr><td>Submitter</td><td>membre</td></tr><tr><td>Submitted</td><td>Oct 20 2026</td></tr>
    <tr><td>File Size</td><td>40.81MB</td></tr><tr><td>Downloads</td><td>1,234</td></tr></table><a class="download_button">Download</a></body></html>`);
  assert.equal(expectedSizeFromPage(ipb, 't2_l8.zip'), Math.round(40.81 * MB));
});
