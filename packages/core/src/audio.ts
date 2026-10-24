// Sorties audio de la borne : lecture des propriétés MMDevices, rattachement
// d'une sortie HDMI à son écran, correspondance au démarrage et clés de VPX.
// VPX 10.8.1 n'a que deux sorties ([Player] SoundDeviceBG et SoundDevice),
// désignées par le nom Windows de la sortie (PKEY_Device_FriendlyName) comparé
// au caractère près ; un nom introuvable l'envoie sans bruit sur la sortie par
// défaut. Cyber Pinball garde donc sa propre empreinte (endpointId, ContainerId)
// et réécrit le nom courant à chaque synchronisation, comme pour les écrans.

import { fingerprintOf } from './fingerprint';
import { AUDIO_ROLES } from './model';
import type {
  AudioOutput,
  AudioRole,
  CabinetAudio,
  ObservedAudioOutput,
  ObservedDisplay,
  PlayfieldAudioMode,
} from './model';
import type { SyncFinding } from './sync';
import type { VpxSetting } from './vpx';

// ---------------------------------------------------------------------------
// Propriétés lues dans le registre (HKLM\…\MMDevices\Audio\Render\{guid}\Properties)

/** Noms des valeurs du registre : « {fmtid},pid » des PROPERTYKEY Windows. */
export const AUDIO_PROPERTIES = {
  deviceDesc: '{a45c254e-df1c-4efd-8020-67d146a850e0},2',
  bus: '{a45c254e-df1c-4efd-8020-67d146a850e0},24',
  interfaceName: '{b3f8fa53-0004-438e-9003-51a46e139bfc},6',
  containerId: '{8c7ed206-3f8a-4827-b3ab-ae9e1faefc6c},2',
  formFactor: '{1da5d803-d492-4edd-8c23-e0c0ffee7f0e},0',
  deviceFormat: '{f19f064d-082c-4e27-bc73-6882a1bb8e4c},0',
} as const;

/** DeviceState d'un point de terminaison actif (DEVICE_STATE_ACTIVE). */
export const AUDIO_DEVICE_ACTIVE = 1;

/** Les propriétés binaires sont précédées d'un en-tête de 8 octets (type PROPVARIANT, puis 1). */
const PROPERTY_HEADER = 8;

/** Nom que Windows, SDL (donc VPX) et Chromium donnent à la sortie. */
export function audioFriendlyName(deviceDesc: string, interfaceName: string): string {
  return interfaceName ? `${deviceDesc} (${interfaceName})` : deviceDesc;
}

/** GUID au format texte (« {XXXXXXXX-XXXX-…} ») depuis une propriété binaire VT_CLSID. */
export function guidFromProperty(bytes: Uint8Array): string | undefined {
  if (bytes.length < PROPERTY_HEADER + 16) return undefined;
  const b = bytes.subarray(PROPERTY_HEADER, PROPERTY_HEADER + 16);
  const hex = (from: number, to: number, reverse: boolean) => {
    const part = [...b.subarray(from, to)];
    return (reverse ? part.reverse() : part).map((x) => x.toString(16).padStart(2, '0')).join('');
  };
  return `{${hex(0, 4, true)}-${hex(4, 6, true)}-${hex(6, 8, true)}-${hex(8, 10, false)}-${hex(10, 16, false)}}`.toUpperCase();
}

/**
 * Canaux et masque des haut-parleurs du format réglé dans Windows : en-tête,
 * puis WAVEFORMATEX (nChannels à l'octet 2) et, pour WAVE_FORMAT_EXTENSIBLE,
 * dwChannelMask à l'octet 20.
 */
export function audioFormatFromProperty(bytes: Uint8Array): { channels: number; channelMask: number } | undefined {
  if (bytes.length < PROPERTY_HEADER + 18) return undefined;
  const view = new DataView(bytes.buffer, bytes.byteOffset + PROPERTY_HEADER, bytes.length - PROPERTY_HEADER);
  const tag = view.getUint16(0, true);
  const channels = view.getUint16(2, true);
  const extensible = tag === 0xfffe && view.byteLength >= 24;
  return { channels, channelMask: extensible ? view.getUint32(20, true) : defaultChannelMask(channels) };
}

/** Masque implicite d'un format sans WAVEFORMATEXTENSIBLE (mono, stéréo). */
function defaultChannelMask(channels: number): number {
  return channels === 1 ? SPEAKER.FC : channels === 2 ? SPEAKER.FL | SPEAKER.FR : 0;
}

/**
 * ContainerId commun à tout ce qui est intégré à l'ordinateur (écran et
 * haut-parleurs d'un portable) : il ne rattache pas une sortie à un écran.
 */
