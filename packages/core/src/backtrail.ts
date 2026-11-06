// Retour nommé (app/src/library.ts) : le bouton de retour en tête d'un écran dit où il mène
// (« ‹ Neon Abyss », « ‹ Téléchargements »), pas seulement « ‹ Retour ». La destination se lit
// du parcours : les écrans traversés pour arriver là, dans l'ordre. Revenir sur l'un d'eux, par
// quelque chemin que ce soit (son retour, une action qui le rouvre), coupe la suite. Un retour
// qui arrive ailleurs que là où son bouton l'annonçait est appris pour la fois suivante, et
// signalé : l'écran devrait alors déclarer sa destination.

/** Un écran affiché : sa clé (sorte, table, titre : le même écran rouvert a la même clé) et son titre. */
export interface BackPlace {
  key: string;
  /** Sorte de l'écran (« sheet », « sheet+manage », « custom »…), « wheel » pour le menu des tables. */
  kind: string;
  heading: string;
}

/** Retour arrivé ailleurs que là où son bouton l'annonçait. */
export interface BackSurprise {
  from: string;
  announced: string;
  landed: string;
}

export class BackTrail<S = unknown> {
  /** Écrans traversés, le plus ancien d'abord : le dernier est celui où mène le retour. */
  private trail: BackPlace[] = [];
  private shown: (BackPlace & { screen: S }) | undefined;
  /** Retours qui ne menaient pas à l'écran d'avant : clé de l'écran → où il mène. */
  private readonly learned = new Map<string, BackPlace>();
  private pending: { from: BackPlace; announced: BackPlace } | undefined;

  /** `home` : là où mène le retour quand plus rien n'est ouvert (le menu des tables). */
  constructor(private readonly home: () => BackPlace) {}

  /**
   * L'écran affiché (`screen` : son objet, pour reconnaître le même écran redessiné même si son
   * titre change), ou undefined quand plus rien n'est ouvert ; renvoie le retour surpris, s'il y en a un.
   */
  arrive(place: BackPlace | undefined, screen?: S): BackSurprise | undefined {
    const check = this.pending;
    this.pending = undefined;
    if (!place) {
      this.trail = [];
      this.shown = undefined;
      return check ? this.verify(check, this.home()) : undefined;
    }
    if (this.shown && this.shown.screen === screen) this.shown = { ...place, screen: screen as S };
    else {
      if (this.shown && this.shown.key !== place.key) {
        const at = this.trail.findIndex((p) => p.key === place.key);
        if (at >= 0) this.trail = this.trail.slice(0, at);
        // Arrivé par un retour sur un écran jamais traversé (le parcours d'une table ramène à sa
        // fiche) : l'écran quitté ne s'empile pas, on en est revenu.
        else if (!check) this.trail.push({ key: this.shown.key, kind: this.shown.kind, heading: this.shown.heading });
      }
      this.shown = { ...place, screen: screen as S };
    }
    return check && check.from.key !== place.key ? this.verify(check, place) : undefined;
  }

  /** Où mène le retour de l'écran affiché : appris s'il a déjà surpris, sinon l'écran d'avant, sinon `home`. */
  destination(): BackPlace {
    return (this.shown && this.learned.get(this.shown.key)) ?? this.trail.at(-1) ?? this.home();
  }

  /** Un retour part de l'écran affiché : ce que son bouton annonce, vérifié à l'écran suivant (arrive). */
  expect(): void {
    if (this.shown) this.pending = { from: this.shown, announced: this.destination() };
  }

  /** Plus rien n'est ouvert (gestion des tables fermée) : le parcours repart de zéro. */
  reset(): void {
    this.trail = [];
    this.shown = undefined;
    this.pending = undefined;
  }

  private verify(check: { from: BackPlace; announced: BackPlace }, to: BackPlace): BackSurprise | undefined {
    if (check.announced.key === to.key || (to.kind === 'wheel' && check.announced.kind === 'wheel')) return undefined;
    this.learned.set(check.from.key, { key: to.key, kind: to.kind, heading: to.heading });
    return { from: check.from.heading, announced: check.announced.heading, landed: to.heading };
  }
}
