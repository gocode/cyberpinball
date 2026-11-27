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

import { addTableDofTap, dofCallLines, DOF_TAP_TABLE_SUB, ownDofSubs } from './dof-evenements';
import { commentStart, scriptCode, statements } from './vbscript';

/** Correctifs connus, nommés dans la dernière ligne du .vbs de Cyber Pinball. */
export type CompatFix = 'vpmInitOnce' | 'vrRoomOnScreens' | 'executeGlobalOnce' | 'timerTextOnce' | 'executeOnce' | 'tablesDirectoryDmd' | 'b2sArgs' | 'dofTapOwnSub';

/**
 * Version du texte que les correctifs écrivent, notée dans la dernière ligne du .vbs (compatVersion ; absente = 1). À
 * augmenter dès que le texte écrit par un correctif change : un .vbs de Cyber Pinball écrit avec une version
 * précédente est alors refait avant la partie suivante (scriptPatchState), au lieu de passer pour un .vbs modifié à la
 * main. 2 : minuteries compilées au premier passage et d'avance, au chargement (27/11/2026).
 */
export const COMPAT_VERSION = 2;

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

// ---------- Procédure redéfinie par ExecuteGlobal pendant la partie ----------
//
// Windows fait lire à son antivirus (AMSI, Microsoft Defender par défaut) chaque texte que VBScript compile pendant la
// partie : ExecuteGlobal, Execute, Eval. Le fil des images de VPX attend la fin de l'analyse. Le core.vbs de VPX le dit
// lui-même (cvpmTimer.Update : « calling Execute is a direct cause of stutters since it triggers OS security »). Mesuré
// le 18/11/2026 sur un poste de développement (Defender actif, cscript) : un appel direct 1,3 µs, ExecuteGlobal 22 ms,
// Execute 2 à 29 ms, Eval 50 ms. Rapport d'une borne du même jour (Daredevil, plugin du DMD, arrets.h) : 155 arrêts
// de 100 à 1 000 ms en trois minutes, le fil des images dans MPCLIENT.DLL (Defender) sous amsi.dll et vbscript.dll.
//
// La routine de clignotement que des centaines de tables recopient (FlashForMs de gtxjoe, SetFlash de JP) redéfinit à
// chaque appel la Sub « <lumière>_Timer » par ExecuteGlobal, avec un texte qui ne dépend que du nom de la lumière :
// chaque clignotement relance une analyse. Le .vbs de Cyber Pinball passe ces définitions par CyberPinball_ExecuteGlobal,
// qui ne recompile une procédure que si son texte a changé depuis la dernière définition de ce nom : redéfinir une
// procédure par le même texte ne change rien. Tout autre texte (instructions, plusieurs procédures) est exécuté
// comme avant, à chaque fois. ExecuteGlobal agit dans la portée globale d'où qu'on l'appelle : le déplacer dans une Sub
// ne change pas ce qu'il fait.

