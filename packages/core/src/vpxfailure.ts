// Pourquoi VPX s'est arrêté pendant une partie, lu dans la fin de son journal (vpinball.log) et dans
// son code de sortie. Essai réel du 04/11/2026 (PinCab, The Goonies, partie entre amis) : l'écran
// d'échec montrait « VPX s'est terminé avec le code 3221226356 » et proposait « voir ce qu'il manque
// pour jouer », alors que rien ne manquait : le script de la table s'était arrêté ligne 9781
// (« Objet requis: 'FlexDMD.Stage.GetLabel(...)' », FlexDMD ne trouvant plus l'élément « Ball »),
// puis VPX s'était fermé sur une corruption du tas (0xC0000374). Ici, la règle qui reconnaît ce cas
// et le nomme, pour toute table : erreur du script (exécution ou compilation), élément FlexDMD
// introuvable, code de sortie de Windows connu.

import { t } from './i18n';
import { describeWindowsFault, isPupPluginModule, type WindowsFault } from './windowsfault';

/** Erreur du script de la table, telle que VPX l'écrit dans vpinball.log (Player::OnScriptError). */
export interface VpxScriptError {
  /** Erreur à l'exécution, ou script qui ne se compile pas. */
  kind: 'runtime' | 'compile';
  line: number;
  column?: number;
  /** Le message de VBScript, dans la langue de Windows (« Objet requis: '…' »). */
  message: string;
  /** Élément de FlexDMD que le script demandait et que FlexDMD n'a pas trouvé, juste avant. */
  flexActor?: string;
  /** Le code de la ligne en faute, quand le script de la table est lisible. */
  code?: string;
}

/**
 * L'erreur du script dans les lignes de vpinball.log : la dernière. Formats de VPX 10.8 :
 * « Runtime error on line 9781, col 2: Objet requis: 'FlexDMD.Stage.GetLabel(...)' »,
 * « Compile error on line 12, col 5: … » (avec ou sans « col »).
 */
export function vpxScriptError(lines: readonly string[], script?: string): VpxScriptError | undefined {
  const re = /\b(runtime|compil(?:e|ation))\s+error\s+(?:on|at)\s+line\s+(\d+)(?:\s*,\s*col(?:umn)?\s+(\d+))?\s*:\s*(.*?)\s*$/i;
  for (let i = lines.length - 1; i >= 0; i--) {
    const m = re.exec(lines[i]!);
    if (!m) continue;
    const line = Number(m[2]);
    const error: VpxScriptError = { kind: /^run/i.test(m[1]!) ? 'runtime' : 'compile', line, ...(m[3] ? { column: Number(m[3]) } : {}), message: m[4]! };
    // L'élément FlexDMD introuvable, écrit juste avant l'erreur (Flex::Group::Get).
    for (let j = i - 1; j >= Math.max(0, i - 5); j--) {
      const actor = /\bActor\s+(.+?)\s+not found in children of\b/i.exec(lines[j]!);
      if (actor) {
        error.flexActor = actor[1]!;
        break;
      }
    }
    const code = script?.split(/\r?\n/)[line - 1]?.trim();
    if (code) error.code = code.length > 120 ? `${code.slice(0, 117)}…` : code;
    return error;
  }
  return undefined;
}

/** Une erreur du script et le nombre de fois que VPX l'a écrite pendant la partie. */
export interface RepeatedScriptError extends VpxScriptError {
  count: number;
}

/**
 * Les erreurs du script écrites par VPX pendant une partie, regroupées (même ligne, même message), la plus
 * fréquente d'abord. Une erreur dans une Sub appelée à chaque tour d'une minuterie revient à chaque tour :
 * VPX l'écrit au journal et la montre sur le plateau autant de fois (19/11/2026, une table Champions League :
 * « Objet requis: 'UltraDMD' » sur tout le plateau, la variable UltraDMD restée vide).
 */
