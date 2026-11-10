// Fenêtres et premier plan sous Windows : trouver les fenêtres d'un processus,
// savoir qui a le focus, et le reprendre malgré le verrou de premier plan.
//
// Windows n'autorise SetForegroundWindow qu'au processus qui a déjà le focus
// (ou à qui il l'a cédé). Un frontend qui lance VPX puis veut revenir doit donc :
// 1. céder explicitement le droit avant de lancer VPX (AllowSetForegroundWindow) ;
// 2. au retour, se rattacher au fil qui a le focus (AttachThreadInput), et en
//    dernier recours simuler un appui sur Alt, qui lève le verrou.

import * as koffi from 'koffi';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type NativeFn = (...args: any[]) => any;

const ASFW_ANY = 0xffffffff;
const SW_HIDE = 0;
const SW_SHOWNA = 8;
const SW_RESTORE = 9;
const WM_CLOSE = 0x0010;
const WM_GETTEXT = 0x000d;
const WM_GETTEXTLENGTH = 0x000e;
const SMTO_ABORTIFHUNG = 0x0002;
/** Assez pour un rapport d'audit de VPX ; au-delà, le texte est tronqué. */
const MAX_CONTROL_TEXT = 65_536;
const VK_MENU = 0x12;
const SWP_NOSIZE = 0x0001;
const SWP_NOMOVE = 0x0002;
const SWP_NOZORDER = 0x0004;
const SWP_NOACTIVATE = 0x0010;
const SWP_NOOWNERZORDER = 0x0200;
const SWP_ASYNCWINDOWPOS = 0x4000;
const KEYEVENTF_KEYUP = 0x0002;
const GWL_EXSTYLE = -20;
const WS_EX_TOPMOST = 0x0008;

interface Api {
  EnumWindows: NativeFn;
  EnumChildWindows: NativeFn;
  FindWindowExW: NativeFn;
  GetWindowThreadProcessId: NativeFn;
  IsWindowVisible: NativeFn;
  IsIconic: NativeFn;
  GetWindowTextW: NativeFn;
  GetClassNameW: NativeFn;
  GetWindowRect: NativeFn;
  GetForegroundWindow: NativeFn;
  SetForegroundWindow: NativeFn;
  BringWindowToTop: NativeFn;
  ShowWindow: NativeFn;
  AttachThreadInput: NativeFn;
  GetCurrentThreadId: NativeFn;
  AllowSetForegroundWindow: NativeFn;
  PostMessageW: NativeFn;
  SendMessageTimeoutW: NativeFn;
  keybd_event: NativeFn;
  SetCursorPos: NativeFn;
  SetWindowPos: NativeFn;
  GetWindowLongPtrW: NativeFn;
  GetAsyncKeyState: NativeFn;
  IsHungAppWindow: NativeFn;
  SendInput: NativeFn;
  SetWindowPosAfter: NativeFn;
}

let api: Api | undefined;

