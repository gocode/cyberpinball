// Charge du PC pendant une partie : ce que prennent Cyber Pinball (processus principal, GPU de
// Chromium, pages des écrans) et VPX, relevé toutes les quelques secondes et résumé dans le journal à
// la fin de la partie. Pendant une partie, le menu doit être au repos : ses fenêtres restent derrière
// VPX avec une image fixe, le compagnon du casque est arrêté, rien n'est peint hors écran. La ligne
// du journal le vérifie sur la borne, partie après partie, et sert à comparer avant et après un
// changement (réglages de Link, pilote, version de VPX).

/** Part de Cyber Pinball : processus principal, GPU de Chromium, pages des écrans, autres (son, réseau…). */
export type LoadPart = 'main' | 'gpu' | 'pages' | 'other';

export const LOAD_PARTS: readonly LoadPart[] = ['main', 'gpu', 'pages', 'other'];

/** Un relevé : la charge de chaque part, en pourcentage d'un cœur, et celle de VPX s'il est lu. */
export interface LoadSample {
  ours: Record<LoadPart, number>;
  vpx?: number;
}

/** Part d'un processus d'Electron, d'après son type (app.getAppMetrics : Browser, GPU, Tab, Utility…). */
export function loadPart(type: string): LoadPart {
  if (type === 'Browser') return 'main';
  if (type === 'GPU') return 'gpu';
  if (type === 'Tab') return 'pages';
  return 'other';
}

/** Relevé à partir des processus d'Electron (type et pourcentage d'un cœur depuis le relevé précédent). */
export function loadSample(processes: { type: string; cpu: number }[], vpx?: number): LoadSample {
  const ours: Record<LoadPart, number> = { main: 0, gpu: 0, pages: 0, other: 0 };
  for (const p of processes) ours[loadPart(p.type)] += Math.max(0, p.cpu);
  return vpx === undefined ? { ours } : { ours, vpx };
}

/** Pourcentage d'un cœur consommé entre deux lectures du temps de processeur (en ms) d'un processus. */
export function cpuPercent(cpuMsBefore: number, cpuMsAfter: number, elapsedMs: number): number {
  if (elapsedMs <= 0) return 0;
  return Math.max(0, ((cpuMsAfter - cpuMsBefore) / elapsedMs) * 100);
}

function total(s: LoadSample): number {
  return LOAD_PARTS.reduce((sum, part) => sum + s.ours[part], 0);
}

function percent(n: number): string {
  return `${(Math.round(n * 10) / 10).toLocaleString('fr-FR')} %`;
}

/**
 * Ligne du journal à la fin d'une partie : moyenne et pointe de Cyber Pinball, le détail de ses parts,
 * et VPX. Sans relevé (partie de moins de quelques secondes), rien.
 */
export function gameLoadReport(samples: LoadSample[], where: 'casque' | 'ecrans', sampleMs: number): string | undefined {
  if (!samples.length) return undefined;
  const mean = (pick: (s: LoadSample) => number, of = samples) => of.reduce((sum, s) => sum + pick(s), 0) / of.length;
  const peak = Math.max(...samples.map(total));
  const detail = LOAD_PARTS.map((part) => `${PART_LABELS[part]} ${percent(mean((s) => s.ours[part]))}`).join(', ');
  const vpxSamples = samples.filter((s) => s.vpx !== undefined);
  const vpx = vpxSamples.length ? ` ; VPX ${percent(mean((s) => s.vpx!, vpxSamples))} d’un cœur en moyenne, ${percent(Math.max(...vpxSamples.map((s) => s.vpx!)))} au plus` : ''; // i18n-ignore : journal
  const seconds = Math.round((samples.length * sampleMs) / 1000);
  return `Charge pendant la partie (${where === 'casque' ? 'dans le casque' : 'sur les écrans'}) : Cyber Pinball ${percent(mean(total))} d’un cœur en moyenne, ${percent(peak)} au plus (${detail})${vpx} ; ${samples.length} relevés sur ${seconds} s.`; // i18n-ignore : journal
}

const PART_LABELS: Record<LoadPart, string> = {
  main: 'principal', // i18n-ignore : journal
  gpu: 'GPU de Chromium', // i18n-ignore : journal
  pages: 'pages des écrans', // i18n-ignore : journal
  other: 'autres', // i18n-ignore : journal
};
