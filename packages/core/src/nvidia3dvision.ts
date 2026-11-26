// Lunettes actives NVIDIA 3D Vision (bêta), à côté de l'anaglyphe dans « Lunettes 3D ».
//
// NVIDIA a arrêté 3D Vision en 2019 : le pilote 452.06 est le dernier qui la garde en Direct3D 11,
// avec son pilote 3D réinstallé par 3D Fix Manager. Le rendu est fait par le VPX corrigé (série 7,
// packages/vpx-corrige/correctifs/06-nvidia-3d-vision.patch) : la stéréo « Side by Side » de VPX,
// chaque vue à la pleine largeur de l'écran, présentée œil par œil au pilote en mode direct (NVAPI,
// NvAPI_Stereo_SetActiveEye), en plein écran exclusif sur le playfield. La 3D automatique du pilote
// n'est pas employée : elle exige aussi le plein écran exclusif, que BGFX ne sait pas faire, devine la
// profondeur image par image (le rendu différé de VPX, bloom et reflets, en sort faux), et se règle
// dans le magasin de profils du pilote, commun à tout le PC.
//
// Ce module ne lit ni n'écrit rien : réglages de la partie, constats de la détection et leurs marches
// à suivre, bilan d'une partie d'après le journal de VPX. app/src/nvidia-3dvision.ts relève les faits
// (NVAPI par koffi, USB, écrans).

import type { AnaglyphSetting } from './anaglyph';
import { EYE_SEPARATION_MM } from './anaglyph';
import { t } from './i18n';
import { IniDocument } from './ini';
import type { ObservedUsbDevice } from './model';
import type { VpxSetting } from './vpx';
import { VR_REFUSED_FXAA, VR_STEREO_FXAA } from './vr';

/** Les lunettes de « Lunettes 3D » : à filtres colorés (anaglyphe) ou actives NVIDIA 3D Vision. */
export type StereoGlassesKind = 'anaglyph' | 'nvidia';
export const STEREO_GLASSES_KINDS: readonly StereoGlassesKind[] = ['anaglyph', 'nvidia'];

/** « Side by Side » de VPX (typedefs3D.h, STEREO_SBS) : le VPX corrigé en tire les deux vues. */
export const NVIDIA_STEREO_MODE = 4;
/** Dernier pilote NVIDIA qui garde 3D Vision en Direct3D 11 (452.06), en centièmes comme NVAPI le rend. */
export const NVIDIA_3DVISION_LAST_DRIVER = 45206;
/** Constructeur USB de NVIDIA, et l'émetteur 3D Vision (1 et 2, et celui intégré aux écrans 3D Vision Ready). */
export const NVIDIA_USB_VID = 0x0955;
export const NVIDIA_3DVISION_EMITTER_PID = 0x0007;

/** Version du pilote écrite comme NVIDIA le fait : 45206 → « 452.06 ». */
export function nvidiaDriverLabel(version: number): string {
  return `${Math.floor(version / 100)}.${String(version % 100).padStart(2, '0')}`;
}

/** L'émetteur 3D Vision parmi les périphériques USB : son identifiant, ou un périphérique NVIDIA qui se dit « 3D Vision ». */
export function isNvidia3dVisionEmitter(d: ObservedUsbDevice): boolean {
  if (d.vid !== NVIDIA_USB_VID) return false;
  return d.pid === NVIDIA_3DVISION_EMITTER_PID || /3d\s*vision|stereo/i.test(d.name ?? '');
}

/** Un écran présent, vu comme VPX le nomme : ses identifiants possibles (vpxDisplayId, nom seul et « Nom [x, y] »). */
export interface VpxDisplayCandidate {
  ids: readonly string[];
  primary: boolean;
}