function loadApi(): Api {
  if (api) return api;
  const user32 = koffi.load('user32.dll');
  const kernel32 = koffi.load('kernel32.dll');
  koffi.proto('bool __stdcall CP_EnumWindowsProc(void *hwnd, intptr_t lParam)');
  api = {
    EnumWindows: user32.func('bool __stdcall EnumWindows(CP_EnumWindowsProc *callback, intptr_t lParam)'),
    EnumChildWindows: user32.func('bool __stdcall EnumChildWindows(void *parent, CP_EnumWindowsProc *callback, intptr_t lParam)'),
    FindWindowExW: user32.func('void * __stdcall FindWindowExW(void *parent, void *after, str16 className, str16 title)'),
    GetWindowThreadProcessId: user32.func('uint32_t __stdcall GetWindowThreadProcessId(void *hwnd, _Out_ uint32_t *pid)'),
    IsWindowVisible: user32.func('bool __stdcall IsWindowVisible(void *hwnd)'),
    IsIconic: user32.func('bool __stdcall IsIconic(void *hwnd)'),
    GetWindowTextW: user32.func('int __stdcall GetWindowTextW(void *hwnd, void *buffer, int max)'),
    GetClassNameW: user32.func('int __stdcall GetClassNameW(void *hwnd, void *buffer, int max)'),
    GetWindowRect: user32.func('bool __stdcall GetWindowRect(void *hwnd, void *rect)'),
    GetForegroundWindow: user32.func('void * __stdcall GetForegroundWindow()'),
    SetForegroundWindow: user32.func('bool __stdcall SetForegroundWindow(void *hwnd)'),
    BringWindowToTop: user32.func('bool __stdcall BringWindowToTop(void *hwnd)'),
    ShowWindow: user32.func('bool __stdcall ShowWindow(void *hwnd, int cmd)'),
    AttachThreadInput: user32.func('bool __stdcall AttachThreadInput(uint32_t attach, uint32_t attachTo, bool on)'),
    GetCurrentThreadId: kernel32.func('uint32_t __stdcall GetCurrentThreadId()'),
    AllowSetForegroundWindow: user32.func('bool __stdcall AllowSetForegroundWindow(uint32_t pid)'),
    PostMessageW: user32.func('bool __stdcall PostMessageW(void *hwnd, uint32_t msg, uintptr_t wParam, intptr_t lParam)'),
    SendMessageTimeoutW: user32.func(
      'intptr_t __stdcall SendMessageTimeoutW(void *hwnd, uint32_t msg, uintptr_t wParam, void *lParam, uint32_t flags, uint32_t timeout, _Out_ uintptr_t *result)',
    ),
    keybd_event: user32.func('void __stdcall keybd_event(uint8_t vk, uint8_t scan, uint32_t flags, uintptr_t extra)'),
    SetCursorPos: user32.func('bool __stdcall SetCursorPos(int x, int y)'),
    SetWindowPos: user32.func('bool __stdcall SetWindowPos(void *hwnd, void *after, int x, int y, int cx, int cy, uint32_t flags)'),
    GetWindowLongPtrW: user32.func('intptr_t __stdcall GetWindowLongPtrW(void *hwnd, int index)'),
    GetAsyncKeyState: user32.func('int16_t __stdcall GetAsyncKeyState(int vk)'),
    IsHungAppWindow: user32.func('bool __stdcall IsHungAppWindow(void *hwnd)'),
    SendInput: user32.func('uint32_t __stdcall SendInput(uint32_t count, void *inputs, int size)'),
    SetWindowPosAfter: user32.func('bool __stdcall SetWindowPos(void *hwnd, intptr_t after, int x, int y, int cx, int cy, uint32_t flags)'),
  };
  return api;
}

export interface WindowInfo {
  /** Pointeur natif (HWND), à repasser aux autres fonctions de ce module. */
  hwnd: unknown;
  /** Valeur numérique du HWND, pour comparer et journaliser. */
  handle: bigint;
  pid: number;
  threadId: number;
  title: string;
  className: string;
  visible: boolean;
  /** Réduite dans la barre des tâches. */
  minimized: boolean;
  /** Au premier plan permanent (WS_EX_TOPMOST), comme la barre des tâches devant une fenêtre ordinaire. */
  topmost: boolean;
  rect:{ x: number; y: number; width: number; height: number };
}

