// Goldorak (Original 2017), 19/11/2026 : « aucun son », et un DMD orange avec ou sans son dossier UltraDMD, sans une
// ligne au journal pour trancher. Le plugin FlexDMD de VPX 10.8.1 dessine les textes d'UltraDMD en orange (sa couleur
// par défaut) et en RGB (« format=2 » = SRGB888) : seul le journal dit si les images du dossier se chargent.
// Invariants : après une partie, le journal de la borne dit les sorties du son, la musique que VPX n'a pas trouvée et
// les images du DMD chargées ou introuvables ; le médecin signale un son coupé par le .ini de la table et une musique
// introuvable à la dernière partie ; la musique nommée par une variable ou jouée par une procédure du script est connue,
// reprise d'une autre installation, ou signalée absente.

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { diagnose, scriptFacts } from '../doctor';
import { IniDocument } from '../ini';
import { findInstallation, tableCompanions } from '../installation';
import { scanTables } from '../tables';
import { flexAssetsJournal, musicNotFound, mutedAudioSettings, vpxAudioJournal } from '../vpxgamelog';

const LOG = (table: string) => [
  `2026-11-19 10:16:00.000 INFO  [Main] [VPinball::LoadFileName@1] LoadGameFromFilename ${table}`,
  "2026-11-19 10:16:01.000 INFO  [Main] [AudioPlayer::AudioPlayer@154] Audio device initialized. Device: 'Haut-parleurs (Realtek(R) Audio)', Freq : 48000, Format: SDL_AUDIO_F32LE, Channels: 2",
  '2026-11-19 10:16:01.010 INFO  [Main] [AudioPlayer::AudioPlayer@230] Backglass sound device was not found (Casque USB), using default: Haut-parleurs (Realtek(R) Audio)',
  '2026-11-19 10:16:02.000 INFO  [Main] [FlexDMD:AssetManager::SetBasePath@60] Base path set to: C:\\Cyber Pinball\\tables\\Goldorak (Original 2017)\\Goldorak.UltraDMD\\',
  '2026-11-19 10:16:02.100 INFO  [Main] [FlexDMD:AssetManager::GetBitmap@323] Bitmap added to cache: FlexDMD.Resources.udmd-f6by12_0.png',
  '2026-11-19 10:16:02.200 INFO  [Main] [FlexDMD:AssetManager::GetBitmap@323] Bitmap added to cache: C:\\Cyber Pinball\\tables\\Goldorak (Original 2017)\\Goldorak.UltraDMD\\intro.png',
  '2026-11-19 10:16:02.300 ERROR [Main] [FlexDMD:AssetManager::ResolveSrc@228] Failed to resolve asset: C:\\Cyber Pinball\\tables\\Goldorak (Original 2017)\\Goldorak.UltraDMD\\fulgure.png',
  '2026-11-19 10:16:02.400 ERROR [Main] [FlexDMD:AssetManager::ResolveSrc@152] Unsupported asset extension: tga',
  '2026-11-19 10:16:03.000 ERROR [Main] [ScriptGlobalTable::PlayMusic@133] Failed to stream music: Goldorak\\generique.mp3',
  '2026-11-19 10:16:40.000 ERROR [Main] [ScriptGlobalTable::PlayMusic@133] Failed to stream music: Goldorak\\generique.mp3',
];

test('journal de la partie : sorties du son, musique introuvable, images du DMD', () => {
  const lines = LOG('C:\\Cyber Pinball\\tables\\Goldorak (Original 2017)\\Goldorak (Original 2017).vpx');
  assert.deepEqual(musicNotFound(lines), ['Goldorak\\generique.mp3']);
  const audio = vpxAudioJournal('Goldorak', lines)!;
  assert.match(audio, /^Son de la partie \(Goldorak\) : sorties « Haut-parleurs \(Realtek\(R\) Audio\) »/);
  assert.match(audio, /sortie absente, remplacée : Backglass : « Casque USB »/);
  assert.match(audio, /musique introuvable .* « Goldorak\\generique\.mp3 »\.$/);
  const dmd = flexAssetsJournal('Goldorak', lines)!;
  assert.match(dmd, /dossier « C:\\Cyber Pinball\\tables\\Goldorak \(Original 2017\)\\Goldorak\.UltraDMD\\ » ; 1 image chargée ; introuvables : .*fulgure\.png ; formats non pris en charge : tga\.$/);
  assert.equal(vpxAudioJournal('x', ['rien']), undefined);
  assert.equal(flexAssetsJournal('x', ['rien']), undefined);
});

