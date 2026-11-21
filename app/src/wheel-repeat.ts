// Cadence de la roue quand un bouton reste tenu (21/11/2026). Un bouton tenu se répète toutes les
// 33 ms (joystick-input.ts, comme le clavier de Windows ; 70 ms pour le téléphone et les manettes du
// casque) : la roue changeait de table 30 fois par seconde, chaque fois avec l'état complet envoyé à
// tous les écrans, un son de solénoïde et un glissement de 320 ms. Illisible, et la page du plateau
// occupée à 85 % (mesuré en 2160 × 3840). Les répétitions sont ramenées à une table toutes les
// WHEEL_REPEAT_MS ; un nouvel appui, aussi rapide soit-il, passe toujours.

/** Une table au plus toutes les 100 ms quand le bouton est tenu : 10 tables par seconde. */
export const WHEEL_REPEAT_MS = 100;

export class WheelRepeat {
  private last = -Infinity;

  constructor(
    private readonly every = WHEEL_REPEAT_MS,
    private readonly now: () => number = Date.now,
  ) {}

  /**
   * Un appui sur précédent ou suivant fait-il tourner la roue ? `repeat` : répétition d'un bouton tenu.
   * Vrai pour tout nouvel appui ; pour une répétition, seulement WHEEL_REPEAT_MS après le dernier cran.
   */
  take(repeat: boolean): boolean {
    const t = this.now();
    if (!repeat) {
      this.last = t;
      return true;
    }
    const since = t - this.last;
    if (since < this.every) return false;
    // Le cran suivant se compte du précédent, pas de cette répétition : avec des répétitions toutes les
    // 33 ms, repartir de leur heure donnait un cran toutes les 132 ms. Après une pause, on repart d'ici.
    this.last = since < 2 * this.every ? this.last + this.every : t;
    return true;
  }
}