function describe(w: Api, hwnd: unknown): WindowInfo {
  const pid = [0];
  const threadId = w.GetWindowThreadProcessId(hwnd, pid) as number;
  const text = Buffer.alloc(512);
  const textLen = w.GetWindowTextW(hwnd, text, 256) as number;
  const cls = Buffer.alloc(512);
  const clsLen = w.GetClassNameW(hwnd, cls, 256) as number;
  const rect = Buffer.alloc(16);
  w.GetWindowRect(hwnd, rect);
  const left = rect.readInt32LE(0);
  const top = rect.readInt32LE(4);
  return {
    hwnd,
    handle: BigInt(koffi.address(hwnd)),
    pid: pid[0]!,
    threadId,
    title: text.toString('utf16le', 0, textLen * 2),
    className: cls.toString('utf16le', 0, clsLen * 2),
    visible: Boolean(w.IsWindowVisible(hwnd)),
    minimized: Boolean(w.IsIconic(hwnd)),
    topmost: (Number(w.GetWindowLongPtrW(hwnd, GWL_EXSTYLE)) & WS_EX_TOPMOST) !== 0,
    rect: { x: left, y: top, width: rect.readInt32LE(8) - left, height: rect.readInt32LE(12) - top },
  };
}

/** Fenêtres de premier niveau, dans l'ordre de superposition (la plus haute d'abord). */
export function listWindows(filter?: (w: WindowInfo) => boolean): WindowInfo[] {
  const w = loadApi();
  const found: WindowInfo[] = [];
  w.EnumWindows((hwnd: unknown) => {
    const info = describe(w, hwnd);
    if (!filter || filter(info)) found.push(info);
    return true;
  }, 0);
  return found;
}

/** Fenêtres visibles d'un processus. */
export function visibleWindowsOf(pid: number): WindowInfo[] {
  return listWindows((info) => info.pid === pid && info.visible);
}

/** Fenêtre de premier niveau de ce HWND (valeur de BrowserWindow.getNativeWindowHandle()), si elle existe encore. */
export function windowOfHandle(handle: bigint): WindowInfo | undefined {
  return listWindows((w) => w.handle === handle)[0];
}

export function foregroundWindow(): WindowInfo | undefined {
  const w = loadApi();
  const hwnd = w.GetForegroundWindow();
  return hwnd ? describe(w, hwnd) : undefined;
}

/** Autorise n'importe quel processus (VPX en particulier) à prendre le premier plan. */
export function allowAnyForeground(): void {
  loadApi().AllowSetForegroundWindow(ASFW_ANY);
}

/** Met une fenêtre au premier plan ; renvoie true si elle l'a vraiment obtenu. */
export function bringToFront(target: WindowInfo): boolean {
  const w = loadApi();
  if (w.IsIconic(target.hwnd)) w.ShowWindow(target.hwnd, SW_RESTORE);
  const isFront = () => foregroundWindow()?.handle === target.handle;

  w.SetForegroundWindow(target.hwnd);
  if (isFront()) return true;

  const fg = foregroundWindow();
  const me = w.GetCurrentThreadId() as number;
  const attached = fg && fg.threadId !== me ? w.AttachThreadInput(me, fg.threadId, true) : false;
  try {
    // Un appui sur Alt lève le verrou de premier plan pour le processus appelant.
    w.keybd_event(VK_MENU, 0, 0, 0);
    w.keybd_event(VK_MENU, 0, KEYEVENTF_KEYUP, 0);
    w.BringWindowToTop(target.hwnd);
    w.SetForegroundWindow(target.hwnd);
  } finally {
    if (attached && fg) w.AttachThreadInput(me, fg.threadId, false);
  }
  return isFront();
}

/**
 * Texte d'un contrôle par WM_GETTEXT. GetWindowTextW ne lit, pour la fenêtre d'un autre
 * processus, que le texte donné à sa création : rien pour une zone d'édition remplie
 * ensuite (le rapport d'audit de VPX, le message de « Script Runtime Error »).
 * SMTO_ABORTIFHUNG : un processus bloqué ne bloque pas l'appelant.
 */
function controlText(w: Api, hwnd: unknown): string | undefined {
  const result = [0];
  if (!w.SendMessageTimeoutW(hwnd, WM_GETTEXTLENGTH, 0, null, SMTO_ABORTIFHUNG, 200, result)) return undefined;
  const length = Math.min(Number(result[0]), MAX_CONTROL_TEXT);
  if (length === 0) return '';
  const buffer = Buffer.alloc((length + 1) * 2);
  if (!w.SendMessageTimeoutW(hwnd, WM_GETTEXT, length + 1, buffer, SMTO_ABORTIFHUNG, 200, result)) return undefined;
  return buffer.toString('utf16le', 0, Math.min(Number(result[0]), length) * 2);
}

