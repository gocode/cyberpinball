// i18n-ignore-file : bureau caché des essais sans opérateur, ses erreurs ne servent qu’au développeur.
// Bureau Windows caché des essais sans opérateur : un bureau à part (CreateDesktopW) sur
// lequel un processus est lancé (CreateProcessW, STARTUPINFO.lpDesktop). L'utilisateur ne
// le voit jamais : quoi que fassent ses fenêtres, rien n'apparaît sur ses écrans ni ne lui
// prend le focus. Ses enfants y restent, et partagent sa console sans fenêtre.
// Il est lié à son lanceur par un objet tâche de Windows (job) : quand le lanceur meurt, de
// quelque façon que ce soit (fin normale, délai d'un test qui le tue), tout l'arbre lancé sur le
// bureau caché meurt avec lui. Il n'hérite pas non plus de la console du lanceur : seul le
// journal lui est confié. Sans cela, un essai tué au délai laissait son relais vivant, qui tenait
// les tuyaux de sortie du test (spawnSync attendait leur fermeture : 41 min, 01/11/2026).
// Même bureau que scripts\bureau-cache.ps1 (Enter-BureauCache).

import * as koffi from 'koffi';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type NativeFn = (...args: any[]) => any;

export const HIDDEN_DESKTOP = 'CyberPinballEssais';

const UOI_NAME = 2;
const GENERIC_ALL = 0x10000000;
const GENERIC_WRITE = 0x40000000;
const FILE_SHARE_READ_WRITE = 0x3;
const CREATE_ALWAYS = 2;
const FILE_ATTRIBUTE_NORMAL = 0x80;
const STARTF_USESHOWWINDOW = 0x1;
const STARTF_USESTDHANDLES = 0x100;
const SW_HIDE = 0;
/** Console sans fenêtre : une nouvelle console serait confiée au Terminal, sur le bureau de l'utilisateur. */
const CREATE_NO_WINDOW = 0x08000000;
const WAIT_OBJECT_0 = 0;
/** Créé suspendu : rangé dans le job avant d'avoir pu lancer le moindre enfant. */
const CREATE_SUSPENDED = 0x4;
const JOB_OBJECT_EXTENDED_LIMIT_INFORMATION = 9;
/** JOBOBJECT_EXTENDED_LIMIT_INFORMATION en 64 bits ; LimitFlags à l'octet 16. */
const JOB_LIMIT_SIZE = 144;
const JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE = 0x2000;
const STD_HANDLES = [-10, -11, -12];
const HANDLE_FLAG_INHERIT = 0x1;

interface Api {
  GetCurrentThreadId: NativeFn;
  GetThreadDesktop: NativeFn;
  GetUserObjectInformationW: NativeFn;
  CreateDesktopW: NativeFn;
  CloseDesktop: NativeFn;
  CreateFileW: NativeFn;
  CreateProcessW: NativeFn;
  WaitForSingleObject: NativeFn;
  GetExitCodeProcess: NativeFn;
  CloseHandle: NativeFn;
  CreateJobObjectW: NativeFn;
  SetInformationJobObject: NativeFn;
  AssignProcessToJobObject: NativeFn;
  ResumeThread: NativeFn;
  TerminateProcess: NativeFn;
  GetStdHandle: NativeFn;
  SetHandleInformation: NativeFn;
}

let api: Api | undefined;

