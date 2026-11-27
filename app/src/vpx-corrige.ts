// Le VPX corrigé de Cyber Pinball : des fichiers de VPX 10.8.1-5436 reconstruits avec des correctifs (packages/vpx-corrige,
// scripts/vpx-corrige.mjs), posés à la place de ceux de l'archive officielle avant chaque partie :
// - l'exécutable (série 1, 20/11/2026) : la 5436 présentait le backglass à chaque image du playfield, et un écran
//   annexe plus lent (50 ou 60 Hz) calait toute la partie sur sa fréquence ; corrigé dans VPX en novembre 2026
//   (d73557d, f832180), dans aucune version publiée ; la série 2 (cadrage « Fit Table » qui garde le haut) aussi ;
// - le plugin PuP (série 3, 21/11/2026) : il décodait les images des labels (GIF animés plein écran de plusieurs Mo)
//   en gardant le verrou du label, et la boucle de jeu l'attendait 200 à 300 ms à chaque image affichée (The Matrix) ;
// - l'exécutable encore (série 4, 22/11/2026) : bilan du temps de rendu de la carte graphique au journal de VPX, lu par
//   les pré-réglages de qualité (mode Auto).
// - l'exécutable encore (série 5, 23/11/2026) : import automatique des cadrages POV sans éditeur,
//   et lecture sûre des champs numériques anciens vides ou illisibles.
// - la bibliothèque DOF plugins/dof/dof64.dll (série 6, 23/11/2026) : la libdof de la 5436 arrêtait une carte DudesCab
//   une seconde fois en se déchargeant, après sa vraie fermeture, et VPX plantait en se fermant (0xC0000005) ; report
//   des correctifs amont 0383246 et c79bcff. Le plugin-dof64.dll officiel la charge telle quelle (DOF.h inchangé).
// - l'exécutable encore (série 7, 24/11/2026) : lunettes actives NVIDIA 3D Vision en mode direct (NVAPI, Direct3D 11,
//   plein écran exclusif), réglage [Player] Stereo3DNvidiaDirect posé par nvidia-3dvision.ts.
// - le plugin PuP encore (série 8, 26/11/2026) : celui de VPX au commit bdbccaf30, construit pour l'interface des plugins
//   de la 5436 ; les vidéos d'un écran PuP non affiché (DMD, topper) se terminent, la file avance, la musique démarre.
// - le plugin PuP encore (série 9, 27/11/2026) : un nom de PupCapture que libpupdmd ne sait pas lire (12341241234.bmp de
//   The Avengers Pro) ne termine plus VPX en 0xC0000409 ; le pack joue avec les captures lisibles.
// Les autres plugins et les bibliothèques restent ceux de l'archive.
//
// Seulement sur la version pour laquelle il est construit (VPX_CORRIGE_VERSION) : un autre VPX (essai 10.9, VPX de
// l'utilisateur) n'est jamais touché. La vérification des fichiers de VPX (vpx-integrity.ts) les reconnaît, et
// « Remettre les fichiers d'origine » peut toujours remettre les officiels : ils sont reposés à la partie suivante.

import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { renameWithRetry } from '@cyberpinball/core';

/** La version de VPX que le corrigé remplace, et le nom de son exécutable. */
export const VPX_CORRIGE_VERSION = '10.8.1-5436';
export const VPX_CORRIGE_EXE = 'VPinballX_BGFX64.exe';
/** Les fichiers remplacés, relatifs au dossier de VPX (séparateur « / », comme components.json). L'exécutable d'abord. */
export const VPX_CORRIGE_FILES: readonly string[] = [VPX_CORRIGE_EXE, 'plugins/pup/plugin-pup64.dll', 'plugins/dof/dof64.dll'];

/** Les dossiers où chercher le corrigé : fabriqué avec l'application (natif\vpx-corrige), ou construit (build\vpx-corrige). */
function corrigeDirs(appDir: string): string[] {
  return [path.join(appDir, 'natif', 'vpx-corrige'), path.join(appDir, '..', 'build', 'vpx-corrige'), path.join(appDir, '..', '..', 'build', 'vpx-corrige')];
}

/** Le dossier du corrigé livré : celui qui a l'exécutable. */
function corrigeDir(appDir: string): string | undefined {
  return corrigeDirs(appDir).find((dir) => fs.existsSync(path.join(dir, VPX_CORRIGE_EXE)));
}

const local = (dir: string, file: string) => path.join(dir, ...file.split('/'));

/** L'exécutable corrigé livré (natif\vpx-corrige ou build\vpx-corrige). */
export function vpxCorrigeFile(appDir: string): string | undefined {
  const dir = corrigeDir(appDir);
  return dir && path.join(dir, VPX_CORRIGE_EXE);
}

/** Les fichiers corrigés livrés, par nom relatif : un corrigé d'une série plus ancienne n'a que l'exécutable. */
export function vpxCorrigeFiles(appDir: string): Map<string, string> {
  const dir = corrigeDir(appDir);
  const files = new Map<string, string>();
  if (dir) for (const file of VPX_CORRIGE_FILES) if (fs.existsSync(local(dir, file))) files.set(file, local(dir, file));
  return files;
}