/** Textes d'une fenêtre et de ses contrôles : le message d'une boîte de dialogue, par exemple. */
export function windowTexts(target: WindowInfo): string[] {
  const w = loadApi();
  const texts: string[] = [];
  w.EnumChildWindows(
    target.hwnd,
    (hwnd: unknown) => {
      const text = (controlText(w, hwnd) ?? describe(w, hwnd).title).trim();
      if (text) texts.push(text);
      return true;
    },
    0,
  );
  return texts;
}

/**
 * La fenêtre ne répond plus : son fil ne traite plus ses messages depuis 5 s (ce qui fait afficher
 * à Windows « ne répond pas »).
 */
export function isHung(target: WindowInfo): boolean {
  return Boolean(loadApi().IsHungAppWindow(target.hwnd));
}

/** Demande poliment la fermeture d'une fenêtre (comme le bouton ×). */
export function closeWindow(target: WindowInfo): void {
  loadApi().PostMessageW(target.hwnd, WM_CLOSE, 0, 0);
}

/** Masque une fenêtre sans la fermer : son processus continue comme si elle était là. */
export function hideWindow(target: WindowInfo): void {
  loadApi().ShowWindow(target.hwnd, SW_HIDE);
}

/** Réaffiche une fenêtre masquée, sans l'activer. */
export function showWindowInactive(target: WindowInfo): void {
  loadApi().ShowWindow(target.hwnd, SW_SHOWNA);
}

/**
 * Déplace la fenêtre d'un autre processus en (x, y), pixels physiques du bureau, à la même
 * taille : sans l'activer ni changer sa place dans la pile, et sans attendre son processus
 * (SWP_ASYNCWINDOWPOS : la demande est postée à son fil, un VPX occupé ne bloque pas le menu).
 */
export function moveWindow(target: WindowInfo, x: number, y: number): boolean {
  const flags = SWP_NOACTIVATE | SWP_NOZORDER | SWP_NOSIZE | SWP_NOOWNERZORDER | SWP_ASYNCWINDOWPOS;
  return Boolean(loadApi().SetWindowPos(target.hwnd, null, Math.round(x), Math.round(y), 0, 0, flags));
}

/**
 * Pose la fenêtre d'un autre processus sur `rect` (pixels physiques du bureau), position et taille,
 * sans l'activer ni changer sa place dans la pile, et sans attendre son processus (comme
 * moveWindow). VPX 10.8.1 suit une fenêtre annexe redimensionnée de l'extérieur : SDL lui envoie
 * SDL_EVENT_WINDOW_RESIZED, et il refait sa surface de rendu (player.cpp, Window::OnResized).
 */
export function setWindowBounds(target: WindowInfo, rect: { x: number; y: number; width: number; height: number }): boolean {
  const flags = SWP_NOACTIVATE | SWP_NOZORDER | SWP_NOOWNERZORDER | SWP_ASYNCWINDOWPOS;
  return Boolean(loadApi().SetWindowPos(target.hwnd, null, Math.round(rect.x), Math.round(rect.y), Math.max(1, Math.round(rect.width)), Math.max(1, Math.round(rect.height)), flags));
}

/**
 * Touches du clavier enfoncées en ce moment, quel que soit le premier plan (GetAsyncKeyState) :
 * pendant une partie, VPX a le clavier, et Cyber Pinball lit ainsi ses propres combinaisons.
 * `vks` : codes de touche virtuelle de Windows ; rend ceux qui sont enfoncés.
 */
export function keysDown(vks: readonly number[]): number[] {
  const w = loadApi();
  return vks.filter((vk) => ((w.GetAsyncKeyState(vk) as number) & 0x8000) !== 0);
}

