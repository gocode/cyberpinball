// État de jeu en direct d'une partie entre amis (essai réel du 30/10/2026 : crédits mis à la main,
// inégaux ; rien sur les autres pendant la partie ; fin de partie floue ; score perdu si l'on quitte
// pendant les initiales). VPX ne publie rien de tout cela hors du script de la table : Cyber
// Pinball ajoute au script, dans le double de la table seulement (tabledouble.ts), un relevé et un
// départ automatique. Le script de la table habituelle n'est jamais touché.
//
// Pour les tables originales bâties sur le socle de script commun (Game of Thrones, GOTG, The
// Goonies, The Matrix : Score(), CurrentPlayer, PlayersPlayingGame, BallsRemaining(),
// BallsPerGame, bGameInPlay) :
// - Relevé : un élément que le script n'utilise jamais (un mur, une lampe) prête son minuteur
//   intégré ; quatre fois par seconde, l'état part dans un petit fichier du double, quand il change.
// - Boutons : la procédure <table>_KeyDown (et KeyUp) est enveloppée. Le monnayeur est toujours
//   ignoré ; Start et la barre de verrouillage, hors d'une partie en cours (pas d'autre partie après
//   la nôtre). Pendant la partie, Start passe : il valide les lettres des initiales (Game of Thrones)
//   ou sert au redémarrage rapide ; un joueur ajouté par Start se voit dans le relevé (joueurs > 1),
//   et le score passe hors classement (live-game.ts).
// - Départ : le script met lui-même un crédit, puis appuie sur Start, quand la table est prête ;
//   si la partie ne part pas, il recommence (quatre fois au plus).
//
// Pour les tables à ROM (PinMAME), l'état de jeu est dans la mémoire de la ROM : le relevé la lit
// par Controller.NVRAM (les octets mêmes du .nv), aux adresses de la section « game_state » de sa
// carte (Pinball Memory Maps, ballcount.ts) : scores, joueur en cours, bille, fin de partie, nombre
// de joueurs ; billes par partie dans ses réglages. Relevé sur la libpinmame de la borne le
// 30/10/2026 (T2, t2_l8) :
// - au démarrage, la mémoire montre trois secondes la partie d'avant (VPX quitté en pleine partie),
//   puis la ROM l'efface : une partie ne compte qu'après notre Start, et le départ attend la table
//   en attente (fin de partie vraie) ;
// - la fin de partie passe à vrai avant la saisie des initiales ; le tableau des records n'est
//   écrit qu'après (jusqu'à une minute et demie plus tard) : tant qu'un score de la partie bat la
//   dernière place sans y être entré, la partie reste en cours pour le relevé (Start passe, il
//   valide les lettres), deux minutes au plus ;
// - les touches passent par vpmKeyDown : un crédit pris 750 ms après la touche, Start tenu une
//   demi-seconde (la ROM lit ses contacts, un appui sans durée ne se voit pas).
// Seules les ROM dont la carte met tout cela dans la NVRAM ont un relevé : sur Williams WPC, toute
// la RAM est la NVRAM ; sur Stern SAM, joueur, bille et fin de partie sont en RAM principale, hors
// de portée du script. Le banc l'a confirmé sur Star Trek (st_161h) et The Walking Dead
// (twd_160h) : scores et nombre de joueurs se lisent en direct dans la NVRAM, un compteur de billes
// s'y trouve aussi (hors carte), mais il garde la bille d'une partie coupée jusqu'à la partie
// suivante, et aucun mot n'y dit « partie en cours » d'une partie à l'autre (un candidat de la
// première partie est resté à 0 pendant la seconde) : ni départ sûr, ni fin sûre, pas de relevé.
// Une table qui n'a ni ce socle ni cette carte n'a pas d'état en direct : la partie se joue comme
// avant.

import { romBallsEntry, type RomMemory } from './ballcount';

/** Ce que le relevé écrit, une ligne « clé=valeur;… ». */
export interface LiveGameState {
  /** Partie en cours dans la table. */
  inGame: boolean;
  /** Une partie a commencé depuis le lancement (inGame passé à vrai au moins une fois). */
  started: boolean;
  players: number;
  player: number;
  /** Bille en cours, de 1 à `balls`. */
  ball: number;
  balls: number;
  /** Score du joueur en cours. */
  score: number;
}

