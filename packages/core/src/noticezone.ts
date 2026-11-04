// La zone des notifications sur chaque écran de Cyber Pinball : la pastille des amis en ligne et
// la notification du moment (notices.ts). Une seule règle pour tous les écrans (essai réel du
// 04/11/2026 : les notifications, l'invitation surtout, ne paraissaient que sur la roue) :
//
// - tout écran de Cyber Pinball (roue, menu système et chacun de ses sous-écrans, aide, message,
//   confirmation, mode attente) : le nombre d'amis en ligne et toutes les notifications ;
// - le navigateur intégré, une page web plein écran : toutes les notifications, par-dessus ;
// - pendant une partie (et son chargement) : plus de compteur, mais ce qui compte (NoticeRule.away :
//   une invitation, un ami qui se connecte, la partie entre amis) en haut du plateau, par-dessus VPX,
//   sauf « Masquer les notifications pendant les parties » ;
// - les seuls écrans sans zone le sont pour une raison dite ici (`why`) : rien n'y est perdu, la
//   file garde ce qui attend pour l'écran suivant.
//
// frontend.ts nomme l'écran du moment (ZoneScreen) et applique cette règle partout : la file
// (menu-notices.ts), le coin dessiné par la fenêtre du plateau (renderer/frontend.js) et la ligne
// posée par-dessus VPX ou le navigateur (game-notice.ts). Le test « notifications-partout » parcourt
// ZONE_SCREENS : un écran ajouté sans sa règle ne compile pas.

/** Les écrans de Cyber Pinball, du point de vue de la zone des notifications. */
export type ZoneScreen =
  /** L'ouverture animée du démarrage (quelques secondes). */
  | 'intro'
  /** Le menu des tables (la roue). */
  | 'menu'
  /** Le mode attente : une table au hasard, sans le menu. */
  | 'attract'
  /** Le menu système et chacun de ses sous-écrans (réglages, fiches, listes, assistant, amis…). */
  | 'library'
  /** L'aide des commandes, par-dessus le menu des tables. */
  | 'help'
  /** Un message plein écran (partie impossible, installation, aucune table…). */
  | 'message'
  /** « Quitter Cyber Pinball ? ». */
  | 'confirmQuit'
  /** L'extinction, la veille ou le redémarrage en cours : écran noir. */
  | 'power'
  /** Le navigateur intégré (fenêtre « Récupérer ») sur l'écran du plateau. */
  | 'browser'
  /** La table se charge (vidéo de chargement, lancement en cinéma). */
  | 'loading'
  /** La partie, VPX à l'écran. */
  | 'playing'
  /** Le bureau de Windows à l'écran : Cyber Pinball s'est effacé. */
  | 'desktop';

export const ZONE_SCREENS: readonly ZoneScreen[] = ['intro', 'menu', 'attract', 'library', 'help', 'message', 'confirmQuit', 'power', 'browser', 'loading', 'playing', 'desktop'];

/**
 * Où se pose la zone : `corner`, le coin du menu des tables (à gauche de la roue dentée) ;
 * `head`, la ligne de la roue dentée au-dessus de l'en-tête d'un écran plein (à droite de la
 * marque) ; `over`, une ligne posée par-dessus une autre fenêtre (VPX, le navigateur), dans le
 * coin haut du joueur ; `none`, nulle part.
 */
export type ZonePlace = 'corner' | 'head' | 'over' | 'none';

export interface NoticeZone {
  place: ZonePlace;
  /** La pastille des amis en ligne. */
  count: boolean;
  /**
   * Les notifications : `all`, toutes ; `away`, seulement ce qui se montre partout
   * (NoticeRule.away) ; `wait`, aucune pour l'instant : la file les garde pour la suite.
   */
  notices: 'all' | 'away' | 'wait';
  /** Pourquoi rien, ou moins que tout (pour le test et la documentation). */
  why?: string;
}

/** Ce qui, sur l'écran du moment, change la règle. */
export interface ZoneFacts {
  /** « Masquer les notifications pendant les parties » (Menu système > Amis). */
  quietInGame?: boolean;
  /** Un constat bref est posé sous la marque du menu des tables, à la place de la notification. */
  banner?: boolean;
  /** Le préavis d'arrêt de la borne (horaires) est à l'écran. */
  stopNotice?: boolean;
  /** Cyber Pinball se ferme. */
  closing?: boolean;
}

/** La zone des notifications de cet écran. */
export function noticeZone(screen: ZoneScreen, facts: ZoneFacts = {}): NoticeZone {
  if (facts.closing) return { place: 'none', count: false, notices: 'wait', why: 'Cyber Pinball se ferme' }; // i18n-ignore : raison (tests, documentation)
  // Le préavis d'arrêt dit seul ce qui compte : la notification attend qu'il parte, le compteur reste.
  const waiting = facts.stopNotice ? 'wait' : 'all';
  switch (screen) {
    case 'menu':
      // Le constat bref prend la ligne de la notification, quelques secondes : elle attend.
      return { place: 'corner', count: true, notices: facts.banner ? 'wait' : waiting };
    case 'attract':
    case 'library':
    case 'help':
    case 'message':
    case 'confirmQuit':
      return { place: 'head', count: true, notices: waiting };
    case 'browser':
      return { place: 'over', count: false, notices: 'all', why: 'une page web plein écran : la notification passe devant, le compteur reste au menu dessous' }; // i18n-ignore : raison (tests, documentation)
    case 'loading':
    case 'playing':
      return facts.quietInGame
        ? { place: 'none', count: false, notices: 'wait', why: 'notifications masquées pendant les parties : tout attend le menu' } // i18n-ignore : raison (tests, documentation)
        : { place: 'over', count: false, notices: 'away', why: 'en partie : plus de compteur, seulement ce qui compte, par-dessus VPX' }; // i18n-ignore : raison (tests, documentation)
    case 'intro':
      return { place: 'none', count: false, notices: 'wait', why: 'l’ouverture du démarrage, quelques secondes' }; // i18n-ignore : raison (tests, documentation)
    case 'power':
      return { place: 'none', count: false, notices: 'wait', why: 'l’écran noir de l’extinction' }; // i18n-ignore : raison (tests, documentation)
    case 'desktop':
      return { place: 'none', count: false, notices: 'wait', why: 'le bureau de Windows à l’écran : Cyber Pinball s’est effacé' }; // i18n-ignore : raison (tests, documentation)
  }
}
