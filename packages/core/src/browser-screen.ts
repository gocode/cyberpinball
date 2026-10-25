// Écran du navigateur intégré (fenêtre « Récupérer » : catalogue, comptes des sites,
// médias des sites, recherche sur le web). Réglage de chaque configuration de la borne
// (Cabinet.browserScreen) : automatique, ou un rôle de la borne. Rangé par rôle, il suit
// l'écran physique même quand Windows le renumérote. Ici, rien que du calcul : le choix,
// le repli quand l'écran choisi n'est pas branché, et ce que le menu et le bandeau en disent.

import { describeDisplay } from './fingerprint';
import { t } from './i18n';
import { EDGE_LABELS, currentFlipperEdge, playfieldRotation, readingScreen } from './layout';
import { matchScreens } from './match';
import { ROLES, type Cabinet, type ObservedDisplay, type RoleId, type Rotation } from './model';

/** Nom du rôle tel que le menu le dit : Playfield, Fronton, DMD, Topper. */
export function browserRoleLabel(role: RoleId): string {
  switch (role) {
    case 'playfield':
      return t('Playfield');
    case 'backglass':
      return t('Fronton');
    case 'dmd':
      return 'DMD';
    case 'topper':
      return 'Topper';
  }
}

/** Écran d'un rôle ; deux rôles qui partagent un écran (fronton et DMD) en ont le même `bounds`. */
export interface RoleScreen<B> {
  role: RoleId;
  bounds: B;
}

export interface BrowserScreenPick<B> {
  bounds: B;
  /** Rôles de l'écran retenu, dans l'ordre de ROLES (le premier le nomme). */
  roles: RoleId[];
  /** Écran choisi par l'utilisateur ; faux : règle automatique (readingScreen). */
  chosen: boolean;
  /** Rôle choisi dont l'écran n'est pas branché (ou n'est plus un rôle de la borne) : repli sur la règle automatique. */
  missing?: RoleId;
  /** L'écran retenu est le playfield, tourné pour le joueur : la page y est de travers et la souris va à angle droit de sa main. */
  tilted: boolean;
}

/**
 * Écran de la fenêtre « Récupérer » : celui du rôle choisi s'il est branché, même le
 * playfield tourné (l'utilisateur l'a voulu, le bandeau prévient) ; sinon, ou en
 * automatique, la règle de readingScreen. undefined : aucun écran (l'écran principal de
 * Windows reste le repli de l'appelant).
 */
export function pickBrowserScreen<B extends { width: number; height: number }>(
  screens: RoleScreen<B>[],
  rotation: Rotation,
  wanted: RoleId | undefined,
): BrowserScreenPick<B> | undefined {
  const rolesOf = (bounds: B) => ROLES.map((r) => r.id).filter((id) => screens.some((s) => s.role === id && s.bounds === bounds));
  const result = (bounds: B, chosen: boolean, missing?: RoleId): BrowserScreenPick<B> => {
    const roles = rolesOf(bounds);
    return { bounds, roles, chosen, ...(missing && { missing }), tilted: roles.includes('playfield') && rotation !== 0 };
  };
  const own = wanted && screens.find((s) => s.role === wanted);
  if (own) return result(own.bounds, true);
  const auto = readingScreen(screens, rotation);
  if (auto) return result(auto, false, wanted);
  return undefined;
}

/**
 * Message du bandeau de « Récupérer » sur l'écran retenu : écran choisi pas branché, ou
 * playfield tourné. undefined quand il n'y a rien à dire.
 */
export function browserScreenNotice(pick: Pick<BrowserScreenPick<unknown>, 'roles' | 'missing' | 'tilted'> | undefined): string | undefined {
  if (!pick) return undefined;
  const screen = pick.roles[0] ? browserRoleLabel(pick.roles[0]) : t('l’écran principal');
  const parts: string[] = [];
  if (pick.missing) parts.push(t('Écran du navigateur intégré : {role} n’est pas branché, ouvert sur {screen} (automatique).', { role: browserRoleLabel(pick.missing), screen }));
  if (pick.tilted) parts.push(t('Playfield tourné : la page et la souris y vont de travers. Autre écran : menu, Configurations de la borne, « Écran du navigateur intégré ».'));
  return parts.join(' ') || undefined;
}

/** Une ligne du choix dans le menu : automatique (role undefined) ou un rôle de la configuration. */
export interface BrowserScreenOption {
  role: RoleId | undefined;
  label: string;
  /** Écran que la fenêtre prendrait avec les écrans branchés ; undefined : pas branché. */
  display?: ObservedDisplay;
  /** Rôles de cet écran (un écran partagé : fronton et DMD). */
  roles: RoleId[];
  /** Le playfield tourné : la souris y irait de travers. */
  tilted: boolean;
  /** Choix enregistré dans la configuration. */
  current: boolean;
}

/**
 * Choix proposés pour une configuration, avec les écrans branchés : Automatique (et
 * l'écran qu'il donne maintenant), puis chaque rôle que la borne a, dans l'ordre de ROLES.
 */
export function browserScreenOptions(cabinet: Cabinet, observed: ObservedDisplay[]): BrowserScreenOption[] {
  const matched = matchScreens(cabinet.screens, observed).matched;
  const roles = ROLES.map((r) => r.id).filter((id) => cabinet.roles[id]);
  const displayOf = (role: RoleId) => matched.get(cabinet.roles[role]!);
  const screens = roles.flatMap((role) => {
    const display = displayOf(role);
    return display ? [{ role, bounds: display.bounds, display }] : [];
  });
  const rotation = playfieldRotation(cabinet, displayOf('playfield'));
  const option = (role: RoleId | undefined): BrowserScreenOption => {
    const pick = pickBrowserScreen(screens, rotation, role);
    const display = role && pick?.missing ? undefined : screens.find((s) => s.bounds === pick?.bounds)?.display;
    return {
      role,
      label: role ? browserRoleLabel(role) : t('Automatique'),
      display,
      roles: display ? pick!.roles : role ? [role] : [],
      tilted: Boolean(display && pick!.tilted),
      current: cabinet.browserScreen === role || (!role && !cabinet.browserScreen),
    };
  };
  return [option(undefined), ...roles.map(option)];
}

/**
 * « LG TV SSCR2 (3840 × 2160) · paysage · couché, flippers à gauche de l'image : la souris
 * y va de travers » : l'aperçu d'un écran dans le choix du menu.
 */
export function describeBrowserScreen(cabinet: Cabinet, option: BrowserScreenOption): string {
  const display = option.display;
  if (!display) return t('Pas branché : la fenêtre prendrait l’écran automatique');
  const { width, height } = display.bounds;
  const parts = option.role ? [] : [t('maintenant : {roles}', { roles: option.roles.map(browserRoleLabel).join(' + ') })];
  parts.push(describeDisplay(display), width >= height ? t('paysage') : t('portrait'));
  const others = option.roles.filter((r) => r !== option.role);
  if (option.role && others.length) parts.push(t('partagé avec : {roles}', { roles: others.map(browserRoleLabel).join(', ') }));
  if (option.roles.includes('playfield')) {
    const edge = currentFlipperEdge(cabinet, display) ?? 'bottom';
    parts.push(option.tilted ? t('couché, flippers {edge} de l’image : la page et la souris y vont de travers', { edge: EDGE_LABELS[edge] }) : t('dans le sens de l’image'));
  } else parts.push(t('debout, face au joueur'));
  return parts.join(' · ');
}