function loadApi(): Api {
  if (api) return api;
  const user32 = koffi.load('user32.dll');
  const kernel32 = koffi.load('kernel32.dll');
  koffi.struct('CP_SECURITY_ATTRIBUTES', { nLength: 'uint32_t', lpSecurityDescriptor: 'void *', bInheritHandle: 'int32_t' });
  koffi.struct('CP_STARTUPINFOW', {
    cb: 'uint32_t',
    lpReserved: 'void *',
    lpDesktop: 'str16',
    lpTitle: 'void *',
    dwX: 'uint32_t',
    dwY: 'uint32_t',
    dwXSize: 'uint32_t',
    dwYSize: 'uint32_t',
    dwXCountChars: 'uint32_t',
    dwYCountChars: 'uint32_t',
    dwFillAttribute: 'uint32_t',
    dwFlags: 'uint32_t',
    wShowWindow: 'uint16_t',
    cbReserved2: 'uint16_t',
    lpReserved2: 'void *',
    hStdInput: 'void *',
    hStdOutput: 'void *',
    hStdError: 'void *',
  });
  koffi.struct('CP_PROCESS_INFORMATION', { hProcess: 'void *', hThread: 'void *', dwProcessId: 'uint32_t', dwThreadId: 'uint32_t' });
  api = {
    GetCurrentThreadId: kernel32.func('uint32_t __stdcall GetCurrentThreadId()'),
    GetThreadDesktop: user32.func('void * __stdcall GetThreadDesktop(uint32_t thread)'),
    GetUserObjectInformationW: user32.func('bool __stdcall GetUserObjectInformationW(void *obj, int index, void *info, uint32_t length, _Out_ uint32_t *needed)'),
    CreateDesktopW: user32.func('void * __stdcall CreateDesktopW(str16 name, void *device, void *mode, uint32_t flags, uint32_t access, void *sa)'),
    CloseDesktop: user32.func('bool __stdcall CloseDesktop(void *desktop)'),
    CreateFileW: kernel32.func('void * __stdcall CreateFileW(str16 name, uint32_t access, uint32_t share, CP_SECURITY_ATTRIBUTES *sa, uint32_t disposition, uint32_t flags, void *template)'),
    CreateProcessW: kernel32.func(
      'bool __stdcall CreateProcessW(void *app, void *commandLine, void *pa, void *ta, bool inherit, uint32_t flags, void *env, str16 directory, CP_STARTUPINFOW *si, _Out_ CP_PROCESS_INFORMATION *pi)',
    ),
    WaitForSingleObject: kernel32.func('uint32_t __stdcall WaitForSingleObject(void *handle, uint32_t ms)'),
    GetExitCodeProcess: kernel32.func('bool __stdcall GetExitCodeProcess(void *process, _Out_ uint32_t *code)'),
    CloseHandle: kernel32.func('bool __stdcall CloseHandle(void *handle)'),
    CreateJobObjectW: kernel32.func('void * __stdcall CreateJobObjectW(void *sa, void *name)'),
    SetInformationJobObject: kernel32.func('bool __stdcall SetInformationJobObject(void *job, int infoClass, void *info, uint32_t length)'),
    AssignProcessToJobObject: kernel32.func('bool __stdcall AssignProcessToJobObject(void *job, void *process)'),
    ResumeThread: kernel32.func('uint32_t __stdcall ResumeThread(void *thread)'),
    TerminateProcess: kernel32.func('bool __stdcall TerminateProcess(void *process, uint32_t code)'),
    GetStdHandle: kernel32.func('void * __stdcall GetStdHandle(int which)'),
    SetHandleInformation: kernel32.func('bool __stdcall SetHandleInformation(void *handle, uint32_t mask, uint32_t flags)'),
  };
  return api;
}

/** Nom du bureau de ce processus (« Default » : celui de l'utilisateur). */
export function currentDesktop(): string {
  const w = loadApi();
  const buffer = Buffer.alloc(512);
  const needed = [0];
  if (!w.GetUserObjectInformationW(w.GetThreadDesktop(w.GetCurrentThreadId()), UOI_NAME, buffer, buffer.length, needed)) return '';
  const name = buffer.toString('utf16le');
  return name.slice(0, name.indexOf('\0') === -1 ? undefined : name.indexOf('\0'));
}

export interface HiddenRun {
  pid: number;
  /** Vrai si le processus s'est terminé dans le délai. */
  wait(ms: number): boolean;
  /** Code de sortie ; libère les poignées et le bureau. */
  finish(): number;
}

/**
 * Lance `commandLine` sur le bureau caché, dans `directory`, sortie et erreurs dans `log`
 * (relu par l'appelant), avec l'environnement de ce processus.
 */
