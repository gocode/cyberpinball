// Médias attendus par un PuP-Pack et absents (26/11/2026) : seul ce qui est certain est signalé. Chaque
// garde-fou contre un faux positif est fixé ici.

import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { fileIsAbsent, pupScriptCalls } from '../pup-medias-absents';
import { emptyPlayedPlaylists, missingPackFiles, packCoverage, packMostlyMissing } from '../pupfiles';

const CRLF = String.fromCharCode(13, 10);
const lines = (...rows: string[]) => rows.join(CRLF) + CRLF;
const HEAD = 'ID,Active,Descript,Trigger,ScreenNum,PlayList,PlayFile';

function pack(triggers: string[], folders: Record<string, string[]>, declared: string[] = Object.keys(folders)): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pup-absents-'));
  for (const [dir, files] of Object.entries(folders)) {
    fs.mkdirSync(path.join(root, dir), { recursive: true });
    for (const f of files) fs.writeFileSync(path.join(root, dir, f), 'x');
  }
  fs.writeFileSync(path.join(root, 'playlists.pup'), lines('ScreenNum,Folder,Des,AlphaSort,RestSeconds,Volume,Priority', ...declared.map((d) => `0,${d},,0,0,100,0`)));
  fs.writeFileSync(path.join(root, 'triggers.pup'), lines(HEAD, ...triggers));
  return root;
}

test('médias absents : un fichier de déclencheur qui manque est signalé, la casse et l’extension absente sont tolérées', () => {
  const root = pack(['1,1,A,E1,0,Music,Track1.MP3', '2,1,B,E2,0,Music,TRACK2', '3,1,C,E3,0,Music,absent.mp3'], { Music: ['track1.mp3', 'track2.wav'] });
  assert.deepEqual(missingPackFiles(root), ['Music\\absent.mp3']);
});

test('médias absents : PlayFile vide ou "" (lecture au hasard), déclencheur inactif, nom accentué : jamais signalés', () => {
  const root = pack(['1,1,A,E1,0,Music,', '2,1,B,E2,0,Music,""', '3,0,C,E3,0,Music,inactif.mp3', '4,1,D,E4,0,Music,café.mp3'], { Music: ['a.mp3'] });
  assert.deepEqual(missingPackFiles(root), []);
});

test('médias absents : le script, seulement les chaînes littérales complètes, hors commentaires', () => {
  const root = pack([], { Music: ['a.mp3'], Topper: ['topperenter.mp4'] });
  const script = [
    'PuPlayer.playlistplayex pMusic,"Music","a.mp3",100,1',
    'PuPlayer.playlistplayex pMusic,"Music","A-TRACK.mp3",100,1',
    "'PuPlayer.playlistplayex pMusic,\"Music\",\"commente.mp3\",100,1",
    'Rem PuPlayer.playlistplayex pMusic,"Music","rem.mp3",100,1',
    'PuPlayer.playlistplayex pMusic,"Music","player" & n & ".wav",100,1',
    'PuPlayer.playlistplayex pMusic,"Music",fname,100,1',
    'PuPlayer.playlistplayex pMusic,"Music","",100,1',
    'PuPlayer.playlistplayex pMusic,"Music","accentué.mp3",100,1',
    'PuPlayer.playlistplayex pMusic,"Topper","TopperEnter",100,1',
    'x = 1 \' PuPlayer.playlistplayex pMusic,"Music","fin.mp3",100,1',
  ].join('\n');
  assert.deepEqual(missingPackFiles(root, script), ['Music\\A-TRACK.mp3']);
});

test('médias absents : l’analyse du script ne garde que le littéral entier', () => {
  const calls = pupScriptCalls('PuPlayer.playlistplayex 2,"Fond","x.mp4",0,1\nPuPlayer.playlistplayex 2,"p" & n,"x.mp4",0,1\nPuPlayer.playlistadd 2,"Intro",1,0');
  assert.deepEqual(calls, [
    { kind: 'play', folder: 'Fond', file: 'x.mp4' },
    { kind: 'add', folder: 'Intro' },
  ]);
  assert.equal(fileIsAbsent(['a.mp3'], 'b'), true);
  assert.equal(fileIsAbsent(['a.mp3'], 'A'), false);
  assert.equal(fileIsAbsent(['a.mp3'], 'dossier\\b.mp3'), false);
});

