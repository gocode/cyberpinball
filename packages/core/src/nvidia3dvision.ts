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

/**
 * Le playfield est-il l'écran principal de Windows ? Le pilote NVIDIA ne montre la 3D que sur lui.
 * `playfieldDisplay` : [Player] PlayfieldDisplay de VPX (« Nom [x, y] », la position de l'écran sur le
 * bureau) ; l'écran principal est toujours en [0, 0]. Vide : VPX prend l'écran principal. Illisible : undefined.
 * `displays` : l'origine des écrans présents (pixels physiques) ; un écran nommé qui n'y est plus
 * (débranché, bureau réarrangé) fait prendre à VPX l'écran principal.
 */
export function playfieldOnPrimary(playfieldDisplay: string | undefined, displays?: { x: number; y: number }[]): boolean | undefined {
  const value = playfieldDisplay?.trim();
  if (!value) return true;
  const m = /\[\s*(-?\d+)\s*,\s*(-?\d+)\s*\]\s*$/.exec(value);
  if (!m) return undefined;
  const x = Number(m[1]);
  const y = Number(m[2]);
  if (displays && !displays.some((d) => d.x === x && d.y === y)) return true;
  return x === 0 && y === 0;
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
  /** L'émetteur USB est branché ; absent : USB illisible. */
  emitter?: boolean;
  /** Le playfield est l'écran principal de Windows. */
  playfieldPrimary?: boolean;
  /** Le mode de l'écran principal (pixels physiques, fréquence en Hz) ; absent : pas relevé. */
  primaryMode?: { width: number; height: number; hz: number };
  /** Le VPX en place est celui que Cyber Pinball corrige (10.8.1-5436) ; false : une autre version, sans le mode direct. */
  vpxSupported?: boolean;
}

export type Nvidia3dVisionIssueId = 'not-windows' | 'no-nvidia' | 'driver-too-new' | 'stereo-disabled' | 'no-emitter' | 'playfield-not-primary' | 'mode-unsupported' | 'vpx-unsupported';

/**
 * L'émetteur ne synchronise les lunettes que sur un mode décrit dans sa table (registre de NvStUSB,
 * que NvTimingsEd complète) : la fréquence pixel y tient sur 16 bits, en 10 kHz, soit 655,35 MHz au
 * plus (NvTimingsEd plafonne à 650). Les lunettes alternent aussi à 100 Hz au moins (50 images par œil).
 * Relevé sur la borne, 25/11/2026 : iiyama PL4380UH en 3840x2160 à 119,91 Hz, 1 075 MHz, hors table ;
 * les plus grands modes connus du pilote sont en 2560x1440 à 120 Hz.
 */
export const NVIDIA_3DVISION_MAX_PIXEL_MHZ = 655.35;
export const NVIDIA_3DVISION_MIN_HZ = 99;
/** Les blancs d'un mode réduit (CVT-RB) : environ 5 % de pixels en plus de la partie visible. */
const BLANKING = 1.05;

/** Le mode de l'écran ne peut pas être synchronisé par l'émetteur (trop de pixels, ou trop lent). */
export function nvidia3dVisionModeUnsupported(mode: { width: number; height: number; hz: number }): 'pixels' | 'hz' | undefined {
  if (mode.hz < NVIDIA_3DVISION_MIN_HZ) return 'hz';
  return (mode.width * mode.height * mode.hz * BLANKING) / 1e6 > NVIDIA_3DVISION_MAX_PIXEL_MHZ ? 'pixels' : undefined;
}

/** Un manque : ce qui ne va pas, et la marche à suivre. */
export interface Nvidia3dVisionIssue {
  id: Nvidia3dVisionIssueId;
  title: string;
  /** La marche à suivre, une étape par élément. */
  steps: string[];
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
  if (f.playfieldPrimary === false)
    issues.push({
      id: 'playfield-not-primary',
      title: t('Le playfield n’est pas l’écran principal de Windows'),
      steps: [t('Le pilote NVIDIA ne montre la 3D que sur l’écran principal'), t('Paramètres de Windows, Système, Affichage : choisis l’écran du playfield et coche « En faire mon écran principal »'), t('Puis Configuration de la borne, pour que Cyber Pinball retrouve ses écrans')],
    });
  const tooMuch = f.playfieldPrimary !== false && f.primaryMode ? nvidia3dVisionModeUnsupported(f.primaryMode) : undefined;
  if (tooMuch && f.primaryMode) {
    const mode = { width: f.primaryMode.width, height: f.primaryMode.height, hz: Math.round(f.primaryMode.hz) };
    issues.push({
      id: 'mode-unsupported',
      title:
        tooMuch === 'hz'
          ? t('Playfield en {width}x{height} à {hz} Hz : les lunettes 3D Vision demandent 100 Hz au moins', mode)
          : t('Playfield en {width}x{height} à {hz} Hz : trop de pixels pour l’émetteur 3D Vision', mode),
      steps: [
        t('L’émetteur ne synchronise les lunettes que jusqu’à 2560x1440 à 120 Hz environ, et à 100 Hz au moins'),
        t('Pour jouer avec ces lunettes, il faut un mode de playfield dans ces limites ; sinon, prends les lunettes à filtres colorés, qui marchent à toute définition'),
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

export function stereoGlassesKindLabel(kind: StereoGlassesKind): string {
  return kind === 'nvidia' ? t('actives NVIDIA 3D Vision') : t('à filtres colorés');
}
