// Lecture de la sortie TAP de `node --test` : fichiers en échec et cas en échec, en quelques lignes.
// Sert à scripts/controles.mjs et scripts/avant-fusion.mjs, pour que les sessions n'aient plus à
// fouiller des journaux de 3 000 tests avec des Select-String improvisés.

import * as path from 'node:path';

/** Chemin d'une ligne « location: '…:12:3' » de la sortie TAP (barres obliques inverses doublées). */
function locationPath(line) {
  const m = line.match(/location: '(.+?):\d+:\d+'/);
  return m ? m[1].replace(/\\\\/g, '\\') : undefined;
}

/**
 * Fichiers de test en échec. Selon la version de node, la sortie TAP donne une ligne « not ok » par
 * fichier, ou seulement les tests (à plat, chacun avec sa location) : les deux sont lus.
 */
export function failedFiles(tap) {
  const files = [];
  for (const m of tap.matchAll(/^not ok \d+ - (.+?\.test\.m?js)\s*$/gm)) files.push(m[1].trim().replace(/\\\\/g, '\\'));
  const lines = tap.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    if (!/^\s*not ok \d+ - /.test(lines[i])) continue;
    for (let j = i + 1; j < lines.length && j < i + 60; j++) {
      if (/^\s*(not )?ok \d+ - /.test(lines[j])) break;
      const loc = locationPath(lines[j]);
      if (loc) {
        if (/\.test\.m?js$/.test(loc)) files.push(loc);
        break;
      }
    }
  }
  // Un même fichier vu par son chemin relatif et absolu : gardé une fois.
  const seen = new Set();
  return files.filter((f) => {
    const key = path.basename(f);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Totaux de la fin de sortie (« # pass 12 »…). */
export function totals(tap) {
  const get = (k) => {
    const all = [...tap.matchAll(new RegExp(`^# ${k} (\\d+)\\s*$`, 'gm'))];
    return all.length ? Number(all.at(-1)[1]) : undefined;
  };
  return { tests: get('tests'), pass: get('pass'), fail: get('fail') };
}

/**
 * Cas en échec les plus profonds, avec leur fichier et la première ligne de leur erreur. Dans la
 * sortie TAP de node, les sous-tests d'un test précèdent sa propre ligne « not ok » : un test dont un
 * sous-test a déjà échoué n'est pas répété.
 */
export function failureDetails(tap) {
  const lines = tap.split(/\r?\n/);
  const out = [];
  const frozen = new Map();
  for (const m of tap.matchAll(/(test figé \([^)]*\)) : (\S+\.test\.[cm]?js) › (.+?)\s*$/gm)) frozen.set(m[2], `${m[1]} : ${m[3]}`);
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^(\s*)not ok \d+ - (.*)$/);
    if (!m) continue;
    const wholeFile = /\.test\.m?js\s*$/.test(m[2]);
    const indent = m[1].length;
    let parent = false;
    for (let j = i - 1; j >= 0; j--) {
      const l = lines[j];
      const at = l.search(/\S/);
      if (at === indent && /^\s*# Subtest: /.test(l)) break;
      if (at > indent && /^\s*not ok \d+ - /.test(l)) {
        parent = true;
        break;
      }
      if (at < indent && at >= 0) break;
    }
    if (parent) continue;
    let file;
    let error;
    for (let j = i + 1; j < lines.length && j < i + 60; j++) {
      const l = lines[j];
      if (/^\s*(not )?ok \d+ - /.test(l)) break;
      const loc = locationPath(l);
      if (loc && !file) file = path.basename(loc);
      const err = l.match(/^\s*error: (.*)$/);
      if (err && !error) error = err[1].replace(/^['"|>-]+\s*|['"]$/g, '').trim();
    }
    if (wholeFile && !file) file = path.basename(m[2].trim().replace(/\\\\/g, '\\'));
    // Fichier arrêté par la veille des tests figés (veille-tests.mjs) : le test qui ne finissait pas.
    if (wholeFile && frozen.has(file)) error = frozen.get(file);
    out.push({ name: wholeFile ? '(le fichier entier)' : m[2].trim(), file, error, wholeFile });
  }
  // La ligne d'un fichier entier n'est gardée que si aucun de ses tests n'est déjà listé (erreur
  // hors test : exception non rattrapée, échec du lanceur de node…).
  return out.filter((d) => !d.wholeFile || !out.some((o) => !o.wholeFile && o.file === d.file)).map(({ wholeFile, ...d }) => d);
}

/** Résumé court des échecs, pour la console. */
export function shortReport(details, max = 12) {
  const lines = details.slice(0, max).map((d) => `  - ${d.file ?? '?'} : ${d.name}${d.error ? `\n      ${d.error.slice(0, 200)}` : ''}`);
  if (details.length > max) lines.push(`  … et ${details.length - max} autre(s)`);
  return lines.join('\n');
}
