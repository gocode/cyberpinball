// Profil graphique de VPX pour les parties dans le casque, selon la machine, et relevé de Link.
//
// Essai du 10 novembre 2026 : VPX saccadait dans le casque (Link : environ 700 images par minute
// reprojetées plus de 5 fois, contre 106 à 334 au menu), tous ses réglages graphiques de la VR à leur
// défaut. Le profil est choisi sur des critères généraux de la carte graphique qui porte le casque
// (mémoire vidéo dédiée, machine sur batterie), jamais sur un nom de modèle ; une carte inconnue prend
// le profil prudent. Il n'est écrit dans l'INI de la VR que dans les clés vides : un réglage du joueur
// l'emporte toujours.
//
// [PlayerVR] ResFactor n'est pas utilisé : VPX 10.8.1 (rév. 5436, VRDevice::SetupHMD) compare la
// résolution demandée à une limite de texture lue avant que son rendu ne démarre (bgfx::getCaps() à
// zéro), et retombe toujours sur la résolution recommandée du casque (« Requested resolution exceed the
// GPU capability » au journal de VPX, même ResFactor vide). Le suréchantillonnage passe par
// [Player] AAFactor ; la résolution de rendu du casque se règle dans l'application Oculus.

import type { VpxSetting } from './vpx';

export type VrGraphicsProfileId = 'prudent' | 'standard' | 'puissant';

/** La carte graphique du casque, dite par le compagnon (« carte <Mo> batterie|secteur <nom> »). */
export interface VrGpu {
  /** Mémoire vidéo dédiée, en Mo. */
  vramMb: number;
  /** Machine sur batterie (portable) : sa carte est bien moins puissante qu'une carte de bureau de même mémoire. */
  laptop: boolean;
  name: string;
}

/** Mémoire vidéo minimale pour chaque profil, en Mo. */
export const VR_PROFILE_VRAM_MB = { standard: 6 * 1024, puissant: 10 * 1024 } as const;

export function vrGraphicsProfile(gpu: VrGpu | undefined): { id: VrGraphicsProfileId; why: string } {
  if (!gpu || !(gpu.vramMb > 0)) return { id: 'prudent', why: 'carte graphique inconnue' }; // i18n-ignore : journal
  const gb = `${Math.round(gpu.vramMb / 1024)} Go`;
  if (gpu.vramMb >= VR_PROFILE_VRAM_MB.puissant && !gpu.laptop) return { id: 'puissant', why: `${gb} de mémoire vidéo, machine de bureau` }; // i18n-ignore : journal
  if (gpu.vramMb >= VR_PROFILE_VRAM_MB.standard) return { id: 'standard', why: `${gb} de mémoire vidéo${gpu.laptop ? ', portable' : ''}` }; // i18n-ignore : journal
  return { id: 'prudent', why: `${gb} de mémoire vidéo seulement` }; // i18n-ignore : journal
}

const player = (key: string, value: string): VpxSetting => ({ section: 'Player', key, value });

/**
 * Les réglages de VPX d'un profil ([Player], partagés par la VR). Prudent et standard visent les
 * 72 Hz tenus ; puissant gagne en netteté (suréchantillonnage 1,25) et garde bloom et reflets.
 */
export function vrProfileSettings(id: VrGraphicsProfileId): VpxSetting[] {
  // MSAA : 4 échantillons au moins dans VPX, trop cher à la résolution du casque ; FXAA à la place.
  const common = [player('MSAASamples', '0'), player('SSRefl', '0'), player('ForceMotionBlurOff', '1')];
  switch (id) {
    case 'prudent':
      // Reflets des billes seulement, ni occlusion ambiante ni bloom.
      return [...common, player('AAFactor', '1'), player('FXAA', '1'), player('DisableAO', '1'), player('PFReflection', '1'), player('ForceBloomOff', '1')];
    case 'standard':
      // Reflets statiques, ni occlusion ambiante ni bloom.
      return [...common, player('AAFactor', '1'), player('FXAA', '1'), player('DisableAO', '1'), player('PFReflection', '2'), player('ForceBloomOff', '1')];
    case 'puissant':
      // Suréchantillonnage 1,25, occlusion ambiante statique, reflets statiques et des billes, bloom gardé.
      return [...common, player('AAFactor', '1.25'), player('FXAA', '2'), player('DisableAO', '0'), player('DynamicAO', '0'), player('PFReflection', '3'), player('ForceBloomOff', '0')];
  }
}

/** Une minute de statistiques de Link (journal de performance d'Oculus, oculus_pc_xrs_stats_event). */
export interface LinkStats {
  /** Heure de la minute relevée (s depuis 1970). */
  at: number;
  presented: number;
  lost: number;
  /** Images du PC réaffichées plus de 5 fois : l'application n'en donnait pas de nouvelle. */
  stale: number;
  appFrames: number;
  encode?: string;
}

