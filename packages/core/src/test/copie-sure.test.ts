// Copies de dossiers : une seule fonction, copyTree (copytree.ts), saine avec les chemins accentués.
//
// Défaut du 06/11/2026 : sous Windows, la copie récursive de fichiers de Node 22 (22.23.2) écrivait
// une destination accentuée en « Ã© » (dossier fantôme « pupvideos (dÃ©sactivÃ©s) ») et arrêtait
// net le processus (0xC0000409) dès qu'une source ou un dossier parent portait un accent. Une
// table « Été », un profil Windows accentué suffisaient. Electron 44 (Node 24) est sain, mais les
// essais, les scripts de fabrication et les outils en ligne de commande tournent sous Node 22.

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { copyTree, findMangledDirs, unmangledName } from '../copytree';

const REPO = path.join(__dirname, '..', '..', '..', '..');
/** Appel direct à la copie de dossiers de Node (écrit en deux morceaux pour que ce fichier ne s'accuse pas). */
const FORBIDDEN = new RegExp(['\\bcp', 'Sync\\s*\\(|\\b(?:fs|fsp|promises)\\.cp\\s*\\('].join(''));

function sources(dir: string, found: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', 'dist', 'build', 'release', '.git'].includes(e.name)) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) sources(full, found);
    else if (/\.(ts|mts|cts|js|mjs|cjs)$/.test(e.name)) found.push(full);
  }
  return found;
}

test('aucune copie de dossier ne passe par fs.cpSync : tout passe par copyTree', () => {
  const dirs = ['packages/core/src', 'packages/installer/src', 'packages/win-displays/src', 'app/src', 'app/renderer', 'scripts', 'docs'];
  const offenders: string[] = [];
  for (const dir of dirs) {
    for (const file of sources(path.join(REPO, dir))) {
      fs.readFileSync(file, 'utf8')
        .split('\n')
        .forEach((line, i) => {
          if (FORBIDDEN.test(line)) offenders.push(`${path.relative(REPO, file)}:${i + 1} ${line.trim()}`);
        });
    }
  }
  assert.deepEqual(offenders, [], 'utiliser copyTree (packages/core/src/copytree.ts)');
});

/** Dossier d'essai dont le chemin porte lui-même des accents, comme un profil « Hélène ». */
function accentedTmp(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'cyberpinball-copie-éàç-'));
}

function tree(dir: string): string[] {
  return fs
    .readdirSync(dir, { recursive: true })
    .map((f) => String(f).split(path.sep).join('/'))
    .sort();
}

test('copie vers un dossier accentué, depuis un dossier accentué : les bons noms, aucun fantôme', () => {
  const base = accentedTmp();
  const src = path.join(base, 'Attack from Mars Été (Bally 1995)');
  fs.mkdirSync(path.join(src, 'pupvideos', 'Pack œuvre’s – é'), { recursive: true });
  fs.writeFileSync(path.join(src, 'table.vpx'), 'vpx');
  fs.writeFileSync(path.join(src, 'pupvideos', 'Pack œuvre’s – é', 'Écran.mp4'), 'mp4');
  // Destination dont les parents n'existent pas encore : ils sont créés sous leur vrai nom.
  const dest = path.join(base, 'Tables à côté', 'pupvideos (désactivés)');
  copyTree(src, dest);
  assert.deepEqual(tree(dest), ['pupvideos', 'pupvideos/Pack œuvre’s – é', 'pupvideos/Pack œuvre’s – é/Écran.mp4', 'table.vpx']);
  assert.deepEqual(fs.readdirSync(base).sort(), ['Attack from Mars Été (Bally 1995)', 'Tables à côté']);
  assert.deepEqual(findMangledDirs(base, 5), []);
  // Fusion dans un dossier existant ; un fichier déjà là est remplacé par défaut, refusé sur demande.
  fs.writeFileSync(path.join(src, 'table.vpx'), 'nouvelle');
  fs.writeFileSync(path.join(dest, 'à garder.txt'), 'x');
  copyTree(src, dest);
  assert.equal(fs.readFileSync(path.join(dest, 'table.vpx'), 'utf8'), 'nouvelle');
  assert.ok(fs.existsSync(path.join(dest, 'à garder.txt')));
  assert.throws(() => copyTree(src, dest, { overwrite: false }), { code: 'EEXIST' });
  fs.rmSync(base, { recursive: true, force: true });
});

test('copyTree : fichier seul, filtre, refus de se copier dans soi-même', () => {
  const base = accentedTmp();
  const src = path.join(base, 'source é');
  fs.mkdirSync(path.join(src, 'doc'), { recursive: true });
  fs.writeFileSync(path.join(src, 'garder.js'), 'js');
  fs.writeFileSync(path.join(src, 'écarter.md'), 'md');
  fs.writeFileSync(path.join(src, 'doc', 'lisez-moi.js'), 'js');
  // Le filtre reçoit la source et la destination ; un dossier écarté l'est avec tout son contenu.
  const seen: string[] = [];
  copyTree(src, path.join(base, 'filtré'), {
    filter: (from, to) => {
      seen.push(path.relative(base, to));
      return path.basename(from) !== 'doc' && !from.endsWith('.md');
    },
  });
  assert.deepEqual(tree(path.join(base, 'filtré')), ['garder.js']);
  assert.ok(seen.includes('filtré'), 'filtre appelé aussi pour la source');
  copyTree(path.join(src, 'garder.js'), path.join(base, 'nouveau é', 'copié.js'));
  assert.equal(fs.readFileSync(path.join(base, 'nouveau é', 'copié.js'), 'utf8'), 'js');
  assert.throws(() => copyTree(src, path.join(src, 'doc', 'copie')), { code: 'EINVAL' });
  fs.rmSync(base, { recursive: true, force: true });
});

test('noms abîmés par l’ancienne copie : reconnus, et jamais un nom français ordinaire', () => {
  // Écrits par fs.cpSync de Node 22 (relevés le 06/11/2026) : l'UTF-8 du nom lu en cp1252.
  assert.equal(unmangledName('pupvideos (dÃ©sactivÃ©s)'), 'pupvideos (désactivés)');
  // « à » donne « Ã » suivi d'une espace insécable (octet 0xa0).
  assert.equal(unmangledName('Ã‰tÃ© Å“uf Ã¼ Ã§ Ã  Ãª â€™ â€“ Ã±'), 'Été œuf ü ç à ê ’ – ñ');
  for (const name of ['pupvideos', 'pupvideos (off)', 'Été', 'Âge de glace', 'Ça va', 'SÃO PAULO', 'Œuvre', 'Attack from Mars (Bally 1995)', '']) {
    assert.equal(unmangledName(name), undefined, name);
  }
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'cyberpinball-fantomes-'));
  fs.mkdirSync(path.join(base, 'Table Ã‰tÃ©', 'sous Ã©'), { recursive: true });
  fs.mkdirSync(path.join(base, 'Table Été', 'pupvideos', 'Pack Ã©'), { recursive: true });
  // Un fantôme est rangé avec son contenu : on n'y cherche pas d'autre fantôme.
  assert.deepEqual(
    findMangledDirs(base, 3).map((m) => path.relative(base, m.repaired)).sort(),
    [path.join('Table Été'), path.join('Table Été', 'pupvideos', 'Pack é')].sort(),
  );
  assert.deepEqual(findMangledDirs(base, 1).map((m) => path.basename(m.path)), ['Table Ã‰tÃ©']);
  fs.rmSync(base, { recursive: true, force: true });
});
