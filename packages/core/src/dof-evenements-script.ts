// Ce que veut dire chaque événement DOF d'une table sans ROM, lu dans son script.
//
// Essai sur une borne, 25/11/2026 : sur les tables sans ROM, « plein d'événements pas pris en compte » — seuls 101 à 104
// (flippers, slingshots) avaient un effet. Les numéros des autres événements changent d'une table à l'autre,
// mais le script dit à quoi ils servent : la Sub qui les appelle (Bumper1_Hit, Drain_Hit, SolAutofire), le
// son de SoundFXDOF (« fx_bumper », « fx_knocker »), la touche testée autour (LeftFlipperKey, PlungerKey),
// le jouet DOF (DOFFlippers, DOFKnocker) ou le nom de la constante (Const dofJackpot = 150). Rien n'est
// propre à une borne ni à une table : seuls les mots du script comptent.

export type DofEventKind =
  | 'flipper'
  | 'sling'
  | 'bumper'
  | 'launch'
  | 'ball-start'
  | 'drain'
  | 'kicker'
  | 'target'
  | 'spinner'
  | 'ramp'
  | 'rollover'
  | 'award'
  | 'jackpot'
  | 'multiball'
  | 'tilt'
  | 'game-start'
  | 'game-over'
  | 'flasher'
  | 'gi'
  /** Moteurs, shaker, aimants, tirette du lanceur tenue : rien sur les bandes. */
  | 'mech'
  | 'other';

export type DofSide = 'left' | 'right' | 'center';

export interface DofEventClass {
  kind: DofEventKind;
  side: DofSide;
  /**
   * Allumé puis éteint par le script (DOFOn puis DOFOff), pas une impulsion : un état qui dure, comme la bille
   * posée au lanceur (« DOF 208, DOFOn » à son arrivée, « DOFOff » quand elle part). Pour un lanceur, l'envoi de
   * la bille est alors l'extinction de l'événement, pas son allumage.
   */
  held?: boolean;
}

/** Mots du script, du plus précis au plus vague : le premier qui répond l'emporte. */
const KEYWORDS: readonly [DofEventKind, RegExp][] = [
  ['tilt', /tilt/i],
  ['game-over', /game_?over|end_?of_?game|game_?end|gameended/i],
  ['game-start', /start_?(?:new_?)?game|new_?game|game_?start|reset_?for_?new_?game/i],
  ['drain', /drain|outhole|end_?of_?ball|ball_?(?:end|over|lost)/i],
  ['multiball', /multi_?ball|\bmball/i],
  ['jackpot', /jackpot/i],
  ['award', /knock|extra_?ball|replay|special|match_?win|award/i],
  ['launch', /plunger|launch|shooter|auto_?(?:fire|plunge)|ball_?shoot/i],
  ['ball-start', /ball_?release|release_?ball|trough|serve_?ball|new_?ball|add_?ball|create_?ball/i],
  ['flipper', /flip/i],
  ['sling', /sling/i],
  ['bumper', /bumper|\bjet|pop_?bump/i],
  ['spinner', /spinner/i],
  ['kicker', /kick|saucer|scoop|vuk|\bhole|eject|\block|popper|capture|cannon/i],
  ['target', /target|\bdrop|standup|\bbank/i],
  ['ramp', /ramp|habitrail|wire_?form/i],
  ['rollover', /rollover|lane|gate|trigger|chime|bell|spot/i],
  ['flasher', /flash|strobe|beacon/i],
  ['gi', /(?:^|[^a-z])gi(?:[^a-z]|$)|general_?illum|\bgi_?(?:on|off)|illumination/i],
  ['mech', /shaker|gear|motor|\bfan\b|magnet|diverter|post|wobble|toy/i],
];

/** Jouet DOF du 4e argument de SoundFXDOF (constantes de controller.vbs). */
const TOYS: Readonly<Record<string, DofEventKind>> = {
  dofflippers: 'flipper',
  dofknocker: 'award',
  dofchimes: 'rollover',
  dofbell: 'rollover',
  dofbeacon: 'flasher',
  dofshaker: 'mech',
  dofgear: 'mech',
};

