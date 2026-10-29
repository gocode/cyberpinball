// Aucune jonction (ou lien symbolique) du dépôt ne pointe hors de son propre dossier.
//
// Incident du 29/10/2026 : un worktree sans node_modules avait reçu des jonctions vers celui du
// dossier principal (node_modules\hyperdht -> D:\wamp\www\cyberpinball\node_modules\hyperdht),
// un ancien worktree des jonctions vers app\ et packages\ du dossier principal. Un rangement du
// disque a déplacé ces worktrees avec Robocopy /MOVE, qui suit les jonctions : le code suivi
// (app\, packages\) et tout node_modules du dossier principal ont été vidés.
//
// Une dépendance manquante dans un worktree s'installe (npm ci), jamais par une jonction vers un
// autre dossier ; les liens des espaces de travail npm (node_modules\@cyberpinball\*) pointent
// dans le dépôt lui-même et restent permis.

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';

const REPO = path.join(__dirname, '..', '..', '..', '..');

/** Liens trouvés sous `dir`, sans les suivre : chemin du lien et cible résolue. */
function links(dir: string, depth: number): { link: string; target: string }[] {
  const found: { link: string; target: string }[] = [];
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return found;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isSymbolicLink()) {
      let target: string;
      try {
        target = fs.realpathSync(full);
      } catch {
        target = path.resolve(dir, fs.readlinkSync(full));
      }
      found.push({ link: full, target });
    } else if (entry.isDirectory() && depth > 0 && entry.name !== '.git') {
      found.push(...links(full, depth - 1));
    }
  }
  return found;
}

function inside(child: string, parent: string): boolean {
  const rel = path.relative(parent.toLowerCase(), child.toLowerCase());
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

test('aucune jonction du dépôt ne pointe hors de son dossier (un rangement qui la suit viderait la cible)', () => {
  const root = fs.realpathSync(REPO);
  // node_modules et ses portées (@cyberpinball…), puis le reste du dépôt sur trois niveaux.
  const candidates = [
    ...links(path.join(REPO, 'node_modules'), 1),
    ...['app', 'packages', 'docs', 'scripts'].flatMap((dir) => links(path.join(REPO, dir), 3)),
  ];
  const outside = candidates.filter(({ target }) => !inside(target, root));
  assert.deepEqual(
    outside.map(({ link, target }) => `${path.relative(REPO, link)} -> ${target}`),
    [],
    'Retirez ces jonctions (rmdir sur la jonction, jamais sur sa cible) et installez les dépendances par npm ci.',
  );
});

test('les démonstrations qui posent une jonction la retirent en fin de partie (tmp\\demo-*\\root\\emulators)', () => {
  const docs = path.join(REPO, 'docs');
  const helper = fs.readFileSync(path.join(docs, 'hors-ecran.ps1'), 'utf8');
  assert.match(helper, /Invoke-BureauCache[^\n]*\n\s*Remove-JonctionsSortantes/, 'Enter-BureauCache doit retirer les jonctions sortantes après la démonstration');
  const unguarded = fs.readdirSync(docs)
    .filter((name) => /^demo-.*\.ps1$/.test(name))
    .filter((name) => {
      const text = fs.readFileSync(path.join(docs, name), 'utf8');
      return /-ItemType\s+Junction/.test(text) && !/Enter-BureauCache\s+\$PSCommandPath/.test(text) && !/^Remove-JonctionsSortantes\s*$/m.test(text);
    });
  assert.deepEqual(unguarded, [], 'une démonstration qui pose une jonction passe par Enter-BureauCache, qui la retire à la fin, ou appelle Remove-JonctionsSortantes en dernier');
});

/**
 * Scripts de docs\ qui posent encore une jonction vers les vrais émulateurs (D:\CyberPinball\emulators),
 * avec leur nombre de jonctions : ceux qui lancent réellement VPX, sur les écrans du poste. Tous
 * les autres ont une fausse installation de VPX (New-FauxVpx, docs\hors-ecran.ps1).
 */
const JONCTIONS_PERMISES: Record<string, { jonctions: number; raison: string }> = {
  'demo-fenetres.ps1': { jonctions: 1, raison: 'trois vraies parties de VPX à l’écran (fenêtres d’éditeur et d’audit de VPX)' },
  'demo-barre-taches.ps1': { jonctions: 1, raison: 'avec -Partie seulement : une vraie partie de VPX à l’écran' },
  'demo-ecrans-couverts.ps1': { jonctions: 1, raison: 'scénarios partie et endurance : de vraies parties de VPX à l’écran' },
  'demo-tables.ps1': { jonctions: 1, raison: 'à l’écran seulement (CYBERPINBALL_A_L_ECRAN), le temps de la vraie partie de l’ajout' },
};

test('aucun script de docs\\ ne pose de jonction vers D:\\CyberPinball hors des exceptions justifiées (New-FauxVpx à la place)', () => {
  const docs = path.join(REPO, 'docs');
  const junction = /-ItemType\s+['"]?(?:Junction|SymbolicLink)\b|\bmklink\s+\/[JD]\b|CreateSymbolicLink/gi;
  const found = new Map<string, number>();
  for (const name of fs.readdirSync(docs).filter((n) => /\.ps1$/i.test(n))) {
    const count = (fs.readFileSync(path.join(docs, name), 'utf8').match(junction) ?? []).length;
    if (count) found.set(name, count);
  }
  const refused = [...found]
    .filter(([name, count]) => count > (JONCTIONS_PERMISES[name]?.jonctions ?? 0))
    .map(([name, count]) => `${name} : ${count} jonction(s), ${JONCTIONS_PERMISES[name]?.jonctions ?? 0} permise(s)`);
  assert.deepEqual(
    refused,
    [],
    'Une démonstration qui ne lance pas réellement VPX prend une fausse installation (New-FauxVpx <racine>, docs\\hors-ecran.ps1) ; '
      + 'une jonction vers les vrais émulateurs, qu’un rangement du disque suivrait jusqu’à les vider, ne s’ajoute à JONCTIONS_PERMISES qu’avec sa raison.',
  );
  // Liste tenue à jour : une exception sans jonction s'en va ; chacune retire la sienne en fin de partie.
  for (const [name, { jonctions }] of Object.entries(JONCTIONS_PERMISES)) {
    assert.equal(found.get(name) ?? 0, jonctions, `${name} : ${jonctions} jonction(s) attendue(s) ; retirez ou ajustez son exception`);
    const text = fs.readFileSync(path.join(docs, name), 'utf8');
    assert.match(text, /^\s*Remove-JonctionsSortantes\s*$/m, `${name} : la jonction doit être retirée à la fin (Remove-JonctionsSortantes), à l'écran aussi`);
  }
});

test('inside : un dossier voisin au nom proche n\'est pas dedans', () => {
  assert.equal(inside('D:\\a\\b\\c', 'D:\\a\\b'), true);
  assert.equal(inside('D:\\a\\b', 'D:\\a\\b'), true);
  assert.equal(inside('D:\\a\\bc', 'D:\\a\\b'), false);
  assert.equal(inside('D:\\a', 'D:\\a\\b'), false);
});
