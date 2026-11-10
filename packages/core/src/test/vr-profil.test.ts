// Profil graphique de VPX pour le casque selon la machine, et relevé des statistiques de Link
// (essai du 10 novembre 2026 : VPX saccadait, réglages graphiques de la VR tous au défaut).

import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import { linkStatsBetween, linkStatsSummary, vrGraphicsProfile, vrProfileSettings, VR_PROFILE_VRAM_MB } from '../vr-profil';

const repo = path.join(__dirname, '..', '..', '..', '..');
const read = (...p: string[]) => fs.readFileSync(path.join(repo, ...p), 'utf8');

test('profil VR : choisi sur la mémoire vidéo et la batterie, jamais sur un nom ; inconnu : prudent', () => {
  // Le portable de développement (8 Go, sur batterie) et la borne (11 Go, de bureau).
  assert.equal(vrGraphicsProfile({ vramMb: 8192, laptop: true, name: 'NVIDIA Quadro RTX 4000' }).id, 'standard');
  assert.equal(vrGraphicsProfile({ vramMb: 11264, laptop: false, name: 'NVIDIA GeForce RTX 2080 Ti' }).id, 'puissant');
  // Le nom ne compte pas : la même carte sous un autre nom, le même profil.
  assert.equal(vrGraphicsProfile({ vramMb: 11264, laptop: false, name: 'carte inconnue' }).id, 'puissant');
  // Un portable à grosse mémoire reste standard ; une petite carte, ou rien de connu : prudent.
  assert.equal(vrGraphicsProfile({ vramMb: 16384, laptop: true, name: '' }).id, 'standard');
  assert.equal(vrGraphicsProfile({ vramMb: 4096, laptop: false, name: '' }).id, 'prudent');
  assert.equal(vrGraphicsProfile({ vramMb: 0, laptop: false, name: '' }).id, 'prudent');
  assert.equal(vrGraphicsProfile(undefined).id, 'prudent');
  assert.equal(vrGraphicsProfile({ vramMb: VR_PROFILE_VRAM_MB.standard - 1, laptop: false, name: '' }).id, 'prudent');
  assert.match(vrGraphicsProfile(undefined).why, /inconnue/);
});

test('profil VR : réglages de VPX valides, du plus léger au plus net, jamais ResFactor', () => {
  const get = (id: Parameters<typeof vrProfileSettings>[0], key: string) => vrProfileSettings(id).find((s) => s.key === key)?.value;
  for (const id of ['prudent', 'standard', 'puissant'] as const) {
    const settings = vrProfileSettings(id);
    assert.ok(settings.every((s) => s.section === 'Player'), id);
    // ResFactor sans effet dans VPX 10.8.1 (VRDevice::SetupHMD) : jamais écrit.
    assert.ok(!settings.some((s) => s.key === 'ResFactor'), id);
    // Bornes de VPX (Settings_properties.inl) : AAFactor 0,5 à 2, MSAASamples 0 à 3, FXAA 0 à 7, PFReflection 0 à 5.
    const aa = Number(get(id, 'AAFactor'));
    assert.ok(aa >= 0.5 && aa <= 2, id);
    assert.ok(['0', '1', '2', '3'].includes(get(id, 'MSAASamples')!) && Number(get(id, 'FXAA')) <= 7 && Number(get(id, 'PFReflection')) <= 5, id);
    assert.equal(new Set(settings.map((s) => s.key)).size, settings.length, `${id} : une clé une fois`);
  }
  // Prudent et standard : ni occlusion ambiante ni bloom ; puissant : plus net, bloom gardé.
  assert.equal(get('standard', 'DisableAO'), '1');
  assert.equal(get('standard', 'ForceBloomOff'), '1');
  assert.ok(Number(get('puissant', 'AAFactor')) > Number(get('standard', 'AAFactor')));
  assert.equal(get('puissant', 'ForceBloomOff'), '0');
  assert.ok(Number(get('prudent', 'PFReflection')) < Number(get('standard', 'PFReflection')));
});

test('relevé de Link : les minutes de la partie, lues dans un journal de performance tronqué', () => {
  // Extrait de la partie du 10 novembre 2026 (14:39 à 14:42), avec une minute avant et une après.
  const block = (at: number, presented: number, lost: number, stale: number) =>
    `{\n  "timestamp_epoch": ${at},\n  "event": "oculus_pc_xrs_stats_event",\n  "encode_width": "2304",\n  "encode_height": "1216",\n  "num_pc_presented_frames": "${presented}",\n  "num_completed_app_frames": "0",\n  "lost_pc_presented_frames": "${lost}",\n  "num_pc_reprojected_frames_greater_than_5": "${stale}"\n}`;
  const text = `[${[block(1794321532.5, 4074, 86, 110), block(1794321592.5, 4306, 90, 198), block(1794321652.5, 4310, 105, 693), block(1794321712.5, 4310, 69, 733), block(1794321900, 4310, 1, 1)].join(',\n')},\n{ "event": "oculus_app_stats", "x": "\u0001`;
  const rows = linkStatsBetween(text, 1794321578, 1794321736);
  assert.deepEqual(rows.map((r) => r.stale), [198, 693, 733]);
  assert.equal(rows[0]!.encode, '2304×1216');
  assert.deepEqual(linkStatsSummary(rows), { minutes: 3, presented: 4309, lost: 88, stale: 541, worstStale: 733 });
  assert.equal(linkStatsSummary([]), undefined);
});

test('branchements : carte dite par le compagnon, profil dans les clés vides, relevé en fin de partie', () => {
  const cpp = read('packages', 'casque-vr', 'src', 'casque.cpp');
  assert.match(cpp, /say\("carte " \+ std::to_string\(d\.DedicatedVideoMemory \/ \(1024 \* 1024\)\) \+ \(battery \? " batterie " : " secteur "\) \+ name\);/);
  const menu = read('app', 'src', 'casque.ts');
  assert.match(menu, /const card = \/\^carte \(\\d\+\) \(batterie\|secteur\) \(\.\*\)\$\/\.exec\(line\);/);
  const frontend = read('app', 'src', 'frontend.ts');
  assert.match(frontend, /const missing = vrProfileSettings\(id\)\.filter\(\(s\) => !doc\.get\(s\.section, s\.key\)\?\.trim\(\)\);/);
  assert.match(frontend, /vrProfileApplied = applyVrProfile\(vr\.ini, details\);/);
  assert.match(frontend, /if \(playedVr && vrGame && vrGameStart\) noteLinkStats\(vrGameStart, Date\.now\(\)\);/);
  assert.match(frontend, /Link, bilan de la partie \(profil VR \$\{vrProfileApplied \?\? 'inconnu'\}\)/);
});