/**
 * Les minutes de Link entre deux heures (s depuis 1970), lues dans le journal de performance d'Oculus
 * (PerfLog_*.json : un tableau d'objets à plat, parfois tronqué ou avec des caractères de contrôle).
 */
export function linkStatsBetween(text: string, from: number, to: number): LinkStats[] {
  const out: LinkStats[] = [];
  for (const block of text.match(/\{[^{}]*"event":\s*"oculus_pc_xrs_stats_event"[^{}]*\}/g) ?? []) {
    const num = (key: string) => {
      const m = new RegExp(`"${key}":\\s*"?(-?[\\d.]+)"?`).exec(block);
      return m ? Number(m[1]) : undefined;
    };
    const at = num('timestamp_epoch');
    const presented = num('num_pc_presented_frames');
    if (at === undefined || presented === undefined || at < from || at > to + 60) continue;
    const w = num('encode_width');
    const h = num('encode_height');
    out.push({ at, presented, lost: num('lost_pc_presented_frames') ?? 0, stale: num('num_pc_reprojected_frames_greater_than_5') ?? 0, appFrames: num('num_completed_app_frames') ?? 0, ...(w && h && { encode: `${w}×${h}` }) });
  }
  return out;
}

/** Bilan d'une partie : moyennes par minute, et la pire minute (images réaffichées plus de 5 fois). */
export function linkStatsSummary(rows: readonly LinkStats[]): { minutes: number; presented: number; lost: number; stale: number; worstStale: number } | undefined {
  if (!rows.length) return undefined;
  const mean = (f: (r: LinkStats) => number) => Math.round(rows.reduce((s, r) => s + f(r), 0) / rows.length);
  return { minutes: rows.length, presented: mean((r) => r.presented), lost: mean((r) => r.lost), stale: mean((r) => r.stale), worstStale: Math.max(...rows.map((r) => r.stale)) };
}

/** Identifiants des rendus du fronton du plugin « CyberPinball » (packages/vpx-vision3d/src/cyberpinball.cpp). */
export const PAUSE_RENDERER = 'CyberPinball.Pause';
export const FALLBACK_RENDERER = 'CyberPinball.Fond';
/** Rendu de veille du ScoreView et du topper : il note que VPX dessine la fenêtre, sans rien dessiner. */
export const WATCH_RENDERER = 'CyberPinball.Veille';
/** Les rendus du fronton que VPX 10.8.1 charge, dans l'ordre de chargement des plugins (à priorité égale). */
const BACKGLASS_RENDERERS = ['B2S', 'PUP'];

/**
 * Réglages de la pause dans le casque pour l'INI d'une partie dans le casque : le plugin activé, ses
 * libellés (langue de l'application), et les priorités des fenêtres annexes. VPX essaie les rendus
 * annexes du plus prioritaire au moins prioritaire (0 à 100), le premier qui dessine l'emporte :
 * - fronton : la pause en tête, le fond opaque en dernier ; un autre rendu réglé à 100 (PuP l'est
 *   d'office) descend à 99. Hors de la pause, le plugin dessine lui-même le rendu suivant, cadré
 *   (proportions gardées) : l'ordre de ces rendus lui est donné (`Order`, du plus prioritaire au moins
 *   prioritaire, sans ceux qui sont coupés par une priorité négative) ;
 * - ScoreView et topper : la veille en tête (elle note que VPX dessine la fenêtre, pour que le plugin ne
 *   fasse pas dessiner PuP à vide une seconde fois), PuP descendu à 99 de même.
 */
