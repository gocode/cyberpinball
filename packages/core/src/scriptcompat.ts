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
export type CompatFix = 'vpmInitOnce' | 'vrRoomOnScreens' | 'executeGlobalOnce' | 'timerTextOnce';

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
// cet Execute de CyberPinball_TimerCall. Un texte vu une deuxième fois devient une Sub compilée une fois pour toutes
// (« <texte> <argument> », comme Execute le recevait), appelée ensuite sans analyse ; un texte vu une seule fois (valeurs
// qui changent) ne coûte rien de plus qu'avant. Execute agit dans la portée de cvpmTimer.Update : un texte qui nomme une
// de ses variables, un de ses membres, ou qui ouvre ou ferme une procédure, est laissé à Execute, comme avant.

const TIMER_TEXT = 'CyberPinball_TextFile';
const TIMER_CALL = 'CyberPinball_TimerCall';
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
    const q = (s: string) => s.replace(/"/g, '""');
    const lines = [
      // Le texte d'un fichier de VPX, avec ses propres chargements et l'Execute des minuteries corrigés. Sans On Error :
      // un fichier introuvable reste une erreur pour l'appelant, qui la traite comme avant (If Err Then MsgBox…).
      `Function ${TIMER_TEXT}(aFile)`,
      `  Dim text`,
      `  text = GetTextFile(aFile)`,
      `  text = Replace(text, "GetTextFile(", "${TIMER_TEXT}(", 1, -1, vbTextCompare)`,
      `  text = Replace(text, "${q(CORE_TIMER_EXECUTE)}", "If ${TIMER_CALL}(mQue3(ii), mQue2(ii)) = False Then ${q(CORE_TIMER_EXECUTE)}", 1, -1, vbTextCompare)`,
      `  ${TIMER_TEXT} = text`,
      `End Function`,
      `Dim ${TIMER_CALL}_Seen, ${TIMER_CALL}_Unsafe, ${TIMER_CALL}_Count`,
      // True : le rappel a été fait par sa Sub compilée ; False : à Execute de le faire, comme avant.
      `Function ${TIMER_CALL}(aCode, aArg)`,
      `  Dim code, f, name`,
      `  ${TIMER_CALL} = False`,
      `  If VarType(aCode) <> vbString Then Exit Function`,
      `  code = aCode`,
      `  If IsEmpty(${TIMER_CALL}_Seen) Then`,
      `    Set ${TIMER_CALL}_Seen = CreateObject("Scripting.Dictionary")`,
      `    Set ${TIMER_CALL}_Unsafe = New RegExp`,
      `    ${TIMER_CALL}_Unsafe.IgnoreCase = True`,
      `    ${TIMER_CALL}_Unsafe.Pattern = "(^|[^\\w.])(ii|jj|sw|obj|mquecopy|me|mnow|mtimers|mque\\d|mslowupdates|mfastupdates|mresets|mfasttimer|update|fastupdate|reset|inittimer|enableupdate|addresetobj|pulsesw|pulseswitch|addtimer2?|sub|function|class|property|end|exit)(?!\\w)"`,
      `  End If`,
      `  If Not ${TIMER_CALL}_Seen.Exists(code) Then`,
      `    If ${TIMER_CALL}_Seen.Count < 2000 Then ${TIMER_CALL}_Seen.Add code, 1`,
      `    Exit Function`,
      `  End If`,
      `  If IsObject(${TIMER_CALL}_Seen.Item(code)) Then`,
      `    Set f = ${TIMER_CALL}_Seen.Item(code)`,
      `  Else`,
      `    If ${TIMER_CALL}_Seen.Item(code) <> 1 Then Exit Function`,
      `    ${TIMER_CALL}_Seen.Item(code) = 0`,
      `    If ${TIMER_CALL}_Unsafe.Test(code) Then Exit Function`,
      `    ${TIMER_CALL}_Count = ${TIMER_CALL}_Count + 1`,
      `    name = "${TIMER_CALL}_" & ${TIMER_CALL}_Count`,
      `    On Error Resume Next`,
      `    ExecuteGlobal "Sub " & name & "(CyberPinball_Arg)" & vbNewLine & code & " CyberPinball_Arg " & vbNewLine & "End Sub"`,
      `    If Err.Number = 0 Then Set f = GetRef(name)`,
      `    If Err.Number <> 0 Then Err.Clear : Exit Function`,
      `    On Error Goto 0`,
      `    Set ${TIMER_CALL}_Seen.Item(code) = f`,
      `  End If`,
      `  ${TIMER_CALL} = True`,
      `  Call f(aArg)`,
      `End Function`,
    ];
    return out + lines.join(eol) + eol;
  },
  // Aucun message de VPX : la partie s'arrête un instant, sans erreur.
  stop: /(?!)/,
};

const RULES: readonly CompatRule[] = [vpmInitOnce, vrRoomOnScreens, executeGlobalOnce, timerTextOnce];

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
