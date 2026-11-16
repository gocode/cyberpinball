// Saisie de texte du clavier à l'écran : un point d'insertion dans le texte, déplacé par les
// flèches (celles d'un clavier, ou les touches ◀ ▶ du clavier à l'écran), et les emojis.
//
// Novembre 2026 : le clavier à l'écran n'avait pas de point d'insertion. Tout se tapait à la
// fin, les flèches du clavier du PC n'y faisaient rien, et une faute au milieu d'un message
// obligeait à tout effacer jusqu'à elle. Un emoji ou une lettre accentuée composée tient
// plusieurs unités de code : le point se déplace d'un caractère affiché (graphème) à la fois,
// jamais au milieu d'un emoji.

/** Texte et point d'insertion (rang en unités de code, entre deux graphèmes ; `at` absent : à la fin). */
export interface CaretText {
  value: string;
  at?: number;
}

const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

/** Les bornes des graphèmes de `value` : 0, puis la fin de chacun. */
function bounds(value: string): number[] {
  const out = [0];
  for (const s of segmenter.segment(value)) out.push(s.index + s.segment.length);
  return out;
}

/** Le point d'insertion, ramené dans le texte et sur une borne de graphème. */
export function caretOf(t: CaretText): number {
  const at = t.at ?? t.value.length;
  if (at >= t.value.length) return t.value.length;
  if (at <= 0) return 0;
  const b = bounds(t.value);
  // La borne juste avant (un point arrivé au milieu d'un emoji recule à son début).
  let best = 0;
  for (const x of b) if (x <= at) best = x;
  return best;
}

/** Le texte avant le point d'insertion. */
export function beforeCaret(t: CaretText): string {
  return t.value.slice(0, caretOf(t));
}

/** Le texte après le point d'insertion. */
export function afterCaret(t: CaretText): string {
  return t.value.slice(caretOf(t));
}

/** Pose le point : à la fin, il n'est pas retenu (ce qui arrive ensuite s'ajoute à la fin). */
function place(t: CaretText, at: number): void {
  if (at >= t.value.length) delete t.at;
  else t.at = Math.max(0, at);
}

/** Insère `text` au point d'insertion, qui passe après lui. */
export function insertAtCaret(t: CaretText, text: string): void {
  const at = caretOf(t);
  t.value = t.value.slice(0, at) + text + t.value.slice(at);
  place(t, at + text.length);
}

/** Retour arrière : le graphème avant le point. Rien avant lui : faux. */
export function eraseBeforeCaret(t: CaretText): boolean {
  const at = caretOf(t);
  if (at === 0) return false;
  const b = bounds(t.value);
  const from = b[b.indexOf(at) - 1] ?? 0;
  t.value = t.value.slice(0, from) + t.value.slice(at);
  place(t, from);
  return true;
}

/** Suppr : le graphème après le point. Rien après lui : faux. */
export function eraseAfterCaret(t: CaretText): boolean {
  const at = caretOf(t);
  if (at >= t.value.length) return false;
  const b = bounds(t.value);
  const to = b[b.indexOf(at) + 1] ?? t.value.length;
  t.value = t.value.slice(0, at) + t.value.slice(to);
  place(t, at);
  return true;
}

/** Déplace le point d'un graphème (-1 : à gauche, 1 : à droite), ou au début / à la fin du texte. */
export function moveCaret(t: CaretText, step: -1 | 1 | 'start' | 'end'): void {
  if (step === 'start') return place(t, 0);
  if (step === 'end') return place(t, t.value.length);
  const b = bounds(t.value);
  const i = b.indexOf(caretOf(t));
  place(t, b[Math.min(b.length - 1, Math.max(0, i + step))]!);
}

/** Le point est-il en début de mot (début du texte ou après une espace) : la lettre suivante prend la majuscule. */
export function atWordStart(t: CaretText): boolean {
  const before = beforeCaret(t);
  return before === '' || before.endsWith(' ');
}

/**
 * Texte arrivé d'ailleurs que les touches (panneau des emojis de Windows, Win + point ; méthode
 * de saisie d'une autre langue) : une seule ligne, sans caractère de commande.
 */
export function cleanInserted(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/[\r\n\t]+/g, ' ').replace(/[\u0000-\u001f\u007f]/g, '');
}

/**
 * Emojis du panneau du clavier à l'écran : réactions d'une partie et d'une discussion, quatre
 * rangées de dix. Chacun s'affiche en un seul caractère avec la police d'emojis de Windows.
 */
export const KEYBOARD_EMOJIS: readonly string[] = [
  '😀', '😂', '😅', '😉', '😍', '😎', '🤔', '😮', '😢', '😡',
  '👍', '👎', '👏', '🙏', '💪', '🤝', '👋', '👀', '🙌', '🤞',
  '🔥', '⭐', '🏆', '🎉', '🎯', '💯', '⚡', '💥', '🚀', '🍀',
  '❤️', '💔', '😴', '🤯', '🥳', '😬', '🙃', '🕹️', '✅', '❌',
];
