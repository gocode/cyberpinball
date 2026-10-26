// Police du DMD du menu, dessinée pour Cyber Pinball : des capitales de 5 × 7 points, comme
// celles des afficheurs à points des années 1990, et leurs agrandissements lissés par Scale2x
// (EPX, Eric Johnston, 1992 ; algorithme du domaine public) : 10 × 14 points pour les textes
// en grand, 20 × 28 pour l'horloge. Aucune police de tiers : rien à créditer.
//
// Chaque signe est une liste de lignes, « # » pour un point allumé ; sa largeur est celle
// de ses lignes (5 en général, moins pour la ponctuation). Les lettres accentuées perdent
// leur accent (comme sur les vrais DMD), les signes inconnus deviennent « ? ».

/** Image de points : w × h, 1 point allumé, 0 éteint. */
export interface DotBitmap {
  w: number;
  h: number;
  px: Uint8Array;
}

const SMALL_GLYPHS: Record<string, string[]> = {
  A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  B: ['####.', '#...#', '#...#', '####.', '#...#', '#...#', '####.'],
  C: ['.###.', '#...#', '#....', '#....', '#....', '#...#', '.###.'],
  D: ['####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'],
  E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
  F: ['#####', '#....', '#....', '####.', '#....', '#....', '#....'],
  G: ['.###.', '#...#', '#....', '#.###', '#...#', '#...#', '.####'],
  H: ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  I: ['###', '.#.', '.#.', '.#.', '.#.', '.#.', '###'],
  J: ['..###', '...#.', '...#.', '...#.', '...#.', '#..#.', '.##..'],
  K: ['#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#'],
  L: ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
  M: ['#...#', '##.##', '#.#.#', '#.#.#', '#...#', '#...#', '#...#'],
  N: ['#...#', '#...#', '##..#', '#.#.#', '#..##', '#...#', '#...#'],
  O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  P: ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
  Q: ['.###.', '#...#', '#...#', '#...#', '#.#.#', '#..#.', '.##.#'],
  R: ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
  S: ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
  T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
  U: ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  V: ['#...#', '#...#', '#...#', '#...#', '#...#', '.#.#.', '..#..'],
  W: ['#...#', '#...#', '#...#', '#.#.#', '#.#.#', '#.#.#', '.#.#.'],
  X: ['#...#', '#...#', '.#.#.', '..#..', '.#.#.', '#...#', '#...#'],
  Y: ['#...#', '#...#', '.#.#.', '..#..', '..#..', '..#..', '..#..'],
  Z: ['#####', '....#', '...#.', '..#..', '.#...', '#....', '#####'],
  '0': ['.###.', '#...#', '#..##', '#.#.#', '##..#', '#...#', '.###.'],
  '1': ['..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  '2': ['.###.', '#...#', '....#', '...#.', '..#..', '.#...', '#####'],
  '3': ['#####', '...#.', '..#..', '...#.', '....#', '#...#', '.###.'],
  // 4 ouvert : la diagonale du 4 fermé devenait une masse oblique une fois agrandie (revue du 26/10/2026).
  '4': ['#..#.', '#..#.', '#..#.', '#####', '...#.', '...#.', '...#.'],
  '5': ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'],
  '6': ['..##.', '.#...', '#....', '####.', '#...#', '#...#', '.###.'],
  '7': ['#####', '....#', '...#.', '..#..', '.#...', '.#...', '.#...'],
  '8': ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'],
  '9': ['.###.', '#...#', '#...#', '.####', '....#', '...#.', '.##..'],
  ' ': ['...', '...', '...', '...', '...', '...', '...'],
  /** Séparateur de milliers des scores : un point en bas, d'une seule colonne. */
  '\u2024': ['.', '.', '.', '.', '.', '.', '#'],
  '.': ['..', '..', '..', '..', '..', '##', '##'],
  ',': ['..', '..', '..', '..', '##', '.#', '#.'],
  ':': ['..', '##', '##', '..', '##', '##', '..'],
  ';': ['..', '##', '##', '..', '##', '.#', '#.'],
  '!': ['#', '#', '#', '#', '#', '.', '#'],
  '?': ['.###.', '#...#', '....#', '...#.', '..#..', '.....', '..#..'],
  "'": ['#', '#', '.', '.', '.', '.', '.'],
  '"': ['#.#', '#.#', '...', '...', '...', '...', '...'],
  '-': ['....', '....', '....', '####', '....', '....', '....'],
  '+': ['.....', '..#..', '..#..', '#####', '..#..', '..#..', '.....'],
  '=': ['....', '....', '####', '....', '####', '....', '....'],
  '/': ['....#', '....#', '...#.', '..#..', '.#...', '#....', '#....'],
  '(': ['..#', '.#.', '#..', '#..', '#..', '.#.', '..#'],
  ')': ['#..', '.#.', '..#', '..#', '..#', '.#.', '#..'],
  '&': ['.##..', '#..#.', '#.#..', '.#...', '#.#.#', '#..#.', '.##.#'],
  '#': ['.#.#.', '.#.#.', '#####', '.#.#.', '#####', '.#.#.', '.#.#.'],
  '%': ['##..#', '##..#', '...#.', '..#..', '.#...', '#..##', '#..##'],
  '*': ['.....', '#.#.#', '.###.', '#####', '.###.', '#.#.#', '.....'],
  '<': ['...#', '..#.', '.#..', '#...', '.#..', '..#.', '...#'],
  '>': ['#...', '.#..', '..#.', '...#', '..#.', '.#..', '#...'],
  _: ['.....', '.....', '.....', '.....', '.....', '.....', '#####'],
  '@': ['.###.', '#...#', '#.###', '#.#.#', '#.###', '#....', '.####'],
  '·': ['..', '..', '..', '##', '##', '..', '..'],
};

/** Une police : hauteur des signes, espace entre deux signes, et les signes eux-mêmes. */
export interface DmdFont {
  height: number;
  spacing: number;
  glyphs: Map<string, DotBitmap>;
}

function fromRows(rows: string[]): DotBitmap {
  const w = rows[0]!.length;
  const h = rows.length;
  const px = new Uint8Array(w * h);
  rows.forEach((row, y) => [...row].forEach((c, x) => (px[y * w + x] = c === '#' ? 1 : 0)));
  return { w, h, px };
}

/**
 * Scale2x (EPX) : chaque point devient quatre, et un coin prend la valeur de ses deux
 * voisins quand ils sont égaux (et que les deux autres diffèrent) : les diagonales des
 * lettres restent des diagonales au lieu de devenir des escaliers.
 */
export function scale2x(src: DotBitmap): DotBitmap {
  const { w, h } = src;
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : src.px[y * w + x]!);
  const out = new Uint8Array(w * 2 * h * 2);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = at(x, y);
      const a = at(x, y - 1);
      const b = at(x + 1, y);
      const c = at(x - 1, y);
      const d = at(x, y + 1);
      let e0 = p;
      let e1 = p;
      let e2 = p;
      let e3 = p;
      if (c === a && c !== d && a !== b) e0 = a;
      if (a === b && a !== c && b !== d) e1 = b;
      if (d === c && d !== b && c !== a) e2 = c;
      if (b === d && b !== a && d !== c) e3 = d;
      const o = y * 2 * w * 2 + x * 2;
      out[o] = e0;
      out[o + 1] = e1;
      out[o + w * 2] = e2;
      out[o + w * 2 + 1] = e3;
    }
  }
  return { w: w * 2, h: h * 2, px: out };
}