test('médias absents : dossier déclaré mais jamais utilisé, options inactives, playlists en double : pas d’alerte', () => {
  const root = pack(['1,1,A,E1,0,Music,'], { Music: ['a.mp3'], Jamais: [], 'PuP-Pack_Options': [] }, ['Music', 'Music', 'Jamais']);
  assert.deepEqual(emptyPlayedPlaylists(root, 'PuPlayer.playlistadd 2,"Music",1,0\nPuPlayer.playlistadd 2,"Music",1,0\nPuPlayer.playlistplayex 2,"PuP-Pack_Options","",1,1'), []);
  assert.deepEqual(missingPackFiles(root), []);
});

test('médias absents : un dossier que le script déclare (playlistadd) ou joue, absent ou vide, est signalé', () => {
  const root = pack(['1,1,A,E1,0,Music,'], { Music: ['a.mp3'], Vide: [], Frames: [] });
  const script = 'PuPlayer.playlistadd 2,"Absent",1,0\nPuPlayer.playlistplayex 2,"Vide","",1,1\n\'PuPlayer.playlistadd 2,"Commente",1,0\nPuPlayer.playlistplayex pDMD,"Frames",fname,0,1';
  // « Vide » n'est joué que s'il est déclaré par le pack ; « Absent » est déclaré par le script lui-même.
  assert.deepEqual(emptyPlayedPlaylists(root, script), ['Absent', 'Vide']);
});

test('médias absents : une ligne de séparation de l’auteur, même active, n’est pas un déclencheur', () => {
  // Lignes réelles d'un triggers.pup (The Matrix, 27/11/2026).
  const root = pack(
    [
      '379,1,***MULTIBALL***,********,****,*************,*****************,**********,*****,,,,,0',
      '683,1,"**GHOST SENTINELS EVENT***",**************,***,********************,*********************,,,,,,,0',
      '1,1,A,E1,0,Music,a.mp3',
    ],
    { Music: ['a.mp3'] },
  );
  assert.deepEqual(missingPackFiles(root), []);
  assert.deepEqual(emptyPlayedPlaylists(root), []);
  assert.deepEqual(packCoverage(root), { total: 1, broken: 0 });
  assert.deepEqual(missingPackFiles(root, 'PuPlayer.playlistplayex 2,"Music","a?.mp3",0,1\nPuPlayer.playlistadd 2,"***",1,0'), []);
  assert.deepEqual(emptyPlayedPlaylists(root, 'PuPlayer.playlistadd 2,"***",1,0'), []);
});

test('médias absents : gravité, le pack n’est « en grande partie absent » qu’à partir de la moitié de 4 déclencheurs actifs', () => {
  // 1 déclencheur cassé sur 4 : simple information.
  const peu = pack(['1,1,A,E1,0,Music,a.mp3', '2,1,B,E2,0,Music,', '3,1,C,E3,0,Fond,', '4,1,D,E4,0,Music,absent.mp3'], { Music: ['a.mp3'], Fond: ['f.mp4'] });
  assert.deepEqual(packCoverage(peu), { total: 4, broken: 1 });
  assert.equal(packMostlyMissing(packCoverage(peu)), false);
  // 2 sur 4 (dossier absent, fichier absent), les inactifs et les options ne comptent pas.
  const moitie = pack(
    ['1,1,A,E1,0,Music,a.mp3', '2,1,B,E2,0,Music,', '3,1,C,E3,0,Absent,', '4,1,D,E4,0,Music,absent.mp3', '5,0,E,E5,0,Absent,', '6,1,F,E6,0,PuP-Pack_Options,'],
    { Music: ['a.mp3'] },
  );
  assert.deepEqual(packCoverage(moitie), { total: 4, broken: 2 });
  assert.equal(packMostlyMissing(packCoverage(moitie)), true);
  // Trop peu de déclencheurs pour juger : jamais « en grande partie absent ».
  assert.equal(packMostlyMissing({ total: 3, broken: 3 }), false);
  // Un fichier visé dans un dossier absent est listé ; un pack sans aucun média ne liste rien (déjà signalé en entier).
  assert.deepEqual(missingPackFiles(moitie), ['Music\\absent.mp3']);
  const nu = pack(['1,1,A,E1,0,Music,a.mp3'], { Music: [] });
  assert.deepEqual(missingPackFiles(nu), []);
});
