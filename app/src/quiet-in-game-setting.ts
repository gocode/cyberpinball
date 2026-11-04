// Réglage du joueur « Masquer les notifications pendant les parties » (Menu système > Amis ;
// essai réel du 04/11/2026) : désactivé par défaut, les notifications qui se montrent partout
// (connexion d'un ami, demande de rejoindre une partie, nouvelles de la partie entre amis :
// notices.ts, NoticeRule.away) paraissent aussi pendant les parties, par-dessus VPX, avec leur son.
// Activé, rien ne s'affiche ni ne sonne pendant une partie ; ce qui compte reste au menu (une
// invitation encore valable, la pastille des amis). Gardé dans <données>\amis\notifications-en-partie.json ;
// illisible ou absent : désactivé.

import * as fs from 'node:fs';
import * as path from 'node:path';

const file = (dataDir: string) => path.join(dataDir, 'amis', 'notifications-en-partie.json');

export function readQuietInGame(dataDir: string): boolean {
  try {
    return (JSON.parse(fs.readFileSync(file(dataDir), 'utf8')) as { hide?: unknown }).hide === true;
  } catch {
    return false;
  }
}

export function writeQuietInGame(dataDir: string, hide: boolean): void {
  fs.mkdirSync(path.dirname(file(dataDir)), { recursive: true });
  fs.writeFileSync(file(dataDir), JSON.stringify({ hide }, null, 2));
}
