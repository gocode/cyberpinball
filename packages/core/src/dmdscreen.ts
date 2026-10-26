// FullDMD ou DMD seul : ce que montre l'écran du rôle dmd, la fenêtre ScoreView de VPX
// 10.8.1 (une seule fenêtre pour les deux : src/renderer/Window.cpp).
//
// - FullDMD : un écran large qui montre le média FullDMD (16:9) et l'écran 5 des
//   PuP-Packs ; le DMD de la ROM, de FlexDMD ou d'UltraDMD y est incrusté par les
//   plugins (B2S : ScoreViewDMDOverlay et ScoreViewDMDAutoPos ; PuP : écran 1 posé sur le 5).
// - DMD seul : une bande 4:1 (vrai écran DMD, bande sous le fronton, écran 16:9 derrière
//   la découpe du panneau des haut-parleurs, incrustation dans le playfield).
//
// Le choix est dit par l'utilisateur (Cabinet.dmdKind). Les modèles d'avant ce choix le
// déduisent des proportions de la zone ; une bande DMD dessinée seule sur un écran large
// reste ambiguë (dmdKindQuestion) : elle peut être un FullDMD mal découpé.

import { t } from './i18n';
import type { Cabinet, DmdKind, PhysicalScreen, RoleId, ScreenZone } from './model';
import type { SyncFinding } from './sync';
import { isFullZone, ratioLabel, roleZone, sameZone, splitBackglassDmd, zoneRatio } from './zones';

/**
 * Frontière entre 4:1 et 16:9 : moyenne géométrique des deux proportions
 * (√(4 × 16/9) = 8/3), pour que l'écart se mesure en rapport et non en différence.
 */
export const DMD_RATIO_THRESHOLD = 8 / 3;

/** Type d'afficheur pour des proportions (grand côté sur petit côté). */
export function dmdKindForRatio(ratio: number): DmdKind {
  return ratio >= DMD_RATIO_THRESHOLD ? 'dmd' : 'fulldmd';
}

/** Nom montré du type d'écran : « FullDMD » ou « DMD ». */
export function dmdKindLabel(kind: DmdKind | undefined): string {
  return kind === 'fulldmd' ? 'FullDMD' : 'DMD';
}

/** Écran physique du rôle dmd, s'il est dans le modèle avec sa définition. */
export function dmdScreen(cabinet: Cabinet): PhysicalScreen | undefined {
  const fp = cabinet.roles.dmd;
  const screen = fp ? cabinet.screens.find((s) => s.fingerprint === fp) : undefined;
  return screen && screen.widthPx > 0 && screen.heightPx > 0 ? screen : undefined;
}

const sizeOf = (screen: PhysicalScreen) => ({ width: screen.widthPx, height: screen.heightPx });

/** Rôles autres que le DMD affichés sur l'écran du DMD. */
function screenMates(cabinet: Cabinet): RoleId[] {
  const fp = cabinet.roles.dmd;
  return (Object.entries(cabinet.roles) as [RoleId, string][]).filter(([role, other]) => role !== 'dmd' && other === fp).map(([role]) => role);
}

/**
 * FullDMD ou DMD seul : le choix enregistré, sinon d'après les proportions de la zone du DMD.
 * undefined sans rôle dmd, ou si son écran n'est pas dans le modèle.
 */
export function dmdKindOf(cabinet: Cabinet): DmdKind | undefined {
  if (!cabinet.roles.dmd) return undefined;
  if (cabinet.dmdKind) return cabinet.dmdKind;
  const screen = dmdScreen(cabinet);
  const ratio = screen && zoneRatio(roleZone(cabinet, 'dmd'), sizeOf(screen));
  return ratio === undefined ? undefined : dmdKindForRatio(ratio);
}

/** Libellé d'un rôle pour cette borne : « FullDMD » pour le rôle dmd d'un FullDMD. */
export function cabinetRoleLabel(cabinet: Cabinet | undefined, role: RoleId, fallback: string): string {
  return role === 'dmd' && cabinet && dmdKindOf(cabinet) === 'fulldmd' ? 'FullDMD' : fallback;
}

/** Bande DMD 4:1 au milieu d'un écran : toute la largeur, centrée en hauteur (format verrouillé). */
export function centeredDmdBand(size: { width: number; height: number }): ScreenZone {
  let width = size.width;
  let height = width / 4;
  if (height > size.height) {
    height = size.height;
    width = height * 4;
  }
  const w = width / size.width;
  const h = height / size.height;
  return { x: (1 - w) / 2, y: (1 - h) / 2, width: w, height: h, aspect: 4 };
}

/** La configuration ambiguë : une bande DMD seule sur un écran large, sans choix enregistré. */
export interface DmdKindQuestion {
  /** Nom de l'écran du DMD (« PLX2283HSU (1920 × 1080) »). */
  screen: string;
  /** Proportions de l'écran et de la bande, grand côté sur petit côté. */
  screenRatio: number;
  zoneRatio: number;
}

/**
 * Bande DMD dessinée seule sur un écran large (16:9, 16:10, 4:3), sans que l'utilisateur ait
 * dit ce qu'est cet écran : peut-être un FullDMD réduit à une bande (Poste à 3 écrans,
 * octobre 2026 : bande 4,8:1 au milieu d'un écran 16:9 ; le menu y montrait l'image FullDMD
 * réduite, VPX y ouvrait une fenêtre en bande). Une bande sous le fronton ou une incrustation
 * dans le playfield est voulue : pas de question.
 */
