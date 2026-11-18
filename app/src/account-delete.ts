// Supprimer mon compte (RGPD, droit à l'effacement), novembre 2026 :
// Menu système > Communauté > Partage et réseau > « Supprimer mon compte… ». Le compte, c'est la clé du joueur (social.ts) ; ce qu'il en reste
// ailleurs est effacé par l'avis d'oubli (packages/core/src/forget.ts) et par le service des retours.
//
// Dans l'ordre :
//  1. le service des retours efface ses propositions et ses votes (demande signée par la clé, qui doit
//     donc encore exister) ; injoignable, le joueur choisit de réessayer ou de continuer quand même ;
//  2. l'avis d'oubli part vers les bornes reliées, un « unfriend » vers ses amis, le réseau s'arrête ;
//  3. la messagerie s'arrête (elle écrit son fichier en partant) ;
//  4. les fichiers du compte sont effacés ;
//  5. Cyber Pinball redémarre, avec une clé neuve (loadSocial la crée).
// Restent sur la borne : les tables (reçues d'amis comprises), les scores des tables (initiales), les
// réglages, et les sauvegardes déjà faites, que le joueur efface lui-même s'il le veut (il en est prévenu).

import * as fs from 'node:fs';
import * as path from 'node:path';
import { chatFile, profilesFile, rankingsFile, roomsFile, socialFile } from '@cyberpinball/core';

/** Les fichiers et dossiers du compte, sous le dossier des données. */
export function accountPaths(dataDir: string): string[] {
  return [
    // L'identité : la clé, le nom, le pays, l'avatar choisi, les amis, l'annuaire.
    socialFile(dataDir),
    // Images d'avatar : le sien, et celles des autres gardées pour lui.
    path.join(dataDir, 'avatars'),
    // Ses conversations, ses salons, les cartes et « J'aime », les parties et records entre amis.
    chatFile(dataDir),
    roomsFile(dataDir),
    profilesFile(dataDir),
    path.join(dataDir, 'amis', 'records.json'),
    path.join(dataDir, 'amis', 'parties.json'),
    // Les classements reçus portent ses scores : ils se reremplissent au retour sur le réseau.
    rankingsFile(dataDir),
  ];
}

/** Efface les fichiers du compte ; rend ceux qui n'ont pas pu l'être (verrouillés par Windows). */
export function eraseAccountFiles(dataDir: string): string[] {
  const failed: string[] = [];
  for (const p of accountPaths(dataDir)) {
    try {
      fs.rmSync(p, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
    } catch {
      failed.push(p);
    }
  }
  return failed;
}

export interface AccountDeleteSteps {
  /** Le réseau des bornes : l'avis d'oubli, puis l'arrêt. */
  forgetNetwork(): Promise<{ reached: number }>;
  /** La messagerie, arrêtée avant l'effacement de son fichier. */
  stopChat(): void;
  dataDir: string;
}

export interface AccountDeleteReport {
  /** Le service des retours a effacé ses données ; false : injoignable ou refusé (le joueur a choisi de continuer). */
  feedback: boolean;
  /** Bornes reliées au moment de l'avis. */
  reached: number;
  /** Fichiers que Windows n'a pas laissé effacer. */
  failed: string[];
}

/** Les étapes 2 à 4, une fois le service des retours fait (ou passé avec l'accord du joueur). */
export async function deleteAccount(steps: AccountDeleteSteps, feedback: boolean): Promise<AccountDeleteReport> {
  const { reached } = await steps.forgetNetwork();
  steps.stopChat();
  const failed = eraseAccountFiles(steps.dataDir);
  return { feedback, reached, failed };
}
