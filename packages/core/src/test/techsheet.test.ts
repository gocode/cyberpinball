import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as zlib from 'node:zlib';
import { edidMaxRefresh } from '../edid';
import { healthLines, type HealthFacts } from '../health';
import { setLanguage } from '../i18n';
import {
  anonymizer,
  buildReport,
  journalErrors,
  journalSince,
  nvidiaDriverVersion,
  parseTechProbe,
  pcHealthFacts,
  pcLines,
  refreshGap,
  REPORT_SHORT_MAX,
  reportMailto,
  techBlocks,
  type TechDisplay,
  type TechFacts,
} from '../techsheet';

setLanguage('fr');

/** Sortie de PowerShell telle que la donne un vrai poste (relevé du 11/11/2026, matériel inventé). */
const RAW = {
  cpu: [{ name: 'Intel(R) Core(TM) i7-10700K CPU @ 3.80GHz', cores: 8, threads: 16, mhz: 3801 }],
  mem: { total: 34359738368, free: 22000000000, modules: [{ capacity: 17179869184, speed: 3200 }, { capacity: 17179869184, speed: 3200 }] },
  gpu: [
    { name: 'Microsoft Basic Display Adapter', driver: '10.0.26100.1', driverDate: '2006-06-21T00:00:00.0000000+02:00' },
    { name: 'NVIDIA GeForce RTX 3060 Ti', driver: '32.0.15.6636', driverDate: '2024-12-05T00:00:00.0000000+01:00', memory: 8589934592 },
  ],
  board: { maker: 'ASUSTeK COMPUTER INC.', model: 'ROG STRIX Z490-F GAMING', bios: '2601', biosDate: '2023-06-14T00:00:00' },
  os: { name: 'Microsoft Windows 11 Pro', build: '26100', release: '24H2', ubr: 2605, boot: '2026-11-10T08:00:00' },
  disks: [
    { root: 'C:\\', size: 500e9, free: 112e9, model: 'Samsung SSD 970 EVO 500GB', bus: '17', media: '4' },
    { root: 'D:\\', label: 'Tables', size: 2e12, free: 6.8e9, model: 'CT2000MX500SSD1', bus: 'SATA', media: 'SSD' },
  ],
  net: [{ name: 'Ethernet', desc: 'Intel(R) Ethernet Connection I219-V', bps: 1e9, media: '802.3' }],
  reboot: true,
  power: { guid: '381B4222-F694-41F0-9685-FF5BB260DF2E', name: 'Utilisation normale', sleep: 1800, screen: 600 },
  gameMode: null,
  hags: 2,
  toast: 0,
  av: ['Windows Defender', 'Windows Defender'],
  culture: 'fr-FR',
  keyboard: '040C:0000040C',
};

const PLAYFIELD: TechDisplay = { role: 'playfield', name: 'XG43UQ', inches: 43, width: 3840, height: 2160, hz: 60, offeredMaxHz: 60, edidMaxHz: 144, connection: 'hdmi', scale: 1, rotation: 90, primary: true };

function facts(): TechFacts {
  const { pc, windows } = parseTechProbe(RAW);
  return {
    at: '2026-11-11T13:32:00.000Z',
    pc,
    windows,
    displays: [PLAYFIELD, { role: 'backglass', name: 'S32BM70', width: 3840, height: 2160, hz: 60, offeredMaxHz: 60, connection: 'displayport', rotation: 0, primary: false }],
    configuration: { name: 'Écrans du salon', found: 2, total: 2 },
    controllers: { pinscape: true, buttons: 14, plunger: 'mjrnet Pinscape Controller', dof: ['Pinscape'] },
    software: { vpx: { version: '10.8.1', known: '10.8.2' }, plugins: [{ id: 'PinMAME', name: 'PinMAME', enabled: true }, { id: 'Serum', name: 'Serum', enabled: false }, { id: 'WMP', name: 'WMP', enabled: true }] },
    app: { version: '0.1.9-essai.64', mode: 'cabinet', tables: 212, ready: 207, data: 'D:\\Profils\\bruno\\AppData\\Roaming\\CyberPinball', errors: 2, language: 'Français', friends: 'connected', phones: 1 },
  };
}

