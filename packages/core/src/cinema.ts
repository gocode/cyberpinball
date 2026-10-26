// Lancement en cinéma : au Start d'une partie, le logo du jeu s'allume sur le plateau et
// s'envole vers le fronton, une tache de lumière traverse le DMD, le logo se pose sur le
// fronton et y attend ; quand VPX prend la main (sa fenêtre de jeu au premier plan, signal du
// lanceur), un coup de bobine sonne et tout s'efface.
//
// La chorégraphie ne retarde jamais VPX : elle part au Start et vit sa vie dans les fenêtres
// du menu (CSS de frontend.css, animation « lancement » du DMD vivant) ; le processus principal
// n'en garde qu'un état, posé et relu sans jamais l'attendre. Le passage de relais vient du
// lanceur, jamais d'un minuteur : la tenue dure ce que dure le chargement de VPX.
//
// Les temps sont comptés depuis le Start, dans chaque fenêtre (startedAt) : une fenêtre qui
// affiche la chorégraphie en retard la reprend au bon moment, et les écrans restent d'accord.

/**
 * Rythme de la chorégraphie, en millisecondes depuis le Start. frontend.css (« Lancement en
 * cinéma ») et l'animation « lancement » du DMD (livedmd.ts) s'y tiennent ; cinema.test.ts
 * vérifie que la feuille de style dit les mêmes temps.
 */
export const CINEMA_TIMELINE = {
  /** Le logo s'allume au centre du plateau (240 ms). */
  ignite: 0,
  /** Il recule d'un cran, comme une bille tirée par le lanceur (100 ms). */
  arm: 240,
  /** Il file vers le haut et sort du plateau (400 ms ; le bord bas du logo quitte l'écran vers 660 ms). */
  launch: 340,
  /** Une tache de lumière traverse le DMD, de bas en haut, quand le logo a quitté le plateau. */
  dmdPass: 660,
  /** Durée du passage sur le DMD. */
  dmdPassLength: 240,
  /** Éclat bref en haut du DMD, à la sortie de la tache ; puis la bille roule. */
  dmdFlash: 40,
  /** Le fronton s'assombrit (280 ms). */
  dim: 800,
  /** Le logo entre par le bas du fronton (360 ms, un léger dépassement, posé à 1200 ms). */
  arrive: 840,
  /** Onde autour du logo posé (400 ms). */
  impact: 1200,
  /** Tenue : un halo respire derrière lui jusqu'à ce que VPX prenne la main. */
  hold: 1600,
  /** Fondu de sortie, au passage de relais. */
  fadeOut: 240,
} as const;

/** Ce que la chorégraphie montre de la table lancée. */
export interface CinemaSubject {
  title: string;
  manufacturer?: string;
  year?: string | number;
  /** Adresse du logo du jeu (Wheel) ; absent : le médaillon au titre. */
  logo?: string;
}

/** Part d'une fenêtre dans la chorégraphie, envoyée avec son état (viewFor, frontend.ts). */
export interface CinemaView extends CinemaSubject {
  /** Numéro du lancement : un nouveau lancement repart de zéro, un état renvoyé ne relance rien. */
  id: number;
  /** Heure du Start (Date.now()) : chaque fenêtre en déduit où en est la chorégraphie. */
  startedAt: number;
  /** La fenêtre dessine le plateau : le logo s'y allume et en part. */
  depart: boolean;
  /** La fenêtre dessine le fronton (sa propre fenêtre, ou une zone) : le logo s'y pose. */
  arrivee: boolean;
}

/**
 * État de la chorégraphie dans le processus principal. Aucune méthode ne rend de promesse ni
 * ne programme de minuteur : le lancement de VPX ne peut rien en attendre, et rien n'y change
 * avec le temps. Le passage de relais vient de handover(), appelé par le lanceur.
 */
export class LaunchCinema {
  private run?: { id: number; startedAt: number; subject: CinemaSubject; handedOver: boolean };

  constructor(private readonly now: () => number = Date.now) {}

  /** Start : la chorégraphie du lancement `id` part maintenant. */
  start(id: number, subject: CinemaSubject): void {
    this.run = { id, startedAt: this.now(), subject: { ...subject }, handedOver: false };
  }

  /**
   * VPX a pris la main (sa fenêtre de jeu au premier plan). Vrai la première fois seulement,
   * pendant une chorégraphie : le coup de bobine part alors, une fois par lancement.
   */
  handover(): boolean {
    if (!this.run || this.run.handedOver) return false;
    this.run.handedOver = true;
    return true;
  }

  /** Fin du lancement (partie finie, échec, réglage coupé) : plus rien à montrer. */
  stop(): void {
    this.run = undefined;
  }

  /** Une chorégraphie est en cours (partie, ni relais ni fin). */
  get running(): boolean {
    return Boolean(this.run && !this.run.handedOver);
  }

  /** Table lancée, pour l'animation du DMD. */
  get subject(): CinemaSubject | undefined {
    return this.running ? this.run!.subject : undefined;
  }

  /** Part de la fenêtre qui dessine ces écrans ; rien si elle n'a ni le plateau ni le fronton. */
  view(screens: { depart: boolean; arrivee: boolean }): CinemaView | undefined {
    if (!this.running || (!screens.depart && !screens.arrivee)) return undefined;
    const { id, startedAt, subject } = this.run!;
    return { ...subject, id, startedAt, depart: screens.depart, arrivee: screens.arrivee };
  }
}
