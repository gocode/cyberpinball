// Configurations du son proposées par l'étape « Son de la borne », avant toute question : la borne
// regarde ce qu'elle a (prises décrites par le pilote d'une carte de carte mère, haut-parleurs des
// écrans, ampli HDMI, canaux réglés dans Windows, réglages déjà enregistrés) et propose au plus
// trois configurations, la plus sûre en tête. Le joueur en essaie une ; une vérification rapide
// (chaque paire sonne là où on l'attend ?) la confirme. « Régler pas à pas » reste le dernier choix.
//
// Les prises ne valent que pour une carte de carte mère (HDAUDIO, sortie analogique) : une carte USB
// rend souvent un rôle vide, et un casque Bluetooth se dit « branché ». Leur couleur est nommée
// d'après leur rôle (norme des cartes son : verte avant, noire arrière, grise côtés), la couleur
// déclarée par le pilote étant souvent absente.

import { audioScreen, isAnalogOutput, isHdmiAmplifier, type SpeakerPair, type SpeakerPlace } from './audio';
import { t } from './i18n';
import type { AudioRole, CabinetAudio, ObservedAudioJack, ObservedAudioOutput, ObservedDisplay, PlayfieldAudioMode } from './model';

/** Masques de canaux d'une prise (KSAUDIO_SPEAKER) : avant, arrière, côtés. */
const PAIR_MASK: Record<SpeakerPair, number> = { front: 0x3, rear: 0x30, side: 0x600 };
/** EPcxGeoLocation : panneau arrière (eGeoLocRear) ; la façade (eGeoLocFront) porte souvent un casque. */
const GEO_FRONT_PANEL = 2;

export type SetupTone = 'ok' | 'warn' | 'info';

/** Une place du schéma de la borne : ce qui y joue, ou rien de branché. */
export interface SchemaSpot {
  /** Ce qui joue là, court (« prise noire », « sortie arrière », « AndroidTV »). */
  source: string;
  state?: 'absent';
}

export interface AudioSetup {
  id: 'keep' | 'ssf' | 'ssf-screen' | 'screens' | 'card-and-screen' | 'card' | 'playfield-screen';
  title: string;
  detail: string;
  badges: { text: string; tone: SetupTone }[];
  roles: Partial<Record<AudioRole, string>>;
  playfieldMode: PlayfieldAudioMode;
  /** Mixage du plateau : où chaque paire de la sortie du plateau doit sonner (vérification rapide). */
  expected?: Partial<Record<SpeakerPair, SpeakerPlace>>;
  /** Canaux que Windows doit annoncer sur la sortie du plateau (6 pour deux exciters, 8 pour quatre). */
  needsChannels?: number;
  /** Ce que montre le schéma de la borne vue de dessus. */
  schema: { fronton?: SchemaSpot; haut?: SchemaSpot; bas?: SchemaSpot };
  /** Appuyée sur ce qui a été détecté (prises branchées, réglages déjà enregistrés). */
  sure: boolean;
}

/**
 * Une paire de prises : un câble détecté (true), aucun (false), ou une prise qui ne sait pas
 * détecter les câbles ('unknown', « branchée » ne voulant alors rien dire). Absente : pas de prise.
 */
export type JackState = boolean | 'unknown';

/** Prises d'une carte de carte mère, paire par paire. Undefined : rien à en tirer pour le SSF. */
export interface CardJacks {
  front?: JackState;
  rear?: JackState;
  side?: JackState;
}

/** Ce que disent les prises d'une sortie, seulement pour une carte de carte mère qui les décrit. */
export function cardJacks(output: Pick<ObservedAudioOutput, 'bus' | 'formFactor' | 'jacks'>): CardJacks | undefined {
  if (!isAnalogOutput(output) || output.bus.toUpperCase() !== 'HDAUDIO' || !output.jacks?.length) return undefined;
  const panel = output.jacks.filter((j) => j.geoLocation !== GEO_FRONT_PANEL);
  const jacks = panel.length ? panel : output.jacks;
  const carries = (j: ObservedAudioJack, pair: SpeakerPair) => (j.channelMapping & PAIR_MASK[pair]) === PAIR_MASK[pair];
  const result: CardJacks = {};
  for (const pair of ['front', 'rear', 'side'] as const) {
    const found = jacks.filter((j) => carries(j, pair));
    if (!found.length) continue;
    // « Branchée » ne vaut que pour une prise qui sait détecter un câble (une borne d'essai, le
    // 20/11/2026, disait toutes ses prises branchées, enceintes vibrantes coupées : un câble dans la
    // prise n'est pas un exciter qui marche, d'où la vérification par le son).
    const sensing = found.filter((j) => j.presenceDetect !== false);
    result[pair] = sensing.length ? sensing.some((j) => j.connected) : 'unknown';
  }
  // Une seule prise stéréo (portable, prise combinée) : rien à en tirer pour le SSF.
  return result.rear === undefined && result.side === undefined ? undefined : result;
}