export function dmdKindQuestion(cabinet: Cabinet): DmdKindQuestion | undefined {
  if (cabinet.dmdKind || !cabinet.roles.dmd || screenMates(cabinet).length) return undefined;
  const screen = dmdScreen(cabinet);
  if (!screen) return undefined;
  const size = sizeOf(screen);
  const zone = roleZone(cabinet, 'dmd');
  const screenRatio = zoneRatio({ x: 0, y: 0, width: 1, height: 1 }, size)!;
  const ratio = zoneRatio(zone, size);
  if (isFullZone(zone) || ratio === undefined || screenRatio >= DMD_RATIO_THRESHOLD || ratio < DMD_RATIO_THRESHOLD) return undefined;
  return { screen: screen.label, screenRatio, zoneRatio: ratio };
}

/** Choix possibles : un DMD incrusté dans le playfield n'est jamais un FullDMD. */
export function dmdKindChoices(cabinet: Cabinet): DmdKind[] {
  if (!cabinet.roles.dmd) return [];
  return cabinet.roles.dmd === cabinet.roles.playfield ? ['dmd'] : ['fulldmd', 'dmd'];
}

/**
 * La borne avec ce type d'écran DMD, et la zone qui va avec quand la zone enregistrée ne
 * convient pas : écran entier pour un FullDMD seul sur son écran, bande 4:1 centrée pour un
 * DMD seul ; sous le fronton partagé, la bande du bas (16:9 ou 4:1, splitBackglassDmd). Une
 * zone qui a déjà la bonne forme est gardée (place réglée dans « Disposition des écrans »).
 */
export function withDmdKind(cabinet: Cabinet, kind: DmdKind): Cabinet {
  const screen = dmdScreen(cabinet);
  if (!screen || !dmdKindChoices(cabinet).includes(kind)) return { ...cabinet, dmdKind: kind };
  const size = sizeOf(screen);
  const zone = roleZone(cabinet, 'dmd');
  const zones: Partial<Record<RoleId, ScreenZone>> = { ...cabinet.zones };
  const mates = screenMates(cabinet);
  const fits = dmdKindForRatio(zoneRatio(zone, size) ?? 1) === kind;
  if (!fits) {
    if (!mates.length) {
      if (kind === 'fulldmd') delete zones.dmd;
      else zones.dmd = centeredDmdBand(size);
    } else if (mates.length === 1 && mates[0] === 'backglass') {
      const split = splitBackglassDmd(size, kind === 'fulldmd' ? 16 / 9 : 4);
      zones.backglass = split.backglass;
      zones.dmd = split.dmd;
    }
  }
  const next: Cabinet = { ...cabinet, dmdKind: kind };
  if (Object.keys(zones).length) next.zones = zones;
  else delete next.zones;
  return next;
}

/**
 * Type d'écran après la disposition des écrans : gardé tant que la zone du DMD n'a pas changé
 * (absent, il le reste : une configuration ambiguë reste à trancher), sinon celui de sa
 * nouvelle forme (une bande tirée à 4:1 est un DMD seul).
 */
export function dmdKindAfterArrange(previous: Cabinet | undefined, next: Cabinet): DmdKind | undefined {
  if (!next.roles.dmd) return undefined;
  if (previous && previous.roles.dmd === next.roles.dmd && sameZone(roleZone(previous, 'dmd'), roleZone(next, 'dmd'))) return previous.dmdKind;
  return dmdKindOf({ ...next, dmdKind: undefined });
}

/**
 * Constats de la borne sur l'écran du DMD (synchronisation, « Configuration de la borne ») :
 * - la configuration ambiguë (dmdKindQuestion) ;
 * - un FullDMD réduit à une bande, ou un DMD seul étiré sur un écran large : le média et la
 *   fenêtre de VPX n'ont pas la forme de l'écran.
 */
export function dmdKindFindings(cabinet: Cabinet): SyncFinding[] {
  const question = dmdKindQuestion(cabinet);
  if (question) {
    return [
      {
        severity: 'warning',
        message: t(
          'DMD : bande {zone} au milieu de l’écran « {screen} » ({ratio}), qui ne montre rien d’autre. Si c’est un FullDMD, dites-le dans Configuration de la borne > Écran du DMD : le menu, VPX et les PuP-Packs le traiteront comme tel.',
          { zone: ratioLabel(question.zoneRatio), screen: question.screen, ratio: ratioLabel(question.screenRatio) },
        ),
      },
    ];
  }
  const kind = cabinet.dmdKind;
  const screen = dmdScreen(cabinet);
  if (!kind || !screen) return [];
  const ratio = zoneRatio(roleZone(cabinet, 'dmd'), sizeOf(screen));
  if (ratio === undefined || dmdKindForRatio(ratio) === kind) return [];
  return [
    {
      severity: 'info',
      message:
        kind === 'fulldmd'
          ? t('FullDMD dans une zone {ratio} : les médias 16:9 y seront réduits. Écran du DMD (Configuration de la borne) lui rend tout son écran.', { ratio: ratioLabel(ratio) })
          : t('DMD seul dans une zone {ratio} : le DMD y aura des bandes noires. Écran du DMD (Configuration de la borne) le remet en bande 4:1.', { ratio: ratioLabel(ratio) }),
    },
  ];
}