/**
 * Agrandissement d'une police. Les grands textes gardent un seul point entre deux lettres, et
 * deux pour l'espace (4 points entre deux mots) : plus de titres tiennent sans défiler, à
 * texture égale (revue du directeur artistique, 26/10/2026).
 */
function scaled(font: DmdFont, spacing: number, space: number): DmdFont {
  const glyphs = new Map([...font.glyphs].map(([k, g]) => [k, scale2x(g)]));
  glyphs.set(' ', { w: space, h: font.height * 2, px: new Uint8Array(space * font.height * 2) });
  return { height: font.height * 2, spacing, glyphs };
}

/** 5 × 7 : la police des textes courants (deux lignes et plus). */
export const DMD_FONT_SMALL: DmdFont = { height: 7, spacing: 1, glyphs: new Map(Object.entries(SMALL_GLYPHS).map(([k, rows]) => [k, fromRows(rows)])) };
/** 10 × 14 : les textes en grand (PRESS START, les scores). */
export const DMD_FONT_LARGE: DmdFont = scaled(DMD_FONT_SMALL, 1, 2);
/** 20 × 28 : l'horloge, qui remplit l'afficheur. */
export const DMD_FONT_HUGE: DmdFont = scaled(DMD_FONT_LARGE, 2, 4);

/** Texte tel qu'un DMD l'écrit : capitales sans accent, signes inconnus en « ? », espaces simples. */
export function dmdText(raw: string): string {
  const plain = raw
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/ß/g, 'SS')
    .replace(/[Ææ]/g, 'AE')
    .replace(/[Œœ]/g, 'OE')
    .replace(/[Øø]/g, 'O')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
  return [...plain].map((c) => (SMALL_GLYPHS[c] ? c : '?')).join('');
}

/** Largeur en points d'un texte (déjà passé par dmdText). */
export function textWidth(font: DmdFont, text: string): number {
  let w = 0;
  for (const c of text) w += (font.glyphs.get(c) ?? font.glyphs.get('?')!).w + font.spacing;
  return Math.max(0, w - font.spacing);
}