const ROOT_CONTAINERS = new Set(['{00000000-0000-0000-FFFF-FFFFFFFFFFFF}', '{00000000-0000-0000-0000-000000000000}']);

export function normalizeContainerId(id: string | undefined): string | undefined {
  if (!id) return undefined;
  const upper = id.trim().toUpperCase();
  return ROOT_CONTAINERS.has(upper) ? undefined : upper;
}

// ---------------------------------------------------------------------------
// Haut-parleurs d'une sortie

/** Bits de dwChannelMask (ksmedia.h). Leur ordre est celui des canaux pour Windows, SDL et Chromium. */
export const SPEAKER = {
  FL: 0x1,
  FR: 0x2,
  FC: 0x4,
  LFE: 0x8,
  BL: 0x10,
  BR: 0x20,
  SL: 0x200,
  SR: 0x400,
} as const;

/** Paires de haut-parleurs que VPX alimente ; il n'écrit jamais le centre ni le caisson. */
export type SpeakerPair = 'front' | 'rear' | 'side';

export const SPEAKER_PAIRS: readonly { id: SpeakerPair; label: string; left: number; right: number }[] = [
  { id: 'front', label: 'Avant', left: SPEAKER.FL, right: SPEAKER.FR },
  { id: 'rear', label: 'Arrière', left: SPEAKER.BL, right: SPEAKER.BR },
  { id: 'side', label: 'Côté', left: SPEAKER.SL, right: SPEAKER.SR },
];

/** Rang d'un haut-parleur dans le flux : le nombre de bits du masque placés avant le sien. */
export function channelIndex(mask: number, speaker: number): number | undefined {
  if (!(mask & speaker)) return undefined;
  let index = 0;
  for (let bit = 1; bit < speaker; bit <<= 1) if (mask & bit) index++;
  return index;
}

/** Paires présentes sur la sortie, avec le rang de leurs deux canaux. */
export function speakerPairsOf(output: Pick<ObservedAudioOutput, 'channelMask'>): { pair: SpeakerPair; label: string; left: number; right: number }[] {
  const pairs = [];
  for (const p of SPEAKER_PAIRS) {
    const left = channelIndex(output.channelMask, p.left);
    const right = channelIndex(output.channelMask, p.right);
    if (left !== undefined && right !== undefined) pairs.push({ pair: p.id, label: p.label, left, right });
  }
  return pairs;
}

/** À partir de six canaux annoncés, l'assistant teste chaque haut-parleur pour choisir le mixage du plateau. */
export function needsChannelTest(output: Pick<ObservedAudioOutput, 'channels' | 'channelMask'>): boolean {
  return output.channels >= 6 && speakerPairsOf(output).length >= 2;
}

// ---------------------------------------------------------------------------
// Sorties proposées dans l'assistant

/** Sorties virtuelles (Steam, Oculus…) et Bluetooth : écartées de l'assistant, sauf si elles avaient un rôle. */
export function isCabinetCandidate(output: ObservedAudioOutput): boolean {
  const bus = output.bus.toUpperCase();
  return bus !== 'ROOT' && !bus.startsWith('BTH');
}

/** Écran dont la sortie est le haut-parleur (même ContainerId), s'il est branché. */
export function audioScreen(output: Pick<ObservedAudioOutput, 'containerId'>, displays: ObservedDisplay[]): ObservedDisplay | undefined {
  const container = normalizeContainerId(output.containerId);
  if (!container) return undefined;
  return displays.find((d) => normalizeContainerId(d.containerId) === container);
}

export function toAudioOutput(output: ObservedAudioOutput, displays: ObservedDisplay[]): AudioOutput {
  const screen = audioScreen(output, displays);
  const containerId = normalizeContainerId(output.containerId);
  return {
    endpointId: output.endpointId,
    ...(containerId && { containerId }),
    ...(screen && { screen: fingerprintOf(screen).key }),
    label: output.friendlyName,
    lastSeen: output,
  };
}

/** Libellé court : nom de la sortie et nombre de canaux. */
export function describeAudioOutput(output: ObservedAudioOutput): string {
  return output.channels ? `${output.friendlyName}, ${channelsLabel(output.channels)}` : output.friendlyName;
}

export function channelsLabel(channels: number): string {
  return channels === 8 ? '7.1' : channels === 6 ? '5.1' : channels === 2 ? 'stéréo' : channels === 1 ? 'mono' : `${channels} canaux`;
}

// ---------------------------------------------------------------------------
// Correspondance au démarrage