export function scriptErrorsDuringGame(lines: readonly string[], script?: string): RepeatedScriptError[] {
  const re = /\b(runtime|compil(?:e|ation))\s+error\s+(?:on|at)\s+line\s+(\d+)(?:\s*,\s*col(?:umn)?\s+(\d+))?\s*:\s*(.*?)\s*$/i;
  const groups = new Map<string, RepeatedScriptError>();
  const source = script?.split(/\r?\n/);
  for (const text of lines) {
    const m = re.exec(text);
    if (!m) continue;
    const kind = /^run/i.test(m[1]!) ? 'runtime' : 'compile';
    const key = `${kind}|${m[2]}|${m[4]}`;
    const known = groups.get(key);
    if (known) {
      known.count++;
      continue;
    }
    const line = Number(m[2]);
    const error: RepeatedScriptError = { kind, line, ...(m[3] ? { column: Number(m[3]) } : {}), message: m[4]!, count: 1 };
    const code = source?.[line - 1]?.trim();
    if (code) error.code = code.length > 120 ? `${code.slice(0, 117)}…` : code;
    groups.set(key, error);
  }
  return [...groups.values()].sort((a, b) => b.count - a.count);
}

/**
 * Une ligne du journal de la borne qui résume les erreurs du script pendant la partie (une par erreur, avec le
 * nombre de fois), au lieu de les laisser se perdre parmi des centaines de lignes identiques. undefined sans erreur.
 */
export function scriptErrorsJournal(table: string, lines: readonly string[], script?: string): string | undefined {
  const errors = scriptErrorsDuringGame(lines, script);
  if (!errors.length) return undefined;
  const loop = errors.some((e) => e.count >= 3);
  const parts = errors.slice(0, 5).map((e) => {
    const where = `ligne ${e.line}${e.code ? ` (${e.code})` : ''}`; // i18n-ignore : journal
    return `${where} : « ${e.message} »${e.count > 1 ? `, ${e.count} fois` : ''}`; // i18n-ignore : journal
  });
  const more = errors.length > 5 ? ` ; et ${errors.length - 5} autres` : ''; // i18n-ignore : journal
  const head = loop ? 'Erreur du script répétée en boucle pendant la partie' : 'Erreur du script pendant la partie'; // i18n-ignore : journal
  return `${head} (${table}) : ${parts.join(' ; ')}${more}.`;
}

/**
 * Codes de sortie de Windows qui disent comment VPX s'est arrêté (NTSTATUS, rendus en entier non
 * signé par Node : 3221226356 = 0xC0000374).
 */
const EXIT_NAMES: Record<number, () => string> = {
  0xc0000374: () => t('mémoire de VPX abîmée (corruption du tas)'),
  0xc0000005: () => t('accès mémoire interdit'),
  // STATUS_STACK_BUFFER_OVERRUN : nom historique, mais c'est le code de tout arrêt d'urgence (__fastfail), dont
  // abort() du runtime C++ sur une exception que personne n'attrape (The Avengers Pro, PuP-Pack, 27/11/2026).
  0xc0000409: () => t('arrêt d’urgence demandé par VPX ou l’un de ses plugins'),
  0xc00000fd: () => t('pile de VPX épuisée'),
  0xc0000017: () => t('mémoire insuffisante'),
  0x80000003: () => t('point d’arrêt atteint'),
  0xc0000135: () => t('bibliothèque (DLL) introuvable'),
  0xc0000139: () => t('fonction introuvable dans une bibliothèque (DLL trop ancienne)'),
  0xc000007b: () => t('bibliothèque (DLL) incompatible'),
};

/**
 * Codes d'un VPX qui n'a pas pu démarrer faute d'une bibliothèque : sur un Windows neuf, le runtime
 * Visual C++ de Microsoft (vc-runtime.ts), que « Santé de la borne » installe.
 */
const MISSING_LIBRARY = new Set([0xc0000135, 0xc0000139, 0xc000007b]);

/** VPX s'est-il arrêté faute d'une bibliothèque (DLL absente, trop ancienne ou incompatible) ? */
export function vpxMissingLibrary(code: number | null | undefined): boolean {
  return code !== null && code !== undefined && MISSING_LIBRARY.has(code >>> 0);
}

/** « 0xC0000374, mémoire de VPX abîmée (corruption du tas) » ; undefined pour un code ordinaire. */
export function vpxExitName(code: number | null | undefined): string | undefined {
  if (code === null || code === undefined) return undefined;
  const u = code >>> 0;
  const name = EXIT_NAMES[u];
  return name ? `0x${u.toString(16).toUpperCase().padStart(8, '0')}, ${name()}` : undefined;
}

