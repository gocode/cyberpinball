// Pinball FX3 sur une vraie borne : ce que Cyber Pinball peut savoir de son mode borne avant la
// partie, et pourquoi il n'y écrit rien (19/11/2026, essai sur un PinCab).
//
// Établi :
// - Le mode borne (activation, rotation du plateau, écrans du fronton et du DMD) se règle dans le jeu
//   seulement. Ses réglages sont dans des fichiers chiffrés : SystemConfigCache.dat, Misc.dat et
//   GameStateCache.dat du dossier du jeu, Profile.dat du profil Steam (userdata\<compte>\442120\remote,
//   synchronisé par Steam Cloud, copie dans Documents\Zen Studios\Profile backup). Relevé sur un
//   PinCab : un octet de version (02) puis des données sans aucun texte, entropie de 8 bits par
//   octet. L'outil PinCab Configurator le dit aussi (« Settings data appears to be encrypted »).
//   Ni registre, ni fichier .ini, ni fichier sous %APPDATA% ou %LOCALAPPDATA%. Contrairement à
//   Pinball FX (pinballfx-cabinet.ts), Cyber Pinball ne peut donc ni lire ni écrire la rotation ou la
//   place des écrans : rien n'est écrit.
// - SystemConfigCache.dat n'existe pas tant que le jeu n'a jamais été ouvert sur le PC : relevé sur
//   le PinCab, il est apparu 38 s après le tout premier lancement (installation du runtime Visual C++
//   par Steam au même moment). Absent, le jeu n'a donc jamais été réglé ici : son mode borne n'y est
//   pas activé, et il s'ouvrira sur son écran d'accueil, en paysage, en plein écran 1920 × 1080.
//   C'est le seul état que Cyber Pinball sait reconnaître avant de lancer. Fichier présent : rien ne
//   dit si le mode borne est actif (le fichier est écrit à chaque ouverture, activé ou non).
// - Deux tables sont gratuites, sur tous les comptes : Sorcerer's Lair (fichier Citadel) et Fish
//   Tales (PCGamingWiki, « Monetization » ; sur un compte sans achat, le jeu affiche « Ma collection :
//   2/96 »). Les autres ne s'ouvrent que si elles sont achetées : le jeu reste sinon sur son écran
//   d'accueil. Quelles tables sont achetées : rien ne le dit hors du jeu (Profile.dat est chiffré,
//   tous les fichiers de tables sont installés), jamais deviné.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { writeFileAtomic } from './atomicwrite';
import { t } from './i18n';
import { edgeAfterRotation, rotationDelta } from './layout';
import { edgeRotation, type FlipperEdge, type Rotation } from './model';

/** Réglages du jeu sur ce PC, écrits à sa première ouverture (chiffrés). */
export const PINBALLFX3_SYSTEM_CONFIG = 'SystemConfigCache.dat';

/** Tables gratuites de Pinball FX3, sur tous les comptes Steam (fichiers de data\steam). */
export const PINBALLFX3_FREE_TABLES: readonly string[] = ['Citadel', 'WMS_Fish_Tales'];

/** Table gratuite : elle s'ouvre sur tout compte, achetée ou non. */
export function isFreePinballFx3Table(name: string): boolean {
  return PINBALLFX3_FREE_TABLES.some((f) => f.toLowerCase() === name.toLowerCase());
}

/**
 * Pinball FX3 jamais ouvert sur ce PC : son dossier est là, sans SystemConfigCache.dat. Dans le
 * doute (dossier illisible, absent), false : rien à signaler plutôt qu'un avertissement faux.
 */
export function pinballFx3NeverOpened(gameDir: string): boolean {
  try {
    if (!fs.statSync(gameDir).isDirectory()) return false;
  } catch {
    return false;
  }
  return !fs.existsSync(path.join(gameDir, PINBALLFX3_SYSTEM_CONFIG));
}

/**
 * Ligne qui rappelle qu'une table payante doit être achetée sur le compte Steam ; undefined pour
 * une table gratuite (elle s'ouvre toujours). Les titres sont ceux de PINBALLFX3_FREE_TABLES.
 */
export function pinballFx3PurchaseLine(name: string): string | undefined {
  if (isFreePinballFx3Table(name)) return undefined;
  return t('Seules Fish Tales et Sorcerer’s Lair sont gratuites : les autres tables ne s’ouvrent que si elles sont achetées sur ce compte Steam, sinon le jeu reste sur son écran d’accueil.');
}

/**
 * Message avant la partie, quand Pinball FX3 n'a jamais été ouvert sur ce PC : le mode borne n'y
 * est pas activé, le jeu s'ouvrira sur son écran d'accueil. Start l'ouvre quand même (pour activer
 * le mode borne), Exit revient au front-end. undefined : rien à dire.
 */
