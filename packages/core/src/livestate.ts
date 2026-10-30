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
// Une table qui ne suit pas ce socle (ROM, autre script) n'a pas d'état en direct : la partie se
// joue comme avant.

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

export type LiveHook = { ok: true; script: string; element: string; table: string } | { ok: false; reason: string };

/**
 * Le script du double, avec le relevé et le départ automatique ; `stateFile` : le fichier où le
 * relevé écrit (dans le double). `elements` : ceux de la table (readVpxElements).
 */
export function liveStateHook(script: string, elements: readonly { type: number; name: string }[], stateFile: string): LiveHook {
  if (!NEEDED.every((re) => re.test(script))) return { ok: false, reason: 'script hors du socle commun (Score, CurrentPlayer, BallsRemaining, bGameInPlay)' }; // i18n-ignore : journal
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
  const block = [
    '',
    "' ---- Cyber Pinball : partie entre amis. Ajouté dans le double de la table pour cette partie seulement ;", // i18n-ignore : commentaire du script ajouté à la table
    "' ---- la table habituelle et son script ne sont jamais modifiés.", // i18n-ignore : commentaire du script ajouté à la table
    'Dim CyberPinball_Fso, CyberPinball_Last, CyberPinball_Ticks, CyberPinball_Seen, CyberPinball_Tries',
    'Set CyberPinball_Fso = CreateObject("Scripting.FileSystemObject")',
    'CyberPinball_Ticks = 0 : CyberPinball_Seen = False : CyberPinball_Tries = 0',
    `${e}.TimerInterval = 250`,
    `${e}.TimerEnabled = True`,
    '',
    "' Le monnayeur, toujours ignoré ; Start et la barre, hors d'une partie en cours : le départ est donné par Cyber Pinball.", // i18n-ignore : commentaire du script ajouté à la table
    'Function CyberPinball_Blocked(ByVal keycode)',
    '  CyberPinball_Blocked = (keycode = AddCreditKey Or keycode = AddCreditKey2)',
    '  If Not bGameInPlay Then CyberPinball_Blocked = CyberPinball_Blocked Or keycode = StartGameKey Or keycode = LockBarKey',
    'End Function',
    `Sub ${table}_KeyDown(ByVal keycode)`,
    '  If CyberPinball_Blocked(keycode) Then Exit Sub',
    '  CyberPinball_OrigKeyDown keycode',
    'End Sub',
    `Sub ${table}_KeyUp(ByVal keycode)`,
    '  If CyberPinball_Blocked(keycode) Then Exit Sub',
    ...(up ? ['  CyberPinball_OrigKeyUp keycode'] : []),
    'End Sub',
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
    '  If s <> CyberPinball_Last Then',
    `    Dim f : Set f = CyberPinball_Fso.CreateTextFile("${stateFile}", True)`,
    '    f.Write s',
    '    f.Close',
    '    CyberPinball_Last = s',
    '  End If',
    'End Sub',
    '',
  ];
  return { ok: true, script: text.replace(/\s*$/, '') + eol + block.join(eol), element: e, table };
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
