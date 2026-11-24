// Fond des aperçus du cadrage (24/11/2026). VPX vide l'image en noir, et le bois des rails de la table est presque noir
// lui aussi : sur la carte, le bord de la table se perdait (retour d'un joueur). Ce qui touche le bord de l'image et reste
// noir pur n'est pas la table : c'est peint d'un motif de rayures bleutées, bien distinct de tout ce que la table montre.

import type { RgbaImage } from './png';

/** Un pixel est « noir de VPX » quand sa plus forte composante ne dépasse pas ce seuil (le bois des rails monte plus haut). */
export const OUTSIDE_BLACK_MAX = 2;

/** Le noir de VPX est bruité (jusqu'à 7) : un pixel presque noir, entouré en majorité de fond peint, est du fond aussi. */
const SPECK_MAX = 8;
const SPECK_NEIGHBOURS = 3;
const SPECK_PASSES = 6;

const STRIPE_A: [number, number, number] = [62, 72, 92];
const STRIPE_B: [number, number, number] = [44, 52, 68];
const STRIPE_WIDTH = 8;

/**
 * Peint, dans l'image, la zone noire reliée à son bord (rayures diagonales) ; renvoie le nombre de pixels peints.
 * La table, ses rails et ses ombres, qui ne sont jamais d'un noir pur, ne sont pas touchés.
 */
export function paintOutside(img: RgbaImage): number {
  const { width: w, height: h, data } = img;
  const black = (i: number) => Math.max(data[i * 4]!, data[i * 4 + 1]!, data[i * 4 + 2]!) <= OUTSIDE_BLACK_MAX;
  const seen = new Uint8Array(w * h);
  const stack: number[] = [];
  const push = (i: number) => {
    if (!seen[i] && black(i)) {
      seen[i] = 1;
      stack.push(i);
    }
  };
  for (let x = 0; x < w; x++) {
    push(x);
    push((h - 1) * w + x);
  }
  for (let y = 0; y < h; y++) {
    push(y * w);
    push(y * w + w - 1);
  }
  let painted = 0;
  const paint = (i: number) => {
    const x = i % w;
    const y = (i - x) / w;
    const [r, g, b] = (Math.floor((x + y) / STRIPE_WIDTH) & 1 ? STRIPE_A : STRIPE_B) as [number, number, number];
    data[i * 4] = r;
    data[i * 4 + 1] = g;
    data[i * 4 + 2] = b;
    data[i * 4 + 3] = 255;
    painted++;
  };
  while (stack.length) {
    const i = stack.pop()!;
    const x = i % w;
    const y = (i - x) / w;
    paint(i);
    if (x > 0) push(i - 1);
    if (x < w - 1) push(i + 1);
    if (y > 0) push(i - w);
    if (y < h - 1) push(i + w);
  }
  // Sans noir pur au bord, la table remplit l'image : rien d'autre à peindre.
  if (!painted) return 0;
  // Les grains du bruit, restés au milieu du fond.
  for (let pass = 0; pass < SPECK_PASSES; pass++) {
    const grains: number[] = [];
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (seen[i] || Math.max(data[i * 4]!, data[i * 4 + 1]!, data[i * 4 + 2]!) > SPECK_MAX) continue;
        let around = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (!dx && !dy) continue;
            const nx = x + dx;
            const ny = y + dy;
            // Hors de l'image : du fond, comme le bord lui-même.
            if (nx < 0 || ny < 0 || nx >= w || ny >= h || seen[ny * w + nx]) around++;
          }
        }
        if (around >= SPECK_NEIGHBOURS) grains.push(i);
      }
    }
    if (!grains.length) break;
    for (const i of grains) {
      seen[i] = 1;
      paint(i);
    }
  }
  return painted;
}