export function pinballFx3FirstRunMessage(gameDir: string, name: string, orientation?: Rotation): { title: string; lines: string[] } | undefined {
  if (!pinballFx3NeverOpened(gameDir)) return undefined;
  const game = 'Pinball FX3';
  const purchase = pinballFx3PurchaseLine(name);
  // `orientation` : celle de la borne (pinballFx3Orientation) ; sans bord de flippers enregistré, pas de ligne.
  const rotation = orientation !== undefined ? t('Orientation à saisir dans {game} : {rotation}° (celle qui met les flippers du bon côté, d’après la configuration de la borne). Le DMD et le fronton, Cyber Pinball les replace lui-même sur leurs écrans après le lancement : leurs positions saisies dans le jeu n’ont pas à être exactes.', { game, rotation: orientation }) : undefined;
  return {
    title: t('Première ouverture de {game} sur ce PC', { game }),
    lines: [
      t('{game} n’a encore jamais été ouvert ici : son mode borne n’y est pas activé. Sans lui, le jeu s’ouvre sur son écran d’accueil, en paysage, et pas sur la table.', { game }),
      t('Dans le jeu : icône de borne à côté du profil, « Activer », puis la rotation du plateau et les écrans du fronton et du DMD. Cyber Pinball ne peut pas le faire à sa place : ces réglages sont chiffrés. Ferme ensuite le jeu (Exit tenu) et relance la table.'),
      ...(rotation ? [rotation] : []),
      ...(purchase ? [purchase] : []),
      t('Start : ouvrir {game} · Exit : revenir au front-end', { game }),
    ],
  };
}

/**
 * Orientation à saisir dans le mode borne de FX3 pour un joueur au bord `edge` de l'image de Windows :
 * le quart de tour horaire qui y met les flippers (edgeRotation). Essai sur un PinCab le 20/11/2026 :
 * flippers au bord gauche, 90° juste, 270° à l'envers.
 */
export function pinballFx3Orientation(edge: FlipperEdge): Rotation {
  return edgeRotation(edge);
}

export interface PinballFx3OrientationChange {
  /** Valeur juste avant 0.2.2-essai.10, quand FX3 démarrait sur l'orientation de la session. */
  before: Rotation;
  /** Valeur juste depuis, FX3 démarrant sur l'orientation de Windows. */
  after: Rotation;
}

/**
 * Jusqu'à 0.2.2-essai.10, FX3 démarrait sur l'orientation que Cyber Pinball donne au playfield pour
 * la session (`windowsRotation`, pour VPX) ; depuis, sur celle de Windows (`origin`), comme avec un
 * autre front-end (sessionorientation.ts, GAMES_ON_WINDOWS_ORIENTATION). L'orientation saisie dans FX3
 * avant ce changement ne vaut plus. `flipperEdge` : bord enregistré, pour l'image de la session.
 * undefined si les deux orientations sont les mêmes (rien n'a changé pour FX3).
 */
export function pinballFx3OrientationChange(flipperEdge: FlipperEdge, windowsRotation: Rotation | undefined, origin: Rotation | undefined): PinballFx3OrientationChange | undefined {
  if (windowsRotation === undefined || origin === undefined || windowsRotation === origin) return undefined;
  const before = pinballFx3Orientation(flipperEdge);
  const after = pinballFx3OrientationOnWindows(flipperEdge, windowsRotation, origin);
  return before === after ? undefined : { before, after };
}

/**
 * Orientation à saisir dans FX3 aujourd'hui : celle de l'image de Windows (`origin`), sur laquelle il
 * démarre, pour des flippers enregistrés au bord `flipperEdge` de l'image de la session
 * (`windowsRotation`). Sans l'une des deux, l'image de la session est celle de Windows.
 */
export function pinballFx3OrientationOnWindows(flipperEdge: FlipperEdge, windowsRotation: Rotation | undefined, origin: Rotation | undefined): Rotation {
  if (windowsRotation === undefined || origin === undefined) return pinballFx3Orientation(flipperEdge);
  return pinballFx3Orientation(edgeAfterRotation(flipperEdge, rotationDelta(origin, windowsRotation)));
}

/** Témoin, dans le dossier des données : l'avertissement du changement d'orientation de FX3 est passé. */
export const PINBALLFX3_ORIENTATION_NOTICE_FILE = 'pinballfx3-orientation-prevenu';

/**
 * Avant la prochaine partie de FX3, une fois par borne : le message du changement d'orientation,
 * si FX3 a déjà été lancé par Cyber Pinball (`playedBefore` : une table de FX3 a des parties dans ses
 * statistiques) et si l'orientation à saisir a changé. Le témoin est posé dans tous les cas : une
 * borne qui n'avait rien à apprendre ne sera pas prévenue plus tard, et le message ne revient pas.
 * Témoin illisible ou impossible à poser : rien n'est montré (pas de message à chaque partie).
 */
export function takePinballFx3OrientationNotice(dataDir: string, playedBefore: boolean, change: PinballFx3OrientationChange | undefined): { title: string; lines: string[] } | undefined {
  const marker = path.join(dataDir, PINBALLFX3_ORIENTATION_NOTICE_FILE);
  try {
    if (fs.existsSync(marker)) return undefined;
    fs.mkdirSync(dataDir, { recursive: true });
    writeFileAtomic(marker, new Date().toISOString() + '\n');
  } catch {
    return undefined;
  }
  if (!playedBefore || !change) return undefined;
  const game = 'Pinball FX3';
  return {
    title: t('{game} : orientation à changer', { game }),
    lines: [
      t('Depuis cette version, {game} démarre sur l’écran du playfield tel que Windows l’oriente, comme avec un autre front-end. Son orientation réglée avec Cyber Pinball ne vaut plus : l’image serait à l’envers.', { game }),
      t('Dans {game}, mode borne : passe Orientation de {before}° à {after}°.', { game, before: change.before, after: change.after }),
      t('Start : ouvrir {game} · Exit : revenir au front-end', { game }),
    ],
  };
}
