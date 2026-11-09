// Partage d'un NT HANDLE avec un autre processus (DuplicateHandle de kernel32) : la texture d'une
// fenêtre rendue hors écran par Electron (webPreferences.offscreen.useSharedTexture) ne vaut que
// dans le processus principal ; le compagnon du casque (packages/casque-vr) l'ouvre avec la copie
// faite dans le sien. Le processus cible est ouvert une fois, avec le seul droit de dupliquer.

import * as koffi from 'koffi';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type NativeFn = (...args: any[]) => any;

const PROCESS_DUP_HANDLE = 0x40;
const DUPLICATE_SAME_ACCESS = 0x2;

interface Api {
  OpenProcess: NativeFn;
  GetCurrentProcess: NativeFn;
  DuplicateHandle: NativeFn;
  CloseHandle: NativeFn;
}

let api: Api | undefined;

function loadApi(): Api {
  if (api) return api;
  const kernel32 = koffi.load('kernel32.dll');
  api = {
    OpenProcess: kernel32.func('intptr_t __stdcall OpenProcess(uint32_t access, bool inherit, uint32_t pid)'),
    GetCurrentProcess: kernel32.func('intptr_t __stdcall GetCurrentProcess()'),
    DuplicateHandle: kernel32.func(
      'bool __stdcall DuplicateHandle(intptr_t sourceProcess, intptr_t source, intptr_t targetProcess, _Out_ intptr_t *target, uint32_t access, bool inherit, uint32_t options)',
    ),
    CloseHandle: kernel32.func('bool __stdcall CloseHandle(intptr_t handle)'),
  };
  return api;
}

/** Un processus cible, ouvert pour y dupliquer des handles ; close() le referme. */
export interface HandleTarget {
  /** Copie de `handle` (valable ici) dans le processus cible ; undefined si Windows refuse. */
  share(handle: bigint): bigint | undefined;
  close(): void;
}

export function openHandleTarget(pid: number): HandleTarget | undefined {
  const w = loadApi();
  const process = w.OpenProcess(PROCESS_DUP_HANDLE, false, pid) as number | bigint;
  if (!process) return undefined;
  const self = w.GetCurrentProcess() as number | bigint;
  let open = true;
  return {
    share(handle) {
      if (!open) return undefined;
      const out = [0];
      const ok = w.DuplicateHandle(self, handle, process, out, 0, false, DUPLICATE_SAME_ACCESS) as boolean;
      return ok ? BigInt(out[0] as number | bigint) : undefined;
    },
    close() {
      if (!open) return;
      open = false;
      w.CloseHandle(process);
    },
  };
}