test('fiche : la sortie de PowerShell est lue sans rien supposer', () => {
  const { pc, windows } = parseTechProbe(RAW);
  assert.equal(pc.cpu?.name, 'Intel(R) Core(TM) i7-10700K CPU @ 3.80GHz');
  assert.equal(pc.memory?.modules, 2);
  // L'adaptateur d'affichage de base n'est pas une carte graphique ; le pilote NVIDIA prend son nom NVIDIA.
  assert.deepEqual(pc.gpus?.map((g) => [g.name, g.driver]), [['NVIDIA GeForce RTX 3060 Ti', '566.36']]);
  assert.deepEqual(pc.disks?.map((d) => d.kind), ['nvme', 'ssd']);
  assert.equal(pc.network?.[0]?.wifi, false);
  assert.equal(windows.name, 'Windows 11 Pro');
  assert.equal(windows.build, '26100.2605');
  assert.equal(windows.rebootPending, true);
  assert.deepEqual(windows.power, { scheme: 'balanced', name: 'Utilisation normale', sleepMinutes: 30, screenMinutes: 10 });
  // Absent du registre : la valeur par défaut de Windows 11 (mode Jeu actif).
  assert.equal(windows.gameMode, true);
  assert.equal(windows.gpuScheduling, true);
  assert.equal(windows.notifications, false);
  assert.deepEqual(windows.antivirus, ['Windows Defender']);
  assert.equal(windows.keyboard, 'AZERTY (France)');
  // Un relevé vide ou illisible ne casse rien et n'affirme rien.
  assert.deepEqual(parseTechProbe(undefined), { pc: {}, windows: {} });
  assert.deepEqual(parseTechProbe('pas du JSON'), { pc: {}, windows: {} });
});

test('fiche : version d’un pilote NVIDIA', () => {
  assert.equal(nvidiaDriverVersion('32.0.15.6636'), '566.36');
  assert.equal(nvidiaDriverVersion('31.0.15.5222'), '552.22');
  assert.equal(nvidiaDriverVersion('32.0.15.8092'), '580.92');
  assert.equal(nvidiaDriverVersion('11.5'), undefined);
});

test('fiche : fréquence des écrans, sans affirmer ce qui n’est pas établi', () => {
  // Windows propose plus : le dire, c'est sûr.
  assert.deepEqual(refreshGap({ ...PLAYFIELD, offeredMaxHz: 144 }), { kind: 'windows', max: 144 });
  // L'écran annonce plus, Windows ne le propose pas : le lien est à vérifier.
  assert.deepEqual(refreshGap(PLAYFIELD), { kind: 'link', max: 144 });
  // Déjà au plus haut, ou à un hertz près (59,94 Hz) : rien.
  assert.equal(refreshGap({ ...PLAYFIELD, hz: 144, offeredMaxHz: 144 }), undefined);
  assert.equal(refreshGap({ ...PLAYFIELD, hz: 60, offeredMaxHz: 60, edidMaxHz: 61 }), undefined);
  assert.equal(refreshGap({ ...PLAYFIELD, hz: undefined }), undefined);
  const lines = pcLines(pcHealthFacts(facts()), Date.parse('2026-11-11'));
  const screen = lines.find((l) => l.target.kind === 'sheet' && l.target.block === 'displays')!;
  assert.equal(screen.state, 'check');
  assert.match(screen.title, /Playfield à 60 Hz, il annonce jusqu’à 144 Hz/);
  assert.match(screen.detail!, /HDMI/);
  assert.doesNotMatch(screen.detail!, /bride/);
});