/**
 * Le playfield est-il l'écran principal de Windows ? Le pilote NVIDIA ne montre la 3D que sur lui.
 * `playfieldDisplay` : [Player] PlayfieldDisplay de VPX. VPX (Window::GetDisplayConfig) prend l'écran
 * qui porte exactement ce nom (« PL4380UH » en 10.8.1-5436, « Nom [x, y] » avant), sinon l'écran
 * principal. Vide : l'écran principal.
 * `displays` : les écrans présents. Sans eux, seule la position d'un « Nom [x, y] » renseigne
 * (l'écran principal est toujours en [0, 0]) ; un nom seul reste inconnu (undefined), comme deux
 * écrans du même nom dont un seul est le principal.
 */
export function playfieldOnPrimary(playfieldDisplay: string | undefined, displays?: readonly VpxDisplayCandidate[]): boolean | undefined {
  const value = playfieldDisplay?.trim();
  if (!value) return true;
  if (displays?.length) {
    const named = displays.filter((d) => d.ids.some((id) => id.trim() === value));
    if (!named.length) return true; // écran débranché ou renommé : VPX prend l'écran principal
    return named.every((d) => d.primary === named[0]!.primary) ? named[0]!.primary : undefined;
  }
  const m = /\[\s*(-?\d+)\s*,\s*(-?\d+)\s*\]\s*$/.exec(value);
  return m ? Number(m[1]) === 0 && Number(m[2]) === 0 : undefined;
}

/** Ce que l'application relève (app/src/nvidia-3dvision.ts). Absent : pas relevé ou illisible. */
export interface Nvidia3dVisionFacts {
  /** Le pilote NVIDIA répond (nvapi64.dll chargée et initialisée) ; false : pas de carte NVIDIA, ou pas de pilote. */
  nvapi: boolean;
  /** Version du pilote, en centièmes (45206). */
  driver?: number;
  /**
   * La 3D stéréoscopique globale est activée dans le pilote (NvAPI_Stereo_IsEnabled). Coupée n'est pas
   * un manque : Cyber Pinball l'active avant chaque partie en relief et la coupe après (une partie à
   * plat, stéréo active, perd des éléments de la table). Absente : pilote 3D qui ne répond pas.
   */
  stereo?: boolean;
  /**
   * Cyber Pinball a demandé la stéréo pour la dernière partie en relief, et elle est restée coupée :
   * 3D Fix Manager ouvert, son bouton « Enable 3D » sur Off, la remet aussitôt à son état (essais sur
   * la borne, 24 et 25/11/2026).
   */
  stereoRefused?: boolean;
  /** 3D Fix Manager tourne (3DFixManager.exe) : son bouton « Enable 3D » l'emporte sur Cyber Pinball ; absent : pas relevé. */
  fixManagerOpen?: boolean;
  /** L'émetteur USB est branché ; absent : USB illisible. */
  emitter?: boolean;
  /** Émetteur branché mais son pilote (NvStUSB) ne démarre pas : code du Gestionnaire de périphériques (28 : aucun pilote). */
  emitterProblem?: number;
  /** Le playfield est l'écran principal de Windows. */
  playfieldPrimary?: boolean;
  /** Le mode de l'écran principal (pixels physiques, fréquence en Hz) ; absent : pas relevé. */
  primaryMode?: { width: number; height: number; hz: number };
  /** Le VPX en place est celui que Cyber Pinball corrige (10.8.1-5436) ; false : une autre version, sans le mode direct. */
  vpxSupported?: boolean;
}

export type Nvidia3dVisionIssueId =
  | 'not-windows'
  | 'no-nvidia'
  | 'driver-too-new'
  | 'stereo-disabled'
  | 'no-emitter'
  | 'emitter-driver'
  | 'playfield-not-primary'
  | 'mode-unsupported'
  | 'vpx-unsupported';

/**
 * L'émetteur ne synchronise les lunettes que sur un mode décrit dans sa table (registre de NvStUSB,
 * que NvTimingsEd complète). La fréquence pixel y tient sur 32 bits, en 10 kHz (relevé sur la borne,
 * 25/11/2026) : aucune définition n'est exclue par la table elle-même, seul NvTimingsEd plafonne sa
 * saisie à 650 MHz. Une entrée 3840x2160 à 119,91 Hz (1 075 MHz) a été ajoutée à la main pour l'iiyama
 * PL4380UH : la 4K reste à prouver sur l'émetteur. Les lunettes alternent à 100 Hz au moins (50 images par œil).
 */
