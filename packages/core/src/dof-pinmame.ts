// Effets LED de Cyber Pinball sur une table à ROM : les bobines de PinMAME.
//
// Constat du 27/11/2026 (Apollo 13, Sega 1995, effets de Cyber Pinball à la place de DOF) : 126 événements en
// deux minutes, dont 121 flippers. Sur une table à ROM, ce qui se passe (éjection, knocker, flashers, rampe qui
// se lève, bille servie) est commandé par la ROM : ses bobines (solénoïdes), que core.vbs reçoit de PinMAME
// (`Controller.ChangedSolenoids`, boucle de `PinMAMETimer_Timer`) et passe aux `SolCallback(n)` du script.
// Le script n'appelle presque jamais DOF pour cela : c'est le plugin DOF de VPX qui lit les sorties de la ROM.
//
// Une ligne ajoutée en tête de cette boucle de core.vbs recopie chaque changement d'état d'une bobine dans un
// fichier voisin de celui de controller.vbs (`<fichier d'écoute>.pinmame`, jamais le même : deux poignées
// d'ajout sur un fichier s'écraseraient) ; le rôle de chaque bobine est lu dans le script de la table
// (`SolCallback(5) = "SolRocketEject"`), avec les mêmes mots que les événements DOF.
//
// Sécurité : comme l'écoute de controller.vbs, rien tant que CYBERPINBALL_DOF_TAP n'est pas posée, aucune
// erreur levée (On Error Resume Next dans la Sub), seulement des lignes ajoutées à un fichier.

import { DOF_TAP_ENV } from './dof-evenements';
import { dofKindOf, dofSideOf, scriptConstants, type DofEventClass, type DofEventKind } from './dof-evenements-script';

/** Repère de la retouche de core.vbs (version comprise : une retouche plus ancienne est refaite). */
export const PINMAME_TAP_MARK = "' CyberPinball-pinmame-tap v1";
const SUB = 'CyberPinball_SolTap';
/** Suffixe du fichier des bobines, à côté du fichier d'écoute de controller.vbs. */
export const PINMAME_TAP_SUFFIX = '.pinmame';

/** La Sub ajoutée à core.vbs : « P,bobine,état,secondes » à chaque changement d'état d'une bobine. */
function solSubLines(): string[] {
  return [
    `${PINMAME_TAP_MARK}: copy of the PinMAME solenoid changes for Cyber Pinball (variable ${DOF_TAP_ENV})`,
    `Dim ${SUB}File, ${SUB}Ready, ${SUB}Prev(255)`,
    `Sub ${SUB}(n, v)`,
    '\tOn Error Resume Next',
    `\tIf ${SUB}Ready = "no" Then Exit Sub`,
    `\tIf ${SUB}Ready = "" Then`,
    `\t\t${SUB}Ready = "no"`,
    '\t\tDim p : p = CreateObject("WScript." & "Shell").Environment("Process").Item("' + DOF_TAP_ENV + '")',
    `\t\tIf p <> "" Then Set ${SUB}File = CreateObject("Scripting.FileSystemObject").OpenTextFile(p & "${PINMAME_TAP_SUFFIX}", 8, True) : If Err.Number = 0 Then ${SUB}Ready = "yes"`,
    `\t\tIf ${SUB}Ready <> "yes" Then Exit Sub`,
    '\tEnd If',
    '\tDim k, s : k = CLng(n)',
    '\tIf k < 0 Or k > 255 Then Exit Sub',
    // Bobines modulées (UseModSol >= 2) : 0..255.
    '\ts = CDbl(v) : If UseModSol >= 2 Then s = s / 255',
    '\tIf s >= 0.5 Then s = 1 Else s = 0',
    `\tIf ${SUB}Prev(k) = s Then Exit Sub`,
    `\t${SUB}Prev(k) = s`,
    `\t${SUB}File.WriteLine "P," & k & "," & s & "," & Replace(CStr(Round(Timer, 3)), ",", ".")`,
    'End Sub',
  ];
}

/** Retire une retouche de core.vbs (toutes versions) : lignes marquées et Sub ajoutée. */
export function removePinmameTap(text: string): string {
  const eol = /\r\n/.test(text) ? '\r\n' : '\n';
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((l) => l.startsWith("' CyberPinball-pinmame-tap"));
  const kept = (start < 0 ? lines : lines.slice(0, start)).filter((l) => !l.includes("' CyberPinball-pinmame-tap"));
  while (kept.length && kept[kept.length - 1] === '') kept.pop();
  return kept.join(eol) + eol;
}

/**
 * core.vbs avec l'écoute des bobines : un appel en tête de chaque boucle `For x = 0 To UBound(ChgSol)` (le
 * changement d'état est jugé dans la Sub, qui garde le précédent : ni la boucle ni ses `On Error` ne changent),
 * et la Sub ajoutée à la fin. Idempotent. undefined si aucune boucle sur `ChgSol` (un autre core.vbs : on n'y
 * touche pas).
 */
export function addPinmameTap(text: string): string | undefined {
  if (text.includes(PINMAME_TAP_MARK)) return text;
  if (text.includes("' CyberPinball-pinmame-tap")) return addPinmameTap(removePinmameTap(text));
  const eol = /\r\n/.test(text) ? '\r\n' : '\n';
  let found = 0;
  const lines = text.split(/\r?\n/).flatMap((line) => {
    const loop = /^(\s*)For\s+(\w+)\s*=\s*0\s+To\s+UBound\s*\(\s*(ChgSol)\s*\)\s*$/i.exec(line);
    if (!loop) return [line];
    found++;
    const [, indent, i, arr] = loop;
    return [line, `${indent}\t${SUB} ${arr}(${i}, 0), ${arr}(${i}, 1) ${PINMAME_TAP_MARK}`];
  });
  if (!found) return undefined;
  const out = lines.join(eol);
  return out + (/\r?\n$/.test(out) ? '' : eol) + solSubLines().join(eol) + eol;
}

