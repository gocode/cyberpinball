// i18n-ignore-file : appels Win32 de la mise en veille ; leurs erreurs passent par le journal.
// Mise en veille de la borne par powrprof.dll, appelée directement (pourquoi pas rundll32 :
// packages/core/src/power.ts). Seule app/src/power.ts s'en sert, par un exécuteur qu'un essai
// ne construit jamais.

import * as koffi from 'koffi';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type NativeFn = ((...args: any[]) => any) & { async: (...args: any[]) => void };

const TOKEN_ADJUST_PRIVILEGES = 0x20;
const TOKEN_QUERY = 0x8;
const SE_PRIVILEGE_ENABLED = 0x2;
/** TOKEN_PRIVILEGES à un seul privilège : nombre, LUID (8 octets), attributs. */
const TOKEN_PRIVILEGES_SIZE = 16;

interface Api {
  IsPwrSuspendAllowed: NativeFn;
  SetSuspendState: NativeFn;
  GetCurrentProcess: NativeFn;
  OpenProcessToken: NativeFn;
  LookupPrivilegeValueW: NativeFn;
  AdjustTokenPrivileges: NativeFn;
  CloseHandle: NativeFn;
}

let api: Api | undefined;

function loadApi(): Api {
  if (api) return api;
  const powrprof = koffi.load('powrprof.dll');
  const advapi32 = koffi.load('advapi32.dll');
  const kernel32 = koffi.load('kernel32.dll');
  api = {
    // BOOLEAN de Windows : un octet.
    IsPwrSuspendAllowed: powrprof.func('uint8_t __stdcall IsPwrSuspendAllowed()') as NativeFn,
    SetSuspendState: powrprof.func('uint8_t __stdcall SetSuspendState(uint8_t hibernate, uint8_t force, uint8_t wakeupEventsDisabled)') as NativeFn,
    GetCurrentProcess: kernel32.func('void * __stdcall GetCurrentProcess()') as NativeFn,
    OpenProcessToken: advapi32.func('bool __stdcall OpenProcessToken(void *process, uint32_t access, _Out_ void **token)') as NativeFn,
    LookupPrivilegeValueW: advapi32.func('bool __stdcall LookupPrivilegeValueW(str16 system, str16 name, void *luid)') as NativeFn,
    AdjustTokenPrivileges: advapi32.func('bool __stdcall AdjustTokenPrivileges(void *token, bool disableAll, void *newState, uint32_t length, void *previous, void *returned)') as NativeFn,
    CloseHandle: kernel32.func('bool __stdcall CloseHandle(void *handle)') as NativeFn,
  };
  return api;
}

/** Vrai si ce PC sait se mettre en veille S1 à S3 ; faux sur un PC à veille moderne seulement. */
export function suspendAllowed(): boolean {
  if (process.platform !== 'win32') return false;
  try {
    return loadApi().IsPwrSuspendAllowed() !== 0;
  } catch {
    return false;
  }
}

/**
 * SetSuspendState exige le privilège d'arrêt (SeShutdownPrivilege) : un compte ordinaire le
 * possède, mais désactivé dans le jeton du processus.
 */
function enableShutdownPrivilege(w: Api): void {
  const token = [null];
  if (!w.OpenProcessToken(w.GetCurrentProcess(), TOKEN_ADJUST_PRIVILEGES | TOKEN_QUERY, token)) throw new Error('OpenProcessToken a échoué.');
  try {
    const privileges = Buffer.alloc(TOKEN_PRIVILEGES_SIZE);
    privileges.writeUInt32LE(1, 0);
    if (!w.LookupPrivilegeValueW(null, 'SeShutdownPrivilege', privileges.subarray(4, 12))) throw new Error('LookupPrivilegeValueW(SeShutdownPrivilege) a échoué.');
    privileges.writeUInt32LE(SE_PRIVILEGE_ENABLED, 12);
    if (!w.AdjustTokenPrivileges(token[0], false, privileges, 0, null, null)) throw new Error('AdjustTokenPrivileges a échoué.');
  } finally {
    w.CloseHandle(token[0]);
  }
}

/**
 * Met le PC en veille (S3, ou veille hybride si Windows l'a activée), jamais en veille
 * prolongée : SetSuspendState(FALSE, FALSE, FALSE). L'appel passe par un fil de koffi : le
 * processus principal d'Electron n'est pas bloqué pendant que Windows s'endort. Renvoie
 * faux si Windows a refusé.
 */
export function suspendSystem(): Promise<boolean> {
  if (process.platform !== 'win32') return Promise.resolve(false);
  const w = loadApi();
  enableShutdownPrivilege(w);
  return new Promise((resolve, reject) => {
    w.SetSuspendState.async(0, 0, 0, (error: unknown, result: number) => (error ? reject(error) : resolve(result !== 0)));
  });
}