const JACK_COLOR: Record<SpeakerPair, () => string> = {
  front: () => t('prise verte'),
  rear: () => t('prise noire'),
  side: () => t('prise grise'),
};
const PAIR_NAME: Record<SpeakerPair, () => string> = {
  front: () => t('sortie avant'),
  rear: () => t('sortie arrière'),
  side: () => t('sortie des côtés'),
};

/** Nom court d'une sortie dans le schéma : le nom de l'écran ou de l'appareil, sans l'interface. */
function shortName(output: ObservedAudioOutput): string {
  const name = output.deviceDesc.trim() || output.friendlyName;
  return name.length > 16 ? `${name.slice(0, 15)}…` : name;
}

export interface SetupInputs {
  outputs: readonly ObservedAudioOutput[];
  displays: readonly ObservedDisplay[];
  /** Écrans du fronton et du playfield choisis (index dans `displays`). */
  backglassDisplay?: number;
  playfieldDisplay?: number;
  /** Réglages enregistrés, ramenés aux sorties d'aujourd'hui (rôles retrouvés). */
  previous?: { audio: CabinetAudio; roles: Partial<Record<AudioRole, string>> };
}

/**
 * Les configurations à proposer, au plus trois, la plus sûre en tête (sans « pas à pas », que
 * l'écran ajoute toujours en dernier).
 */