export function startOnHiddenDesktop(commandLine: string, directory: string, log: string): HiddenRun {
  const w = loadApi();
  const desktop = w.CreateDesktopW(HIDDEN_DESKTOP, null, null, 0, GENERIC_ALL, null);
  if (!desktop) throw new Error('Bureau caché : CreateDesktopW a échoué.');
  const sa = { nLength: 24, lpSecurityDescriptor: null, bInheritHandle: 1 };
  const file = w.CreateFileW(log, GENERIC_WRITE, FILE_SHARE_READ_WRITE, sa, CREATE_ALWAYS, FILE_ATTRIBUTE_NORMAL, null);
  if (!file || koffi.address(file) === BigInt('0xffffffffffffffff')) {
    w.CloseDesktop(desktop);
    throw new Error(`Bureau caché : impossible de créer le journal ${log}.`);
  }
  const si = {
    cb: 104,
    lpReserved: null,
    lpDesktop: HIDDEN_DESKTOP,
    lpTitle: null,
    dwX: 0,
    dwY: 0,
    dwXSize: 0,
    dwYSize: 0,
    dwXCountChars: 0,
    dwYCountChars: 0,
    dwFillAttribute: 0,
    dwFlags: STARTF_USESTDHANDLES | STARTF_USESHOWWINDOW,
    wShowWindow: SW_HIDE,
    cbReserved2: 0,
    lpReserved2: null,
    hStdInput: null,
    hStdOutput: file,
    hStdError: file,
  };
  // Le job : poignée non héritable, gardée par le lanceur seul ; sa fermeture tue l'arbre.
  const job = w.CreateJobObjectW(null, null);
  const limits = Buffer.alloc(JOB_LIMIT_SIZE);
  limits.writeUInt32LE(JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE, 16);
  if (!job || !w.SetInformationJobObject(job, JOB_OBJECT_EXTENDED_LIMIT_INFORMATION, limits, JOB_LIMIT_SIZE)) {
    if (job) w.CloseHandle(job);
    w.CloseHandle(file);
    w.CloseDesktop(desktop);
    throw new Error('Bureau caché : objet tâche (job) impossible à préparer.');
  }
  // La console du lanceur (tuyaux d'un test, par exemple) ne passe pas à l'enfant : seul le journal.
  for (const which of STD_HANDLES) {
    const std = w.GetStdHandle(which);
    if (std && koffi.address(std) !== BigInt('0xffffffffffffffff')) w.SetHandleInformation(std, HANDLE_FLAG_INHERIT, 0);
  }
  const pi: Record<string, unknown> = {};
  // CreateProcessW peut écrire dans la ligne de commande : une copie modifiable.
  const command = Buffer.from(`${commandLine}\0`, 'utf16le');
  const ok = w.CreateProcessW(null, command, null, null, true, CREATE_NO_WINDOW | CREATE_SUSPENDED, null, directory, si, pi);
  w.CloseHandle(file);
  if (!ok) {
    w.CloseHandle(job);
    w.CloseDesktop(desktop);
    throw new Error('Bureau caché : CreateProcessW a échoué.');
  }
  if (!w.AssignProcessToJobObject(job, pi.hProcess)) {
    w.TerminateProcess(pi.hProcess, 1);
    w.CloseHandle(pi.hThread);
    w.CloseHandle(pi.hProcess);
    w.CloseHandle(job);
    w.CloseDesktop(desktop);
    throw new Error('Bureau caché : le processus n’a pas pu être rangé dans son objet tâche (job).');
  }
  w.ResumeThread(pi.hThread);
  w.CloseHandle(pi.hThread);
  return {
    pid: pi.dwProcessId as number,
    wait: (ms) => w.WaitForSingleObject(pi.hProcess, ms) === WAIT_OBJECT_0,
    finish: () => {
      const code = [0];
      w.GetExitCodeProcess(pi.hProcess, code);
      w.CloseHandle(pi.hProcess);
      // Le relais est fini : ce qu'il aurait laissé derrière lui sur le bureau caché aussi.
      w.CloseHandle(job);
      w.CloseDesktop(desktop);
      return code[0]!;
    },
  };
}