export const NVIDIA_3DVISION_MIN_HZ = 99;

/** Le mode de l'écran est trop lent pour les lunettes (moins de 100 Hz). */
export function nvidia3dVisionModeUnsupported(mode: { width: number; height: number; hz: number }): 'hz' | undefined {
  return mode.hz < NVIDIA_3DVISION_MIN_HZ ? 'hz' : undefined;
}

/** Un manque : ce qui ne va pas, et la marche à suivre. */
export interface Nvidia3dVisionIssue {
  id: Nvidia3dVisionIssueId;
  title: string;
  /** La marche à suivre, une étape par élément. */
  steps: string[];
}

/** 3D Fix Manager est parmi les processus (noms d'exécutables, casse indifférente). */
export function fixManagerRunning(names: readonly string[]): boolean {
  return names.some((n) => n.toLowerCase().replace(/\.exe$/, '') === '3dfixmanager');
}

/** Les manques, dans l'ordre où les régler : sans pilote NVIDIA, rien d'autre ne se lit. */
export function nvidia3dVisionIssues(f: Nvidia3dVisionFacts, platform: string = process.platform): Nvidia3dVisionIssue[] {
  if (platform !== 'win32') return [{ id: 'not-windows', title: t('3D Vision ne marche que sous Windows'), steps: [t('Les lunettes à filtres colorés, elles, marchent partout')] }];
  if (!f.nvapi)
    return [
      {
        id: 'no-nvidia',
        title: t('Aucune carte NVIDIA, ou son pilote n’est pas installé'),
        steps: [t('3D Vision demande une carte GeForce et le pilote NVIDIA 452.06 au plus'), t('Sans carte NVIDIA, prends les lunettes à filtres colorés')],
      },
    ];
  const issues: Nvidia3dVisionIssue[] = [];
  if (f.driver !== undefined && f.driver > NVIDIA_3DVISION_LAST_DRIVER)
    issues.push({
      id: 'driver-too-new',
      title: t('Pilote NVIDIA {version} : 3D Vision s’arrête au 452.06', { version: nvidiaDriverLabel(f.driver) }),
      steps: [
        t('Retire le pilote actuel (DDU, en mode sans échec, le fait proprement)'),
        t('Installe le pilote NVIDIA 452.06 pour ta carte'),
        t('Dans 3D Fix Manager : « Install 3D Driver », puis « Enable Driver Hack »'),
        t('Redémarre le PC'),
      ],
    });
  else if (f.stereo === undefined)
    issues.push({
      id: 'stereo-disabled',
      title: t('Le pilote 3D de NVIDIA ne répond pas'),
      steps: [
        t('Dans 3D Fix Manager : « Install 3D Driver », puis « Enable Driver Hack »'),
        t('Redémarre le PC'),
        t('Panneau de configuration NVIDIA, « Configurer la 3D stéréoscopique » : lance l’assistant de configuration une fois, lunettes allumées'),
      ],
    });
  else if (f.stereo === false && f.stereoRefused && f.fixManagerOpen)
    // PinCab, 25/11/2026 : 3D Fix Manager laissé ouvert, réduit, après le blocage de l'ouverture ; toutes les parties à plat.
    issues.push({
      id: 'stereo-disabled',
      title: t('3D Fix Manager bloque la 3D : ferme-le'),
      steps: [
        t('Ouvert, 3D Fix Manager remet la 3D dans l’état de son bouton « Enable 3D » : ferme-le, y compris s’il est réduit près de l’horloge'),
        t('Cyber Pinball active la 3D pour chaque partie en relief et la coupe après'),
      ],
    });
  else if (f.stereo === false && f.stereoRefused)
    issues.push({
      id: 'stereo-disabled',
      title: t('Cyber Pinball n’a pas pu activer la 3D stéréoscopique'),
      steps: [
        t('3D Fix Manager ouvert garde la 3D dans l’état de son bouton « Enable 3D » : ferme-le, Cyber Pinball active la 3D pour chaque partie en relief et la coupe après'),
        t('Sinon, Panneau de configuration NVIDIA, « Configurer la 3D stéréoscopique » : vérifie que la page s’ouvre et que l’assistant de configuration passe, lunettes allumées'),
      ],
    });
  if (f.emitter === false)
    issues.push({
      id: 'no-emitter',
      title: t('Émetteur 3D Vision introuvable'),
      steps: [t('Branche l’émetteur (la petite pyramide) sur un port USB du PC, sans hub si possible'), t('Son voyant s’allume quand la 3D démarre ; sans voyant, réinstalle le pilote 3D avec 3D Fix Manager')],
    });
  else if (f.emitter && f.emitterProblem)
    issues.push({
      id: 'emitter-driver',
      title: t('L’émetteur est branché, mais son pilote ne démarre pas (code {code})', { code: f.emitterProblem }),
      steps: [
        t('Débranche l’émetteur, puis rebranche-le sur un autre port USB du PC'),
        t('Si le Gestionnaire de périphériques le montre encore en erreur : dans 3D Fix Manager, « Install 3D Driver », puis redémarre le PC'),
      ],
    });
  if (f.playfieldPrimary === false)
    issues.push({
      id: 'playfield-not-primary',
      title: t('Le playfield n’est pas l’écran principal de Windows'),
      steps: [t('Le pilote NVIDIA ne montre la 3D que sur l’écran principal'), t('Paramètres de Windows, Système, Affichage : choisis l’écran du playfield et coche « En faire mon écran principal »'), t('Puis Configuration de la borne, pour que Cyber Pinball retrouve ses écrans')],
    });
  const tooSlow = f.playfieldPrimary !== false && f.primaryMode ? nvidia3dVisionModeUnsupported(f.primaryMode) : undefined;
  if (tooSlow && f.primaryMode) {
    const mode = { width: f.primaryMode.width, height: f.primaryMode.height, hz: Math.round(f.primaryMode.hz) };
    issues.push({
      id: 'mode-unsupported',
      title: t('Playfield en {width}x{height} à {hz} Hz : les lunettes 3D Vision demandent 100 Hz au moins', mode),
      steps: [
        t('Les lunettes alternent les images des deux yeux : à moins de 100 Hz, chaque œil verrait l’image clignoter'),
        t('Passe le playfield à 100 Hz au moins (120 Hz par exemple) dans le Panneau de configuration NVIDIA ; sinon, prends les lunettes à filtres colorés, qui marchent à toute fréquence'),
      ],
    });
  }
  if (f.vpxSupported === false)
    issues.push({
      id: 'vpx-unsupported',
      title: t('Le VPX en place n’a pas le mode 3D Vision'),
      steps: [
        t('Le mode 3D Vision est dans le VPX 10.8.1-5436 que Cyber Pinball installe et corrige'),
        t('Choisis cette version dans les réglages de VPX'),
        t('Si c’est déjà elle : mets Cyber Pinball à jour, puis redémarre-le, VPX fermé, pour qu’il pose le VPX corrigé'),
      ],
    });
  return issues;
}