/**
 * Appuie puis relâche une touche (code de touche virtuelle) pour la fenêtre au premier plan :
 * F12 rend à VPX l'ouverture de son propre menu.
 */
export function tapKey(vk: number): void {
  const w = loadApi();
  w.keybd_event(vk, 0, 0, 0);
  w.keybd_event(vk, 0, KEYEVENTF_KEYUP, 0);
}

/** Taille d'une structure INPUT de Windows en 64 bits (type, puis l'union dont MOUSEINPUT est la plus grande). */
const INPUT_SIZE = 40;
const INPUT_KEYBOARD = 1;
const KEYEVENTF_UNICODE = 0x0004;
const VK_RETURN = 0x0d;

/** Une frappe (appui puis relâche) en structures INPUT : caractère Unicode (`unit`) ou touche virtuelle (`vk`). */
function keyInputs(key: { unit: number } | { vk: number }): Buffer {
  const buf = Buffer.alloc(INPUT_SIZE * 2);
  for (const [i, up] of [false, true].entries()) {
    const at = i * INPUT_SIZE;
    buf.writeUInt32LE(INPUT_KEYBOARD, at);
    if ('vk' in key) buf.writeUInt16LE(key.vk, at + 8);
    else buf.writeUInt16LE(key.unit, at + 10);
    buf.writeUInt32LE(('vk' in key ? 0 : KEYEVENTF_UNICODE) | (up ? KEYEVENTF_KEYUP : 0), at + 12);
  }
  return buf;
}

/**
 * Tape du texte dans la fenêtre au premier plan, comme un clavier (SendInput) : chaque caractère
 * en Unicode (accents, symboles, émojis par leurs deux moitiés UTF-16), le saut de ligne par la
 * touche Entrée. Sert à la télécommande quand la page est dans un vrai navigateur (Edge) : un
 * clavier à distance, pas un pilotage de la page. Rend le nombre de frappes acceptées.
 */
export function typeText(text: string): number {
  const w = loadApi();
  let sent = 0;
  for (const part of text.split('')) {
    const inputs = part === '\n' ? keyInputs({ vk: VK_RETURN }) : keyInputs({ unit: part.charCodeAt(0) });
    sent += (w.SendInput(2, inputs, INPUT_SIZE) as number) / 2;
  }
  return sent;
}

export interface KeyModifiers {
  shift?: boolean;
  ctrl?: boolean;
  alt?: boolean;
}

const MODIFIER_VK = { shift: 0x10, ctrl: 0x11, alt: 0x12 } as const;

/**
 * Appuie puis relâche une touche virtuelle par SendInput (Tab, Entrée, Retour arrière…) pour la
 * fenêtre au premier plan, les modificateurs tenus pendant la frappe (Maj+Tab, Ctrl+A, Alt+Gauche).
 */
export function pressKey(vk: number, mods: KeyModifiers = {}): boolean {
  const held = (Object.keys(MODIFIER_VK) as (keyof KeyModifiers)[]).filter((m) => mods[m]).map((m) => keyInputs({ vk: MODIFIER_VK[m] }));
  const all = Buffer.concat([...held.map((b) => b.subarray(0, INPUT_SIZE)), keyInputs({ vk }), ...held.reverse().map((b) => b.subarray(INPUT_SIZE))]);
  const count = all.length / INPUT_SIZE;
  return (loadApi().SendInput(count, all, INPUT_SIZE) as number) === count;
}

const INPUT_MOUSE = 0;
const MOUSE_FLAGS = { left: [0x0002, 0x0004], right: [0x0008, 0x0010] } as const;
const MOUSEEVENTF_WHEEL = 0x0800;
const MOUSEEVENTF_HWHEEL = 0x1000;

function mouseInput(flags: number, data = 0): Buffer {
  const buf = Buffer.alloc(INPUT_SIZE);
  buf.writeUInt32LE(INPUT_MOUSE, 0);
  buf.writeInt32LE(data, 16);
  buf.writeUInt32LE(flags, 20);
  return buf;
}

