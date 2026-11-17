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
export type CompatFix = 'vpmInitOnce' | 'vrRoomOnScreens';

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

// ---------- Pièce VR dessinée sur les écrans ----------
//
// Une version VR de table (« … VR », « VR ROOM … ») affiche sa pièce (meuble, salle, fronton 3D) selon un
// interrupteur du script : les tables hybrides le gardent pour le casque (« If RenderingMode = 2 or VRTest = 1 »),
// mais une version faite pour le casque seul l'allume d'office (« Const VR_Room = 1 », sans regarder RenderingMode),
// et un interrupteur d'essai laissé à 1 (VRTest, LiveViewVRSim) l'allume même dans une table hybride. Sur une borne
// sans casque, VPX dessine alors toute la pièce à chaque image, pour rien (banc du 17/11/2026, scripts/banc-cadence :
// petite pièce d'Addams Family forcée, aucun coût mesurable à 1280 × 720 ; une grande pièce n'a pas été mesurée).
// Relevé le 17/11/2026 : « AC-DC LUCI Premium VR » jouée sur une borne sans casque. Le .vbs de Cyber Pinball garde
// l'interrupteur pour le casque seul : sa valeur multipliée par Abs(RenderingMode = 2), qui vaut 1 en VR et 0 sur les
// écrans (VPX connaît RenderingMode dès le chargement du script) ; une Const devient une variable, sur la même ligne.

/** Interrupteurs qui allument la pièce VR (noms relevés dans les scripts de VPW, de JP, des versions « VR Room »). */
const VR_FLAG = /^(VR_?Test|LiveView_?VR_?Sim|VR_?Sim|VR_?Room|VR_?Mode|Use_?VR|VR_?Enabled|VR_?On)$/i;
const VR_GUARD = 'Abs(RenderingMode = 2)';

interface VrFlag {
  /** Ligne (à partir de 0) où le script lui donne sa valeur, hors de toute Sub. */
  line: number;
  name: string;
}

/** Les interrupteurs de pièce VR allumés au chargement du script : nom et ligne de leur dernière valeur, hors Sub. */
function topLevelVrFlags(code: string): VrFlag[] {
  const found = new Map<string, VrFlag & { on: boolean }>();
  let depth = 0;
  code.split('\n').forEach((line, index) => {
    if (/^\s*(?:(?:public|private)\s+)?(?:sub|function|property\s+\w+)\s/i.test(line)) depth++;
    if (/^\s*end\s+(?:sub|function|property)\b/i.test(line)) depth = Math.max(0, depth - 1);
    if (depth) return;
    for (const st of line.split(':')) {
      const m = /^\s*(?:const\s+)?([A-Za-z_]\w*)\s*=\s*(\d+|true|false)\s*$/i.exec(st);
      if (!m || !VR_FLAG.test(m[1]!)) continue;
      const value = m[2]!.toLowerCase();
      found.set(m[1]!.toLowerCase(), { line: index, name: m[1]!, on: value === 'true' || (value !== 'false' && Number(value) !== 0) });
    }
  });
  return [...found.values()].filter((f) => f.on).map(({ line, name }) => ({ line, name }));
}

/** Interrupteurs qui allument la pièce VR sur les écrans aussi. */
function vrFlagsForcingRoom(code: string): VrFlag[] {
  const guarded = /\bRenderingMode\b/i.test(code);
  // La pièce est montrée par le script : des objets VR rendus visibles.
  const showsRoom = code.split('\n').some((l) => /\bVR/i.test(l) && /\.visible\s*=\s*(1|true)\b/i.test(l));
  return topLevelVrFlags(code).filter((flag) => {
    const name = flag.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const conditions = code.split('\n').filter((l) => new RegExp(`\\b(?:else)?if\\b.*\\b${name}\\b`, 'i').test(l));
    if (!conditions.length) return false;
    // Table hybride : l'interrupteur ne compte que s'il s'ajoute au mode VR (« RenderingMode = 2 or VRTest = 1 »).
    if (guarded) return conditions.some((l) => new RegExp(`RenderingMode\\s*=\\s*2\\s+or\\b.*\\b${name}\\b|\\b${name}\\b.*\\bor\\s+RenderingMode\\s*=\\s*2`, 'i').test(l));
    // Version faite pour le casque seul : rien ne regarde le mode de rendu.
    return showsRoom;
  });
}

const vrRoomOnScreens: CompatRule = {
  id: 'vrRoomOnScreens',
  found: (code) => vrFlagsForcingRoom(code).length > 0,
  applicable: (code) => vrFlagsForcingRoom(code).length > 0,
  applied: (text) => text.includes(VR_GUARD) && vrFlagsForcingRoom(text.split(/\r?\n/).map((l) => (commentStart(l) < 0 ? l : l.slice(0, commentStart(l)))).join('\n')).length === 0,
  apply(text) {
    const code = text.split(/\r?\n/).map((l) => (commentStart(l) < 0 ? l : l.slice(0, commentStart(l)))).join('\n');
    const flags = vrFlagsForcingRoom(code);
    if (!flags.length) return undefined;
    const parts = text.split(/(\r?\n)/);
    for (const flag of flags) {
      const i = flag.line * 2;
      const before = parts[i];
      if (before === undefined) return undefined;
      const name = flag.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      let edited = false;
      parts[i] = editCode(before, (piece) =>
        piece.replace(new RegExp(`\\b(const\\s+)?(${name})\\s*=\\s*(\\d+|true)\\b`, 'i'), (_, isConst: string | undefined, n: string, value: string) => {
          edited = true;
          return `${isConst ? `Dim ${n} : ` : ''}${n} = ${value} * ${VR_GUARD}`;
        }),
      );
      if (!edited) return undefined;
    }
    return parts.join('');
  },
  // Aucun message de VPX : la pièce se dessine sans erreur.
  stop: /(?!)/,
};

/** Interrupteurs de pièce VR que le .vbs de Cyber Pinball garde pour le casque (pour le dire à l'utilisateur). */
export function vrRoomFlags(code: string): string[] {
  return vrFlagsForcingRoom(code).map((f) => f.name);
}

const RULES: readonly CompatRule[] = [vpmInitOnce, vrRoomOnScreens];

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