/** Ce qui n'a pas pu être vérifié (USB, écran, VPX illisibles) : ne bloque pas la partie, mais ne se dit jamais prêt. */
export function nvidia3dVisionUnchecked(f: Nvidia3dVisionFacts): string[] {
  if (!f.nvapi) return [];
  return [
    ...(f.driver === undefined ? [t('version du pilote')] : []),
    ...(f.emitter === undefined ? [t('émetteur')] : []),
    ...(f.playfieldPrimary === undefined ? [t('écran du playfield')] : []),
    ...(f.vpxSupported === undefined ? ['VPX'] : []), // i18n-ignore : nom propre
  ];
}

/** Rien ne manque : tout vérifié (« prête »), ou une partie seulement (dit ce qui ne l'a pas été). */
export function nvidia3dVisionReadyText(f: Nvidia3dVisionFacts): { complete: boolean; text: string; detail: string } {
  const unchecked = nvidia3dVisionUnchecked(f);
  if (!unchecked.length)
    return {
      complete: true,
      text: t('NVIDIA 3D Vision prête'),
      detail: t('Pilote {version}, émetteur branché, playfield en écran principal ; la 3D stéréoscopique est activée pour chaque partie en relief, et coupée après', { version: nvidiaDriverLabel(f.driver!) }),
    };
  return {
    complete: false,
    text: t('Rien ne manque de ce qui a pu être vérifié'),
    detail: t('Pas vérifié : {list}. La partie tente la 3D quand même ; son bilan s’affiche ici après', { list: unchecked.join(', ') }),
  };
}