export interface AudioMatch {
  /** endpointId enregistré -> sortie observée. */
  matched: Map<string, ObservedAudioOutput>;
  missing: string[];
  /** Sorties retrouvées par leur ContainerId seulement (pilote réinstallé, HDMI recréé). */
  approximate: string[];
}

/** Retrouve les sorties enregistrées parmi les sorties actives, sans jamais se fier au nom. */
export function matchAudioOutputs(saved: AudioOutput[], observed: ObservedAudioOutput[]): AudioMatch {
  const matched = new Map<string, ObservedAudioOutput>();
  const approximate: string[] = [];
  const free = new Set(observed);
  const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

  for (const output of saved) {
    const hit = [...free].find((o) => same(o.endpointId, output.endpointId));
    if (hit) {
      matched.set(output.endpointId, hit);
      free.delete(hit);
    }
  }

  // Repli par ContainerId, seulement sans ambiguïté des deux côtés.
  for (const output of saved) {
    const container = normalizeContainerId(output.containerId);
    if (matched.has(output.endpointId) || !container) continue;
    const candidates = [...free].filter((o) => normalizeContainerId(o.containerId) === container);
    const sameContainer = saved.filter((s) => !matched.has(s.endpointId) && normalizeContainerId(s.containerId) === container);
    if (candidates.length === 1 && sameContainer.length === 1) {
      matched.set(output.endpointId, candidates[0]!);
      free.delete(candidates[0]!);
      approximate.push(output.endpointId);
    }
  }

  const missing = saved.filter((s) => !matched.has(s.endpointId)).map((s) => s.endpointId);
  return { matched, missing, approximate };
}

// ---------------------------------------------------------------------------
// Mixage du plateau

/**
 * [Player] Sound3D (SoundPlayer.cpp de VPX 10.8.1) :
 * - stéréo : 0 « 2 Front channels », mais 1 sur une sortie 7.1, où le mode 0 annule tous les gains ;
 * - surround : 3 « Front at lockbar » ou 2 « Rear at lockbar » selon le câblage ;
 * - SSF : 5 (4 et 5 sont identiques dans cette version).
 */
export function vpxSound3D(audio: Pick<CabinetAudio, 'playfieldMode' | 'lockbarPair'>, channels: number): number {
  switch (audio.playfieldMode) {
    case 'ssf':
      return 5;
    case 'surround':
      return audio.lockbarPair === 'rear' ? 2 : 3;
    case 'stereo':
      return channels >= 8 ? 1 : 0;
  }
}

/** Canaux que Windows doit annoncer pour qu'un Sound3D ne retombe pas en stéréo. */
export function channelsNeeded(sound3D: number): number {
  return sound3D >= 4 ? 8 : sound3D >= 2 ? 4 : 2;
}

export const PLAYFIELD_MODE_LABELS: Record<PlayfieldAudioMode, string> = {
  stereo: 'stéréo',
  surround: 'surround',
  ssf: 'SSF',
};

/** Où le joueur a entendu une paire de haut-parleurs pendant le test des canaux. */
export type SpeakerPlace = 'lockbar' | 'top' | 'backglass' | 'none';

export const SPEAKER_PLACE_LABELS: Record<SpeakerPlace, string> = {
  lockbar: 'plateau, côté joueur',
  top: 'plateau, côté fronton',
  backglass: 'fronton',
  none: 'rien entendu',
};

export interface ChannelTestResult {
  playfieldMode: PlayfieldAudioMode;
  lockbarPair?: 'front' | 'rear';
  /** Câblage que VPX ne saura pas exploiter tel quel. */
  notices: string[];
}

/**
 * Mixage déduit des réponses au test des canaux :
 * - l'avant au fronton (ou muet) et une autre paire sur le plateau : SSF ;
 * - l'avant et une autre paire sur le plateau : surround, dans le sens entendu ;
 * - sinon : stéréo.
 */
export function playfieldModeFromTest(places: Partial<Record<SpeakerPair, SpeakerPlace>>): ChannelTestResult {
  const onPlayfield = (p: SpeakerPair) => places[p] === 'lockbar' || places[p] === 'top';
  const notices: string[] = [];
  const back = onPlayfield('rear') || onPlayfield('side');

  if (!onPlayfield('front') && back) {
    // Guide Pinscape : exciters côté joueur sur la prise arrière, côté fronton sur la prise latérale.
    if (places.rear === 'top' && places.side === 'lockbar') {
      notices.push('Haut-parleurs arrière près du fronton et latéraux côté joueur : en SSF, VPX les attend dans l’autre sens. Échangez les prises « arrière » et « côté » de la carte son.');
    }
    if (places.front === 'none') notices.push('Rien entendu sur l’avant : en SSF, VPX y envoie seulement le son du fronton si la même carte le joue.');
    return { playfieldMode: 'ssf', notices };
  }
  if (onPlayfield('front') && back) {
    const lockbarPair = places.front === 'lockbar' ? 'front' : 'rear';
    return { playfieldMode: 'surround', lockbarPair, notices };
  }
  return { playfieldMode: 'stereo', notices };
}