/** Numéros communs du configtool (dof-evenements.ts, DOF_STANDARD_EVENTS), quand le script ne dit rien de plus. */
const STANDARD: Readonly<Record<number, DofEventClass>> = {
  101: { kind: 'flipper', side: 'left' },
  102: { kind: 'flipper', side: 'right' },
  103: { kind: 'sling', side: 'left' },
  104: { kind: 'sling', side: 'right' },
};

/** Le côté que nomme un texte : Left/Right en clair, ou L/R accolé à Flipper, Sling, Kicker… */
export function dofSideOf(text: string): DofSide | undefined {
  if (/left|gauche|links/i.test(text)) return 'left';
  if (/right|droit|rechts/i.test(text)) return 'right';
  // L et R en majuscule seulement (SolLFlipper), le reste du mot dans n'importe quelle casse.
  const parts = /(flip(?:per)?|sling(?:shot)?|kick(?:er|back)?|outlane|inlane|bumper|lane|ramp)/.source.replace(/[a-z]/g, (c) => `[${c}${c.toUpperCase()}]`);
  if (new RegExp(`L_?${parts}`).test(text) || new RegExp(`(?:^|[^a-z])l_?${parts}`, 'i').test(text) || new RegExp(`${parts}_?L(?![a-z])`, 'i').test(text)) return 'left';
  if (new RegExp(`R_?${parts}`).test(text) || new RegExp(`(?:^|[^a-z])r_?${parts}`, 'i').test(text) || new RegExp(`${parts}_?R(?![a-z])`, 'i').test(text)) return 'right';
  return undefined;
}

function kindOf(text: string): DofEventKind | undefined {
  if (!text) return undefined;
  for (const [kind, re] of KEYWORDS) if (re.test(text)) return kind;
  return undefined;
}

/** Une ligne sans commentaire (l'apostrophe hors chaîne, ou Rem). */
function stripComment(line: string): string {
  let inString = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') inString = !inString;
    else if (c === "'" && !inString) return line.slice(0, i);
  }
  return /^\s*rem\b/i.test(line) ? '' : line;
}

interface Call {
  /** Numéro, ou nom d'une constante à résoudre. */
  arg: string;
  sound?: string;
  toy?: string;
  /** Second argument : DOFOn, DOFOff, DOFPulse, 0, 1, 2… */
  state?: string;
}