test('fiche : contrôles du PC pour la santé, chacun vers son bloc', () => {
  const now = Date.parse('2026-11-11');
  const lines = pcLines(pcHealthFacts(facts()), now);
  assert.ok(lines.every((l) => l.check === 'pc' && l.target.kind === 'sheet'));
  assert.deepEqual(
    lines.map((l) => [l.state, l.title]),
    [
      ['check', 'Playfield à 60 Hz, il annonce jusqu’à 144 Hz'],
      ['check', 'Redémarrage de Windows en attente'],
      ['ok', 'Alimentation : Utilisation normale'],
      ['ok', 'Pilote graphique du 05/12/2024'],
    ],
  );
  // Économie d'énergie, pilote de plus de deux ans, moins de 8 Go : à vérifier.
  const old = pcLines({ displays: [], power: { scheme: 'saver' }, gpus: [{ name: 'GTX 970', driverDate: '2022-01-10T00:00:00.000Z' }], memory: 4 * 1024 ** 3 }, now);
  assert.deepEqual(old.map((l) => l.state), ['check', 'check', 'check']);
  // La santé place le groupe juste après l'espace disque.
  const health: HealthFacts = { at: '2026-11-11T13:30:00Z', disks: [], pc: pcHealthFacts(facts()), vpx: { installed: '10.8.1' } };
  assert.equal(healthLines(health)[0]!.check, 'pc');
});

test('fiche : six blocs, l’état de chacun écrit, les points à vérifier dans le résumé', () => {
  const blocks = techBlocks(facts(), Date.parse('2026-11-11'));
  assert.deepEqual(blocks.map((b) => b.id), ['pc', 'windows', 'displays', 'controllers', 'software', 'app']);
  assert.deepEqual(blocks.map((b) => b.state), ['check', 'check', 'check', 'ok', 'ok', 'ok']);
  const pc = blocks[0]!;
  // Disques d'abord : l'alerte en haut, près de son action.
  assert.equal(pc.sections[0]!.title, 'Disques');
  assert.match(pc.summary, /i7-10700K/);
  assert.match(pc.summary, /disque presque plein/);
  assert.equal(pc.summary.split(' · ')[0], 'Core i7-10700K');
  // Le playfield n'est pas dit deux fois : sa note suit le nombre d'écrans.
  assert.equal(blocks[2]!.summary, '2 écrans branchés · playfield à 60 Hz, il annonce jusqu’à 144 Hz');
  // Une mise à jour facultative de VPX n'est pas une panne.
  const vpx = blocks[4]!.sections[0]!.rows[0]!;
  assert.equal(vpx.state, 'info');
  // Un relevé vide : chaque bloc dit « Non relevé », rien n'est affirmé.
  const empty = techBlocks({ at: '2026-11-11T13:32:00.000Z' });
  assert.ok(empty.every((b) => b.sections.flatMap((s) => s.rows).some((r) => r.state === 'quiet' || r.state === 'blocking')));
});

test('fiche : anonymisation du rapport', () => {
  const hide = anonymizer({ user: 'bruno', profile: 'D:\\Profils\\bruno', computer: 'SALON-PC', names: ['Léa Martin', 'Thomas'] });
  assert.equal(hide('D:\\Profils\\bruno\\AppData\\Roaming\\CyberPinball'), 'D:\\Profils\\‹utilisateur›\\AppData\\Roaming\\CyberPinball');
  assert.equal(hide('"D:\\\\Profils\\\\bruno\\\\x"'), '"D:\\\\Profils\\\\‹utilisateur›\\\\x"');
  assert.equal(hide('D:/Profils/bruno/x'), 'D:/Profils/‹utilisateur›/x');
  assert.equal(hide('Compte bruno sur SALON-PC'), 'Compte ‹utilisateur› sur ‹PC›');
  assert.equal(hide('Partie avec Léa Martin et Thomas'), 'Partie avec ‹ami 1› et ‹ami 2›');
  // Un mot qui contient un nom n'est pas touché.
  assert.equal(hide('Thomasson'), 'Thomasson');
  assert.equal(hide('écrire à lea@example.com'), 'écrire à ‹adresse e-mail›');
  assert.equal(hide('pair 192.168.1.20:53000 et fe80::1c2b:3a4d'), 'pair ‹adresse IP›:53000 et ‹adresse IP›');
  // Versions, pilotes et heures restent lisibles.
  assert.equal(hide('VPX 10.8.1.5436, pilote 32.0.15.6636 à 14:32:05'), 'VPX 10.8.1.5436, pilote 32.0.15.6636 à 14:32:05');
});

