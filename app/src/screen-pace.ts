// Fluidité de l'écran des tables, relevée par le rendu du plateau pendant le défilement
// (renderer/cadence-ecran.js) et écrite au journal (21/11/2026) : les mesures de la roue venaient
// d'un PC de développement, celles-ci viennent de chaque borne. Une ligne par minute d'activité au
// plus, et une en quittant l'écran des tables.

/** Ce que le rendu envoie (cadence-ecran.js) ; tout est relu et borné : il vient d'une page. */
export interface ScreenPace {
  frames: number;
  slow: number;
  worst: number;
  seconds: number;
  usual: number;
  width: number;
  height: number;
}

const num = (v: unknown, max: number): number => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.min(v, max) : 0);
const fr = (v: number, digits = 0) => v.toLocaleString('fr-FR', { maximumFractionDigits: digits }); // i18n-ignore : journal en français

/** Ligne du journal ; undefined si le relevé est vide ou illisible. */
export function screenPaceLine(raw: unknown): string | undefined {
  const p = (raw ?? {}) as Partial<Record<keyof ScreenPace, unknown>>;
  const frames = Math.round(num(p.frames, 1e7));
  if (!frames) return undefined;
  const slow = Math.round(num(p.slow, frames));
  const worst = Math.round(num(p.worst, 1e6));
  const seconds = num(p.seconds, 1e6);
  const usual = num(p.usual, 1000);
  const hz = usual > 0 ? Math.round(1000 / usual) : 0;
  const width = Math.round(num(p.width, 1e5));
  const height = Math.round(num(p.height, 1e5));
  const share = Math.round((slow / frames) * 1000) / 10;
  return `Fluidité de l'écran des tables : ${fr(frames)} images en ${fr(seconds, 1)} s de défilement, ${fr(slow)} lentes (plus de 25 ms, ${fr(share, 1)} %), la plus longue ${fr(worst)} ms ; rythme habituel ${fr(usual, 1)} ms${hz ? ` (${hz} Hz)` : ''} ; plateau ${width} × ${height}.`; // i18n-ignore : journal
}
