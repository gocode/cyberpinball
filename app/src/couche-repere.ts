// Couche d'API OpenXR du repère de la pièce pour VPX (packages/casque-vr/src/couche-repere.cpp, essai réel du
// 13 novembre 2026 : trois remises d'origine en partie, la table fausse dans le casque jusqu'à la partie suivante).
// Une partie dans le casque : la place que VPX a lue au lancement, la composée des sauts mesurés depuis par la sonde,
// écrite dans le fichier que la couche relit à chaque image. La partie suivante repart d'une correction nulle : son
// INI a déjà la place reposée (frontend.ts, headsetJump).

import * as fs from 'node:fs';
import * as path from 'node:path';
import { composeJumps, ROOM_LAYER, roomCorrectionText, roomLayerCorrected, writeFileAtomic, type CabinetPlace, type JumpTransform } from '@cyberpinball/core';

/** La couche (manifeste et DLL) : natif\couche-repere une fois l'application fabriquée, build\casque-vr\Release en développement. */
export function roomLayerDir(appDir: string): string | undefined {
  return [path.join(appDir, 'natif', 'couche-repere'), path.join(appDir, '..', 'build', 'casque-vr', 'Release'), path.join(appDir, '..', '..', 'build', 'casque-vr', 'Release')].find(
    (d) => fs.existsSync(path.join(d, `${ROOM_LAYER}.json`)) && fs.existsSync(path.join(d, `${ROOM_LAYER}.dll`)),
  );
}

/** Le repère d'une partie dans le casque : la place lue par VPX à son lancement et les sauts mesurés depuis. */
export class GameRoom {
  jump: JumpTransform = { angle: 0, tx: 0, tz: 0, dy: 0 };
  jumps = 0;
  readonly file: string;
  readonly journal: string;

  /** `layer` : la couche est chargée par VPX pour cette partie (sinon la correction n'est que notée). */
  constructor(
    vrDir: string,
    readonly launchPlace: CabinetPlace,
    readonly layer: boolean,
  ) {
    this.file = path.join(vrDir, 'correction-partie.txt');
    this.journal = path.join(vrDir, 'couche-repere.txt');
    fs.mkdirSync(vrDir, { recursive: true });
    fs.rmSync(this.journal, { force: true });
    this.write();
  }

  /** Un saut mesuré pendant la partie : composé avec les précédents, écrit pour la couche. */
  onJump(jump: JumpTransform): void {
    this.jump = composeJumps(this.jump, jump);
    this.jumps++;
    this.write();
  }

  /** Écrit d'un coup (écriture atomique partagée) : la couche ne lit jamais une correction à moitié écrite. */
  private write(): void {
    writeFileAtomic(this.file, roomCorrectionText(this.journal, this.jump));
  }

  /** Le journal de la couche (vide si elle n'a rien écrit). */
  journalText(): string {
    try {
      return fs.readFileSync(this.journal, 'utf8');
    } catch {
      return '';
    }
  }

  /** La couche a-t-elle corrigé l'espace de VPX : sa table et ses manettes sont alors dans le repère du lancement. */
  corrected(): boolean {
    return roomLayerCorrected(this.journalText());
  }
}

/** La couche mise à l'écart après une partie finie anormalement : pour cette version de l'application seulement. */
const SET_ASIDE = 'couche-repere-ecartee.json';

/**
 * La couche est-elle écartée pour cette version ? Une autre version (mise à jour faite) : l'écart est levé, le fichier
 * effacé, et la couche essayée de nouveau.
 */
export function roomLayerSetAside(vrDir: string, version: string): { since: string; why: string } | undefined {
  const file = path.join(vrDir, SET_ASIDE);
  let read: { version?: string; since?: string; why?: string };
  try {
    read = JSON.parse(fs.readFileSync(file, 'utf8')) as typeof read;
  } catch {
    return undefined;
  }
  if (read.version === version) return { since: read.since ?? '?', why: read.why ?? '?' };
  fs.rmSync(file, { force: true });
  return undefined;
}

/** Écarte la couche pour cette version de l'application (les parties suivantes se lancent sans elle). */
export function setRoomLayerAside(vrDir: string, version: string, why: string, now = new Date()): void {
  fs.mkdirSync(vrDir, { recursive: true });
  writeFileAtomic(path.join(vrDir, SET_ASIDE), JSON.stringify({ version, since: now.toISOString(), why }, null, 2) + '\n');
}