/** Empreinte d'un fichier de quelques dizaines de Mo, relue seulement si sa taille ou sa date change. */
const digests = new Map<string, { stamp: string; sha: string }>();
function digest(file: string): string | undefined {
  try {
    const st = fs.statSync(file);
    const stamp = `${st.size}:${st.mtimeMs}`;
    const kept = digests.get(file);
    if (kept?.stamp === stamp) return kept.sha;
    // lecture entière : exécutable ou plugin de VPX, quelques dizaines de Mo au plus
    const sha = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
    digests.set(file, { stamp, sha });
    return sha;
  } catch {
    return undefined;
  }
}

export type VpxCorrigeInstall = 'installed' | 'up-to-date' | 'missing' | 'other-version' | 'busy' | 'restored';

/**
 * Le fichier officiel, gardé à côté avant la première pose (« .officiel » : executablePattern ne le prend pas pour
 * un VPX). Une version de Cyber Pinball qui ne livre plus un fichier corrigé remet l'officiel à la partie suivante,
 * sans téléchargement.
 */
export const VPX_OFFICIEL_SUFFIX = '.officiel';

/** Pose ou retire un fichier corrigé ; `ours` undefined : plus livré, l'officiel gardé reprend sa place. */
function installOne(target: string, ours: string | undefined): VpxCorrigeInstall {
  const official = `${target}${VPX_OFFICIEL_SUFFIX}`;
  const staged = `${target}.cyberpinball`;
  try {
    if (!ours) {
      if (!fs.existsSync(official)) return 'missing';
      fs.copyFileSync(official, staged);
      renameWithRetry(staged, target);
      fs.rmSync(official, { force: true });
      return 'restored';
    }
    if (!fs.existsSync(target)) return 'missing';
    const want = digest(ours);
    if (want && want === digest(target)) return 'up-to-date';
    // Le fichier en place est l'officiel (première pose, ou remis par « Remettre les fichiers d'origine ») : gardé.
    if (!fs.existsSync(official)) fs.copyFileSync(target, official);
    fs.copyFileSync(ours, staged);
    renameWithRetry(staged, target);
    return 'installed';
  } catch {
    fs.rmSync(staged, { force: true });
    return 'busy';
  }
}

/**
 * Pose les fichiers corrigés dans le dossier de VPX `vpxDir` s'ils n'y sont pas à l'identique. `version` : celle de
 * ce VPX (« 10.8.1-5436 ») ; toute autre est laissée telle quelle. VPX ouvert garde ses fichiers : la partie d'après.
 * Un fichier qui n'est plus livré retrouve son officiel gardé (`restored`). Résultat d'ensemble : `busy` si un fichier
 * n'a pas pu être posé, sinon `installed` ou `restored` si l'un a changé, `missing` sans exécutable livré ni gardé.
 */
export function installVpxCorrige(vpxDir: string, version: string | undefined, appDir: string): VpxCorrigeInstall {
  if (version !== VPX_CORRIGE_VERSION) return 'other-version';
  const ours = vpxCorrigeFiles(appDir);
  const results = VPX_CORRIGE_FILES.map((file) => installOne(local(vpxDir, file), ours.get(file)));
  if (results.includes('busy')) return 'busy';
  if (results.includes('installed')) return 'installed';
  if (results.includes('restored')) return 'restored';
  return results[0] ?? 'missing';
}

/**
 * Au démarrage de Cyber Pinball, avant le premier relevé de la fiche technique et de la vérification des fichiers :
 * sinon, après une mise à jour qui apporte le corrigé, la fiche relevée avant la première partie le disait absent
 * (rapport du 21/11/2026 : fiche de 13:01, corrigé posé à 13:02 au premier lancement, alerte du fronton restée).
 */
export function installVpxCorrigeAtStartup(vpx: { exe: string; version: string } | undefined, appDir: string): VpxCorrigeInstall | undefined {
  if (!vpx) return undefined;
  const r = installVpxCorrige(path.dirname(vpx.exe), vpx.version, appDir);
  if (r === 'installed' || r === 'restored' || r === 'busy') console.log(`VPX corrigé (démarrage) : ${r === 'installed' ? 'fichiers posés' : r === 'restored' ? 'plus livré, fichiers officiels remis' : 'VPX ouvert, à la partie suivante'}.`); // i18n-ignore : journal
  return r;
}

/** Série de correctifs livrée (« patched Cyber Pinball 9 ») : la même que VPX_BASE.patch de scripts/vpx-corrige.mjs. */
export const VPX_CORRIGE_PATCH = 9;

/** Le VPX corrigé livré est-il en place (tous ses fichiers) ? Son numéro de série de correctifs, sinon undefined. */
export function vpxCorrigeInPlace(vpxDir: string, version: string | undefined, appDir: string): number | undefined {
  if (version !== VPX_CORRIGE_VERSION) return undefined;
  const ours = vpxCorrigeFiles(appDir);
  if (!ours.has(VPX_CORRIGE_EXE)) return undefined;
  for (const [file, source] of ours) {
    const want = digest(source);
    if (!want || want !== digest(local(vpxDir, file))) return undefined;
  }
  return VPX_CORRIGE_PATCH;
}

/** Tailles des fichiers corrigés livrés, acceptées par la vérification des fichiers de VPX à la place des officielles. */
export function vpxCorrigeSizes(appDir: string, version: string | undefined): Record<string, number> {
  if (version !== VPX_CORRIGE_VERSION) return {};
  const sizes: Record<string, number> = {};
  for (const [file, source] of vpxCorrigeFiles(appDir)) {
    try {
      sizes[file] = fs.statSync(source).size;
    } catch {
      // fichier disparu entre-temps : la vérification le dira modifié
    }
  }
  return sizes;
}
