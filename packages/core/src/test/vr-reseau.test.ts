// Réseau du casque (diagnostic du 11 novembre 2026 sur la borne : VPX à 68-72 images/s, Link perdant 7 à
// 37 % des images en Air Link, le PC lui-même en Wi-Fi).

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import { airLinkOverWifi, fluidityVerdict, linkMinutesBetween, linkNetworkSummary, linkTransport, parsePcNetwork, PC_NETWORK_COMMAND } from '../vr-reseau';

const repo = path.join(__dirname, '..', '..', '..', '..');
const read = (...p: string[]) => fs.readFileSync(path.join(repo, ...p), 'utf8').replace(/\r\n/g, '\n');

/** Une minute de Link comme Oculus l'écrit (PerfLog) ; `air` : avec le Wi-Fi du casque. */
function minute(at: number, o: { presented: number; lost: number; glitches: number; bitrate: number; goodput: number; rtt99: number; air: boolean }): string {
  return `{ "timestamp_epoch": ${at}, "event": "oculus_pc_xrs_stats_event", "transmission_type": "${o.air ? 'TCP' : 'USB'}", "num_pc_presented_frames": "${o.presented}", "lost_pc_presented_frames": "${o.lost}", "num_glitches": "${o.glitches}", "dynamic_bitrate_mbps_p50": "${o.bitrate}", "total_network_video_goodput_Mbps": "${o.goodput}", "network_rtt_ms_p99": "${o.rtt99}", "fps": "72"${o.air ? ', "wifi_rssi_p50": "-32", "wifi_tx_link_speed_mbps_p50": "1200"' : ''} }`;
}

test('Link : transport relevé (Air Link par le Wi-Fi du casque), minutes enrichies, bilan en pourcentage', () => {
  const log = `[${minute(1000, { presented: 4310, lost: 1590, glitches: 251, bitrate: 27, goodput: 17.4, rtt99: 894, air: true })},${minute(1060, { presented: 4310, lost: 298, glitches: 142, bitrate: 31, goodput: 28, rtt99: 23.8, air: true })}]`;
  assert.equal(linkTransport(log), 'air');
  assert.equal(linkTransport(minute(1, { presented: 4320, lost: 0, glitches: 0, bitrate: 200, goodput: 150, rtt99: 3, air: false })), 'cable');
  assert.equal(linkTransport(''), undefined);
  const rows = linkMinutesBetween(log, 990, 1100);
  assert.equal(rows.length, 2);
  const sum = linkNetworkSummary(rows)!;
  assert.ok(Math.abs(sum.lostShare - (1590 + 298) / 8620) < 1e-9);
  assert.equal(sum.glitchesPerMinute, 196.5);
  assert.equal(sum.bitrate, 29);
  assert.equal(sum.worstRttP99, 894);
  assert.equal(sum.transport, 'air');
});

test('verdict : réseau en cause quand Link perd des images alors que VPX tient sa cadence', () => {
  const air = linkNetworkSummary(linkMinutesBetween(minute(1000, { presented: 4310, lost: 1590, glitches: 251, bitrate: 27, goodput: 17, rtt99: 894, air: true }), 0, 2000))!;
  assert.equal(fluidityVerdict(air, 70.5), 'network');
  assert.equal(fluidityVerdict(air, 12), 'both');
  const clean = linkNetworkSummary(linkMinutesBetween(minute(1000, { presented: 4320, lost: 10, glitches: 2, bitrate: 150, goodput: 120, rtt99: 6, air: true }), 0, 2000))!;
  assert.equal(fluidityVerdict(clean, 70.5), 'ok');
  // Le portable du 10 novembre : VPX à 12 images/s, le rendu en cause.
  assert.equal(fluidityVerdict(clean, 12), 'render');
  assert.equal(fluidityVerdict(undefined, 70), undefined);
});

test('PC en Wi-Fi : reconnu par le support physique de la carte de la route par défaut, quelle que soit la marque', () => {
  assert.deepEqual(parsePcNetwork('{"Name":"Wi-Fi","InterfaceDescription":"Intel(R) Wireless-AC 9560 160MHz","PhysicalMediaType":"Native 802.11","NdisPhysicalMedium":9}'), { adapter: 'Intel(R) Wireless-AC 9560 160MHz', wireless: true });
  assert.deepEqual(parsePcNetwork('{"Name":"WLAN","InterfaceDescription":"Realtek 8852BE","PhysicalMediaType":"Unspecified","NdisPhysicalMedium":1}')?.wireless, true);
  assert.deepEqual(parsePcNetwork('{"Name":"Ethernet","InterfaceDescription":"Intel(R) Ethernet Connection (7) I219-V","PhysicalMediaType":"802.3","NdisPhysicalMedium":14}'), { adapter: 'Intel(R) Ethernet Connection (7) I219-V', wireless: false });
  assert.equal(parsePcNetwork(''), undefined);
  assert.match(PC_NETWORK_COMMAND, /Get-NetRoute -DestinationPrefix '0\.0\.0\.0\/0'/);
  assert.equal(airLinkOverWifi('air', { adapter: 'x', wireless: true }), true);
  assert.equal(airLinkOverWifi('cable', { adapter: 'x', wireless: true }), false);
  assert.equal(airLinkOverWifi('air', { adapter: 'x', wireless: false }), false);
  assert.equal(airLinkOverWifi(undefined, { adapter: 'x', wireless: true }), false);
});

test('casque : l’avertissement donné une fois par session, sur la carte du chargement, et le verdict au journal', () => {
  const frontend = read('app', 'src', 'frontend.ts');
  assert.match(frontend, /if \(vrGame && headset\?\.inUse && !airLinkWarned && airLinkOverWifi\(linkMode, pcNetwork\)\) \{\s*airLinkWarned = true;/);
  // Session du casque : remise à zéro casque retiré au menu, jamais pendant une partie.
  assert.match(frontend, /if \(!headset\?\.worn && headsetWornBefore && !playing && !launch\) airLinkWarned = false;/);
  // La carte réseau relevée sans fenêtre.
  assert.match(frontend, /execFile\('powershell\.exe', \['-NoProfile', '-NonInteractive', '-Command', PC_NETWORK_COMMAND\], \{ windowsHide: true/);
  assert.match(frontend, /Casque, verdict : réseau en cause/);
  assert.match(read('app', 'renderer', 'frontend.js'), /if \(!prompt && s\.headsetNote\) card\.append\(el\('p', 'headset-prompt-problem', s\.headsetNote\)\);/);
});