export function pauseVrSettings(iniText: string, labels: { pause: string; resume: string; quit: string; help?: string; resumeHint?: string }): VpxSetting[] {
  const out: VpxSetting[] = [
    { section: 'Plugin.CyberPinball', key: 'Enable', value: '1' },
    { section: 'Plugin.CyberPinball', key: 'Pause', value: labels.pause },
    { section: 'Plugin.CyberPinball', key: 'Resume', value: labels.resume },
    { section: 'Plugin.CyberPinball', key: 'Quit', value: labels.quit },
    // Le rappel des touches sous les choix (lignes séparées par « · ») et celui du bouton Pause quand la reprise n'a pas pris.
    ...(labels.help ? [{ section: 'Plugin.CyberPinball', key: 'Help', value: labels.help }] : []),
    ...(labels.resumeHint ? [{ section: 'Plugin.CyberPinball', key: 'ResumeHint', value: labels.resumeHint }] : []),
    { section: 'Backglass', key: `Priority.${PAUSE_RENDERER}`, value: '100' },
    { section: 'Backglass', key: `Priority.${FALLBACK_RENDERER}`, value: '0' },
    { section: 'ScoreView', key: `Priority.${WATCH_RENDERER}`, value: '100' },
    { section: 'Topper', key: `Priority.${WATCH_RENDERER}`, value: '100' },
  ];
  const ours = new Set([PAUSE_RENDERER, FALLBACK_RENDERER, WATCH_RENDERER]);
  // Priorités du fronton telles que VPX les verra (celles à 100 descendues à 99), pour l'ordre.
  const backglass = new Map<string, number>();
  let section = '';
  for (const line of iniText.split(/\r?\n/)) {
    const head = /^\s*\[([^\]]+)\]/.exec(line);
    if (head) {
      section = head[1]!.trim().toLowerCase();
      continue;
    }
    if (section !== 'backglass' && section !== 'scoreview' && section !== 'topper') continue;
    const prio = /^\s*Priority\.([\w.]+)\s*=\s*(-?\d+)/.exec(line);
    if (!prio || ours.has(prio[1]!)) continue;
    const value = Number(prio[2]);
    const sectionName = section === 'backglass' ? 'Backglass' : section === 'scoreview' ? 'ScoreView' : 'Topper';
    if (value >= 100) out.push({ section: sectionName, key: `Priority.${prio[1]}`, value: '99' });
    if (section === 'backglass') backglass.set(prio[1]!, Math.min(value, 99));
  }
  for (const id of BACKGLASS_RENDERERS) if (!backglass.has(id)) backglass.set(id, 0);
  const order = [...backglass.entries()]
    .filter(([, value]) => value >= 0)
    .map(([id, value], i) => ({ id, value, i: BACKGLASS_RENDERERS.includes(id) ? BACKGLASS_RENDERERS.indexOf(id) : BACKGLASS_RENDERERS.length + i }))
    .sort((x, y) => y.value - x.value || x.i - y.i)
    .map((r) => r.id);
  out.push({ section: 'Plugin.CyberPinball', key: 'Order', value: order.join(',') });
  return out;
}

/**
 * Le script de la table montre son fronton en VR en capturant les fenêtres de PuP
 * (« VR_PupBackglass », VideoCapWidth/VideoCapHeight/VideoCapUpdate) : le lecteur de PuP de PinUp
 * Popper le permettait, celui intégré à VPX 10.8 non, et ce fronton reste vide (essai du 10 novembre
 * 2026, The Matrix : on voyait à travers).
 */
export function tableUsesPupCapture(script: string | undefined): boolean {
  return /\.VideoCap(Width|Height|Update)\b/i.test(script ?? '');
}

/**
 * Fronton posé par VPX dans la scène VR ([PlayerVR] AddBackglass) : sans pièce VR de la table, ou
 * une pièce VR sans flasher du fronton dont le fronton passe par la capture de PuP (il serait vide).
 */
export function vrNeedsVpxBackglass(t: { room: boolean; backglassDisplays: number | undefined; pupCapture: boolean }): boolean {
  return !t.room || (!t.backglassDisplays && t.pupCapture);
}

/**
 * Marques et runtimes de casques VR dans le nom d'une sortie audio de Windows : la sortie de Link
 * (« Casque (Oculus Virtual Audio Device) »), de SteamVR, d'un casque branché (Index, Vive, Reverb,
 * Pico, Varjo, Pimax, Bigscreen…). Des critères généraux, pas le nom d'un seul modèle.
 */
const HEADSET_AUDIO = /\b(oculus|meta quest|quest|rift|virtual audio device|steamvr|valve index|index hmd|vive|reverb|mixed reality|windows mr|pico|varjo|pimax|bigscreen|virtual desktop|\bvr\b)/i;

/**
 * La sortie audio du casque parmi celles de Windows (essai du 10 novembre 2026 : le son restait sur le
 * PC, jamais dans les écouteurs du casque). La plus évidente d'abord (« virtual audio device » d'un
 * runtime), sinon la première qui nomme un casque ; undefined si aucune.
 */
export function headsetAudioOutput<T extends { friendlyName: string; deviceDesc?: string; interfaceName?: string }>(outputs: readonly T[] | undefined): T | undefined {
  const named = (o: T) => `${o.friendlyName} ${o.deviceDesc ?? ''} ${o.interfaceName ?? ''}`;
  const candidates = (outputs ?? []).filter((o) => HEADSET_AUDIO.test(named(o)));
  return candidates.find((o) => /virtual audio device/i.test(named(o))) ?? candidates[0];
}

/** Les deux sorties de VPX (son de la table, et fronton : ROM, PuP, musique) sur la sortie du casque. */
export function vrAudioSettings(friendlyName: string): VpxSetting[] {
  return [
    { section: 'Player', key: 'SoundDevice', value: friendlyName },
    { section: 'Player', key: 'SoundDeviceBG', value: friendlyName },
  ];
}
