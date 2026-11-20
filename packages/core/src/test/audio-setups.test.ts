import assert from 'node:assert/strict';
import { test } from 'node:test';
import { audioFriendlyName } from '../audio';
import { cardJacks, pluggedButSilentNotices, proposeAudioSetups } from '../audio-setups';
import type { ObservedAudioJack, ObservedAudioOutput } from '../model';
import { devPcDisplays } from './fixtures';

// Configurations proposées avant toute question (rapport du 20/11/2026 : SSF introuvable).

const jack = (channelMapping: number, connected: boolean, geoLocation = 1, presenceDetect?: boolean): ObservedAudioJack => ({ channelMapping, color: 0, geoLocation, connected, ...(presenceDetect !== undefined && { presenceDetect }) });

function output(id: string, deviceDesc: string, interfaceName: string, extra: Partial<ObservedAudioOutput> = {}): ObservedAudioOutput {
  return {
    endpointId: `{0.0.0.00000000}.{${id}}`,
    friendlyName: audioFriendlyName(deviceDesc, interfaceName),
    deviceDesc,
    interfaceName,
    bus: 'HDAUDIO',
    formFactor: 1,
    channels: 2,
    channelMask: 0x3,
    ...extra,
  };
}

/** Écrans du PC de développement : le premier (fronton) et le quatrième (playfield) ont leurs haut-parleurs HDMI. */
function displays() {
  const d = devPcDisplays();
  d[0]!.containerId = '{11111111-0000-0000-0000-00000000000b}';
  d[3]!.containerId = '{11111111-0000-0000-0000-00000000000f}';
  return d;
}
const BG = 0;
const PF = 3;
const bgSpeaker = output('ecran-fronton', 'DARTY TV', 'NVIDIA High Definition Audio', { formFactor: 9, containerId: '{11111111-0000-0000-0000-00000000000B}' });
const pfSpeaker = output('ecran-playfield', 'AndroidTV', 'NVIDIA High Definition Audio', { formFactor: 9, containerId: '{11111111-0000-0000-0000-00000000000F}' });
/** La Realtek du rapport : en stéréo dans Windows, prises verte, noire et grise branchées. */
const realtek = (jacks: ObservedAudioJack[]) => output('realtek', 'Haut-parleurs', 'Realtek High Definition Audio', { jacks });
const FOUR = [jack(0x3, true), jack(0x30, true), jack(0xc, false), jack(0x600, true), jack(0x3, true, 2)];

test('prises : seulement une carte de carte mère qui décrit ses paires arrière ou des côtés', () => {
  assert.deepEqual(cardJacks(realtek(FOUR)), { front: true, rear: true, side: true });
  assert.deepEqual(cardJacks(realtek([jack(0x3, true), jack(0x30, true), jack(0x600, false)])), { front: true, rear: true, side: false });
  assert.equal(cardJacks(realtek([jack(0x3, true)])), undefined, 'une prise combinée de portable ne dit rien du SSF');
  assert.equal(cardJacks({ ...realtek(FOUR), bus: 'USB' }), undefined, 'une carte USB rend souvent des rôles vides');
  assert.equal(cardJacks({ ...realtek(FOUR), formFactor: 3 }), undefined, 'un casque n’a pas d’exciters');
  // La prise casque en façade (même rôle que la verte) n'efface pas une verte du panneau arrière débranchée.
  assert.deepEqual(cardJacks(realtek([jack(0x3, false), jack(0x30, true), jack(0x3, true, 2)])), { front: false, rear: true });
});

test('le cas du rapport : SSF sur la carte en tête, réglage Windows annoncé, prises nommées par leur rôle', () => {
  const setups = proposeAudioSetups({ outputs: [bgSpeaker, pfSpeaker, realtek(FOUR)], displays: displays(), backglassDisplay: BG, playfieldDisplay: PF });
  const [ssf] = setups;
  assert.equal(ssf!.id, 'ssf');
  assert.ok(ssf!.sure);
  assert.equal(ssf!.playfieldMode, 'ssf');
  assert.deepEqual(ssf!.roles, { backglass: realtek(FOUR).endpointId, playfield: realtek(FOUR).endpointId });
  assert.deepEqual(ssf!.expected, { front: 'backglass', rear: 'lockbar', side: 'top' });
  assert.equal(ssf!.needsChannels, 8);
  assert.ok(ssf!.badges.some((b) => b.tone === 'warn' && b.text.includes('7.1')));
  assert.deepEqual(ssf!.schema, { fronton: { source: 'prise verte' }, haut: { source: 'prise grise' }, bas: { source: 'prise noire' } });
  assert.deepEqual(setups.map((s) => s.id), ['ssf', 'screens', 'card-and-screen'], 'trois propositions au plus, « pas à pas » en plus');
});

test('deux exciters : SSF avec deux exciters, en 5.1, la place vide dite', () => {
  const card = realtek([jack(0x3, true), jack(0x30, true), jack(0x600, false)]);
  const [ssf] = proposeAudioSetups({ outputs: [card], displays: displays() });
  assert.equal(ssf!.title, 'SSF avec deux exciters');
  assert.equal(ssf!.needsChannels, 6);
  assert.deepEqual(ssf!.expected, { front: 'backglass', rear: 'lockbar', side: 'none' });
  assert.deepEqual(ssf!.schema.haut, { source: 'prise grise', state: 'absent' });
  // Déjà en 7.1 : le 5.1 est conseillé (en 7.1, VPX partage chaque son avec la prise muette).
  const [ssf71] = proposeAudioSetups({ outputs: [{ ...card, channels: 8, channelMask: 0x63f }], displays: displays() });
  assert.equal(ssf71!.needsChannels, undefined);
  assert.ok(ssf71!.badges.some((b) => b.text.includes('5.1')));
});

