// PuP-Packs incomplets (essai du 10 novembre 2026, The Matrix) : seules les playlists que le pack joue
// vraiment comptent ; une playlist vide que rien ne vise, ou citée par un modèle de script que le pack ne
// déclare pas, ne fait pas d'alerte.

import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { emptyPlayedPlaylists, missingPackFiles } from '../pupfiles';

const CRLF = String.fromCharCode(13, 10);
const lines = (...rows: string[]) => rows.join(CRLF) + CRLF;

function pack(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pup-incomplet-'));
  for (const dir of ['Intro', 'Start', 'Toppers', 'Attract']) fs.mkdirSync(path.join(root, dir));
  fs.writeFileSync(path.join(root, 'Attract', 'loop.mp4'), 'mp4');
  fs.writeFileSync(path.join(root, 'Toppers', 'a.mp4'), 'mp4');
  fs.writeFileSync(path.join(root, 'playlists.pup'), lines('ScreenNum,Folder,Des,AlphaSort,RestSeconds,Volume,Priority', '0,Intro,,0,30,100,0', '0,Start,,0,30,100,0', '0,Attract,,0,30,100,0', '0,Toppers,,0,30,100,0'));
  fs.writeFileSync(
    path.join(root, 'triggers.pup'),
    lines(
      'ID,Active,Descript,Trigger,ScreenNum,PlayList,PlayFile',
      // Inactif : comme l'« INTRO » de The Matrix, jamais joué.
      '65,0,***INTRO***,*,0,Intro,',
      // Actif, fichier absent : signalé par missingPackFiles.
      '302,1,TopperEnter,E834,0,Toppers,TopperEnterMatrix.mp4',
      // Actif, sans fichier choisi, sur une playlist pleine : rien à dire.
      '10,1,Attract,D1,0,Attract,',
    ),
  );
  return root;
}

test('PuP-Pack incomplet : une playlist vide que rien ne vise n’est pas signalée (The Matrix : Intro, Start)', () => {
  const root = pack();
  assert.deepEqual(emptyPlayedPlaylists(root), []);
  assert.deepEqual(missingPackFiles(root), ['Toppers\\TopperEnterMatrix.mp4']);
});

test('PuP-Pack incomplet : une playlist vide jouée par un déclencheur actif, ou par le script quand le pack la déclare', () => {
  const root = pack();
  fs.appendFileSync(path.join(root, 'triggers.pup'), lines('11,1,Start,D2,0,Start,'));
  assert.deepEqual(emptyPlayedPlaylists(root), ['Start']);
  // Script : Intro, déclarée par le pack, est jouée ; « PUPFrames » d'un modèle de script PuP-DMD ne l'est pas.
  const script = 'PuPlayer.playlistplayex pBackglass,"Intro","",100,1\nSub pDMDSetBackFrame(fname)\n  PuPlayer.playlistplayex pDMD,"PUPFrames",fname,0,1\nEnd Sub';
  assert.deepEqual(emptyPlayedPlaylists(root, script), ['Intro', 'Start']);
  // Une playlist jouée mais dont le dossier manque : vide aussi.
  fs.rmSync(path.join(root, 'Start'), { recursive: true });
  assert.deepEqual(emptyPlayedPlaylists(root), ['Start']);
  // Pack sans un seul média (configuration seule) : pas installé, pas « incomplet ».
  for (const dir of ['Attract', 'Toppers']) fs.rmSync(path.join(root, dir), { recursive: true });
  assert.deepEqual(emptyPlayedPlaylists(root), []);
});