/** Un changement d'état d'une bobine de la ROM. */
export interface PinmameSolenoid {
  number: number;
  /** 1 alimentée, 0 coupée. */
  state: number;
  /** Secondes depuis minuit (Timer de VBS), même horloge que les événements DOF. */
  at: number;
}

/** Une ligne « P,bobine,état,secondes » ; undefined si elle est incomplète ou étrangère. */
export function parsePinmameLine(line: string): PinmameSolenoid | undefined {
  const m = /^P,(\d{1,3}),([01]),(\d+(?:\.\d+)?)$/.exec(line.trim());
  return m ? { number: Number(m[1]), state: Number(m[2]), at: Number(m[3]) } : undefined;
}

/** Les bobines d'un morceau du fichier ; `rest` : fin sans saut de ligne, à rejoindre au morceau suivant. */
export function parsePinmameChunk(chunk: string): { solenoids: PinmameSolenoid[]; rest: string } {
  const cut = chunk.lastIndexOf('\n');
  const complete = cut < 0 ? '' : chunk.slice(0, cut);
  const solenoids: PinmameSolenoid[] = [];
  for (const l of complete.split(/\r?\n/)) {
    const s = parsePinmameLine(l);
    if (s) solenoids.push(s);
  }
  return { solenoids, rest: cut < 0 ? chunk : chunk.slice(cut + 1) };
}

/** Bobines qui ne font que bouger un jouet ou un passage : un petit effet, jamais celui d'une bille perdue. */
const MOVING = /post|diverter|magnet|motor|shake|wobble|gate|lift/i;
const FLASH = /f_?lamp|flash|strobe|beacon/i;

/** Corps des Sub et Function du script : nom (minuscules) → texte (40 lignes au plus). */
function subBodies(script: string): Map<string, string> {
  const out = new Map<string, string>();
  let name = '';
  let body: string[] = [];
  for (const line of script.split(/\r?\n/)) {
    const head = /^\s*(?:(?:Public|Private)\s+)?(?:Sub|Function)\s+(\w+)/i.exec(line);
    if (head) {
      name = head[1]!.toLowerCase();
      body = [];
      continue;
    }
    if (!name) continue;
    if (/^\s*End\s+(?:Sub|Function)\b/i.test(line)) {
      out.set(name, body.join('\n'));
      name = '';
      continue;
    }
    if (body.length < 40) body.push(line.replace(/'.*$/, ''));
  }
  return out;
}

function solenoidKind(callback: string, body: string): DofEventKind {
  if (FLASH.test(callback)) return 'flasher';
  const named = dofKindOf(callback);
  if (named === 'flipper' || named === 'flasher') return named;
  // « SolDrainPost » lève un poteau, ce n'est pas une bille perdue ; « SolRampLift » reste une rampe.
  if (MOVING.test(callback) && named !== 'ramp') return 'other';
  if (named && named !== 'mech') return named;
  if (named === 'mech') return 'other';
  if (FLASH.test(body)) return 'flasher';
  const inBody = dofKindOf(body);
  return inBody && inBody !== 'mech' && inBody !== 'gi' ? inBody : 'other';
}

/**
 * Le rôle de chaque bobine de la ROM, lu dans les `SolCallback(n) = "…"` et `SolModCallback(n) = "…"` du script :
 * le nom de la Sub appelée (« SolRocketEject » : une éjection), sinon son corps. Flashers tenus (allumés puis
 * éteints) ; une bobine sans rôle lisible a un petit effet (« other ») ; une bobine sans callback n'est pas
 * dans la table (rien ne bouge sur la table, rien sur les bandes).
 */
export function classifyRomSolenoids(script: string): Map<number, DofEventClass> {
  const consts = scriptConstants(script);
  const bodies = subBodies(script);
  const out = new Map<number, DofEventClass>();
  const re = /^\s*Sol(?:Mod)?Call[Bb]ack\s*\(\s*(\w+)\s*\)\s*=\s*"([^"]*)"/gim;
  for (const m of script.matchAll(re)) {
    const arg = m[1]!;
    const number = /^\d+$/.test(arg) ? Number(arg) : consts.get(arg.toLowerCase());
    const callback = m[2]!.trim();
    if (number === undefined || number < 0 || number > 255 || !callback) continue;
    const first = /^(\w+)/.exec(callback)?.[1]?.toLowerCase() ?? '';
    const kind = solenoidKind(callback, bodies.get(first) ?? '');
    const prev = out.get(number);
    // Deux callbacks pour une bobine (SolCallback et SolModCallback) : le rôle reconnu l'emporte sur « other ».
    if (prev && prev.kind !== 'other') continue;
    const side = dofSideOf(callback) ?? 'center';
    out.set(number, kind === 'flasher' ? { kind, side, held: true } : { kind, side });
  }
  return out;
}

/**
 * Plusieurs sources disent la même chose (le son « Bumpers_Top_2 » et la bobine du bumper, ou l'appel DOF du
 * script) : un seul effet. Un événement est écarté si une AUTRE source a donné le même rôle dans la fenêtre ;
 * les répétitions d'une même source passent (la scène les amortit). Horloge : secondes de VBS (Timer).
 */
export function createEventMerger(windowSec = 0.15): (kind: DofEventKind, source: string, at: number) => boolean {
  const last = new Map<DofEventKind, { source: string; at: number }>();
  return (kind, source, at) => {
    const prev = last.get(kind);
    if (prev && prev.source !== source && Math.abs(at - prev.at) < windowSec) return false;
    last.set(kind, { source, at });
    return true;
  };
}
