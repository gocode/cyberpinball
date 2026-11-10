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