test('verte libre : le fronton sur le haut-parleur de son écran, l’avant de la carte n’est pas attendu', () => {
  const card = realtek([jack(0x3, false), jack(0x30, true), jack(0x600, true)]);
  const [ssf] = proposeAudioSetups({ outputs: [bgSpeaker, card], displays: displays(), backglassDisplay: BG });
  assert.equal(ssf!.id, 'ssf-screen');
  assert.equal(ssf!.roles.backglass, bgSpeaker.endpointId);
  assert.equal(ssf!.expected!.front, 'none');
  assert.equal(ssf!.schema.fronton!.source, 'DARTY TV');
});

test('carte USB en 7.1 sans description : proposée, à vérifier par le son, jamais une couleur de prise', () => {
  const usb = output('usb', 'Haut-parleurs', 'Sound Blaster', { bus: 'USB', channels: 8, channelMask: 0x63f, jacks: [jack(0, true, 14)] });
  const [ssf] = proposeAudioSetups({ outputs: [usb], displays: displays() });
  assert.equal(ssf!.id, 'ssf');
  assert.equal(ssf!.sure, false);
  assert.ok(ssf!.badges.some((b) => b.tone === 'info' && b.text.includes('vérifier par le son')));
  assert.deepEqual(ssf!.schema, { fronton: { source: 'sortie avant' }, haut: { source: 'sortie des côtés' }, bas: { source: 'sortie arrière' } });
});

test('rien de sûr : des propositions stéréo simples, pas de SSF inventé', () => {
  const usbStereo = output('usb', 'Haut-parleurs', 'USB Audio Device', { bus: 'USB', jacks: [jack(0, true, 14)] });
  const setups = proposeAudioSetups({ outputs: [bgSpeaker, pfSpeaker, usbStereo], displays: displays(), backglassDisplay: BG, playfieldDisplay: PF });
  assert.ok(!setups.some((s) => s.playfieldMode !== 'stereo'));
  assert.equal(setups[0]!.id, 'screens');
});

test('réglages enregistrés retrouvés : les garder vient en premier', () => {
  const card = realtek(FOUR);
  const setups = proposeAudioSetups({
    outputs: [card],
    displays: displays(),
    previous: { audio: { outputs: [], roles: {}, playfieldMode: 'ssf' }, roles: { backglass: card.endpointId, playfield: card.endpointId } },
  });
  assert.deepEqual(setups.map((s) => s.id).slice(0, 2), ['keep', 'ssf']);
  assert.ok(setups.length <= 3);
});

// Borne d'essai (20/11/2026, sonde par ssh) : carte 5.1 au pilote générique, détection déclarée sur
// chaque prise, toutes « branchées » alors que ses enceintes vibrantes sont coupées.
const PINCAB = [jack(0x3, true, 1, true), jack(0xc, true, 1, true), jack(0x30, true, 1, true), jack(0x3, true, 2, true)];

test('borne d’essai : un câble dans la prise arrière fait proposer deux exciters, vérifiés par le son', () => {
  assert.deepEqual(cardJacks(realtek(PINCAB)), { front: true, rear: true });
  const [ssf] = proposeAudioSetups({ outputs: [realtek(PINCAB)], displays: displays() });
  assert.equal(ssf!.title, 'SSF avec deux exciters');
  assert.deepEqual(ssf!.expected, { front: 'backglass', rear: 'lockbar', side: 'none' });
});

test('prises qui ne détectent pas les câbles : SSF possible, à vérifier, après les propositions stéréo', () => {
  const blind = realtek([jack(0x3, true, 1, false), jack(0x30, true, 1, false), jack(0x600, true, 1, false)]);
  assert.deepEqual(cardJacks(blind), { front: 'unknown', rear: 'unknown', side: 'unknown' });
  const setups = proposeAudioSetups({ outputs: [bgSpeaker, pfSpeaker, blind], displays: displays(), backglassDisplay: BG, playfieldDisplay: PF });
  assert.deepEqual(setups.map((s) => s.id), ['screens', 'card-and-screen', 'ssf']);
  const ssf = setups[2]!;
  assert.equal(ssf.sure, false);
  assert.ok(ssf.badges.some((b) => b.text.includes('ne détecte pas les câbles')));
  assert.ok(!ssf.badges.some((b) => b.text.startsWith('À essayer en premier')));
  // Rien de plus sur une carte sans prise arrière ni des côtés (portable, prise combinée).
  assert.ok(!proposeAudioSetups({ outputs: [realtek([jack(0x3, true, 14, false)])], displays: displays() }).some((s) => s.playfieldMode === 'ssf'));
});

test('câble détecté mais rien entendu : l’ampli des exciters, pas la carte', () => {
  const [notice] = pluggedButSilentNotices(realtek(PINCAB), { front: 'backglass', rear: 'none' });
  assert.ok(notice!.includes('prise noire') && notice!.includes('ampli'));
  assert.deepEqual(pluggedButSilentNotices(realtek(PINCAB), { front: 'backglass', rear: 'lockbar' }), []);
  const blind = realtek([jack(0x3, true, 1, false), jack(0x30, true, 1, false)]);
  assert.deepEqual(pluggedButSilentNotices(blind, { rear: 'none' }), [], 'une prise qui ne détecte rien ne dit pas qu’un câble y est');
});