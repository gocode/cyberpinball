// Luminosité des LED réglée par le joueur (animations hors partie, effets des tables sans ROM) : le
// pourcentage affiché est une CLARTÉ PERÇUE, pas une fraction de la valeur envoyée aux bandes.
//
// Une LED (WS2812, OctoWS2811) émet une lumière proportionnelle à son octet, mais l'œil ne la perçoit pas
// ainsi : 30 % de l'octet paraît déjà aux deux tiers allumé, et 10 % reste franc dans une pièce sombre
// (retour d'essai du 26/11/2026 : « 30 % encore aveuglant », « 10 % encore très lumineux »). Le
// pourcentage passe donc par la courbe de clarté CIE L* (`ledLevelGain`) : 50 % donne 18 % de la
// lumière et paraît à moitié allumé, 10 % en donne 1,1 % (très tamisé), 1 % un millième (la
// quasi-extinction), 0 % éteint, 100 % inchangé. En haut de plage, elle se comporte comme un gamma 3 ;
// en bas, elle redevient linéaire, sans écraser les petits pourcentages à zéro.
//
// Le gain est un multiplicateur de la lumière : les trois canaux d'une LED sont multipliés par le même
// nombre, la teinte ne change pas. Il s'applique en flottant, et l'arrondi final en octet passe par
// `ledDitherByte` : à faible niveau, une valeur de 0,4 n'est pas arrondie à 0 sur toute la bande, mais
// allume 40 % des LED à 1, réparties le long de la bande (pas d'escalier quand la luminosité descend, et
// la nuance se voit encore là où un arrondi simple éteindrait tout). Le motif est fixe par LED : rien ne
// scintille.
//
// Les anciens réglages étaient une fraction linéaire de l'octet : `ledLevelFromLinear` donne le
// pourcentage perçu qui rend la même lumière, arrondi au cran le plus proche de `LED_LEVEL_CHOICES`.

/**
 * Crans proposés, de 10 en 10 (demande du 26/11/2026) : la courbe étant perçue, chaque cran paraît un pas
 * égal ; 10 % est déjà la quasi-extinction (3 sur 255 pour un blanc plein), 0 % éteint.
 */
export const LED_LEVEL_CHOICES: readonly number[] = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100];

/** Valeur écrite dans les fichiers de réglage dont les pourcentages de luminosité sont perçus (sinon : anciens, linéaires). */
export const LED_LEVEL_SCALE = 'perceived';

const KAPPA = 24389 / 27; // 903,3 : pente de la partie linéaire de CIE L*
const EPSILON_L = 8; // clarté où la courbe passe du linéaire au cube

/** Lumière (0 à 1, fraction de l'octet plein) d'un pourcentage de clarté perçue (0 à 100). */
export function ledLevelGain(percent: number): number {
  if (!Number.isFinite(percent) || percent <= 0) return 0;
  if (percent >= 100) return 1;
  return percent > EPSILON_L ? ((percent + 16) / 116) ** 3 : percent / KAPPA;
}

/** Clarté perçue (0 à 100, non arrondie) d'une lumière linéaire (0 à 1) : l'inverse de `ledLevelGain`. */
export function ledLevelOf(linear: number): number {
  if (!Number.isFinite(linear) || linear <= 0) return 0;
  if (linear >= 1) return 100;
  const l = linear > EPSILON_L / KAPPA ? 116 * Math.cbrt(linear) - 16 : linear * KAPPA;
  return Math.max(0, Math.min(100, l));
}

/** Le cran de `choices` le plus proche de `percent` (à égalité, le plus bas : jamais plus fort qu'attendu). */
export function nearestLedLevel(percent: number, choices: readonly number[] = LED_LEVEL_CHOICES): number {
  let best = choices[0] ?? 0;
  for (const c of choices) if (Math.abs(c - percent) < Math.abs(best - percent)) best = c;
  return best;
}

/**
 * Ancien réglage (pourcentage linéaire de l'octet, 0 à 100) vers le nouveau : le cran perçu qui donne la
 * même lumière. 100 reste 100, 0 reste 0 ; 30 devient 60, 10 devient 40.
 */
export function ledLevelFromLinear(linearPercent: number): number {
  if (!Number.isFinite(linearPercent)) return 0;
  return nearestLedLevel(ledLevelOf(Math.max(0, Math.min(100, linearPercent)) / 100));
}

/** Seuil d'arrondi de la LED `k` (0 à 1, répartis le long de la bande par le nombre d'or). */
export function ledDitherThreshold(k: number): number {
  const x = 0.5 + k * 0.6180339887498949;
  return x - Math.floor(x);
}

/**
 * Octet d'une valeur flottante (0 à 255) pour la LED `k` : arrondi par le seuil de la LED, de sorte
 * qu'en moyenne sur la bande la lumière soit exacte même sous une unité. Les trois canaux d'une LED
 * partagent le même seuil.
 */
export function ledDitherByte(value: number, k: number): number {
  if (!(value > 0)) return 0;
  if (value >= 255) return 255;
  return Math.floor(value + ledDitherThreshold(k));
}