/** Profondeur et anticrénelage repris des Lunettes 3D ; le reste est propre au mode direct. */
export function nvidia3dVisionGameSettings(s: AnaglyphSetting, table: string, global: string): VpxSetting[] {
  const player = (key: string, value: string): VpxSetting => ({ section: 'Player', key, value });
  const fxaa = IniDocument.parse(table).get('Player', 'FXAA')?.trim() || IniDocument.parse(global).get('Player', 'FXAA')?.trim();
  return [
    player('Stereo3D', String(NVIDIA_STEREO_MODE)),
    player('Stereo3DEnabled', '1'),
    player('Stereo3DNvidiaDirect', '1'),
    player('Stereo3DEyeSeparation', String(Math.round(EYE_SEPARATION_MM * s.depth * 1000) / 1000)),
    // Le mode direct de NVAPI ne vit qu'en Direct3D 11 ; le VPX corrigé l'impose aussi de lui-même.
    player('GfxBackend', 'Direct3D11'),
    ...(fxaa === VR_REFUSED_FXAA ? [player('FXAA', VR_STEREO_FXAA)] : []),
  ];
}

// --- Bilan d'une partie -----------------------------------------------------------------------

/** `unknown` : la partie n'a rien écrit sur la 3D Vision dans le journal de VPX (VPX arrêté tôt, journal illisible). */
export const NVIDIA_3DVISION_OUTCOME_STATES = ['active', 'not-activated', 'fallback', 'ready', 'unknown'] as const;
export type Nvidia3dVisionOutcomeState = (typeof NVIDIA_3DVISION_OUTCOME_STATES)[number];

/** Ce que la dernière partie a donné, d'après les lignes « NVIDIA 3D Vision: » du journal de VPX. */
export interface Nvidia3dVisionOutcome {
  state: Nvidia3dVisionOutcomeState;
  /** La ligne du journal qui le dit (anglais, telle que VPX l'écrit). */
  line: string;
}

/**
 * Le bilan de la dernière partie lancée en mode 3D Vision dans le texte du journal de VPX ; undefined
 * si elle n'en a rien écrit. Seules comptent les lignes après la dernière demande du mode direct.
 */
export function nvidia3dVisionOutcome(log: string): Nvidia3dVisionOutcome | undefined {
  const lines = log.split(/\r?\n/).filter((l) => l.includes('NVIDIA 3D Vision: '));
  const start = lines.map((l) => /direct mode requested|NVAPI error|stereo is disabled/.test(l)).lastIndexOf(true);
  if (start < 0) return undefined;
  let outcome: Nvidia3dVisionOutcome | undefined;
  // Le plein écran exclusif peut manquer au départ (fenêtre pas encore devant) ou se perdre en cours de
  // partie (autre fenêtre au premier plan) : VPX montre alors le côte à côte et le reprend dès qu'il
  // revient. Seul un plein écran jamais obtenu de toute la partie fait un repli.
  let fullscreenFailure: string | undefined;
  let fullscreenSeen = false;
  for (const raw of lines.slice(start)) {
    const line = raw.slice(raw.indexOf('NVIDIA 3D Vision: ') + 'NVIDIA 3D Vision: '.length).trim();
    if (/^exclusive fullscreen \d/.test(line)) fullscreenSeen = true;
    else if (/^exclusive fullscreen failed/.test(line)) fullscreenFailure ??= line;
    if (/falling back|using plain side by side|SetActiveEye error/.test(line)) outcome = { state: 'fallback', line };
    else if (outcome?.state === 'fallback') continue;
    else if (/^stereo activated/.test(line)) outcome = { state: 'active', line };
    else if (/^stereo not activated/.test(line)) outcome = { state: 'not-activated', line };
    else if (/^direct mode ready/.test(line) && !outcome) outcome = { state: 'ready', line };
  }
  if (outcome?.state !== 'fallback' && !fullscreenSeen && fullscreenFailure) return { state: 'fallback', line: fullscreenFailure };
  return outcome;
}