const EXECUTE_GLOBAL_ONCE = 'CyberPinball_ExecuteGlobal';
/** ExecuteGlobal dont le texte commence par une définition (« ExecuteGlobal "Sub " & … »), hors chaîne. */
const DEFINING_EXECUTE_GLOBAL = /(^|[^\w.])ExecuteGlobal(?=\s*\(?\s*"\s*(?:(?:public|private)\s+)?(?:sub|function)\s)/gi;
const PROCEDURE_START = /^\s*(?:(?:public|private)\s+)?(?:sub|function)\s/i;
const PROCEDURE_END = /^\s*end\s+(?:sub|function)\b/i;

/** Positions des ExecuteGlobal qui définissent une procédure dans une ligne de code (hors chaînes). */
function definingExecuteGlobals(code: string): number[] {
  const out: number[] = [];
  for (const m of code.matchAll(DEFINING_EXECUTE_GLOBAL)) {
    const at = m.index! + m[1]!.length;
    if ((code.slice(0, at).match(/"/g)?.length ?? 0) % 2 === 0) out.push(at);
  }
  return out;
}

/** Le script redéfinit une procédure par ExecuteGlobal depuis une de ses Sub (donc pendant la partie). */
function redefinesDuringPlay(code: string): boolean {
  let depth = 0;
  for (const line of code.split('\n')) {
    if (PROCEDURE_START.test(line)) depth++;
    if (depth && definingExecuteGlobals(line).length) return true;
    if (PROCEDURE_END.test(line)) depth = Math.max(0, depth - 1);
  }
  return false;
}

const executeGlobalOnce: CompatRule = {
  id: 'executeGlobalOnce',
  found: (code) => redefinesDuringPlay(code),
  applicable: (code) => redefinesDuringPlay(code),
  applied: (text) => new RegExp(`^\\s*sub\\s+${EXECUTE_GLOBAL_ONCE}\\b`, 'im').test(text),
  apply(text) {
    const eol = /\r\n/.test(text) ? '\r\n' : '\n';
    const parts = text.split(/(\r?\n)/);
    let calls = 0;
    for (let i = 0; i < parts.length; i += 2) {
      const line = parts[i]!;
      const at = commentStart(line);
      const code = at < 0 ? line : line.slice(0, at);
      const positions = definingExecuteGlobals(code);
      if (!positions.length) continue;
      let edited = code;
      for (const p of positions.reverse()) edited = `${edited.slice(0, p)}${EXECUTE_GLOBAL_ONCE}${edited.slice(p + 'ExecuteGlobal'.length)}`;
      parts[i] = edited + (at < 0 ? '' : line.slice(at));
      calls += positions.length;
    }
    if (!calls) return undefined;
    let out = parts.join('');
    if (out && !/\r?\n$/.test(out)) out += eol;
    // En fin de script (VBScript connaît Sub et variables globales dès le chargement). Le dictionnaire est créé au
    // premier appel : du code de premier niveau placé avant ces lignes peut déjà appeler la routine. Les noms de
    // VBScript ignorent la casse ; le texte, lui, est comparé tel quel. Une seule procédure : le motif refuse un second
    // « End Sub ». Le nom est lu avec des fonctions de chaîne : RegExp.Execute coûte autant qu'ExecuteGlobal (5 ms
    // mesurées le 18/11/2026, Defender actif), RegExp.Test 10 µs.
    const g = EXECUTE_GLOBAL_ONCE;
    const lines = [
      `Dim ${g}_Defined, ${g}_Shape`,
      `Sub ${g}(aCode)`,
      `  Dim code, s, low, key, p`,
      `  code = CStr(aCode)`,
      `  If IsEmpty(${g}_Defined) Then`,
      `    Set ${g}_Defined = CreateObject("Scripting.Dictionary")`,
      `    Set ${g}_Shape = New RegExp`,
      `    ${g}_Shape.IgnoreCase = True`,
      `    ${g}_Shape.Pattern = "^\\s*(?:(?:public|private)\\s+)?(?:sub|function)\\s+[A-Za-z_]\\w*(?:(?!\\bend\\s+(?:sub|function)\\b)[\\s\\S])*\\bend\\s+(?:sub|function)\\s*:?\\s*$"`,
      `  End If`,
      `  key = ""`,
      `  If ${g}_Shape.Test(code) Then`,
      `    s = LTrim(Replace(Replace(Replace(code, vbTab, " "), vbCr, " "), vbLf, " "))`,
      `    low = LCase(s)`,
      `    If Left(low, 7) = "public " Or Left(low, 8) = "private " Then s = LTrim(Mid(s, InStr(s, " ") + 1)) : low = LCase(s)`,
      `    s = LTrim(Mid(s, InStr(s, " ") + 1))`,
      `    For p = 1 To Len(s)`,
      `      If InStr("abcdefghijklmnopqrstuvwxyz0123456789_", LCase(Mid(s, p, 1))) = 0 Then Exit For`,
      `    Next`,
      `    key = LCase(Left(s, p - 1))`,
      `  End If`,
      `  If key <> "" Then`,
      `    If ${g}_Defined.Exists(key) Then`,
      `      If ${g}_Defined(key) = code Then Exit Sub`,
      `    End If`,
      `  End If`,
      `  ExecuteGlobal code`,
      `  If key <> "" Then ${g}_Defined(key) = code`,
      `End Sub`,
    ];
    return out + lines.join(eol) + eol;
  },
  // Aucun message de VPX : la partie s'arrête un instant, sans erreur.
  stop: /(?!)/,
};

// ---------- Minuteries de vpmTimer décrites par un texte ----------
//
// « vpmTimer.AddTimer 3000, "PlaySoundVol ""x"", 1 '" » : le core.vbs garde le texte et, quand la minuterie arrive à
// échéance, le fait compiler par Execute (cvpmTimer.Update) ; chaque échéance relance donc une analyse de l'antivirus
// (voir plus haut). Relevé le 18/11/2026 dans les tables d'un poste de développement : Guardians of the Galaxy en a 12
// (bonus de fin de bille), Game of Thrones une ; les scripts de système de VPX en ont pour les monnayeurs.
//
// Passer un objet GetRef à AddTimer éviterait Execute, mais le core.vbs de VPX 10.8.1-5436 (3.61, cvpmTimer.Update l. 254)
// recopie la file sans Set quand une minuterie part : un objet placé derrière fait tomber la partie (erreur 450). Le .vbs
// de Cyber Pinball corrige donc le core.vbs lui-même, au chargement : les textes que le script charge par GetTextFile
// (core.vbs, et les scripts de système qui le chargent à leur tour) passent par CyberPinball_TextFile, qui fait précéder
// cet Execute de CyberPinball_TimerCall. Un texte devient, dès son premier passage, une Sub compilée une fois pour toutes
// (« <texte> <argument> », comme Execute le recevait), appelée ensuite sans analyse (CyberPinball_Compile, plus bas).
// Execute agit dans la portée de cvpmTimer.Update : un texte qui nomme une de ses variables, un de ses membres, ou qui
// ouvre ou ferme une procédure, est laissé à Execute, comme avant.
//
// Précompilation (rapport du 27/11/2026, McAfee : environ 785 ms par analyse, à la suite, sur The Goonies et Guardians
// of the Galaxy) : les textes écrits tels quels dans la table (« vpmTimer.AddTimer 500, "GIOn '" ») sont tous compilés
// au chargement, en un seul ExecuteGlobal, donc une seule analyse, avant la partie. Compiler au premier passage n'est
// jamais plus cher qu'avant : ExecuteGlobal coûte moins qu'Execute (cscript, Defender, 1000 appels : 1,6 s contre 6,0 s
// pour un texte identique, 3,2 s contre 16,7 s pour des textes distincts).

const TIMER_TEXT = 'CyberPinball_TextFile';
const TIMER_CALL = 'CyberPinball_TimerCall';
const TIMER_GUARD = 'CyberPinball_TimerGuard';
/** Le paramètre de la Sub compilée qui reçoit l'argument de la minuterie (« <texte> <argument> », comme Execute). */
const TIMER_ARG = 'CyberPinball_Arg';
/** Variables et membres de cvpmTimer.Update (core.vbs 3.61), que voit un texte passé à Execute. */
const TIMER_SCOPE = 'ii|jj|sw|obj|mquecopy|mnow|mtimers|mque\\d|mslowupdates|mfastupdates|mresets|mfasttimer|update|fastupdate|reset|inittimer|enableupdate|addresetobj|pulsesw|pulseswitch|addtimer2?';

/** Un texte écrit entre guillemets en VBScript. */
function vbString(s: string): string {
  return s.replace(/"/g, '""');
}

/**
 * Les rappels de minuterie écrits tels quels dans le script (« vpmTimer.AddTimer 500, "GIOn '" » : le texte seul, sans
 * concaténation), dans l'ordre, sans doublon ; ce que le core.vbs passera à Execute.
 */
function constantTimerTexts(code: string): string[] {
  const texts = new Set<string>();
  for (const line of code.split('\n')) {
    for (const m of line.matchAll(TIMER_ADD)) {
      const at = m.index! + m[0].length;
      if ((line.slice(0, at).match(/"/g)?.length ?? 0) % 2) continue;
      const rest = line.slice(at).replace(/^\s*\(/, '');
      const callback = callArguments(rest)[/^PulseSwitch$/i.test(m[2]!) ? 2 : 1] ?? '';
      const literal = /^"((?:[^"]|"")*)"$/.exec(callback);
      if (literal) texts.add(literal[1]!.replace(/""/g, '"'));
    }
  }
  return [...texts];
}

// ---------- Textes compilés une fois (minuteries, Execute d'une variable) ----------
//
// CyberPinball_Compile(texte, paramètre, garde) rend la Sub qui fait ce qu'Execute ferait du texte, compilée une fois
// par ExecuteGlobal puis gardée ; Nothing quand le texte doit rester à Execute : il nomme un nom de la garde (variables
// de la procédure qui l'exécute, que la Sub ne verrait pas), il ouvre ou ferme une procédure, nomme Me, ou ne se compile
// pas seul. 2000 textes au plus ; au-delà, Execute comme avant. _Want et _Wanted compilent d'avance une liste de
// textes en un seul ExecuteGlobal ; une erreur de compilation fait échouer tout le lot, qui est alors coupé en deux
// jusqu'à isoler le texte fautif, laissé à Execute (il y donnera son erreur, comme avant).

const COMPILE = 'CyberPinball_Compile';
const COMPILED = 'CyberPinball_Compiled';

/** Le texte avec le moteur de compilation (une fois : les deux règles qui s'en servent l'ajoutent chacune). */
function withCompiler(text: string): string {
  if (new RegExp(`^\\s*function\\s+${COMPILE}\\b`, 'im').test(text)) return text;
  const eol = /\r\n/.test(text) ? '\r\n' : '\n';
  const c = COMPILE;
  const lines = [
    `Dim ${c}_Seen, ${c}_Wants, ${c}_Guards, ${c}_Count, ${c}_Done`,
    `Sub ${c}_Init()`,
    `  If Not IsEmpty(${c}_Seen) Then Exit Sub`,
    `  Set ${c}_Seen = CreateObject("Scripting.Dictionary")`,
    `  Set ${c}_Wants = CreateObject("Scripting.Dictionary")`,
    `  Set ${c}_Guards = CreateObject("Scripting.Dictionary")`,
    `  ${c}_Count = 0`,
    `End Sub`,
    `Function ${c}_Safe(aCode, aGuard)`,
    `  Dim re, words`,
    `  If Not ${c}_Guards.Exists(aGuard) Then`,
    `    words = "me|sub|function|class|property|end|exit"`,
    `    If aGuard <> "" Then words = words & "|" & aGuard`,
    `    Set re = New RegExp`,
    `    re.IgnoreCase = True`,
    `    re.Pattern = "(^|[^\\w.])(" & words & ")(?!\\w)"`,
    `    ${c}_Guards.Add aGuard, re`,
    `  End If`,
    `  ${c}_Safe = Not ${c}_Guards.Item(aGuard).Test(aCode)`,
    `End Function`,
    `Function ${c}_Source(aName, aCode, aArg)`,
    `  If aArg = "" Then`,
    `    ${c}_Source = "Sub " & aName & "()" & vbNewLine & aCode & vbNewLine & "End Sub" & vbNewLine`,
    `  Else`,
    `    ${c}_Source = "Sub " & aName & "(" & aArg & ")" & vbNewLine & aCode & " " & aArg & " " & vbNewLine & "End Sub" & vbNewLine`,
    `  End If`,
    `End Function`,
    `Function ${c}_Run(aSource)`,
    `  On Error Resume Next`,
    `  ExecuteGlobal aSource`,
    `  ${c}_Run = (Err.Number = 0)`,
    `  Err.Clear`,
    `End Function`,
    `Function ${c}(aCode, aArg, aGuard)`,
    `  Dim key, name`,
    `  Set ${c} = Nothing`,
    `  ${c}_Init`,
    `  key = aArg & "|" & aGuard & "|" & aCode`,
    `  If Not ${c}_Seen.Exists(key) Then`,
    `    If ${c}_Seen.Count >= 2000 Then Exit Function`,
    `    ${c}_Seen.Add key, 0`,
    `    If Not ${c}_Safe(aCode, aGuard) Then Exit Function`,
    `    ${c}_Count = ${c}_Count + 1`,
    `    name = "${COMPILED}_" & ${c}_Count`,
    `    If Not ${c}_Run(${c}_Source(name, aCode, aArg)) Then Exit Function`,
    `    Set ${c}_Seen.Item(key) = GetRef(name)`,
    `  End If`,
    `  If IsObject(${c}_Seen.Item(key)) Then Set ${c} = ${c}_Seen.Item(key)`,
    `End Function`,
    // Fait ce qu'Execute ferait du texte, par sa Sub compilée ; _Done dit si c'est fait (sinon, à Execute de le faire).
    // Jamais dans la condition d'un If : sous On Error Resume Next, une erreur y ferait exécuter le Then, et le texte
    // deux fois. Une erreur du texte arrête sa Sub au même endroit qu'Execute, puis est rendue à l'appelant telle quelle,
    // _Done déjà vrai (un texte qui en exécute un autre a pu le changer entre-temps).
    `Sub ${c}_Do(aCode, aArgName, aArg, aGuard)`,
    `  Dim f, n, s, d`,
    `  ${c}_Done = False`,
    `  If VarType(aCode) <> vbString Then Exit Sub`,
    `  Set f = ${c}(aCode, aArgName, aGuard)`,
    `  If f Is Nothing Then Exit Sub`,
    `  On Error Resume Next`,
    `  If aArgName = "" Then Call f() Else Call f(aArg)`,
    `  n = Err.Number : s = Err.Source : d = Err.Description`,
    `  On Error Goto 0`,
    `  ${c}_Done = True`,
    `  If n <> 0 Then Err.Raise n, s, d`,
    `End Sub`,
    `Sub ${c}_Want(aCode, aArg, aGuard)`,
    `  Dim key`,
    `  ${c}_Init`,
    `  key = aArg & "|" & aGuard & "|" & aCode`,
    `  If ${c}_Seen.Exists(key) Or ${c}_Wants.Exists(key) Then Exit Sub`,
    `  If Not ${c}_Safe(aCode, aGuard) Then Exit Sub`,
    `  ${c}_Wants.Add key, Array(aCode, aArg)`,
    `End Sub`,
    `Sub ${c}_Wanted()`,
    `  Dim keys`,
    `  ${c}_Init`,
    `  If ${c}_Wants.Count = 0 Then Exit Sub`,
    `  keys = ${c}_Wants.Keys`,
    `  ${c}_Some keys, 0, UBound(keys)`,
    `  ${c}_Wants.RemoveAll`,
    `End Sub`,
    `Sub ${c}_Some(aKeys, aFrom, aTo)`,
    `  Dim i, w, src, first, middle`,
    `  first = ${c}_Count + 1`,
    `  src = ""`,
    `  For i = aFrom To aTo`,
    `    w = ${c}_Wants.Item(aKeys(i))`,
    `    src = src & ${c}_Source("${COMPILED}_" & (first + i - aFrom), w(0), w(1))`,
    `  Next`,
    `  If ${c}_Run(src) Then`,
    `    ${c}_Count = first + aTo - aFrom`,
    `    For i = aFrom To aTo`,
    `      If Not ${c}_Seen.Exists(aKeys(i)) And ${c}_Seen.Count < 2000 Then ${c}_Seen.Add aKeys(i), GetRef("${COMPILED}_" & (first + i - aFrom))`,
    `    Next`,
    `  ElseIf aFrom = aTo Then`,
    `    If Not ${c}_Seen.Exists(aKeys(aFrom)) Then ${c}_Seen.Add aKeys(aFrom), 0`,
    `  Else`,
    `    middle = (aFrom + aTo) \\ 2`,
    `    ${c}_Some aKeys, aFrom, middle`,
    `    ${c}_Some aKeys, middle + 1, aTo`,
    `  End If`,
    `End Sub`,
  ];
  return text + (text && !/\r?\n$/.test(text) ? eol : '') + lines.join(eol) + eol;
}
/** L'appel du texte dans cvpmTimer.Update (core.vbs 3.61 : « Execute mQue3(ii) & " " & mQue2(ii) & " " »). */
export const CORE_TIMER_EXECUTE = 'Execute mQue3(ii) & " " & mQue2(ii)';
/** Une minuterie de vpmTimer et la place (à partir de 0) de son rappel parmi ses arguments. */
const TIMER_ADD = /(^|[^\w.])vpmTimer\s*\.\s*(AddTimer2?|PulseSwitch)\b/gi;
const GET_TEXT_FILE = /(^|[^\w.])GetTextFile(?=\s*\()/gi;

/** Arguments d'un appel, du début de `rest` à la fin de l'instruction (virgules hors chaînes et parenthèses). */
function callArguments(rest: string): string[] {
  const args: string[] = [];
  let depth = 0;
  let quoted = false;
  let current = '';
  for (const ch of rest) {
    if (ch === '"') quoted = !quoted;
    else if (!quoted && ch === '(') depth++;
    else if (!quoted && ch === ')') {
      if (depth === 0) break;
      depth--;
    } else if (!quoted && depth === 0 && (ch === ':' || ch === "'")) break;
    else if (!quoted && depth === 0 && ch === ',') {
      args.push(current.trim());
      current = '';
      continue;
    }
    current += ch;
  }
  args.push(current.trim());
  return args;
}

/** Le script donne à vpmTimer au moins une minuterie dont le rappel est un texte (pas un GetRef). */
function queuesTimerText(code: string): boolean {
  for (const line of code.split('\n')) {
    for (const m of line.matchAll(TIMER_ADD)) {
      const at = m.index! + m[0].length;
      if ((line.slice(0, at).match(/"/g)?.length ?? 0) % 2) continue;
      const rest = line.slice(at).replace(/^\s*\(/, '');
      const callback = callArguments(rest)[/^PulseSwitch$/i.test(m[2]!) ? 2 : 1] ?? '';
      if (callback.includes('"') && !/^\(?\s*GetRef\s*\(/i.test(callback)) return true;
    }
  }
  return false;
}

/** Le script charge des scripts de VPX par GetTextFile (core.vbs, ou un script de système qui le charge). */
function loadsTextFiles(code: string): boolean {
  let found = false;
  for (const line of code.split('\n')) {
    editCode(line, (part) => {
      if (GET_TEXT_FILE.test(part)) found = true;
      GET_TEXT_FILE.lastIndex = 0;
      return part;
    });
    if (found) return true;
  }
  return false;
}

const timerTextOnce: CompatRule = {
  id: 'timerTextOnce',
  found: (code) => queuesTimerText(code) && loadsTextFiles(code),
  applicable: (code) => queuesTimerText(code) && loadsTextFiles(code),
  applied: (text) => new RegExp(`^\\s*function\\s+${TIMER_TEXT}\\b`, 'im').test(text),
  apply(text) {
    const eol = /\r\n/.test(text) ? '\r\n' : '\n';
    const parts = text.split(/(\r?\n)/);
    let calls = 0;
    for (let i = 0; i < parts.length; i += 2) {
      parts[i] = editCode(parts[i]!, (code) =>
        code.replace(GET_TEXT_FILE, (_, before: string) => {
          calls++;
          return `${before}${TIMER_TEXT}`;
        }),
      );
    }
    if (!calls) return undefined;
    let out = parts.join('');
    if (out && !/\r?\n$/.test(out)) out += eol;
    const lines = [
      // Le texte d'un fichier de VPX, avec ses propres chargements et l'Execute des minuteries corrigés. Sans On Error :
      // un fichier introuvable reste une erreur pour l'appelant, qui la traite comme avant (If Err Then MsgBox…).
      `Function ${TIMER_TEXT}(aFile)`,
      `  Dim text`,
      `  text = GetTextFile(aFile)`,
      `  text = Replace(text, "GetTextFile(", "${TIMER_TEXT}(", 1, -1, vbTextCompare)`,
      `  text = Replace(text, "${vbString(CORE_TIMER_EXECUTE)}", "${TIMER_CALL} mQue3(ii), mQue2(ii) : If Not ${COMPILE}_Done Then ${vbString(CORE_TIMER_EXECUTE)}", 1, -1, vbTextCompare)`,
      `  ${TIMER_TEXT} = text`,
      `End Function`,
      // Les noms de la portée de cvpmTimer.Update (variables, membres) : un texte qui en nomme un reste à Execute.
      `Const ${TIMER_GUARD} = "${TIMER_SCOPE}"`,
      // Le rappel fait par sa Sub compilée ; sinon (CyberPinball_Compile_Done faux), à Execute de le faire, comme avant.
      `Sub ${TIMER_CALL}(aCode, aArg)`,
      `  ${COMPILE}_Do aCode, "${TIMER_ARG}", aArg, ${TIMER_GUARD}`,
      `End Sub`,
      // Les textes écrits tels quels dans la table, compilés d'un seul coup au chargement.
      ...constantTimerTexts(scriptCode(text)).map((s) => `${COMPILE}_Want "${vbString(s)}", "${TIMER_ARG}", ${TIMER_GUARD}`),
      `${COMPILE}_Wanted`,
    ];
    return withCompiler(out + lines.join(eol) + eol);
  },
  // Aucun message de VPX : la partie s'arrête un instant, sans erreur.
  stop: /(?!)/,
};

// ---------- Execute d'un texte rangé dans une variable ----------
//
// Guardians of the Galaxy (rapport du 27/11/2026, McAfee) range des commandes en texte dans une file (QueueScene :
// « PuPEvent 12 », « pDMDStartBall »...) et les fait exécuter par « Execute qCmd » dans sa Sub RunQueue, à chaque scène :
// autant d'analyses de l'antivirus, en pleine partie. Le .vbs de Cyber Pinball fait précéder un tel Execute, seul sur sa
// ligne, de CyberPinball_Execute, qui exécute le texte par une Sub compilée une fois (CyberPinball_Compile). Execute agit
// dans la portée de la procédure qui l'appelle : un texte qui nomme une de ses variables (paramètres, Dim, ReDim,
// Const, noms auxquels elle donne une valeur ou qu'elle parcourt par For) reste à Execute, comme avant. Pas de
// correctif dans une Class (les membres s'y lisent sans Me) ni dans un bloc With (« .Nom » désigne l'objet du With).

const EXECUTE_ONCE = 'CyberPinball_Execute';
const EXECUTE_ALONE = /^(\s*)Execute(\s+)([A-Za-z_]\w*)(\s*)$/i;
const CLASS_START = /^\s*(?:(?:public|private)\s+)?class\s+[A-Za-z_]/i;
const CLASS_END = /^\s*end\s+class\b/i;
const PROC_HEAD = /^\s*(?:(?:public|private)\s+)?(?:default\s+)?(?:sub|function|property\s+(?:get|let|set))\s+[A-Za-z_]\w*\s*(?:\(([^)]*)\))?/i;
const PROC_TAIL = /^\s*end\s+(?:sub|function|property)\b/i;
const WITH_START = /^\s*with\s/i;
const WITH_END = /^\s*end\s+with\b/i;

interface ExecuteSite {
  /** Ligne (à partir de 0). */
  line: number;
  /** Noms de la procédure, en minuscules, séparés par « | » (la garde de CyberPinball_Compile). */
  guard: string;
}

/** Les noms qu'une procédure tient pour siens : paramètres, Dim, ReDim, Const, affectations, variables de For. */
function procedureNames(params: string, body: readonly string[]): string[] {
  const names = new Set<string>();
  const add = (name: string | undefined) => {
    if (name && /^[A-Za-z_]\w*$/.test(name) && !VB_WORDS.has(name.toLowerCase())) names.add(name.toLowerCase());
  };
  for (const p of params.split(',')) add(/^\s*(?:optional\s+)?(?:(?:byval|byref)\s+)?([A-Za-z_]\w*)/i.exec(p)?.[1]);
  for (const line of body) {
    for (const statement of statements(line)) {
      const declared = /^\s*(?:dim|redim(?:\s+preserve)?|const|private|public)\s+(.*)$/i.exec(statement);
      if (declared) {
        for (const part of declared[1]!.replace(/\([^)]*\)/g, '').split(',')) add(/^\s*([A-Za-z_]\w*)/.exec(part)?.[1]);
        continue;
      }
      // « If c Then x = 1 Else y = 2 » : chaque morceau peut donner une valeur à un nom.
      for (const piece of statement.split(/\b(?:then|else)\b/i)) {
        add(/^\s*(?:set\s+)?([A-Za-z_]\w*)\s*(?:\([^)]*\)\s*)?=/i.exec(piece)?.[1]);
        add(/^\s*for\s+(?:each\s+)?([A-Za-z_]\w*)/i.exec(piece)?.[1]);
      }
    }
  }
  return [...names];
}

/** Les « Execute <variable> » seuls sur leur ligne, dans une procédure hors Class et hors With, avec la garde de chacun. */
function executeSites(code: string): ExecuteSite[] {
  const lines = code.split('\n');
  const sites: ExecuteSite[] = [];
  let inClass = false;
  let proc: { start: number; params: string; withs: number; found: number[] } | undefined;
  lines.forEach((line, i) => {
    if (!proc) {
      if (CLASS_START.test(line)) inClass = true;
      else if (CLASS_END.test(line)) inClass = false;
      const head = PROC_HEAD.exec(line);
      // Une procédure écrite sur une seule ligne (« Sub X : … : End Sub ») n'a rien à corriger.
      if (head && !inClass && !/\bend\s+(?:sub|function|property)\b/i.test(line)) proc = { start: i, params: head[1] ?? '', withs: 0, found: [] };
      return;
    }
    if (PROC_TAIL.test(line)) {
      if (proc.found.length) {
        const guard = procedureNames(proc.params, lines.slice(proc.start + 1, i)).join('|');
        for (const at of proc.found) sites.push({ line: at, guard });
      }
      proc = undefined;
      return;
    }
    if (WITH_START.test(line)) proc.withs++;
    else if (WITH_END.test(line)) proc.withs = Math.max(0, proc.withs - 1);
    else if (!proc.withs && EXECUTE_ALONE.test(line)) proc.found.push(i);
  });
  return sites;
}

const executeOnce: CompatRule = {
  id: 'executeOnce',
  found: (code) => executeSites(code).length > 0,
  applicable: (code) => executeSites(code).length > 0,
  applied: (text) => new RegExp(`^\\s*sub\\s+${EXECUTE_ONCE}\\b`, 'im').test(text),
  apply(text) {
    const sites = executeSites(scriptCode(text));
    if (!sites.length) return undefined;
    const eol = /\r\n/.test(text) ? '\r\n' : '\n';
    const parts = text.split(/(\r?\n)/);
    for (const site of sites) {
      const line = parts[site.line * 2]!;
      const at = commentStart(line);
      const code = at < 0 ? line : line.slice(0, at);
      const m = EXECUTE_ALONE.exec(code);
      if (!m) return undefined;
      const [, indent, space, variable, trail] = m;
      parts[site.line * 2] = `${indent}${EXECUTE_ONCE} ${variable}, "${site.guard}" : If Not ${COMPILE}_Done Then Execute${space}${variable}${trail}${at < 0 ? '' : line.slice(at)}`;
    }
    let out = parts.join('');
    if (out && !/\r?\n$/.test(out)) out += eol;
    const lines = [
      // Le texte exécuté par sa Sub compilée ; sinon (CyberPinball_Compile_Done faux), à Execute de le faire, comme avant.
      `Sub ${EXECUTE_ONCE}(aCode, aGuard)`,
      `  ${COMPILE}_Do aCode, "", Empty, aGuard`,
      `End Sub`,
    ];
    return withCompiler(out + lines.join(eol) + eol);
  },
  // Aucun message de VPX : la partie s'arrête un instant, sans erreur.
  stop: /(?!)/,
};

// ---------- Dossier du DMD cherché dans TablesDirectory ----------
//
// UltraDMD et FlexDMD chargent leurs images d'un dossier livré avec la table (« Foo.UltraDMD »). La plupart des
// scripts le cherchent dans le dossier courant (« curDir = fso.GetAbsolutePathName(".") ») : VPX 10.8 en fait le
// dossier de la table juste avant de compiler le script (PinTable::Play, « make sure the load directory is the
// active directory »). D'autres passent par TablesDirectory : VPX 10.8 y met le dossier « Tables » à côté de
// VPinballX.exe s'il existe, sinon « tables » dans le dossier de la table (ScriptGlobalTable::get_TablesDirectory),
// jamais le dossier de la table lui-même. Avec une table par dossier, le DMD y reste vide. Signalé le 18/11/2026
// par un utilisateur. Le .vbs de Cyber Pinball remplace TablesDirectory, sur les seules lignes qui mènent au dossier
// du DMD, par le dossier courant relevé au chargement du script, comme le font les scripts en curDir.

const TABLE_DIR = 'CyberPinball_TableDir';
const TABLES_DIRECTORY = /(^|[^\w.])TablesDirectory(?!\w)/gi;
const PROJECT_FOLDER = /\.(?:ProjectFolder\s*=|SetProjectFolder\b)/i;
const VB_WORDS = new Set(['and', 'or', 'not', 'call', 'set', 'with', 'end', 'me', 'true', 'false', 'nothing', 'empty', 'null']);

/** Code d'une ligne sans ses chaînes (pour y chercher des noms). */
function codeOnly(line: string): string {
  let out = '';
  editCode(line, (part) => {
    out += ` ${part}`;
    return part;
  });
  return out;
}

/** Lignes (à partir de 0) qui mènent le dossier du DMD à TablesDirectory : l'appel lui-même, ou la variable qu'il reçoit. */
function tablesDirectoryDmdLines(code: string): number[] {
  const lines = code.split('\n');
  const uses = (i: number) => new RegExp(TABLES_DIRECTORY.source, 'i').test(codeOnly(lines[i]!));
  const found = new Set<number>();
  lines.forEach((line, i) => {
    const at = line.search(PROJECT_FOLDER);
    if (at < 0) return;
    if (uses(i)) found.add(i);
    // Variables du chemin (« .SetProjectFolder dmdDir ») : leur affectation à partir de TablesDirectory.
    const names = [...codeOnly(line.slice(at)).matchAll(/(?:^|[^\w.])([A-Za-z_]\w*)(?![\w.(])/g)].map((m) => m[1]!).filter((n) => !VB_WORDS.has(n.toLowerCase()) && !/^(SetProjectFolder|ProjectFolder|TablesDirectory)$/i.test(n));
    for (const name of names) {
      const assign = new RegExp(`(?:^|[\\s:])${name}\\s*=`, 'i');
      lines.forEach((other, j) => {
        if (j !== i && assign.test(codeOnly(other)) && uses(j)) found.add(j);
      });
    }
  });
  return [...found].sort((a, b) => a - b);
}

const tablesDirectoryDmd: CompatRule = {
  id: 'tablesDirectoryDmd',
  found: (code) => tablesDirectoryDmdLines(code).length > 0,
  applicable: (code) => tablesDirectoryDmdLines(code).length > 0,
  applied: (text) => new RegExp(`^\\s*function\\s+${TABLE_DIR}\\b`, 'im').test(text) && tablesDirectoryDmdLines(scriptCode(text)).length === 0,
  apply(text) {
    const targets = tablesDirectoryDmdLines(scriptCode(text));
    if (!targets.length) return undefined;
    const eol = /\r\n/.test(text) ? '\r\n' : '\n';
    const parts = text.split(/(\r?\n)/);
    for (const line of targets) {
      const i = line * 2;
      if (parts[i] === undefined) return undefined;
      parts[i] = editCode(parts[i]!, (code) => code.replace(TABLES_DIRECTORY, (_, before: string) => `${before}${TABLE_DIR}()`));
    }
    let out = parts.join('');
    if (out && !/\r?\n$/.test(out)) out += eol;
    // Relevé au chargement du script (dernière ligne exécutée avant <table>_Init), ou au premier appel s'il vient plus tôt.
    const lines = [
      `Dim ${TABLE_DIR}_Value`,
      `Function ${TABLE_DIR}()`,
      `  If IsEmpty(${TABLE_DIR}_Value) Then ${TABLE_DIR}_Value = CreateObject("Scripting.FileSystemObject").GetAbsolutePathName(".") & "\\"`,
      `  ${TABLE_DIR} = ${TABLE_DIR}_Value`,
      `End Function`,
      `Call ${TABLE_DIR}()`,
    ];
    return out + lines.join(eol) + eol;
  },
  // Aucun message de VPX : le DMD reste vide, ou le script s'arrête plus loin (« Type incompatible »).
  stop: /(?!)/,
};

// ---------- Appels au fronton B2S que le plugin de VPX refuse ----------
//
// VPX 10.8.1 fournit B2S.Server par son plugin B2S (plugins/b2s/B2SPlugin.cpp), aux paramètres typés : B2SSetData
// (int, int) ou (string, int), B2SSetScore (int, int)… Un texte à une place « int » est converti par VariantChangeType
// (src/core/DynamicScript.cpp, COMToScriptVariant) : un nombre écrit en texte passe, tout autre texte échoue (« Failed to
// convert from COM variant type 8 », « Failed to convert a parameter in call to B2S_Server.B2SSetData »), et l'erreur
// de type arrête la procédure du script qui appelait. Le B2S Server d'origine l'acceptait sans arrêter la table.
// Relevé le 19/11/2026 (Champions League 2023, ligne 5165 de son script) : l'erreur venait pendant l'initialisation,
// qui s'arrêtait avant de créer UltraDMD, puis « Objet requis: 'UltraDMD' » 540 fois sur le plateau.
// Le .vbs de Cyber Pinball passe ces appels par une procédure qui convertit en nombre un texte numérique, aux seules
// places « int » du plugin, et qui, si le fronton refuse encore, laisse le script continuer : un élément du fronton
// non allumé plutôt qu'une table arrêtée. Appliqué seulement aux tables dont VPX a écrit ce refus (doctor.ts,
// compatFixesFromLog) : rien ne change pour les autres.

const B2S_CALL = 'CyberPinball_B2S';
/** Pour chaque méthode du plugin et son nombre d'arguments : les places qui n'acceptent qu'un entier. */
const B2S_INT_ONLY: Record<string, Record<number, number[]>> = (() => {
  const both = (one: number[], two: number[]) => ({ 1: one, 2: two });
  const map: Record<string, Record<number, number[]>> = {
    b2ssetdata: { 2: [1] },
    b2ssetpos: { 3: [1, 2] },
    b2ssetillumination: { 2: [1] },
    b2ssetled: { 2: [0] },
    b2ssetleddisplay: { 2: [0] },
    b2ssetreel: { 2: [0, 1] },
    b2ssetscore: { 2: [0, 1] },
    b2ssetscoreplayer: { 2: [0, 1] },
    b2ssetscoredigit: { 2: [0, 1] },
    b2ssetscorerollover: { 2: [0, 1] },
  };
  for (let i = 1; i <= 6; i++) map[`b2ssetscoreplayer${i}`] = { 1: [0] };
  for (let i = 1; i <= 4; i++) map[`b2ssetscorerolloverplayer${i}`] = { 1: [0] };
  for (const m of ['credits', 'playerup', 'canplay', 'ballinplay', 'tilt', 'match', 'gameover', 'shootagain']) map[`b2sset${m}`] = both([0], [0, 1]);
  return map;
})();

/** Un appel à une méthode B2S en début d'instruction : objet, méthode, et la place de ses arguments dans la ligne. */
interface B2sCall {
  start: number;
  end: number;
  call: boolean;
  object: string;
  method: string;
  args: string[];
  parens: boolean;
}

/** Fin des arguments d'une instruction (« : », « ' », Else, fin de ligne ; parenthèse fermante en mode parenthésé). */
function argumentsEnd(line: string, from: number, parens: boolean): number {
  let depth = 0;
  let quoted = false;
  for (let i = from; i < line.length; i++) {
    const ch = line[i]!;
    if (ch === '"') quoted = !quoted;
    if (quoted) continue;
    if (ch === '(') depth++;
    else if (ch === ')') {
      if (depth === 0) return parens ? i : -1;
      depth--;
    } else if (!parens && depth === 0 && (ch === ':' || ch === "'")) return i;
    else if (!parens && depth === 0 && /^\belse\b/i.test(line.slice(i)) && /[\s]/.test(line[i - 1] ?? ' ')) return i;
  }
  return parens ? -1 : line.length;
}

/** Arguments séparés par les virgules hors chaînes et parenthèses. */
function splitArguments(text: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let quoted = false;
  let current = '';
  for (const ch of text) {
    if (ch === '"') quoted = !quoted;
    if (!quoted && ch === '(') depth++;
    if (!quoted && ch === ')') depth--;
    if (!quoted && depth === 0 && ch === ',') {
      out.push(current.trim());
      current = '';
      continue;
    }
    current += ch;
  }
  if (current.trim()) out.push(current.trim());
  return out;
}

/** Les appels B2S d'une ligne dont une place « int » du plugin reçoit un argument (à convertir). */
function b2sCalls(line: string): B2sCall[] {
  const calls: B2sCall[] = [];
  const at = commentStart(line);
  const code = at < 0 ? line : line.slice(0, at);
  const re = /(^|:|\bthen\b|\belse\b)(\s*)(call\s+)?([A-Za-z_][\w]*(?:\.[A-Za-z_]\w*)*)\.(B2S\w+)\b/gi;
  for (const m of code.matchAll(re)) {
    const start = m.index! + m[1]!.length + m[2]!.length;
    if ((code.slice(0, start).match(/"/g)?.length ?? 0) % 2) continue;
    const afterName = m.index! + m[0].length;
    const rest = code.slice(afterName);
    const open = /^\s*\(/.exec(rest);
    const call = Boolean(m[3]);
    // Sans Call, « x.B2SSetData(1, 2) » n'est pas valide en VBScript avec deux arguments ; avec un seul, les
    // parenthèses font partie de l'argument : on lit comme une instruction.
    const parens = call && Boolean(open);
    const from = parens ? afterName + open![0].length : afterName;
    const end = argumentsEnd(code, from, parens);
    if (end < 0) continue;
    const args = splitArguments(code.slice(from, end));
    const ints = B2S_INT_ONLY[m[5]!.toLowerCase()]?.[args.length];
    if (!ints?.length) continue;
    calls.push({ start, end: parens ? end + 1 : end, call, object: m[4]!, method: m[5]!, args, parens });
  }
  return calls;
}

/**
 * Un appel B2S dont une place « int » reçoit à coup sûr un texte que le plugin ne convertit pas : un texte écrit en clair
 * qui n'est pas un nombre (« "on" », « "" »), ou un texte assemblé (« & », CStr) qui peut ne pas en être un. Un nombre
 * écrit en texte (« "1" ») passe tel quel dans le plugin : rien à corriger.
 */
function refusedB2sArgument(code: string): boolean {
  return code.split('\n').some((line) =>
    b2sCalls(line).some((c) =>
      (B2S_INT_ONLY[c.method.toLowerCase()]?.[c.args.length] ?? []).some((k) => {
        const arg = c.args[k]!.replace(/^\((.*)\)$/, '$1').trim();
        const literal = /^"((?:[^"]|"")*)"$/.exec(arg);
        if (literal) return !/^\s*[+-]?\d+(?:[.,]\d+)?\s*$/.test(literal[1]!);
        return /"[^"]*"\s*&|&\s*"|\bCStr\s*\(/i.test(arg);
      }),
    ),
  );
}

const b2sArgs: CompatRule = {
  id: 'b2sArgs',
  // Repéré dans le texte quand un appel passe à coup sûr un texte à une place « int » (refusedB2sArgument) ; sinon,
  // réclamé par le journal de VPX après une partie (compatFixesFromLog) : un texte venu d'une variable ne se voit qu'à l'exécution.
  found: (code) => refusedB2sArgument(code),
  applicable: (code) => code.split('\n').some((l) => b2sCalls(l).length > 0),
  applied: (text) => new RegExp(`^\\s*function\\s+${B2S_CALL}_Int\\b`, 'im').test(text),
  apply(text) {
    const eol = /\r\n/.test(text) ? '\r\n' : '\n';
    const parts = text.split(/(\r?\n)/);
    const used = new Map<string, { method: string; n: number }>();
    for (let i = 0; i < parts.length; i += 2) {
      const line = parts[i]!;
      const calls = b2sCalls(line);
      if (!calls.length) continue;
      let edited = line;
      for (const c of [...calls].reverse()) {
        const name = `${B2S_CALL}_${c.method}_${c.args.length}`;
        used.set(name.toLowerCase(), { method: c.method, n: c.args.length });
        const args = [c.object, ...c.args].join(', ');
        const replacement = c.call ? `Call ${name}(${args})` : `${name} ${args} `;
        edited = edited.slice(0, c.start) + replacement + edited.slice(c.end).replace(/^\s+/, (s) => (c.call ? s : ''));
      }
      parts[i] = edited;
    }
    if (!used.size) return undefined;
    let out = parts.join('');
    if (out && !/\r?\n$/.test(out)) out += eol;
    const lines = [
      // Un nombre écrit en texte devient un nombre ; tout le reste passe tel quel.
      `Function ${B2S_CALL}_Int(aValue)`,
      `  If VarType(aValue) = vbString Then`,
      `    If IsNumeric(aValue) Then ${B2S_CALL}_Int = CLng(aValue) : Exit Function`,
      `  End If`,
      `  If IsObject(aValue) Then Set ${B2S_CALL}_Int = aValue Else ${B2S_CALL}_Int = aValue`,
      `End Function`,
    ];
    for (const { method, n } of used.values()) {
      const ints = B2S_INT_ONLY[method.toLowerCase()]![n]!;
      const params = Array.from({ length: n }, (_, k) => `a${k}`);
      const values = params.map((p, k) => (ints.includes(k) ? `${B2S_CALL}_Int(${p})` : p));
      lines.push(
        `Sub ${B2S_CALL}_${method}_${n}(aServer, ${params.join(', ')})`,
        // Le fronton refuse encore (texte qui n'est pas un nombre) : le script continue, comme avec le B2S Server d'origine.
        `  On Error Resume Next`,
        `  aServer.${method} ${values.join(', ')}`,
        `End Sub`,
      );
    }
    return out + lines.join(eol) + eol;
  },
  stop: /Failed to convert a parameter in call to B2S_Server\.|Type incompatible: '[\w.]*\.B2S\w+'|Type mismatch: '[\w.]*\.B2S\w+'/i,
};

// ---------- Sub DOF propre au script ----------
//
// Les effets LED d'une table sans ROM viennent de ses appels DOF, recopiés par l'écoute posée dans la Sub DOF de
// controller.vbs (dof-evenements.ts). Un script qui colle sa propre copie de controller.vbs (Stranger Things :
// « Sub DOF(DOFevent, State) » dans la table, controller.vbs jamais chargé) court-circuite cette écoute : 312 appels
// DOF, LED muettes. Le .vbs de Cyber Pinball branche la même écoute en tête de ses Sub DOF et DOFALT, sur la ligne
// de leur déclaration. Inerte hors d'une partie aux LED (variable CYBERPINBALL_DOF_TAP absente).

const dofTapOwnSub: CompatRule = {
  id: 'dofTapOwnSub',
  found: (code) => ownDofSubs(code).some((s) => !s.tapped) && dofCallLines(code) > 0,
  applicable: (code) => ownDofSubs(code).length > 0,
  applied: (text) => new RegExp(`^\\s*sub\\s+${DOF_TAP_TABLE_SUB}\\b`, 'im').test(text) && ownDofSubs(scriptCode(text)).every((s) => s.tapped),
  apply: addTableDofTap,
  stop: /(?!)/,
};

const RULES: readonly CompatRule[] = [vpmInitOnce, vrRoomOnScreens, executeGlobalOnce, timerTextOnce, executeOnce, tablesDirectoryDmd, b2sArgs, dofTapOwnSub];

/** Correctifs que réclament les lignes du journal de VPX d'une partie de la table (erreurs du script, refus d'un plugin). */
export function compatFixesFromLog(lines: readonly string[], code?: string): CompatFix[] {
  return RULES.filter((r) => r.stop.source !== '(?!)' && lines.some((l) => r.stop.test(l)) && (code === undefined || r.applicable(code))).map((r) => r.id);
}

/**
 * Les correctifs que cette version sait repérer. Les lectures de script gardées en cache (app/src/vbs.ts) les notent :
 * une lecture faite avant l'arrivée d'un correctif ne le réclame pas, et le médecin s'y fie sans relire le script
 * (18/11/2026 : executeGlobalOnce publié, jamais appliqué sur une borne dont les lectures dataient de la veille).
 */
export const COMPAT_FIXES: readonly CompatFix[] = RULES.map((r) => r.id);

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