/** Lignes de la fin du journal où se cherche l'erreur du script (le reste sert à la fermeture). */
const SCRIPT_ERROR_LINES = 15;

/**
 * VPX planté en se fermant, après la partie : la partie s'est déroulée jusqu'au bout (« Closing
 * player… », Player::~Player), puis VPX s'est arrêté sur un code de plantage en défaisant la table.
 * Relevé le 17/11/2026 sur une borne à ZeDMD WiFi (Daredevil, Deadpool, 24) : pendant la fermeture,
 * une source de DMD survit (FlexDMD, Serum…), DMDUtil recrée son DMD et relance la recherche du DMD
 * réel (« Attempting to connect », « Searching for ZeDMD »), puis il est déchargé avant qu'elle
 * finisse ; son fil se réveille dans du code déchargé. `dmdProbe` : ce cas-là, lu dans le journal.
 *
 * `dofUnload` : bornes à cartes DudesCab (rapports du 19/11 et du 23/11/2026, Apollo 13, Cobra, 4 cartes) : VPX
 * décharge ses plugins (« Plugin CyberPinballDmd unloaded »), puis plante en déchargeant DOF, sans jamais écrire
 * « Plugin DOF unloaded ». La libdof de la 5436 détruit la DudesCab sur le fil principal, et son destructeur relance
 * Finish() et AllOff() sur une carte déjà arrêtée par le fil de DOF : libération sur un tas abîmé. Reconnu même quand
 * « Closing player » est sorti de la fin du journal (DOF y écrit beaucoup en fermant) : les plugins ne se déchargent
 * qu'à la fermeture.
 */
export function vpxShutdownCrash(lines: readonly string[], exitCode: number | null | undefined): { dmdProbe: boolean; dofUnload: boolean } | undefined {
  if (exitCode === null || exitCode === undefined || vpxMissingLibrary(exitCode) || !EXIT_NAMES[exitCode >>> 0]) return undefined;
  const pluginsUnloading = lines.some((l) => /\bPlugin \S+ unloaded\b/.test(l));
  const dofUnload = pluginsUnloading && !lines.some((l) => /\bPlugin DOF unloaded\b/.test(l)) && lines.some((l) => /\bDudesCab\b/i.test(l));
  const closing = lines.findLastIndex((l) => /\bClosing player\b/.test(l));
  if (closing < 0 && !dofUnload) return undefined;
  const after = closing < 0 ? [] : lines.slice(closing);
  const destroyed = after.findIndex((l) => /DMDUtil.*\bDMD destructor finished\b/.test(l));
  const dmdProbe = destroyed >= 0 && after.slice(destroyed + 1).some((l) => /DMDUtil.*\b(Attempting to connect|Searching for (ZeDMD|PIN2DMD|Pixelcade))\b/i.test(l));
  return { dmdProbe, dofUnload };
}

/**
 * Série du VPX corrigé de Cyber Pinball qui livre la libdof réparée (plugins/dof/dof64.dll, correctifs-libdof de
 * packages/vpx-corrige) : le plantage `dofUnload` n'a plus lieu d'être à partir d'elle.
 */
export const DOF_UNLOAD_FIXED_IN = 6;

/** Au plus ce temps entre « PUP Manager start » et la dernière ligne du journal : l'arrêt suit le démarrage du PuP-Pack. */
export const PUP_START_CRASH_SECONDS = 15;

/** Heure d'une ligne de vpinball.log (« 2026-11-27 23:06:09.535 INFO … »), en secondes ; undefined sans heure. */
function logSeconds(line: string): number | undefined {
  const m = /^\d{4}-\d\d-\d\d (\d\d):(\d\d):(\d\d(?:\.\d+)?)\s/.exec(line);
  return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : undefined;
}

/**
 * VPX planté juste après avoir démarré le PuP-Pack de la table (rapports du 27/11/2026, The Avengers Pro,
 * PuP-Pack avs_170, joueur et PinCab : 0xC0000409 0,4 s après « PUP Manager start », module fautif
 * plugin-pup64.dll). Reconnu par le module fautif que Windows a noté (windowsfault.ts), sinon par le
 * journal : « PUP Manager start », puis au plus PUP_START_CRASH_SECONDS avant sa fin, sans fermeture de
 * la partie. Rend les secondes écoulées depuis ce démarrage (undefined quand seul le module le dit).
 */