export function proposeAudioSetups(input: SetupInputs): AudioSetup[] {
  const { outputs, displays } = input;
  const speakerOf = (index: number | undefined) => (index === undefined ? undefined : outputs.find((o) => audioScreen(o, [...displays]) === displays[index]));
  const screenBg = speakerOf(input.backglassDisplay);
  const screenPf = speakerOf(input.playfieldDisplay);
  const setups: AudioSetup[] = [];

  // Réglages déjà enregistrés et retrouvés : les garder vient en premier.
  const prev = input.previous;
  if (prev && Object.keys(prev.roles).length) {
    const mode = prev.audio.playfieldMode;
    setups.push({
      id: 'keep',
      title: t('Garder les réglages actuels'),
      detail: mode === 'ssf' ? t('SSF, comme aujourd’hui') : mode === 'surround' ? t('Surround, comme aujourd’hui') : t('Stéréo, comme aujourd’hui'),
      badges: [{ text: t('Réglages enregistrés, sorties retrouvées'), tone: 'info' }],
      roles: { ...prev.roles },
      playfieldMode: mode,
      schema: {},
      sure: true,
    });
  }

  // La carte qui peut porter des exciters : une carte de carte mère dont les prises arrière ou des
  // côtés sont branchées, sinon une sortie déjà en 5.1 ou 7.1, sinon un ampli HDMI.
  const cards = outputs.filter((o) => isAnalogOutput(o) || isHdmiAmplifier(o, displays));
  const withJacks = cards.map((o) => ({ o, jacks: cardJacks(o) }));
  const plugged = withJacks.find((c) => c.jacks && (c.jacks.rear === true || c.jacks.side === true));
  const multichannel = withJacks.find((c) => c.o.channels >= 6);
  // Prises arrière ou des côtés qui ne savent pas détecter les câbles : le SSF reste possible, à vérifier.
  const unsensed = withJacks.find((c) => c.jacks && (c.jacks.rear === 'unknown' || c.jacks.side === 'unknown'));
  const card = plugged ?? multichannel ?? unsensed;
  let ssf: AudioSetup | undefined;
  if (card) {
    const { o, jacks } = card;
    // Une paire compte si un câble y est détecté, ou si sa prise ne sait pas le dire ; sans description, les canaux.
    const pairOn = (state: JackState | undefined, fallback: boolean) => (jacks ? state !== undefined && state !== false : fallback);
    const rear = pairOn(jacks?.rear, o.channels >= 6);
    const side = pairOn(jacks?.side, o.channels >= 8);
    const front = jacks ? jacks.front !== false : true;
    const known = Boolean(jacks) && jacks!.rear !== 'unknown' && jacks!.side !== 'unknown';
    const jackLabel = (pair: SpeakerPair) => (jacks ? JACK_COLOR[pair]() : PAIR_NAME[pair]());
    const exciters = (rear ? 2 : 0) + (side ? 2 : 0);
    // Le fronton sur l'avant de la carte s'il y est branché, sinon sur le haut-parleur de son écran.
    const bgOnScreen = !front && screenBg;
    const needs = exciters === 2 ? 6 : 8;
    const badges: AudioSetup['badges'] = [];
    if (known) badges.push({ text: exciters === 4 ? t('À essayer en premier : prises arrière et des côtés branchées') : t('À essayer en premier : une paire d’exciters branchée'), tone: 'ok' });
    else if (jacks) badges.push({ text: t('La carte ne détecte pas les câbles de ses prises : à vérifier par le son'), tone: 'info' });
    else badges.push({ text: t('La carte annonce {channels} canaux : à vérifier par le son', { channels: o.channels }), tone: 'info' });
    if (o.channels < needs) badges.push({ text: needs === 8 ? t('Réglage Windows nécessaire avant le test : stéréo → 7.1, l’essai ouvre le panneau') : t('Réglage Windows nécessaire avant le test : stéréo → 5.1, l’essai ouvre le panneau'), tone: 'warn' });
    if (exciters === 2 && o.channels >= 8) badges.push({ text: t('Deux exciters : réglez la carte en 5.1, ils recevront tout le son du plateau'), tone: 'info' });
    if (exciters === 2 && !rear) badges.push({ text: t('Branchez plutôt ces exciters sur la sortie arrière'), tone: 'warn' });
    const where = bgOnScreen ? t('le fronton sur les haut-parleurs de {screen}', { screen: shortName(screenBg) }) : t('le fronton sur la {jack}', { jack: jackLabel('front') });
    ssf = {
      id: bgOnScreen ? 'ssf-screen' : 'ssf',
      title: bgOnScreen ? t('SSF : {screen} + {card}', { screen: shortName(screenBg), card: shortName(o) }) : exciters === 4 ? t('SSF sur la carte son') : t('SSF avec deux exciters'),
      detail: t('Les bruits du jeu font vibrer la caisse : {where}, {n} exciters (haut-parleurs vibrants) sur la carte', { where, n: exciters }),
      badges,
      roles: { backglass: bgOnScreen ? screenBg.endpointId : o.endpointId, playfield: o.endpointId },
      playfieldMode: 'ssf',
      expected: { front: bgOnScreen ? 'none' : 'backglass', rear: rear ? 'lockbar' : 'none', side: side ? 'top' : 'none' },
      ...(o.channels < needs && { needsChannels: needs }),
      schema: {
        fronton: { source: bgOnScreen ? shortName(screenBg) : jackLabel('front') },
        haut: side ? { source: jackLabel('side') } : { source: jackLabel('side'), state: 'absent' },
        bas: rear ? { source: jackLabel('rear') } : { source: jackLabel('rear'), state: 'absent' },
      },
      sure: known,
    };
    // Câbles détectés, ou carte déjà réglée en 5.1/7.1 dans Windows : en place. Sinon (prises qui ne
    // détectent rien, carte en stéréo), après les propositions stéréo : une carte de bureau a presque
    // toujours des prises arrière, rarement des exciters.
    if (known || o.channels >= 6) setups.push(ssf);
  }

  // Stéréo : ce qui est sûr (les haut-parleurs des écrans), puis la carte de la carte mère.
  const analog = cards.find((o) => isAnalogOutput(o) && o.bus.toUpperCase() === 'HDAUDIO') ?? cards.find(isAnalogOutput);
  if (screenBg && screenPf && screenBg !== screenPf) {
    setups.push({
      id: 'screens',
      title: t('Chaque écran joue son son'),
      detail: t('Fronton sur {bg}, plateau sur {pf}', { bg: shortName(screenBg), pf: shortName(screenPf) }),
      badges: [],
      roles: { backglass: screenBg.endpointId, playfield: screenPf.endpointId },
      playfieldMode: 'stereo',
      schema: { fronton: { source: shortName(screenBg) }, haut: { source: shortName(screenPf) } },
      sure: false,
    });
  }
  if (analog && screenPf) {
    setups.push({
      id: 'card-and-screen',
      title: t('Fronton sur la carte, plateau sur {pf}', { pf: shortName(screenPf) }),
      detail: t('Stéréo : la carte son au fronton, les haut-parleurs de l’écran du playfield au plateau'),
      badges: [],
      roles: { backglass: analog.endpointId, playfield: screenPf.endpointId },
      playfieldMode: 'stereo',
      schema: { fronton: { source: shortName(analog) }, haut: { source: shortName(screenPf) } },
      sure: false,
    });
  }
  if (analog) {
    setups.push({
      id: 'card',
      title: t('Tout sur la carte, en stéréo'),
      detail: card ? t('Fronton et plateau sur la carte son ; les exciters restent muets') : t('Fronton et plateau sur la carte son'),
      badges: [],
      roles: { backglass: analog.endpointId, playfield: analog.endpointId },
      playfieldMode: 'stereo',
      schema: { fronton: { source: shortName(analog) }, haut: { source: shortName(analog) } },
      sure: false,
    });
  } else if (screenPf) {
    setups.push({
      id: 'playfield-screen',
      title: t('Tout sur {pf}', { pf: shortName(screenPf) }),
      detail: t('Fronton et plateau sur l’écran du playfield'),
      badges: [],
      roles: { backglass: screenPf.endpointId, playfield: screenPf.endpointId },
      playfieldMode: 'stereo',
      schema: { fronton: { source: shortName(screenPf) }, haut: { source: shortName(screenPf) } },
      sure: false,
    });
  }

  // SSF à vérifier (prises sans détection, carte en stéréo) : troisième au plus, jamais coupé.
  if (ssf && !setups.includes(ssf)) setups.splice(Math.min(2, setups.length), 0, ssf);

  // La plus sûre en tête (réglages gardés, prises détectées), dans l'ordre de construction sinon.
  return rank(setups);
}