/** Le bilan, dit au joueur. */
export function nvidia3dVisionOutcomeText(o: Nvidia3dVisionOutcome): { text: string; detail: string; tone: 'ok' | 'warning' | 'quiet' } {
  switch (o.state) {
    case 'active':
      return { text: t('Dernière partie : 3D Vision activée'), detail: t('Le pilote NVIDIA a reçu les deux vues, l’émetteur était allumé'), tone: 'ok' };
    case 'not-activated':
      return { text: t('Dernière partie : 3D Vision prête, mais pas activée'), detail: t('Allume les lunettes, vérifie l’émetteur ; Ctrl+T active ou coupe la 3D dans le pilote'), tone: 'warning' };
    case 'fallback':
      return { text: t('Dernière partie : sans 3D Vision, image côte à côte'), detail: o.line, tone: 'warning' };
    case 'ready':
      return { text: t('Dernière partie : mode 3D Vision prêt'), detail: t('Le pilote n’a pas dit si la 3D s’est activée'), tone: 'quiet' };
    case 'unknown':
      return { text: t('Dernière partie : bilan 3D Vision inconnu'), detail: t('VPX n’a rien écrit sur la 3D Vision dans son journal pour cette partie'), tone: 'warning' };
  }
}

/**
 * La 3D stéréoscopique globale du pilote au lancement de Cyber Pinball. Active (Panneau NVIDIA, ou
 * « Enable 3D » de 3D Fix Manager), le pilote 452.06 prend aussi les fenêtres de Cyber Pinball : leur
 * ouverture reste figée sur sa première image (PinCab, 25/11/2026 : chaque lancement figé dès que
 * 3D Fix Manager l'a activée, reparti dès qu'elle a été coupée). Coupée avant toute fenêtre ; Cyber
 * Pinball la rallume lui-même pour chaque partie en relief.
 */
export interface StartupStereo {
  /** Lue avant ; undefined : inconnue (pas de pilote NVIDIA, pas de pilote 3D, sonde muette). */
  before?: boolean;
  /** Relue après la coupure ; seulement si elle était active. */
  after?: boolean;
}

/** Délai avant la relecture : 3D Fix Manager ouvert remet son bouton « Enable 3D » dans la seconde. */
export const STARTUP_STEREO_SETTLE_MS = 1500;

/**
 * Lit la stéréo et ne la coupe que si elle est active, puis la relit après STARTUP_STEREO_SETTLE_MS.
 * `probe` : un processus neuf à chaque appel (NVAPI garde dans un processus l'état lu la première fois).
 * Asynchrone : le processus principal reste libre pendant la sonde (5 s sur la PinCab, 26/11/2026).
 */
export async function cutStereoAtStart(
  probe: (op: 'read' | 'disable') => Promise<{ nvapi: boolean; stereo?: boolean }>,
  wait: (ms: number) => Promise<void>,
): Promise<StartupStereo> {
  const read = await probe('read');
  if (!read.nvapi || read.stereo !== true) return read.nvapi && read.stereo === false ? { before: false } : {};
  await probe('disable');
  await wait(STARTUP_STEREO_SETTLE_MS);
  const again = await probe('read');
  return { before: true, ...(again.nvapi && again.stereo !== undefined ? { after: again.stereo } : {}) };
}

export function stereoGlassesKindLabel(kind: StereoGlassesKind): string {
  return kind === 'nvidia' ? t('actives NVIDIA 3D Vision') : t('à filtres colorés');
}