export function vpxPupStartCrash(lines: readonly string[], exitCode: number | null | undefined, fault?: WindowsFault): { afterSeconds?: number } | undefined {
  if (exitCode === null || exitCode === undefined || vpxMissingLibrary(exitCode) || !EXIT_NAMES[exitCode >>> 0]) return undefined;
  if (lines.some((l) => /\bClosing player\b/.test(l))) return undefined;
  // Windows nomme un autre plugin (DOF démarre dans la même seconde que le PuP-Pack) : ce n'est pas le PuP-Pack.
  if (fault && /^plugin-.*\.dll$/i.test(fault.module) && !isPupPluginModule(fault.module)) return undefined;
  const start =lines.findLastIndex((l) => /\bPUP Manager start\b/.test(l));
  const startAt = start >= 0 ? logSeconds(lines[start]!) : undefined;
  const lastAt = lines.map(logSeconds).findLast((s) => s !== undefined);
  // Une partie passée minuit : l'écart reste positif.
  const after = startAt !== undefined && lastAt !== undefined ? (lastAt - startAt + 86400) % 86400 : undefined;
  if (after !== undefined && after <= PUP_START_CRASH_SECONDS) return { afterSeconds: Math.round(after * 10) / 10 };
  return isPupPluginModule(fault?.module) ? {} : undefined;
}

/** Ce que le lanceur sait du lancement, en plus du journal et du code de sortie. */
export interface VpxLaunchFacts {
  /** VPX a écrit son journal pendant ce lancement (launcher.ts) ; faux : arrêté avant. Absent : inconnu. */
  logWritten?: boolean;
  /** Fichiers de VPX qui ne sont plus ceux de son archive (component-files.ts), décrits pour le joueur. */
  changedFiles?: readonly string[];
  /** Série du VPX corrigé de Cyber Pinball en place pendant la partie (vpxCorrigeInPlace) ; absent : VPX officiel ou autre. */
  vpxPatch?: number;
  /** Ce que Windows a noté de l'arrêt (événement « Application Error », windowsfault.ts) : le module fautif. */
  fault?: WindowsFault;
  /** La table a un PuP-Pack actif (pupdisabled.ts) : « Essayer sans le PuP-Pack » a un sens. */
  pupActive?: boolean;
}

/**
 * VPX planté au démarrage, avant d'écrire une ligne de son journal : la table n'a pas encore été lue,
 * la panne est celle de VPX lui-même (rapports du 17/11/2026 : Demolition Man et Diablo arrêtés en
 * 0,2 s, le dossier de VPX modifié hors de Cyber Pinball). Jamais un arrêt faute de bibliothèque
 * (vpxMissingLibrary, son propre écran), ni un code inconnu.
 */
export function vpxStartupCrash(exitCode: number | null | undefined, launch: VpxLaunchFacts): ((exit: string, file: string) => VpxFailureDiagnosis) | undefined {
  if (launch.logWritten !== false || exitCode === null || exitCode === undefined || !EXIT_NAMES[exitCode >>> 0]) return undefined;
  const changed = launch.changedFiles ?? [];
  return (exit, file) => ({
    title: t('VPX s’est arrêté en démarrant'),
    lines: [
      t('VPX s’est arrêté ({exit}) avant d’écrire la moindre ligne de son journal : il n’avait pas encore ouvert la table. La panne vient de VPX, pas de cette table.', { exit }),
      changed.length
        ? t('Des fichiers de VPX ont été remplacés hors de Cyber Pinball : {files}. Start : remettre ses fichiers d’origine.', { files: changed.slice(0, 3).join(', ') + (changed.length > 3 ? '…' : '') })
        : t('Menu système > Ma borne > « Santé et sauvegardes » > « Santé de la borne » vérifie VPX et ses fichiers.'),
    ],
    journal: `VPX arrêté au démarrage, avant son journal (${file}) : ${exit}${changed.length ? ` ; fichiers de VPX modifiés : ${changed.join(', ')}` : ''}.`, // i18n-ignore : journal
    startup: true,
  });
}

