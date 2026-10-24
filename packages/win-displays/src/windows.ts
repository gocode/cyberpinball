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
const KEYEVENTF_KEYUP = 0x0002;

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
  rect: { x: number; y: number; width: number; height: number };
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