/** Les appels DOF d'une instruction : DOF n, s / DOF(n, s) / DOFALT n, s / SoundFXDOF("son", n, s, jouet). */
function callsIn(statement: string): Call[] {
  const calls: Call[] = [];
  const fx = /SoundFXDOF\s*\(\s*(?:"([^"]*)"|([^,()]+(?:\([^()]*\))?))\s*,\s*(\w+)\s*,\s*(\w+)\s*,\s*(\w+)/gi;
  for (const m of statement.matchAll(fx)) calls.push({ arg: m[3]!, sound: m[1] ?? m[2]?.trim(), state: m[4], toy: m[5] });
  const plain = /(?:^|[^\w.])DOF(?:ALT)?\s*\(?\s*(\w+)\s*,\s*(\w+)/gi;
  for (const m of statement.replace(fx, '').matchAll(plain)) calls.push({ arg: m[1]!, state: m[2] });
  return calls;
}

const STATE_ON = /^(?:dofon|1|true)$/i;
const STATE_OFF = /^(?:dofoff|0|false)$/i;

/**
 * Le type et le côté de chaque événement DOF appelé par le script d'une table (numéro → classe). Un
 * numéro appelé à plusieurs endroits prend le type qui revient le plus souvent ; un numéro dont rien
 * ne dit le rôle est « other » (un petit effet quand même : il se passe quelque chose à chaque événement).
 */
export function classifyDofScript(script: string): Map<number, DofEventClass> {
  const consts = new Map<string, number>();
  for (const m of script.matchAll(/\bConst\s+([^\r\n:']+)/gi)) {
    for (const part of m[1]!.split(',')) {
      const c = /^\s*(\w+)\s*=\s*(\d{1,4})\s*$/.exec(part);
      if (c) consts.set(c[1]!.toLowerCase(), Number(c[2]));
    }
  }
  const votes = new Map<number, Map<string, number>>();
  const states = new Map<number, { on: boolean; off: boolean }>();
  let sub = '';
  const conds: string[] = [];
  for (const raw of script.split(/\r?\n/)) {
    const line = stripComment(raw);
    const head = /^\s*(?:(?:Public|Private)\s+)?(?:Sub|Function)\s+(\w+)/i.exec(line);
    if (head) {
      sub = head[1]!;
      conds.length = 0;
    }
    if (/^\s*End\s+(?:Sub|Function)\b/i.test(line)) {
      sub = '';
      conds.length = 0;
      continue;
    }
    // Conditions des blocs If / Select Case : « If keycode = LeftFlipperKey Then » au-dessus d'un DOF.
    if (/^\s*If\b.*\bThen\s*$/i.test(line) || /^\s*Select\s+Case\b/i.test(line)) conds.push(line.trim());
    else if (/^\s*(?:ElseIf\b.*\bThen|Case\b)/i.test(line) && conds.length) conds[conds.length - 1] = line.trim();
    else if (/^\s*Else\s*$/i.test(line) && conds.length) conds[conds.length - 1] = '';
    else if (/^\s*End\s+(?:If|Select)\b/i.test(line)) conds.pop();
    if (head && /^\s*(?:(?:Public|Private)\s+)?Sub\s+DOF(?:ALT)?\b/i.test(line)) continue; // controller.vbs
    for (const call of callsIn(line)) {
      const number = /^\d+$/.test(call.arg) ? Number(call.arg) : consts.get(call.arg.toLowerCase());
      if (number === undefined || number <= 0) continue;
      const st = states.get(number) ?? { on: false, off: false };
      if (call.state && STATE_ON.test(call.state)) st.on = true;
      if (call.state && STATE_OFF.test(call.state)) st.off = true;
      states.set(number, st);
      const statement = line.replace(/\w*DOF\w*/gi, ' ');
      const constName = /^\d+$/.test(call.arg) ? '' : call.arg.replace(/^dof_?/i, '');
      const cond = conds.join(' ');
      const keyRe = /(?:Left|Right)FlipperKey|PlungerKey|StartGameKey|LeftMagnaSave|RightMagnaSave/i;
      const keyed = (keyRe.exec(statement) ?? keyRe.exec(cond))?.[0];
      // Tirette du lanceur tenue (KeyDown) : rien ; relâchée (KeyUp) : la bille part.
      const sources = [keyed ? (/plunger/i.test(keyed) && /keydown/i.test(sub) ? 'mech' : keyed.replace(/Key$/i, '')) : '', constName, call.sound ?? '', statement, sub];
      let found: DofEventClass | undefined;
      for (const text of sources) {
        const kind = text === 'mech' ? 'mech' : kindOf(text);
        if (!kind) continue;
        found = { kind, side: dofSideOf(text) ?? sources.map((s) => dofSideOf(s)).find(Boolean) ?? STANDARD[number]?.side ?? 'center' };
        break;
      }
      const toy = call.toy ? TOYS[call.toy.toLowerCase()] : undefined;
      found ??= toy ? { kind: toy, side: STANDARD[number]?.side ?? sources.map((s) => dofSideOf(s)).find(Boolean) ?? 'center' } : STANDARD[number] ?? { kind: 'other', side: 'center' };
      const key = `${found.kind}/${found.side}`;
      const v = votes.get(number) ?? new Map<string, number>();
      v.set(key, (v.get(key) ?? 0) + 1);
      votes.set(number, v);
    }
  }
  const out = new Map<number, DofEventClass>();
  for (const [number, v] of votes) {
    // Le plus fréquent ; « other » ne l'emporte que seul.
    const best = [...v.entries()].sort((a, b) => Number(a[0].startsWith('other/')) - Number(b[0].startsWith('other/')) || b[1] - a[1])[0]![0];
    const [kind, side] = best.split('/') as [DofEventKind, DofSide];
    const st = states.get(number);
    out.set(number, st?.on && st.off ? { kind, side, held: true } : { kind, side });
  }
  return out;
}

/** La classe d'un événement reçu : lue dans le script, sinon les numéros communs, sinon « other ». */
export function dofEventClass(classes: ReadonlyMap<number, DofEventClass> | undefined, number: number): DofEventClass {
  return classes?.get(number) ?? STANDARD[number] ?? { kind: 'other', side: 'center' };
}
