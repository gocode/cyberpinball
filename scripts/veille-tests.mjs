// Veille des tests figés, chargée dans le processus de chaque fichier de test (importée par
// console-sur-stderr.mjs, que NODE_TEST_ARGS charge à chaque lancement de node --test).
//
// Pourquoi (23/11/2026) : `node --test --test-timeout=N` ne borne pas chaque test mais chaque fichier
// entier. En isolation par processus (le défaut), le lanceur applique le délai au test qui représente
// le fichier, et le processus du fichier ignore ce drapeau (node 22). Avec 5 min, clavier-reel (335 s
// de tests verts) et telecommande (environ 451 s) étaient interrompus alors qu'ils avançaient
// normalement, et la fusion d'une branche saine a été refusée pour cette seule raison.
//
// Ici, un fichier est figé quand aucun de ses tests ne commence ni ne finit pendant TEST_FIGE_MS
// (5 min) : un fichier long qui avance n'est jamais arrêté, un test bloqué l'est au bout de 5 min,
// avec son nom. Le plafond par fichier (--test-timeout, TEST_TIMEOUT_MS de controles.mjs) et celui de
// toute la suite restent, plus larges.

import * as path from 'node:path';

/** Délai sans aucun progrès (aucun test commencé ni fini) au-delà duquel le fichier est figé. */
export const TEST_FIGE_MS = 5 * 60_000;

/** Début du message écrit sur la sortie d'erreur, que scripts/sortie-tests.mjs reconnaît. */
export const MARQUE_FIGE = 'test figé';

/** Le délai, sauf CYBERPINBALL_TEST_FIGE_MS (les tests de cette veille le raccourcissent). */
export function delaiFige(env = process.env) {
  const ms = Number(env.CYBERPINBALL_TEST_FIGE_MS);
  return ms > 0 ? ms : TEST_FIGE_MS;
}

export function messageFige(fichier, test, ms) {
  return `${MARQUE_FIGE} (aucun progrès depuis ${Math.round(ms / 1000)} s) : ${fichier} › ${test}`;
}

// Seulement dans le processus d'un fichier de test lancé par node --test : jamais dans le lanceur,
// ni dans un programme qu'un test lance avec les mêmes options.
const fichierTest = process.argv[1] && /\.test\.[cm]?js$/.test(process.argv[1]) ? path.basename(process.argv[1]) : undefined;
if (process.env.NODE_TEST_CONTEXT && fichierTest) {
  const { beforeEach, afterEach } = await import('node:test');
  const limite = delaiFige();
  let enCours = '(chargement du fichier, avant le premier test)';
  let minuterie;
  const arme = () => {
    clearTimeout(minuterie);
    minuterie = setTimeout(() => {
      const fin = () => process.exit(1);
      process.stderr.write(`\n${messageFige(fichierTest, enCours, limite)}\n`, fin);
      setTimeout(fin, 2_000).unref();
    }, limite);
    // Ne retient pas le processus : un fichier fini se termine sans l'attendre.
    minuterie.unref();
  };
  arme();
  beforeEach((t) => {
    enCours = t.fullName ?? t.name;
    arme();
  });
  afterEach((t) => {
    enCours = `après « ${t.fullName ?? t.name} » (le fichier ne se termine pas)`;
    arme();
  });
}