/**
 * Câble détecté dans la prise arrière ou des côtés, mais rien entendu au test : c'est l'ampli des
 * exciters (éteint, volume au plus bas, débranché plus loin) qu'il faut voir, pas la carte.
 */
export function pluggedButSilentNotices(output: Pick<ObservedAudioOutput, 'bus' | 'formFactor' | 'jacks'>, places: Partial<Record<SpeakerPair, SpeakerPlace>>): string[] {
  const jacks = cardJacks(output);
  if (!jacks) return [];
  const silent = (['rear', 'side'] as const).filter((p) => places[p] === 'none' && jacks[p] === true);
  if (!silent.length) return [];
  return [t('Un câble est bien branché sur la {jacks}, mais rien n’a vibré : l’ampli des exciters est-il allumé, son volume monté ?', { jacks: silent.map((p) => JACK_COLOR[p]()).join(t(' et la ')) })];
}

/**
 * Ce que la borne a détecté, en une phrase (sous les propositions) : les cartes et leurs prises
 * branchées, les haut-parleurs des écrans, le réglage de Windows.
 */
export function describeDetected(input: SetupInputs): string {
  const { outputs, displays } = input;
  const parts: string[] = [];
  for (const o of outputs) {
    const screen = audioScreen(o, [...displays]);
    if (screen) {
      const role = displays.indexOf(screen) === input.playfieldDisplay ? t('playfield') : displays.indexOf(screen) === input.backglassDisplay ? t('fronton') : undefined;
      parts.push(role ? t('haut-parleurs de {name} ({role})', { name: shortName(o), role }) : t('haut-parleurs de {name}', { name: shortName(o) }));
      continue;
    }
    if (!isAnalogOutput(o) && !isHdmiAmplifier(o, displays)) continue;
    const jacks = cardJacks(o);
    const name = shortName(o) === 'Haut-parleurs' ? o.interfaceName.replace(/ High Definition Audio| Audio$/i, '').trim() || o.friendlyName : shortName(o);
    const setting = o.channels >= 8 ? '7.1' : o.channels === 6 ? '5.1' : o.channels === 2 ? t('stéréo') : undefined;
    if (jacks && (jacks.rear === 'unknown' || jacks.side === 'unknown')) {
      // Prises qui ne détectent pas les câbles : rien à dire de ce qui y est branché.
      parts.push(setting ? t('{name}, réglée en {setting}, branchements non détectables', { name, setting }) : t('{name}, branchements non détectables', { name }));
    } else if (jacks) {
      const on = (['front', 'rear', 'side'] as const).filter((p) => jacks[p] === true).map((p) => JACK_COLOR[p]());
      parts.push(t('{name}, {jacks} branchées, réglée en {setting} dans Windows', { name, jacks: on.join(', ') || t('aucune prise'), setting: setting ?? t('{n} canaux', { n: o.channels }) }));
    } else if (isHdmiAmplifier(o, displays)) parts.push(t('ampli HDMI {name}', { name }));
    else parts.push(setting ? t('{name}, réglée en {setting}, branchements non détectables', { name, setting }) : t('{name}, branchements non détectables', { name }));
  }
  return parts.length ? t('Détecté : {list}.', { list: parts.join(' ; ') }) : t('Aucune sortie audio détectée.');
}

function rank(setups: AudioSetup[]): AudioSetup[] {
  return setups
    .map((s, i) => ({ s, i }))
    .sort((a, b) => Number(b.s.sure) - Number(a.s.sure) || a.i - b.i)
    .map(({ s }) => s)
    .slice(0, 3);
}
