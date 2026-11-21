// Le VPX corrigé de Cyber Pinball : l'exécutable de VPX 10.8.1-5436 reconstruit avec des correctifs de VPX venus
// après elle (packages/vpx-corrige, scripts/vpx-corrige.mjs), posé à la place de celui de l'archive officielle avant
// chaque partie. Le premier (20/11/2026) : la 5436 présentait le backglass à chaque image du playfield, et un écran
// annexe plus lent (50 ou 60 Hz) calait toute la partie sur sa fréquence ; corrigé dans VPX en novembre 2026
// (d73557d, f832180), dans aucune version publiée. Les plugins et bibliothèques restent ceux de l'archive.
//
// Seulement sur la version pour laquelle il est construit (VPX_CORRIGE_VERSION) : un autre VPX (essai 10.9, VPX de
// l'utilisateur) n'est jamais touché. La vérification des fichiers de VPX (vpx-integrity.ts) le reconnaît, et
// « Remettre les fichiers d'origine » peut toujours remettre l'officiel : il est reposé à la partie suivante.

import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { renameWithRetry } from '@cyberpinball/core';

/** La version de VPX que l'exécutable corrigé remplace, et son nom. */
export const VPX_CORRIGE_VERSION = '10.8.1-5436';
export const VPX_CORRIGE_EXE = 'VPinballX_BGFX64.exe';

/** Fabriqué avec l'application (natif\vpx-corrige), ou construit en développement (build\vpx-corrige). */
export function vpxCorrigeFile(appDir: string): string | undefined {
  for (const file of [path.join(appDir, 'natif', 'vpx-corrige', VPX_CORRIGE_EXE), path.join(appDir, '..', 'build', 'vpx-corrige', VPX_CORRIGE_EXE), path.join(appDir, '..', '..', 'build', 'vpx-corrige', VPX_CORRIGE_EXE)])
    if (fs.existsSync(file)) return file;
  return undefined;
}

/** Empreinte d'un exécutable de quelques dizaines de Mo, relue seulement si sa taille ou sa date change. */
const digests = new Map<string, { stamp: string; sha: string }>();
function digest(file: string): string | undefined {
  try {
    const st = fs.statSync(file);
    const stamp = `${st.size}:${st.mtimeMs}`;
    const kept = digests.get(file);
    if (kept?.stamp === stamp) return kept.sha;
    // lecture entière : exécutable de VPX, quelques dizaines de Mo
    const sha = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
    digests.set(file, { stamp, sha });
    return sha;
  } catch {
    return undefined;
  }
}

export type VpxCorrigeInstall = 'installed' | 'up-to-date' | 'missing' | 'other-version' | 'busy' | 'restored';

/**
 * L'exécutable officiel, gardé à côté avant la première pose (« .officiel » : executablePattern ne le prend pas pour
 * un VPX). Une version de Cyber Pinball qui ne livre plus le corrigé le remet à la partie suivante, sans téléchargement.
 */
export const VPX_OFFICIEL_SUFFIX = '.officiel';

/**
 * Pose l'exécutable corrigé dans le dossier de VPX `vpxDir` s'il n'y est pas à l'identique. `version` : celle de ce
 * VPX (« 10.8.1-5436 ») ; toute autre est laissée telle quelle. VPX ouvert garde son exécutable : la partie d'après.
 * Sans corrigé livré (`missing`), l'officiel gardé est remis (`restored`).
 */
export function installVpxCorrige(vpxDir: string, version: string | undefined, appDir: string): VpxCorrigeInstall {
  if (version !== VPX_CORRIGE_VERSION) return 'other-version';
  const target = path.join(vpxDir, VPX_CORRIGE_EXE);
  const official = `${target}${VPX_OFFICIEL_SUFFIX}`;
  const staged = `${target}.cyberpinball`;
  const ours = vpxCorrigeFile(appDir);
  try {
    if (!ours) {
      // Retour arrière : plus de corrigé dans cette version de Cyber Pinball, l'officiel reprend sa place.
      if (!fs.existsSync(official)) return 'missing';
      fs.copyFileSync(official, staged);
      renameWithRetry(staged, target);
      fs.rmSync(official, { force: true });
      return 'restored';
    }
    if (!fs.existsSync(target)) return 'missing';
    const want = digest(ours);
    if (want && want === digest(target)) return 'up-to-date';
    // L'exécutable en place est l'officiel (première pose, ou remis par « Remettre les fichiers d'origine ») : gardé.
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
 * Au démarrage de Cyber Pinball, avant le premier relevé de la fiche technique et de la vérification des fichiers :
 * sinon, après une mise à jour qui apporte le corrigé, la fiche relevée avant la première partie le disait absent
 * (rapport du 21/11/2026 : fiche de 13:01, corrigé posé à 13:02 au premier lancement, alerte du fronton restée).
 */
export function installVpxCorrigeAtStartup(vpx: { exe: string; version: string } | undefined, appDir: string): VpxCorrigeInstall | undefined {
  if (!vpx) return undefined;
  const r = installVpxCorrige(path.dirname(vpx.exe), vpx.version, appDir);
  if (r === 'installed' || r === 'restored' || r === 'busy') console.log(`VPX corrigé (démarrage) : ${r === 'installed' ? 'exécutable posé' : r === 'restored' ? 'plus livré, exécutable officiel remis' : 'VPX ouvert, à la partie suivante'}.`); // i18n-ignore : journal
  return r;
}

/** Série de correctifs livrée (« patched Cyber Pinball 1 ») : la même que VPX_BASE.patch de scripts/vpx-corrige.mjs. */
export const VPX_CORRIGE_PATCH = 1;

/** Le VPX corrigé livré est-il l'exécutable en place ? Son numéro de série de correctifs, sinon undefined. */
export function vpxCorrigeInPlace(vpxDir: string, version: string | undefined, appDir: string): number | undefined {
  if (version !== VPX_CORRIGE_VERSION) return undefined;
  const ours = vpxCorrigeFile(appDir);
  const want = ours && digest(ours);
  return want && want === digest(path.join(vpxDir, VPX_CORRIGE_EXE)) ? VPX_CORRIGE_PATCH : undefined;
}

/** Taille de l'exécutable corrigé livré, acceptée par la vérification des fichiers de VPX à la place de l'officielle. */
export function vpxCorrigeSizes(appDir: string, version: string | undefined): Record<string, number> {
  if (version !== VPX_CORRIGE_VERSION) return {};
  const ours = vpxCorrigeFile(appDir);
  try {
    return ours ? { [VPX_CORRIGE_EXE]: fs.statSync(ours).size } : {};
  } catch {
    return {};
  }
}