/** Ce que dit l'écran d'échec, et la ligne du journal de Cyber Pinball, pour un arrêt reconnu. */
export interface VpxFailureDiagnosis {
  /** Titre de l'écran : la vraie raison. */
  title: string;
  /** Explication, en phrases. */
  lines: string[];
  /** Ligne du journal de Cyber Pinball (en français, pour le diagnostic à distance). */
  journal: string;
  scriptError?: VpxScriptError;
  /** Arrêté au démarrage, avant son journal (vpxStartupCrash) : la panne est celle de VPX, toutes tables. */
  startup?: true;
  /** Arrêté juste après le démarrage du PuP-Pack, actif (vpxPupStartCrash) : Start propose de jouer sans lui. */
  withoutPup?: true;
}

/**
 * La règle : une erreur du script de la table dans la fin du journal de VPX, ou un code de sortie
 * connu. undefined : rien de reconnu (l'écran garde son explication habituelle).
 */
export function diagnoseVpxFailure(
  logTail: readonly string[],
  exitCode: number | null | undefined,
  file: string,
  script?: string,
  launch: VpxLaunchFacts = {},
): VpxFailureDiagnosis | undefined {
  const error = vpxScriptError(logTail.slice(-SCRIPT_ERROR_LINES), script);
  const exit = vpxExitName(exitCode);
  if (!error && !exit) return undefined;
  const early = !error && !vpxMissingLibrary(exitCode) ? vpxStartupCrash(exitCode, launch) : undefined;
  if (early && exit) return early(exit, file);
  // Planté en se fermant : la partie s'est jouée, rien n'est à réparer dans la table.
  const shutdown = !error ? vpxShutdownCrash(logTail, exitCode) : undefined;
  if (shutdown && exit) {
    const patch = launch.vpxPatch;
    const fixedInPlace = patch !== undefined && patch >= DOF_UNLOAD_FIXED_IN;
    const lines = [t('La partie s’est jouée jusqu’au bout : VPX s’est arrêté ({exit}) après sa fin, en se fermant.', { exit })];
    if (shutdown.dofUnload) {
      lines.push(
        t('Il déchargeait sa bibliothèque DOF, qui pilote ta carte DudesCab. Rien n’est à réparer dans la table : c’est un défaut connu de la bibliothèque DOF de VPX 10.8.1, qui arrêtait la carte une seconde fois après sa vraie fermeture.'),
        fixedInPlace
          ? t('Le VPX de Cyber Pinball le corrige depuis la série {fixed}, et il était en place (série {patch}) : ce plantage a donc une autre cause. Le rapport aidera à la trouver.', { fixed: DOF_UNLOAD_FIXED_IN, patch: patch! })
          : t('C’est corrigé dans le VPX de Cyber Pinball à partir de la série {fixed} (« patched Cyber Pinball {fixed} »), posé avant chaque partie sur VPX 10.8.1-5436.', { fixed: DOF_UNLOAD_FIXED_IN }),
      );
    } else if (shutdown.dmdProbe) {
      lines.push(t('Pendant la fermeture, le plugin DMDUtil de VPX a relancé la recherche du DMD réel (ZeDMD), puis a été déchargé avant qu’elle finisse. C’est un défaut de VPX 10.8.1, pas de la table ; Cyber Pinball fait désormais attendre la fin de cette recherche.'));
    } else {
      lines.push(t('Rien n’est à réparer dans la table : une autre partie peut se dérouler normalement.'));
    }
    const cause = shutdown.dofUnload
      ? ` ; plantage en déchargeant DOF avec une DudesCab (défaut de la libdof de VPX 10.8.1, corrigé par la série ${DOF_UNLOAD_FIXED_IN} du VPX corrigé ; en place : ${patch === undefined ? 'aucune série' : `série ${patch}`})` // i18n-ignore : journal
      : shutdown.dmdProbe
        ? ' ; DMDUtil relançait la recherche du DMD réel pendant la fermeture' // i18n-ignore : journal
        : '';
    return {
      title: t('VPX a planté en se fermant'),
      lines,
      journal: `VPX arrêté en se fermant, après la partie (${file}) : ${exit}${cause}${faultNote(launch.fault)}.`, // i18n-ignore : journal
    };
  }
  // Planté juste après le démarrage du PuP-Pack : Start propose de jouer sans lui (rangé à part, rendu tel quel).
  const pup = !error ? vpxPupStartCrash(logTail, exitCode, launch.fault) : undefined;
  if (pup && exit) {
    const lines = [
      pup.afterSeconds !== undefined
        ? t('VPX s’est arrêté ({exit}) {seconds} s après avoir démarré le PuP-Pack de la table, avant la fin de la partie.', { exit, seconds: pup.afterSeconds })
        : t('VPX s’est arrêté ({exit}) dans son plugin PuP, qui joue le PuP-Pack de la table.', { exit }),
    ];
    if (launch.fault) lines.push(t('Module en faute, d’après Windows : {module}.', { module: launch.fault.module }));
    lines.push(
      launch.pupActive
        ? t('Start : essayer sans le PuP-Pack. Il est rangé à part, pas effacé : « Réactiver le PuP-Pack », dans « Parties du jeu », le remet tel quel.')
        : t('Rien ne manque pour jouer : une autre partie peut se dérouler sans cet arrêt. Le rapport aidera à trouver ce qui, dans ce PuP-Pack, arrête VPX.'),
    );
    return {
      title: t('VPX s’est arrêté au démarrage du PuP-Pack'),
      lines,
      journal: `VPX arrêté au démarrage du PuP-Pack (${file}) : ${exit}${pup.afterSeconds !== undefined ? `, ${pup.afterSeconds} s après « PUP Manager start »` : ''}${faultNote(launch.fault)}.`, // i18n-ignore : journal
      ...(launch.pupActive && { withoutPup: true as const }),
    };
  }
  const lines: string[] = [];
  const journal: string[] = [];
  if (error) {
    lines.push(
      error.kind === 'runtime'
        ? t('Le script de la table s’est arrêté ligne {line} de {file} : {message}', { line: error.line, file, message: error.message })
        : t('Le script de la table ne se compile pas, ligne {line} de {file} : {message}', { line: error.line, file, message: error.message }),
    );
    if (error.code) lines.push(t('Ligne en faute : {code}', { code: error.code }));
    if (error.flexActor) lines.push(t('Le script demandait l’élément « {actor} » de son DMD (FlexDMD), absent de la scène à ce moment.', { actor: error.flexActor }));
    journal.push(`erreur du script ligne ${error.line}${error.column ? `, col ${error.column}` : ''} : ${error.message}${error.flexActor ? ` (élément FlexDMD « ${error.flexActor} » introuvable)` : ''}${error.code ? ` ; ligne : ${error.code}` : ''}`); // i18n-ignore : journal
  }
  if (!error && vpxMissingLibrary(exitCode)) {
    return {
      title: t('Il manque une bibliothèque à VPX'),
      lines: [
        t('VPX n’a pas pu démarrer ({exit}).', { exit: exit! }),
        t('Le plus souvent, c’est le runtime Visual C++ de Microsoft, absent d’un Windows neuf. Menu système > Ma borne > « Santé et sauvegardes » > « Santé de la borne » l’installe, avec l’accord de Windows.'),
      ],
      journal: `VPX non démarré (${file}) : ${exit}, runtime Visual C++ à vérifier.`, // i18n-ignore : journal
    };
  }
  if (exit) {
    lines.push(error ? t('VPX s’est ensuite fermé ({exit}).', { exit }) : t('VPX s’est fermé ({exit}).', { exit }));
    journal.push(`VPX fermé (${exit})`); // i18n-ignore : journal
  }
  lines.push(
    error
      ? t('Rien ne manque pour jouer : l’erreur vient du script de la table, ou de ce qui l’a dérangé pendant la partie. Une autre partie peut se dérouler sans elle.')
      : t('Rien ne manque pour jouer : VPX s’est arrêté pendant la partie. Une autre partie peut se dérouler sans cet arrêt.'),
  );
  return {
    title: error ? t('Le script de la table s’est arrêté') : t('VPX s’est arrêté pendant la partie'),
    lines,
    journal: `VPX arrêté (${file}) : ${journal.join(' ; ')}${faultNote(launch.fault)}.`, // i18n-ignore : journal
    ...(error ? { scriptError: error } : {}),
  };
}

/** « ; module fautif : plugin-pup64.dll (…) » pour la ligne du journal ; vide quand Windows n'a rien noté. */
function faultNote(fault: WindowsFault | undefined): string {
  return fault ? ` ; module fautif (Windows) : ${describeWindowsFault(fault)}` : ''; // i18n-ignore : journal
}
