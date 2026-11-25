// Bibliothèques (.fpl) d'une table de Future Pinball (packages/core/src/futurepinball-libraries.ts) : celles que
// le .fpt cite, celles qui manquent au jeu lancé, la remise depuis une autre installation, le constat au journal.
// Cas relevé sur un PinCab le 25/11/2026 : Ghostbusters citait ghostbuster_sounds.fpl (et trois autres) que
// ni l'installation gérée ni l'ancienne n'avaient ; leur archive (.rar) attendait dans les téléchargements.
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import {
  archivesLikelyHolding,
  checkFuturePinballLibraries,
  futurePinballLibraryRefs,
  futurePinballLibraryReport,
  repairFuturePinballLibraries,
} from '../futurepinball-libraries';
import { REPO_ROOT } from './i18n-scan';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'cp-fpl-'));
const put = (file: string, content: string | Buffer = 'x') => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  return file;
};
/** Un .fpt de fortune : des octets de contrôle, puis des références « Bibliothèque.fpl\ressource » comme celles du jeu. */
const fpt = (refs: string[]) => Buffer.concat(refs.flatMap((r) => [Buffer.from([0, 7, 0x1f, 0]), Buffer.from(r, 'latin1')]));

const GHOSTBUSTERS = [
  'fpModels.fpl\\trigger-star.fpm',
  'ghostbuster_musics.fpl\\music_startmasshysteriamb.ogg',
  'ghostbuster_voices.fpl\\protonnottested.ogg',
  'ghostbuster_sounds.fpl\\protongun_ai_burst_loop.ogg',
  'ghostbuster_sounds.fpl\\proton2.ogg',
  'ghostbuster_narrator.fpl\\narrator_storage_mb_islit.ogg',
  'ZBRrollingballsoundslib.fpl\\zfx_ballrolwire2.ogg',
  'fpSounds.fpl\\trigger.ogg',
];

test('références : chaque bibliothèque citée une fois, avec son orthographe', async () => {
  const dir = tmp();
  const file = put(path.join(dir, 'ghostbusters.fpt'), fpt(GHOSTBUSTERS));
  const refs = await futurePinballLibraryRefs(file);
  assert.deepEqual([...refs].sort(), ['fpModels.fpl', 'fpSounds.fpl', 'ghostbuster_musics.fpl', 'ghostbuster_narrator.fpl', 'ghostbuster_sounds.fpl', 'ghostbuster_voices.fpl', 'ZBRrollingballsoundslib.fpl'].sort());
});

test('références : un nom à cheval sur deux morceaux de lecture est retrouvé entier, un fichier illisible ne cite rien', async () => {
  const dir = tmp();
  const CHUNK = 8 << 20;
  const ref = Buffer.from('ghostbuster_sounds.fpl\\a.ogg', 'latin1');
  const big = Buffer.alloc(CHUNK + 4096, 0);
  // « ghostbuster_sounds » avant la limite du morceau, « .fpl\ » après.
  ref.copy(big, CHUNK - 10);
  const file = put(path.join(dir, 'big.fpt'), big);
  assert.deepEqual(await futurePinballLibraryRefs(file), ['ghostbuster_sounds.fpl']);
  assert.deepEqual(await futurePinballLibraryRefs(path.join(dir, 'absent.fpt')), []);
});

test('références : du texte qui ressemble à un chemin sans bibliothèque n’en fait pas une', async () => {
  const dir = tmp();
  const file = put(path.join(dir, 't.fpt'), Buffer.from('\0C:\\Games\\readme.txt\0 table.fpl is mentioned \0\0 .fpl\\ \0', 'latin1'));
  assert.deepEqual(await futurePinballLibraryRefs(file), []);
});

test('manque : les bibliothèques citées que <jeu>\\Libraries n’a pas, sans tenir compte de la casse', async () => {
  const game = tmp();
  const table = put(path.join(tmp(), 'ghostbusters.fpt'), fpt(GHOSTBUSTERS));
  for (const n of ['FPMODELS.FPL', 'fpsounds.fpl', 'ZBRrollingballsoundslib.fpl']) put(path.join(game, 'Libraries', n));
  const check = await checkFuturePinballLibraries(game, table);
  assert.equal(check.refs.length, 7);
  assert.deepEqual([...check.missing].sort(), ['ghostbuster_musics.fpl', 'ghostbuster_narrator.fpl', 'ghostbuster_sounds.fpl', 'ghostbuster_voices.fpl']);
  // Un jeu sans dossier Libraries : tout manque ; une table qui ne cite rien : rien ne manque.
  assert.equal((await checkFuturePinballLibraries(tmp(), table)).missing.length, 7);
  const bare = put(path.join(tmp(), 'bare.fpt'), Buffer.from('rien'));
  assert.deepEqual((await checkFuturePinballLibraries(game, bare)).missing, []);
});