test('fiche : le rapport, un ZIP anonymisé et ses résumés', () => {
  const f = facts();
  const lines = pcLines(pcHealthFacts(f), Date.parse('2026-11-11'));
  const report = buildReport({
    facts: f,
    health: lines,
    description: 'Le DMD reste noir sur Attack from Mars depuis hier.',
    attachments: [{ name: 'journal.txt', text: '2026-11-11T09:00:00.000Z [erreur] D:\\Profils\\bruno\\tables : 192.168.1.20 injoignable', about: 'journal' }],
    healthJson: { at: 'x' },
    secrets: { user: 'bruno', profile: 'D:\\Profils\\bruno', computer: 'SALON-PC', names: [] },
    now: new Date(2026, 10, 11, 14, 33),
  });
  assert.equal(report.name, 'rapport-borne-2026-11-11.zip');
  assert.deepEqual(report.files.map((x) => x.name), ['rapport.html', 'probleme.txt', 'resume.txt', 'sante.json', 'fiche.json', 'journal.txt']);
  // Chaque fichier se relit dans le ZIP, et aucun ne garde le compte, le PC ou une adresse.
  const zip = report.zip;
  let p = 0;
  const texts: Record<string, string> = {};
  while (zip.readUInt32LE(p) === 0x04034b50) {
    const method = zip.readUInt16LE(p + 8);
    const size = zip.readUInt32LE(p + 18);
    const nameLength = zip.readUInt16LE(p + 26);
    const name = zip.subarray(p + 30, p + 30 + nameLength).toString('utf8');
    const body = zip.subarray(p + 30 + nameLength, p + 30 + nameLength + size);
    texts[name] = (method === 8 ? zlib.inflateRawSync(body) : body).toString('utf8');
    p += 30 + nameLength + size;
  }
  assert.deepEqual(Object.keys(texts), report.files.map((x) => x.name));
  for (const [name, text] of Object.entries(texts)) {
    assert.doesNotMatch(text, /bruno|SALON-PC|192\.168\.1\.20/, name);
  }
  assert.match(texts['journal.txt']!, /D:\\Profils\\‹utilisateur›\\tables : ‹adresse IP› injoignable/);
  assert.match(texts['rapport.html']!, /<!doctype html>/);
  assert.match(texts['rapport.html']!, /Le DMD reste noir/);
  assert.doesNotMatch(texts['rapport.html']!, /<script|https?:\/\//);
  assert.match(report.summary, /^Rapport de la borne · Cyber Pinball 0\.1\.9-essai\.64/);
  assert.match(report.summary, /! Redémarrage de Windows en attente/);
  // Le résumé court tient dans un message de la messagerie, les points à voir d'abord.
  assert.ok([...report.short].length <= REPORT_SHORT_MAX);
  assert.match(report.short.split('\n')[1]!, /^! Playfield/);
  const mail = reportMailto(report.summary, report.name);
  assert.match(mail, /^mailto:\?subject=/);
  assert.ok(mail.length < 6000);
});

test('fiche : journal des 7 derniers jours, erreurs depuis hier', () => {
  const text = [
    '2026-11-01T10:00:00.000Z vieux',
    '2026-11-10T10:00:00.000Z [erreur] avant-hier',
    '    suite de l’erreur',
    '2026-11-11T09:00:00.000Z [erreur] hier',
    '2026-11-11T10:00:00.000Z récent',
  ].join('\n');
  assert.equal(journalSince(text, Date.parse('2026-11-05')), text.split('\n').slice(1).join('\n'));
  assert.equal(journalErrors(text, Date.parse('2026-11-10T12:00:00Z')), 1);
});

test('fiche : fréquence la plus haute annoncée par l’EDID', () => {
  const bytes = new Uint8Array(128);
  bytes.set([0x00, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0x00]);
  // Descripteur « limites de balayage » en 72 : 48 à 144 Hz.
  bytes.set([0, 0, 0, 0xfd, 0, 48, 144, 30, 160], 72);
  assert.equal(edidMaxRefresh(bytes), 144);
  // Écran rapide : +255 Hz (octet 4, bit 1).
  bytes[76] = 0x02;
  bytes[78] = 5;
  assert.equal(edidMaxRefresh(bytes), 260);
  assert.equal(edidMaxRefresh(new Uint8Array(128)), undefined);
});