// ---------------------------------------------------------------------------
// Clés de VPinballX.ini

export const VPX_AUDIO_KEYS: Record<AudioRole, string> = {
  backglass: 'SoundDeviceBG',
  playfield: 'SoundDevice',
};

/** Toutes les clés audio gérées, dans [Player]. */
export const VPX_AUDIO_OWNED_KEYS = [VPX_AUDIO_KEYS.backglass, VPX_AUDIO_KEYS.playfield, 'Sound3D'];

export interface VpxAudioPlan {
  /** Sortie observée pour chaque rôle retrouvé. */
  assignments: Partial<Record<AudioRole, ObservedAudioOutput>>;
  settings: VpxSetting[];
  /** Clés gérées laissées telles quelles faute de sortie retrouvée (« Section.Clé »). */
  untouched: string[];
  findings: SyncFinding[];
}

/**
 * Clés audio pour les sorties réellement actives : le nom courant de chaque
 * sortie, et Sound3D selon le mixage choisi. Un rôle sans sortie laisse la clé
 * vide (VPX prend alors la sortie par défaut) ; une sortie introuvable laisse la
 * clé telle quelle et le signale.
 */
export function vpxAudioSettings(audio: CabinetAudio, observed: ObservedAudioOutput[]): VpxAudioPlan {
  const match = matchAudioOutputs(audio.outputs, observed);
  const assignments: VpxAudioPlan['assignments'] = {};
  const settings: VpxSetting[] = [];
  const untouched: string[] = [];
  const findings: SyncFinding[] = [];
  const put = (key: string, value: string) => settings.push({ section: 'Player', key, value });

  for (const role of AUDIO_ROLES) {
    const key = VPX_AUDIO_KEYS[role.id];
    const id = audio.roles[role.id];
    if (!id) {
      put(key, '');
      continue;
    }
    const output = match.matched.get(id);
    const saved = audio.outputs.find((o) => o.endpointId === id);
    if (!output) {
      untouched.push(`Player.${key}`);
      findings.push({
        severity: 'warning',
        message: `${role.label} : la sortie « ${saved?.label ?? id} » est introuvable. ${saved?.screen ? 'Son écran est-il allumé, sur la bonne entrée ?' : 'Est-elle branchée ?'} VPX jouera ce son sur la sortie par défaut de Windows.`,
      });
      continue;
    }
    assignments[role.id] = output;
    put(key, output.friendlyName);
    if (match.approximate.includes(id)) {
      findings.push({
        severity: 'info',
        message: `${role.label} : sortie « ${output.friendlyName} » retrouvée par son écran (le pilote l’a recréée).`,
      });
    }
    // VPX garde la dernière sortie qui porte ce nom : deux homonymes sont indiscernables pour lui.
    const sameName = observed.filter((o) => o.friendlyName === output.friendlyName);
    if (sameName.length > 1) {
      findings.push({
        severity: 'warning',
        message: `${role.label} : ${sameName.length} sorties s’appellent « ${output.friendlyName} ». VPX prendra la dernière de sa liste, peut-être pas la bonne : renommez l’une d’elles dans le panneau Son de Windows (Propriétés), puis relancez l’assistant.`,
      });
    }
  }

  const playfield = assignments.playfield;
  if (playfield || !audio.roles.playfield) {
    const channels = playfield?.channels ?? 0;
    const sound3D = vpxSound3D(audio, channels);
    put('Sound3D', String(sound3D));
    const needed = channelsNeeded(sound3D);
    if (playfield && channels > 0 && channels < needed) {
      findings.push({
        severity: 'warning',
        message: `Son du plateau : mixage ${PLAYFIELD_MODE_LABELS[audio.playfieldMode]}, mais « ${playfield.friendlyName} » est réglée en ${channelsLabel(channels)} dans Windows. VPX retombera en stéréo : réglez-la en ${needed === 8 ? '7.1' : '5.1 ou 7.1'} (Panneau de configuration > Son > Configurer).`,
      });
    }
  } else {
    untouched.push('Player.Sound3D');
  }

  return { assignments, settings, untouched, findings };
}