test('médecin : son coupé par le .ini de la table, musique introuvable à la dernière partie', () => {
  const tablesDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-son-'));
  try {
    const name = 'Goldorak (Original 2017)';
    const folder = path.join(tablesDir, name);
    fs.mkdirSync(folder, { recursive: true });
    const vpx = path.join(folder, `${name}.vpx`);
    fs.writeFileSync(vpx, 'x');
    fs.writeFileSync(path.join(folder, `${name}.ini`), '[Player]\r\nMusicVolume = 0\r\nSoundVolume = 80\r\nBGSet = 1\r\n');
    const entry = scanTables(tablesDir)[0]!;
    const findings = diagnose(entry, { tablesDir, vpxLog: LOG(vpx).join('\r\n') });
    const muted = findings.find((f) => f.code === 'tableAudioMuted');
    assert.match(muted?.detail ?? '', /MusicVolume à 0/);
    const write = muted?.fix?.ops[0];
    assert.ok(write && write.op === 'write' && !/MusicVolume/.test(write.content) && /SoundVolume = 80/.test(write.content));
    const music = findings.find((f) => f.code === 'musicMissing');
    assert.match(music?.detail ?? '', /« Goldorak\\generique\.mp3 »/);
    // L'image du DMD introuvable (seule celle du dossier de la table ; jamais une ressource de FlexDMD).
    assert.match(findings.find((f) => f.code === 'dmdImagesMissing')?.detail ?? '', /« fulgure\.png » dans « Goldorak\.UltraDMD »/);
    // Le journal d'une autre table ne compte pas.
    assert.equal(diagnose(entry, { tablesDir, vpxLog: LOG('C:\\autre\\Autre.vpx').join('\r\n') }).find((f) => f.code === 'musicMissing'), undefined);
    assert.deepEqual(mutedAudioSettings(IniDocument.parse('[Player]\r\nMusicVolume = 100\r\nSoundVolume =\r\n')), []);
  } finally {
    fs.rmSync(tablesDir, { recursive: true, force: true });
  }
});

test('musique nommée par une variable ou jouée par une procédure du script : connue', () => {
  const script = [
    'Const MusicDir = "Goldorak\\"',
    'Sub Table1_Init : PlayMusic MusicDir & "generique.mp3" : End Sub',
    'Sub PlaySong(song)',
    '  EndMusic',
    '  PlayMusic "Goldorak\\" & song',
    'End Sub',
    'Sub Attract : PlaySong "attract.mp3" : End Sub',
    'Sub Bonus : PlaySong("bonus.ogg") : End Sub',
    'Sub Inconnu(x) : PlayMusic x & ".mp3" : End Sub',
    '',
  ].join('\r\n');
  // « Goldorak\ » : le dossier écrit en toutes lettres dans la procédure (lu comme avant) ; puis les morceaux.
  assert.deepEqual(scriptFacts(script).music, ['Goldorak\\', 'Goldorak\\generique.mp3', 'Goldorak\\attract.mp3', 'Goldorak\\bonus.ogg']);
  // Procédure sur une seule ligne.
  assert.deepEqual(scriptFacts('Sub Joue(s) : PlayMusic s : End Sub\r\nSub A : Joue "theme.mp3" : End Sub\r\n').music, ['theme.mp3']);
  // En toutes lettres : comme avant.
  assert.deepEqual(scriptFacts('Sub A : PlayMusic "Akira\\" & n & ".mp3" : End Sub\r\n').music, ['Akira\\']);
});

test('reprise d’une installation : la musique jouée suit la table, ou elle est signalée absente', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-son-reprise-'));
  try {
    const vp = path.join(root, 'vPinball');
    const tables = path.join(vp, 'VisualPinball', 'Tables');
    fs.mkdirSync(path.join(vp, 'VisualPinball', 'VPinMAME'), { recursive: true });
    fs.mkdirSync(path.join(vp, 'PinUPSystem', 'PUPVideos'), { recursive: true });
    fs.mkdirSync(path.join(vp, 'VisualPinball', 'Music', 'Goldorak'), { recursive: true });
    fs.writeFileSync(path.join(vp, 'VisualPinball', 'Music', 'Goldorak', 'generique.mp3'), 'x');
    fs.writeFileSync(path.join(vp, 'VisualPinball', 'VPinballX64.exe'), 'x');
    fs.mkdirSync(tables, { recursive: true });
    const vpx = path.join(tables, 'Goldorak (Original 2017).vpx');
    fs.writeFileSync(vpx, 'x');
    const layout = findInstallation(tables, [path.join(root, 'CyberPinball')])!;
    assert.ok(layout?.musicDir);
    const ok = tableCompanions(vpx, layout, { usesPinmame: false, roms: [], music: ['Goldorak\\generique.mp3'] });
    assert.ok(ok.found.some((c) => c.part === 'music' && path.basename(c.path) === 'Goldorak'), JSON.stringify(ok.found));
    assert.deepEqual(ok.missing, []);
    const absent = tableCompanions(vpx, layout, { usesPinmame: false, roms: [], music: ['Mazinger\\theme.mp3'] });
    assert.deepEqual(absent.missing, ['musique « Mazinger\\theme.mp3 »']);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