test('remise : une bibliothèque qu’une autre installation a encore est copiée, rien n’est écrasé, la source reste', () => {
  const game = tmp();
  const old = tmp();
  put(path.join(old, 'Libraries', 'Ghostbuster_Sounds.fpl'), 'ancienne');
  put(path.join(game, 'Libraries', 'ghostbuster_voices.fpl'), 'celle du jeu');
  put(path.join(old, 'Libraries', 'ghostbuster_voices.fpl'), 'autre');
  const done = repairFuturePinballLibraries(game, ['ghostbuster_sounds.fpl', 'ghostbuster_voices.fpl', 'ghostbuster_narrator.fpl'], [old]);
  assert.deepEqual(done.copied.map((c) => c.name), ['ghostbuster_sounds.fpl']);
  assert.deepEqual(done.stillMissing, ['ghostbuster_narrator.fpl']);
  assert.equal(fs.readFileSync(path.join(game, 'Libraries', 'ghostbuster_sounds.fpl'), 'utf8'), 'ancienne');
  assert.equal(fs.readFileSync(path.join(game, 'Libraries', 'ghostbuster_voices.fpl'), 'utf8'), 'celle du jeu', 'une bibliothèque déjà là reste la sienne');
  assert.ok(fs.existsSync(path.join(old, 'Libraries', 'Ghostbuster_Sounds.fpl')), 'la source reste intacte');
  // Le jeu lui-même n'est pas sa propre « autre installation ».
  assert.deepEqual(repairFuturePinballLibraries(game, ['x.fpl'], [game]).stillMissing, ['x.fpl']);
});

test('archives reçues : celles dont le nom ressemble à une bibliothèque manquante sont nommées, pas les autres', () => {
  const downloads = tmp();
  put(path.join(downloads, 'acquisition', 'ghostbusters_table_sounds-libs-v1.3.rar'));
  put(path.join(downloads, 'acquisition', 'BackToTheFuture.zip'));
  put(path.join(downloads, 'ghostbusters.txt'));
  const hits = archivesLikelyHolding(downloads, ['ghostbuster_sounds.fpl', 'ghostbuster_voices.fpl']);
  assert.deepEqual(hits.map((h) => path.basename(h)), ['ghostbusters_table_sounds-libs-v1.3.rar']);
  assert.deepEqual(archivesLikelyHolding(path.join(downloads, 'absent'), ['ghostbuster_sounds.fpl']), []);
});

test('constat : rien à dire quand la table a tout ; sinon ce qui manque, ce qui est remis et quoi faire du reste', () => {
  const full = { refs: ['fpModels.fpl'], missing: [] };
  assert.deepEqual(futurePinballLibraryReport({ tableName: 'T', check: full }), []);
  const check = { refs: ['a.fpl', 'b.fpl', 'c.fpl'], missing: ['b.fpl', 'c.fpl'] };
  const none = futurePinballLibraryReport({ tableName: 'ghostbusters', check, repair: { copied: [], stillMissing: ['b.fpl', 'c.fpl'], failed: [] } });
  assert.match(none.join('\n'), /« ghostbusters » en cite 3, 2 manque\(nt\).*b\.fpl, c\.fpl/);
  assert.match(none.join('\n'), /b\.fpl, c\.fpl introuvable\(s\) sur ce PC ; la partie démarre quand même/);
  assert.match(none.join('\n'), /ajoute l’archive des bibliothèques avec « Ajouter une table »/);
  const fixed = futurePinballLibraryReport({ tableName: 't', check, repair: { copied: [{ name: 'b.fpl', from: 'x' }], stillMissing: ['c.fpl'], failed: [] }, archives: ['D:\\dl\\libs.rar'] });
  assert.match(fixed.join('\n'), /1 remise\(s\).*b\.fpl/);
  assert.match(fixed.join('\n'), /c\.fpl introuvable[\s\S]*libs\.rar[\s\S]*« Ajouter une table » dessus/);
  const all = futurePinballLibraryReport({ tableName: 't', check, repair: { copied: [{ name: 'b.fpl', from: 'x' }, { name: 'c.fpl', from: 'x' }], stillMissing: [], failed: [] } });
  assert.ok(!all.join('\n').includes('introuvable'), 'tout remis : plus rien à faire');
});

test('le lancement d’une partie de Future Pinball constate ses bibliothèques, son et vue avant de lancer le jeu', () => {
  const source = fs.readFileSync(path.join(REPO_ROOT, 'app', 'src', 'frontend.ts'), 'utf8');
  const launch = source.indexOf('launchPinballFx({');
  for (const call of ['logFuturePinballLaunch(', 'await logFuturePinballLibraries(']) {
    const at = source.indexOf(call);
    assert.ok(at > 0, `frontend.ts doit appeler ${call} avant la partie`);
    assert.ok(at < launch, `${call} doit précéder le lancement du jeu`);
  }
  const guard = source.indexOf('if (simulated === undefined && fp && !simulatedDisplays()');
  assert.ok(guard > 0 && guard < source.indexOf('logFuturePinballLaunch('), 'jamais sur des écrans simulés : le constat est dans le bloc gardé');
  assert.ok(source.indexOf('await logFuturePinballLibraries(') - guard < 4000, 'le constat des bibliothèques est dans le même bloc gardé');
});
