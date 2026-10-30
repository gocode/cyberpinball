// Scripts de table écrits pour un ancien core.vbs. Les scripts que VPX fournit aux tables
// (core.vbs et les siens, chargés par LoadVPM) refusent aujourd'hui des maladresses que les
// anciens laissaient passer, et arrêtent la partie dès son lancement. Back to the Future
// (Data East 1990) appelle « vpmInit Me » deux fois dans bttf_Init : le core.vbs de VPX
// 10.8.1-5436 (cvpmFlips2.Init, l. 2094-2098) affiche « Table script bug: cvpmFlips2.Init is
// called twice » et quitte la partie (QuitPlayer 2), alors qu'un second vpmInit ne refaisait
// rien d'autre (événements déjà créés, mêmes réglages de PinMAME).
//
// Chaque règle sait repérer la maladresse dans le texte du script (sans l'exécuter), la
// corriger dans le .vbs de Cyber Pinball (scriptpatch.ts) sans déplacer une ligne (les numéros
// de ligne des erreurs de script restent ceux de la table), et reconnaître le message par
// lequel VPX s'arrête, pour les cas que le texte ne montre pas (un seul vpmInit, dans une Sub
// appelée deux fois). Le médecin l'applique avant chaque partie (PUP_PLAY_REPAIRS) et dès
// l'installation ; la table n'est jamais modifiée.

import { commentStart } from './vbscript';

/** Correctifs connus, nommés dans la dernière ligne du .vbs de Cyber Pinball. */
export type CompatFix = 'vpmInitOnce';

interface CompatRule {
  id: CompatFix;
  /** Le script (code sans commentaires, scriptCode) a la maladresse que le core.vbs actuel refuse. */
  found(code: string): boolean;
  /** Le correctif sait s'appliquer à ce script. */
  applicable(code: string): boolean;
  /** Le correctif est déjà dans ce texte. */
  applied(text: string): boolean;
  /** Le texte corrigé, ligne pour ligne ; undefined si le correctif ne trouve plus sa place. */
  apply(text: string): string | undefined;
  /** Message par lequel VPX arrête la partie quand la maladresse se produit. */
  stop: RegExp;
}

// ---------- vpmInit appelé plus d'une fois ----------

const VPM_INIT_ONCE = 'CyberPinball_VpmInit';
/** Appel de vpmInit : le nom seul, ni membre d'un objet (x.vpmInit), ni morceau d'un autre nom. */
const VPM_INIT_CALL = /(^|[^\w.])vpmInit(?!\w)/gi;
/** Le script définit son propre vpmInit (vieux scripts qui embarquaient le core) : rien à toucher. */
const OWN_VPM_INIT = /^\s*(?:(?:public|private)\s+)?(?:sub|function)\s+vpmInit\b/im;

/** Applique `edit` aux morceaux de code d'une ligne hors chaînes, commentaire laissé tel quel. */
function editCode(line: string, edit: (code: string) => string): string {
  const at = commentStart(line);
  const code = at < 0 ? line : line.slice(0, at);
  const comment = at < 0 ? '' : line.slice(at);
  // Les chaînes ("…", guillemets doublés compris) alternent avec le code : indices pairs = code.
  const parts = code.split(/("(?:[^"]|"")*"?)/);
  return parts.map((part, i) => (i % 2 === 0 ? edit(part) : part)).join('') + comment;
}

/** Nombre d'appels de vpmInit dans le code (hors chaînes). */
function vpmInitCalls(code: string): number {
  let n = 0;
  for (const line of code.split('\n')) {
    editCode(line, (part) => {
      n += [...part.matchAll(VPM_INIT_CALL)].length;
      return part;
    });
  }
  return n;
}

const vpmInitOnce: CompatRule = {
  id: 'vpmInitOnce',
  found: (code) => !OWN_VPM_INIT.test(code) && vpmInitCalls(code) >= 2,
  applicable: (code) => !OWN_VPM_INIT.test(code) && vpmInitCalls(code) >= 1,
  applied: (text) => new RegExp(`^\\s*sub\\s+${VPM_INIT_ONCE}\\b`, 'im').test(text),
  apply(text) {
    const eol = /\r\n/.test(text) ? '\r\n' : '\n';
    const parts = text.split(/(\r?\n)/);
    let calls = 0;
    for (let i = 0; i < parts.length; i += 2) {
      parts[i] = editCode(parts[i]!, (code) =>
        code.replace(VPM_INIT_CALL, (_, before: string) => {
          calls++;
          return `${before}${VPM_INIT_ONCE}`;
        }),
      );
    }
    if (!calls) return undefined;
    let out = parts.join('');
    if (out && !/\r?\n$/.test(out)) out += eol;
    // En fin de script : VBScript connaît ses Sub et ses variables globales dès le chargement,
    // et vpmInit (core.vbs, chargé par LoadVPM) existe quand <table>_Init l'appelle.
    const lines = [
      `Dim ${VPM_INIT_ONCE}_Done`,
      `Sub ${VPM_INIT_ONCE}(aTable)`,
      `  If ${VPM_INIT_ONCE}_Done Then Exit Sub`,
      `  ${VPM_INIT_ONCE}_Done = True`,
      `  vpmInit aTable`,
      `End Sub`,
    ];
    return out + lines.join(eol) + eol;
  },
  stop: /cvpmFlips2\.Init is called twice/i,
};

const RULES: readonly CompatRule[] = [vpmInitOnce];

/** Correctifs dont le script a besoin, d'après son seul texte (code sans commentaires). */
export function compatFixesFound(code: string): CompatFix[] {
  return RULES.filter((r) => r.found(code)).map((r) => r.id);
}

/** Correctifs que réclame le message par lequel VPX a arrêté la partie, s'ils s'appliquent au script. */
export function compatFixesForStop(message: string, code: string): CompatFix[] {
  return RULES.filter((r) => r.stop.test(message) && r.applicable(code)).map((r) => r.id);
}

/** Correctifs qui s'appliquent encore au script (une table mise à jour peut ne plus en avoir besoin). */
export function compatFixesApplicable(fixes: readonly CompatFix[], code: string): CompatFix[] {
  return RULES.filter((r) => fixes.includes(r.id) && r.applicable(code)).map((r) => r.id);
}

/** Correctifs déjà présents dans un .vbs. */
export function compatFixesApplied(text: string): CompatFix[] {
  return RULES.filter((r) => r.applied(text)).map((r) => r.id);
}

/** Le texte avec ces correctifs (ceux déjà présents laissés tels quels) ; undefined si l'un ne trouve plus sa place. */
export function applyCompatFixes(text: string, fixes: readonly CompatFix[]): string | undefined {
  let out: string | undefined = text;
  for (const rule of RULES) {
    if (out === undefined || !fixes.includes(rule.id) || rule.applied(out)) continue;
    out = rule.apply(out);
  }
  return out;
}

/** Nombre d'appels de vpmInit dans le code, pour le dire à l'utilisateur. */
export function vpmInitCallCount(code: string): number {
  return vpmInitCalls(code);
}
