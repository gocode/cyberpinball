// Écrans d'une table dans le casque : ce que Cyber Pinball retient de chaque partie, pour la suivante.
//
// Règle du 12 novembre 2026 (The Matrix : le fronton de PuP trop petit ; City Hunter : un DMD gris) : chaque
// source (PuP, B2S, DMD, image) remplit la partie visible de son cadre (fronton, bande DMD, cadre DMD de la
// pièce VR), pour toute table, sans valeur propre à une table. Le plugin y pose chaque source proportions
// gardées (pause.h, remplir) et en mesure le remplissage ; ce module garde, par table :
// - les proportions de PuP apprises de ce qu'il dessine (« ratio fenetre=… »), reprises dès la partie suivante
//   (PupRatio, PupDmdRatio) : la correction se fait seule, avant que le joueur en ait besoin ;
// - le réglage du joueur, en dernier recours (pause, « Ajuster les écrans », ligne « reglage ») ;
// - le dernier remplissage mesuré de chaque cadre : sous VR_FILL_MIN, dit au journal et dans la santé de la borne.

import type { VpxSetting } from './vpx';

/** Un cadre bien rempli : au moins cette part de sa zone visible (pause.h, REMPLI_MIN). */
export const VR_FILL_MIN = 0.85;

export type VrFrame = 'fronton' | 'dmd' | 'salle';

export interface VrScreensEntry {
  /** Proportions (largeur / hauteur) apprises de PuP : fronton et DMD. */
  pupRatio?: number;
  pupDmdRatio?: number;
  /** Réglages du joueur, « dx,dy,taille » (pause.h, lireReglage). */
  adjust?: { fronton?: string; dmd?: string };
  /** Dernier remplissage mesuré de chaque cadre dessiné (0 à 1). */
  fill?: Partial<Record<VrFrame, number>>;
  /** Titre de la table, pour le journal et la santé. */
  title?: string;
  at?: string;
}

export type VrScreensStore = Record<string, VrScreensEntry>;

/** Clé d'une table dans le fichier et dans les mesures du plugin ([Plugin.CyberPinball] TableId) : sans espace. */
export function vrTableKey(tableFile: string): string {
  return encodeURIComponent(tableFile.replace(/\\/g, '/').split('/').pop() ?? tableFile);
}

/** Ce qu'un bloc de mesures du plugin (une partie) apprend sur les écrans de la table. */
export function parseVrScreensBlock(text: string): { table?: string; entry: VrScreensEntry } {
  const values = (line: string) => Object.fromEntries([...line.matchAll(/(\w+)=(\S+)/g)].map((m) => [m[1]!, m[2]!]));
  const entry: VrScreensEntry = {};
  let table: string | undefined;
  const ratio = (v: string | undefined) => {
    const n = Number(v);
    return Number.isFinite(n) && n >= 0.25 && n <= 8 ? Math.round(n * 1000) / 1000 : undefined;
  };
  const adjust = (v: string | undefined) => (v && /^-?\d+(\.\d+)?,-?\d+(\.\d+)?,\d+(\.\d+)?$/.test(v) ? v : undefined);
  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith('debut ')) {
      const t = values(line).table;
      if (t && t !== '?') table = t;
    } else if (line.startsWith('ratio ')) {
      const v = values(line);
      const r = ratio(v.valeur);
      if (r && v.fenetre === 'fronton') entry.pupRatio = r;
      if (r && v.fenetre === 'dmd') entry.pupDmdRatio = r;
    } else if (line.startsWith('reglage ')) {
      const v = values(line);
      const fronton = adjust(v.fronton);
      const dmd = adjust(v.dmd);
      entry.adjust = { ...(fronton ? { fronton } : {}), ...(dmd ? { dmd } : {}) };
    } else if (line.startsWith('mesure ')) {
      const v = values(line);
      const fill: Partial<Record<VrFrame, number>> = {};
      for (const frame of ['fronton', 'dmd', 'salle'] as const) {
        const n = Number(v[`remplir_${frame}`]);
        if (Number.isFinite(n) && n >= 0) fill[frame] = Math.min(1, n);
      }
      if (Object.keys(fill).length) entry.fill = fill;
    }
  }
  return { ...(table ? { table } : {}), entry };
}

/** Le fichier mis à jour par une partie : ce qu'elle apprend remplace l'ancien, le reste est gardé. */
export function mergeVrScreens(store: VrScreensStore, key: string, update: VrScreensEntry, at = new Date().toISOString()): VrScreensStore {
  const old = store[key] ?? {};
  return {
    ...store,
    [key]: {
      ...old,
      ...update,
      ...(update.adjust || old.adjust ? { adjust: { ...old.adjust, ...update.adjust } } : {}),
      ...(update.fill ? { fill: update.fill } : old.fill ? { fill: old.fill } : {}),
      at,
    },
  };
}

/** Réglages du plugin pour la table : proportions apprises, réglages du joueur, clé de la table. */
export function vrScreensSettings(key: string, entry: VrScreensEntry | undefined): VpxSetting[] {
  const a = entry?.adjust;
  const screens = [a?.fronton ? `fronton=${a.fronton}` : '', a?.dmd ? `dmd=${a.dmd}` : ''].filter(Boolean).join(';');
  return [
    { section: 'Plugin.CyberPinball', key: 'TableId', value: key },
    { section: 'Plugin.CyberPinball', key: 'PupRatio', value: String(entry?.pupRatio ?? 1.7778) },
    { section: 'Plugin.CyberPinball', key: 'PupDmdRatio', value: String(entry?.pupDmdRatio ?? 1.7778) },
    { section: 'Plugin.CyberPinball', key: 'Screens', value: screens },
  ];
}

/** Les cadres mal remplis à la dernière partie (sous VR_FILL_MIN), du moins rempli au plus rempli. */
export function poorlyFilled(entry: VrScreensEntry | undefined): { frame: VrFrame; fill: number }[] {
  return Object.entries(entry?.fill ?? {})
    .filter(([, v]) => typeof v === 'number' && v < VR_FILL_MIN)
    .map(([frame, fill]) => ({ frame: frame as VrFrame, fill: fill as number }))
    .sort((a, b) => a.fill - b.fill);
}

/** Pour la santé et le journal : « Titre (fronton 62 %) ». */
export function poorFillSummary(store: VrScreensStore): string[] {
  const name: Record<VrFrame, string> = { fronton: 'fronton', dmd: 'DMD', salle: 'DMD de la pièce VR' }; // i18n-ignore : noms des cadres, comme au journal
  return Object.entries(store)
    .map(([key, entry]) => ({ key, entry, poor: poorlyFilled(entry) }))
    .filter((x) => x.poor.length)
    .map((x) => `${x.entry.title ?? decodeURIComponent(x.key)} (${x.poor.map((p) => `${name[p.frame]} ${Math.round(p.fill * 100)} %`).join(', ')})`);
}

/** Proportions d'un cadre DMD d'après les points de son flasher (largeur / hauteur), undefined si inconnues. */
export function frameRatio(points: readonly { x: number; y: number }[]): number | undefined {
  if (points.length < 3) return undefined;
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const w = Math.max(...xs) - Math.min(...xs);
  const h = Math.max(...ys) - Math.min(...ys);
  const r = h > 0 ? w / h : 0;
  return r >= 0.5 && r <= 8 ? Math.round(r * 1000) / 1000 : undefined;
}