/** Le relevé est-il possible : le socle de script commun, et ses procédures de touches. */
const NEEDED = [/\bDim\s+Score\s*\(/i, /\bCurrentPlayer\b/i, /\bPlayersPlayingGame\b/i, /\bBallsRemaining\s*\(/i, /\bBallsPerGame\b/i, /\bbGameInPlay\b/i];

/** Types d'éléments au minuteur intégré qu'on peut emprunter : mur, lampe. */
const TIMER_HOSTS = [0, 7];

export type LiveHook = { ok: true; script: string; element: string; table: string; source: 'script' | 'rom' } | { ok: false; reason: string };

// ---------------------------------------------------------------------------
// La mémoire d'une ROM

/** Une valeur de la NVRAM : sa place dans Controller.NVRAM (le .nv) et son codage. */
interface NvField {
  at: number;
  length: number;
  bcd: boolean;
  little: boolean;
  mask?: number;
  /** Booléen : vrai si non nul (après le masque), inversé si `invert`. */
  bool?: { invert: boolean };
}

/** Ce que le relevé lit dans la NVRAM d'une ROM. */
export interface RomLivePlan {
  /** Score de chaque joueur, du premier au dernier. */
  scores: NvField[];
  player: NvField;
  ball: NvField;
  over: NvField;
  players?: NvField;
  balls?: NvField;
  /** Les scores du tableau des records (la saisie des initiales finie, le score y est). */
  board: NvField[];
  /** Taille de NVRAM qu'il faut au moins. */
  size: number;
}

interface Descriptor {
  label?: unknown;
  start?: unknown;
  length?: unknown;
  encoding?: unknown;
  endian?: unknown;
  nibble?: unknown;
  mask?: unknown;
  invert?: unknown;
}

const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && /^(0x[0-9a-f]+|\d+)$/i.test(v) ? Number(v) : undefined);

/**
 * Ce que le relevé peut lire dans la NVRAM d'une ROM, d'après sa carte ; ou la raison (les valeurs
 * de « game_state » absentes, hors de la NVRAM, ou d'un codage inconnu).
 */
export function romLivePlan(memory: RomMemory): { ok: true; plan: RomLivePlan } | { ok: false; reason: string } {
  const map = memory.map as RomMemory['map'] & { game_state?: Record<string, unknown>; high_scores?: { score?: Descriptor }[] };
  const state = map.game_state;
  if (!state || typeof state !== 'object') return { ok: false, reason: 'carte sans état de jeu (game_state)' }; // i18n-ignore : journal
  const nvram = (memory.platform.memory_layout ?? []).filter((r) => r.type === 'nvram');
  const region = nvram.length === 1 && (nvram[0]!.nibble ?? 'both') === 'both' ? { base: num(nvram[0]!.address), size: num(nvram[0]!.size) } : undefined;
  if (region?.base === undefined || region.size === undefined) return { ok: false, reason: 'carte sans NVRAM lisible' }; // i18n-ignore : journal
  const little = memory.platform.endian === 'little';
  let size = 0;
  const field = (d: unknown, kind: 'number' | 'bool'): NvField | undefined => {
    if (!d || typeof d !== 'object') return undefined;
    const e = d as Descriptor;
    const start = num(e.start);
    const length = num(e.length) ?? 1;
    if (start === undefined || length < 1 || length > 8 || (e.nibble ?? 'both') !== 'both') return undefined;
    const at = start - region.base!;
    if (at < 0 || at + length > region.size!) return undefined;
    const mask = num(e.mask);
    const encoding = e.encoding;
    if (kind === 'bool' ? encoding !== 'bool' : encoding !== 'int' && encoding !== 'bcd') return undefined;
    size = Math.max(size, at + length);
    return {
      at,
      length,
      bcd: encoding === 'bcd',
      little: (e.endian ?? (little ? 'little' : 'big')) === 'little',
      ...(mask !== undefined ? { mask } : {}),
      ...(kind === 'bool' ? { bool: { invert: e.invert === true } } : {}),
    };
  };
  const scores = Array.isArray(state.scores) ? state.scores.map((s) => field(s, 'number')) : [];
  const player = field(state.current_player, 'number');
  const ball = field(state.current_ball, 'number');
  const over = field(state.game_over, 'bool');
  const missing = [...(!scores.length || scores.some((s) => !s) ? ['scores'] : []), ...(player ? [] : ['current_player']), ...(ball ? [] : ['current_ball']), ...(over ? [] : ['game_over'])];
  if (missing.length) return { ok: false, reason: `état de jeu hors de la NVRAM ou illisible (${missing.join(', ')})` }; // i18n-ignore : journal
  const players = field(state.player_count, 'number');
  const ballsEntry = romBallsEntry(memory);
  const balls = field(ballsEntry, 'number');
  const board = (Array.isArray(map.high_scores) ? map.high_scores : []).map((h) => field(h?.score, 'number')).filter((f): f is NvField => !!f);
  return { ok: true, plan: { scores: scores as NvField[], player: player!, ball: ball!, over: over!, ...(players ? { players } : {}), ...(balls ? { balls } : {}), board, size } };
}

/** L'expression VBScript qui lit une valeur dans `nv` (le tableau de Controller.NVRAM). */
function read(f: NvField): string {
  const raw = `CyberPinball_Rd(nv, ${f.at}, ${f.length}, ${f.bcd ? 'True' : 'False'}, ${f.little ? 'True' : 'False'})`;
  const masked = f.mask !== undefined ? `(${raw} And ${f.mask})` : raw;
  if (!f.bool) return masked;
  return f.bool.invert ? `(${masked} = 0)` : `(${masked} <> 0)`;
}

// ---------------------------------------------------------------------------
// Le script du double

/**
 * Le script du double, avec le relevé et le départ automatique ; `stateFile` : le fichier où le
 * relevé écrit (dans le double). `elements` : ceux de la table (readVpxElements). `rom` : la carte
 * de la ROM que joue la table (le jeu chargé), pour une table à ROM (romLivePlan).
 */
export function liveStateHook(script: string, elements: readonly { type: number; name: string }[], stateFile: string, rom?: RomMemory): LiveHook {
  const original = NEEDED.every((re) => re.test(script));
  let plan: RomLivePlan | undefined;
  if (!original) {
    if (!rom) return { ok: false, reason: 'script hors du socle commun (Score, CurrentPlayer, BallsRemaining, bGameInPlay)' }; // i18n-ignore : journal
    if (!/\bController\b/.test(script) || !/\bvpmKeyDown\s*\(/i.test(script)) return { ok: false, reason: 'table à ROM sans Controller ni vpmKeyDown' }; // i18n-ignore : journal
    const planned = romLivePlan(rom);
    if (!planned.ok) return { ok: false, reason: `carte de la ROM : ${planned.reason}` }; // i18n-ignore : journal
    plan = planned.plan;
  }
  const down = /^([ \t]*)Sub\s+(\w+)_KeyDown\s*\(\s*(?:ByVal\s+)?(\w+)\s*\)/im.exec(script);
  if (!down) return { ok: false, reason: 'pas de procédure _KeyDown' }; // i18n-ignore : journal
  const table = down[2]!;
  const up = new RegExp(`^([ \\t]*)Sub\\s+${table}_KeyUp\\s*\\(\\s*(?:ByVal\\s+)?(\\w+)\\s*\\)`, 'im').exec(script);
  if (/\bCyberPinball_OrigKeyDown\b/.test(script)) return { ok: false, reason: 'script déjà complété' }; // i18n-ignore : journal
  // Un élément dont le nom n'apparaît nulle part dans le script : son minuteur est libre.
  // Un nom compte aussi par ses événements (« Wall1_Hit », « PinCab_Floor_Timer ») : chaque préfixe avant un « _ ».
  const words = new Set<string>();
  for (const word of script.toLowerCase().match(/\w+/g) ?? []) {
    words.add(word);
    for (let i = word.indexOf('_'); i > 0; i = word.indexOf('_', i + 1)) words.add(word.slice(0, i));
  }
  const host = elements.find((e) => TIMER_HOSTS.includes(e.type) && /^[A-Za-z]\w*$/.test(e.name) && !words.has(e.name.toLowerCase()));
  if (!host) return { ok: false, reason: 'aucun élément libre pour le minuteur' }; // i18n-ignore : journal
  if (/"/.test(stateFile) || /[\r\n]/.test(stateFile)) return { ok: false, reason: 'chemin du relevé invalide' }; // i18n-ignore : journal
  let text = script.replace(down[0], `${down[1]}Sub CyberPinball_OrigKeyDown(ByVal ${down[3]})`);
  if (up) text = text.replace(up[0], `${up[1]}Sub CyberPinball_OrigKeyUp(ByVal ${up[2]})`);
  const eol = /\r\n/.test(script) ? '\r\n' : '\n';
  const e = host.name;
  const block = plan ? romBlock(plan, e, table, !!up, stateFile) : scriptBlock(e, table, !!up, stateFile);
  return { ok: true, script: text.replace(/\s*$/, '') + eol + block.join(eol), element: e, table, source: plan ? 'rom' : 'script' };
}

const HEADER = [
  '',
  "' ---- Cyber Pinball : partie entre amis. Ajouté dans le double de la table pour cette partie seulement ;", // i18n-ignore : commentaire du script ajouté à la table
  "' ---- la table habituelle et son script ne sont jamais modifiés.", // i18n-ignore : commentaire du script ajouté à la table
];

/** Les touches de la table enveloppées : le monnayeur ignoré, Start et la barre hors partie (`inGame` : l'expression « partie en cours »). */
function keyBlock(table: string, up: boolean, inGame: string): string[] {
  return [
    "' Le monnayeur, toujours ignoré ; Start et la barre, hors d'une partie en cours : le départ est donné par Cyber Pinball.", // i18n-ignore : commentaire du script ajouté à la table
    'Function CyberPinball_Blocked(ByVal keycode)',
    '  CyberPinball_Blocked = (keycode = AddCreditKey Or keycode = AddCreditKey2)',
    `  If Not ${inGame} Then CyberPinball_Blocked = CyberPinball_Blocked Or keycode = StartGameKey Or keycode = LockBarKey`,
    'End Function',
    `Sub ${table}_KeyDown(ByVal keycode)`,
    '  If CyberPinball_Blocked(keycode) Then Exit Sub',
    '  CyberPinball_OrigKeyDown keycode',
    'End Sub',
    `Sub ${table}_KeyUp(ByVal keycode)`,
    '  If CyberPinball_Blocked(keycode) Then Exit Sub',
    ...(up ? ['  CyberPinball_OrigKeyUp keycode'] : []),
    'End Sub',
  ];
}

const writeState = (stateFile: string) => [
  '  If s <> CyberPinball_Last Then',
  `    Dim f : Set f = CyberPinball_Fso.CreateTextFile("${stateFile}", True)`,
  '    f.Write s',
  '    f.Close',
  '    CyberPinball_Last = s',
  '  End If',
];

/** Table originale : le relevé lit les variables du socle commun. */
function scriptBlock(e: string, table: string, up: boolean, stateFile: string): string[] {
  return [
    ...HEADER,
    'Dim CyberPinball_Fso, CyberPinball_Last, CyberPinball_Ticks, CyberPinball_Seen, CyberPinball_Tries',
    'Set CyberPinball_Fso = CreateObject("Scripting.FileSystemObject")',
    'CyberPinball_Ticks = 0 : CyberPinball_Seen = False : CyberPinball_Tries = 0',
    `${e}.TimerInterval = 250`,
    `${e}.TimerEnabled = True`,
    '',
    ...keyBlock(table, up, 'bGameInPlay'),
    'Sub CyberPinball_Press(ByVal keycode)',
    '  CyberPinball_OrigKeyDown keycode',
    ...(up ? ['  CyberPinball_OrigKeyUp keycode'] : []),
    'End Sub',
    '',
    `Sub ${e}_Timer()`,
    '  On Error Resume Next',
    '  CyberPinball_Ticks = CyberPinball_Ticks + 1',
    '  If bGameInPlay Then CyberPinball_Seen = True',
    "  ' Départ : un crédit, puis Start ; encore, s'il ne part pas.", // i18n-ignore : commentaire du script ajouté à la table
    '  If Not CyberPinball_Seen And CyberPinball_Tries < 4 Then',
    '    If CyberPinball_Ticks Mod 16 = 12 Then CyberPinball_Press AddCreditKey',
    '    If CyberPinball_Ticks Mod 16 = 14 Then CyberPinball_Press StartGameKey : CyberPinball_Tries = CyberPinball_Tries + 1',
    '  End If',
    '  Dim s, g, v',
    '  If bGameInPlay Then g = 1 Else g = 0',
    '  If CyberPinball_Seen Then v = 1 Else v = 0',
    '  s = "jeu=" & g & ";vu=" & v & ";joueurs=" & PlayersPlayingGame & ";joueur=" & CurrentPlayer & ";bille=" & (BallsPerGame - BallsRemaining(CurrentPlayer) + 1) & ";billes=" & BallsPerGame & ";score=" & Score(CurrentPlayer)', // i18n-ignore : clés du relevé, lues par parseLiveState
    ...writeState(stateFile),
    'End Sub',
    '',
  ];
}

/**
 * Table à ROM : le relevé lit la NVRAM de la ROM, toutes les demi-secondes ; toutes les deux
 * secondes pour une grande mémoire (au-delà de 32 Ko : la copie des 128 Ko de Stern SAM coûte
 * environ 3 ms au script, sur le fil de VPX).
 */
function romBlock(plan: RomLivePlan, e: string, table: string, up: boolean, stateFile: string): string[] {
  const scoreOf = (v: string, k: string) => ['  Select Case ' + k, ...plan.scores.map((f, i) => `    Case ${i + 1} : ${v} = ${read(f)}`), '  End Select'];
  const every = plan.size > 32 * 1024 ? 4 : 1;
  // Les initiales : deux minutes au plus, comptées en relevés.
  const initials = Math.ceil(120 / (every * 0.5));
  return [
    ...HEADER,
    'Dim CyberPinball_Fso, CyberPinball_Last, CyberPinball_Ticks, CyberPinball_Seen, CyberPinball_Tries, CyberPinball_InGame, CyberPinball_Ready, CyberPinball_Step, CyberPinball_Held, CyberPinball_Over, CyberPinball_Score',
    'Set CyberPinball_Fso = CreateObject("Scripting.FileSystemObject")',
    'CyberPinball_Ticks = 0 : CyberPinball_Seen = False : CyberPinball_Tries = 0 : CyberPinball_InGame = False : CyberPinball_Ready = 0 : CyberPinball_Step = 0 : CyberPinball_Held = 0 : CyberPinball_Over = 0 : CyberPinball_Score = 0',
    `${e}.TimerInterval = 500`,
    `${e}.TimerEnabled = True`,
    '',
    ...keyBlock(table, up, 'CyberPinball_InGame'),
    "' Une touche tenue jusqu'au tour suivant : la ROM lit ses contacts.", // i18n-ignore : commentaire du script ajouté à la table
    'Sub CyberPinball_Hold(ByVal keycode)',
    '  CyberPinball_OrigKeyDown keycode',
    '  CyberPinball_Held = keycode',
    'End Sub',
    '',
    "' Une valeur de la mémoire de la ROM (les octets du .nv), d'après sa carte.", // i18n-ignore : commentaire du script ajouté à la table
    'Function CyberPinball_Rd(ByRef nv, ByVal at, ByVal n, ByVal bcd, ByVal little)',
    '  Dim i, b, v : v = 0',
    '  For i = 0 To n - 1',
    '    If little Then b = nv(at + n - 1 - i) Else b = nv(at + i)',
    '    If bcd Then v = v * 100 + (b \\ 16) * 10 + (b And 15) Else v = v * 256 + b',
    '  Next',
    '  CyberPinball_Rd = v',
    'End Function',
    '',
    "' Un score de la partie bat la dernière place du tableau sans y être encore : la saisie des initiales.", // i18n-ignore : commentaire du script ajouté à la table
    'Function CyberPinball_Pending(ByRef nv, ByVal n)',
    '  CyberPinball_Pending = False',
    ...(plan.board.length
      ? [
          `  Dim board(${plan.board.length - 1}), low, k, j, sc, found`,
          ...plan.board.map((f, i) => `  board(${i}) = ${read(f)}`),
          '  low = board(0)',
          '  For j = 1 To UBound(board) : If board(j) < low Then low = board(j)',
          '  Next',
          '  For k = 1 To n',
          '    sc = 0',
          ...scoreOf('sc', 'k').map((l) => '  ' + l),
          '    If sc > low Then',
          '      found = False',
          '      For j = 0 To UBound(board) : If board(j) = sc Then found = True',
          '      Next',
          '      If Not found Then CyberPinball_Pending = True',
          '    End If',
          '  Next',
        ]
      : []),
    'End Function',
    '',
    "' Le relevé : la mémoire de la ROM, puis le fichier du double.", // i18n-ignore : commentaire du script ajouté à la table
    'Sub CyberPinball_Read()',
    '  Dim nv : nv = Controller.NVRAM',
    '  If Err.Number <> 0 Then Err.Clear : Exit Sub',
    '  If Not IsArray(nv) Then Exit Sub',
    `  If UBound(nv) < ${plan.size - 1} Then Exit Sub`,
    '  Dim p, b, n, over, playing, sc',
    `  p = ${read(plan.player)}`,
    `  b = ${read(plan.ball)}`,
    `  over = ${read(plan.over)}`,
    plan.players ? `  n = ${read(plan.players)}` : '  n = 1',
    `  If n < 1 Or n > ${plan.scores.length} Then n = 1`,
    `  playing = (Not over) And p >= 1 And p <= ${plan.scores.length} And b >= 1`,
    "  ' Notre partie : celle qui part après notre Start (au démarrage, la mémoire montre un temps la partie d'avant).", // i18n-ignore : commentaire du script ajouté à la table
    '  If playing And CyberPinball_Tries > 0 Then CyberPinball_Seen = True',
    '  If over Then CyberPinball_Ready = CyberPinball_Ready + 1 Else CyberPinball_Ready = 0',
    '  If playing Or Not CyberPinball_Seen Then CyberPinball_Over = 0 Else CyberPinball_Over = CyberPinball_Over + 1',
    "  ' Après la dernière bille, les initiales : la partie dure jusqu'à ce que le score entre au tableau (deux minutes au plus).", // i18n-ignore : commentaire du script ajouté à la table
    '  CyberPinball_InGame = playing And CyberPinball_Seen',
    `  If CyberPinball_Seen And Not playing And CyberPinball_Over < ${initials} Then CyberPinball_InGame = CyberPinball_Pending(nv, n)`,
    '  sc = -1',
    ...scoreOf('sc', 'p'),
    '  If sc >= 0 Then CyberPinball_Score = sc',
    '  If p < 1 Then p = 1',
    '  Dim s, g, v, balls',
    '  If CyberPinball_InGame Then g = 1 Else g = 0',
    '  If CyberPinball_Seen Then v = 1 Else v = 0',
    plan.balls ? `  balls = ${read(plan.balls)}` : '  balls = 0',
    '  s = "jeu=" & g & ";vu=" & v & ";joueurs=" & n & ";joueur=" & p & ";bille=" & b & ";billes=" & balls & ";score=" & CyberPinball_Score', // i18n-ignore : clés du relevé, lues par parseLiveState
    ...writeState(stateFile),
    'End Sub',
    '',
    `Sub ${e}_Timer()`,
    '  On Error Resume Next',
    '  CyberPinball_Ticks = CyberPinball_Ticks + 1',
    '  If CyberPinball_Held <> 0 Then',
    ...(up ? ['    CyberPinball_OrigKeyUp CyberPinball_Held'] : []),
    '    CyberPinball_Held = 0',
    '  End If',
    ...(every > 1 ? [`  If CyberPinball_Ticks Mod ${every} = 1 Then CyberPinball_Read`] : ['  CyberPinball_Read']),
    "  ' Départ : la table en attente, un crédit, puis Start deux secondes après ; encore toutes les dix secondes, deux minutes, s'il ne part pas.", // i18n-ignore : commentaire du script ajouté à la table
    '  If Not CyberPinball_Seen And CyberPinball_Tries < 12 And CyberPinball_Ready >= 4 Then',
    '    CyberPinball_Step = CyberPinball_Step + 1',
    '    If CyberPinball_Step = 1 Then CyberPinball_Hold AddCreditKey',
    '    If CyberPinball_Step = 5 Then CyberPinball_Hold StartGameKey : CyberPinball_Tries = CyberPinball_Tries + 1',
    '    If CyberPinball_Step >= 20 Then CyberPinball_Step = 0',
    '  End If',
    'End Sub',
    '',
  ];
}

/** La ligne du relevé ; undefined si elle est incomplète (lue pendant l'écriture) ou absurde. */
export function parseLiveState(text: string): LiveGameState | undefined {
  const fields = new Map(text.trim().split(';').map((kv) => kv.split('=') as [string, string]));
  const int = (k: string) => {
    const v = fields.get(k);
    return v !== undefined && /^-?\d+(\.\d+)?(E\+?\d+)?$/i.test(v.trim()) ? Math.round(Number(v)) : undefined;
  };
  const inGame = int('jeu'), started = int('vu'), players = int('joueurs'), player = int('joueur'), ball = int('bille'), balls = int('billes'), score = int('score');
  if ([inGame, started, players, player, ball, balls, score].some((v) => v === undefined)) return undefined;
  if (score! < 0 || !Number.isSafeInteger(score!)) return undefined;
  return { inGame: inGame === 1, started: started === 1, players: players!, player: player!, ball: Math.max(1, Math.min(ball!, balls! || ball!)), balls: balls!, score: score! };
}