/** Clic (simple ou double) là où est le pointeur de la souris, comme une vraie souris (SendInput). */
export function mouseClick(button: 'left' | 'right' = 'left', count = 1): boolean {
  const [down, up] = MOUSE_FLAGS[button];
  const parts: Buffer[] = [];
  for (let i = 0; i < Math.max(1, Math.min(3, count)); i++) parts.push(mouseInput(down), mouseInput(up));
  return (loadApi().SendInput(parts.length, Buffer.concat(parts), INPUT_SIZE) as number) === parts.length;
}

/**
 * Molette sous le pointeur, au sens de sendInputEvent d'Electron (comme Windows) : `dy` positif
 * remonte la page, `dx` positif va vers la gauche ; 120 par cran.
 */
export function mouseWheel(dx: number, dy: number): boolean {
  const parts: Buffer[] = [];
  if (Math.round(dy)) parts.push(mouseInput(MOUSEEVENTF_WHEEL, Math.round(dy)));
  if (Math.round(dx)) parts.push(mouseInput(MOUSEEVENTF_HWHEEL, -Math.round(dx)));
  if (!parts.length) return true;
  return (loadApi().SendInput(parts.length, Buffer.concat(parts), INPUT_SIZE) as number) === parts.length;
}

const HWND_TOPMOST = -1;
const HWND_NOTOPMOST = -2;

/**
 * Met (ou retire) une fenêtre d'un autre processus au premier plan permanent, sans l'activer ni
 * la déplacer : la page de connexion d'Edge reste devant les fenêtres de la borne sur son écran.
 */
export function setTopmost(target: WindowInfo, on: boolean): boolean {
  const flags = SWP_NOACTIVATE | SWP_NOMOVE | SWP_NOSIZE | SWP_NOOWNERZORDER;
  return Boolean(loadApi().SetWindowPosAfter(target.hwnd, on ? HWND_TOPMOST : HWND_NOTOPMOST, 0, 0, 0, 0, flags));
}

/**
 * Range `target` juste sous `after` dans la pile des fenêtres, sans l'activer, la déplacer ni la
 * redimensionner : une barre des tâches passée devant une fenêtre du menu retourne derrière elle
 * (screen-guard.ts). Sous une fenêtre ordinaire, elle perd son premier plan permanent, comme
 * l'Explorateur le fait lui-même devant une fenêtre plein écran active ; il le lui rend à la
 * bascule suivante. Rien n'est enregistré dans Windows.
 */
export function placeWindowBelow(target: WindowInfo, after: WindowInfo): boolean {
  const flags = SWP_NOACTIVATE | SWP_NOMOVE | SWP_NOSIZE | SWP_NOOWNERZORDER | SWP_ASYNCWINDOWPOS;
  return Boolean(loadApi().SetWindowPos(target.hwnd, after.hwnd, 0, 0, 0, 0, flags));
}

/**
 * Place le pointeur de la souris en (x, y), pixels physiques du bureau : sur une borne, une
 * fenêtre qui se lit à la souris l'amène sous le pointeur, qui pouvait être sur un écran
 * qui le cache.
 */
export function setCursorPosition(x: number, y: number): boolean {
  return Boolean(loadApi().SetCursorPos(Math.round(x), Math.round(y)));
}

/**
 * Barres des tâches de Windows, visibles ou masquées : celle de l'écran principal et celle de
 * chaque autre écran. Par leur classe (FindWindowEx) : assez léger pour être relu souvent.
 */
export function taskbarWindows(): WindowInfo[] {
  const w = loadApi();
  const found: WindowInfo[] = [];
  for (const className of ['Shell_TrayWnd', 'Shell_SecondaryTrayWnd']) {
    for (let hwnd = w.FindWindowExW(null, null, className, null); hwnd; hwnd = w.FindWindowExW(null, hwnd, className, null)) found.push(describe(w, hwnd));
  }
  return found;
}
