// Processus ouverts, par leur exécutable (instantané Toolhelp de kernel32) : de quoi
// savoir si un autre menu de borne tourne déjà. Lecture seule, sans droits particuliers.
//
// PROCESSENTRY32W est lu octet par octet, comme les structures de index.ts.

import * as koffi from 'koffi';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type NativeFn = (...args: any[]) => any;

const TH32CS_SNAPPROCESS = 0x2;
const INVALID_HANDLE_VALUE = -1;

// PROCESSENTRY32W (tlhelp32.h) en 64 bits : th32DefaultHeapID (ULONG_PTR) aligné sur 8.
const ENTRY_SIZE = 568;
const OFFSET_EXE_FILE = 44;
const MAX_PATH = 260;

const PROCESS_QUERY_LIMITED_INFORMATION = 0x1000;

interface Api {
  CreateToolhelp32Snapshot: NativeFn;
  Process32FirstW: NativeFn;
  Process32NextW: NativeFn;
  CloseHandle: NativeFn;
  OpenProcess: NativeFn;
  GetProcessTimes: NativeFn;
}

let api: Api | undefined;

function loadApi(): Api {
  if (api) return api;
  const kernel32 = koffi.load('kernel32.dll');
  api = {
    CreateToolhelp32Snapshot: kernel32.func('intptr_t __stdcall CreateToolhelp32Snapshot(uint32_t flags, uint32_t pid)'),
    Process32FirstW: kernel32.func('bool __stdcall Process32FirstW(intptr_t snapshot, void *entry)'),
    Process32NextW: kernel32.func('bool __stdcall Process32NextW(intptr_t snapshot, void *entry)'),
    CloseHandle: kernel32.func('bool __stdcall CloseHandle(intptr_t handle)'),
    OpenProcess: kernel32.func('intptr_t __stdcall OpenProcess(uint32_t access, bool inherit, uint32_t pid)'),
    GetProcessTimes: kernel32.func('bool __stdcall GetProcessTimes(intptr_t process, void *creation, void *exit, void *kernel, void *user)'),
  };
  return api;
}

/**
 * Temps de processeur pris par le processus `pid` depuis son départ, en millisecondes (noyau et
 * utilisateur, tous ses fils) ; undefined s'il est parti ou fermé à la lecture. Sert à la charge de
 * VPX pendant une partie (app/src/game-load.ts).
 */
export function processCpuMs(pid: number): number | undefined {
  if (process.platform !== 'win32') return undefined;
  const w = loadApi();
  const handle = w.OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid) as number | bigint;
  if (!handle) return undefined;
  try {
    const [creation, exit, kernel, user] = [Buffer.alloc(8), Buffer.alloc(8), Buffer.alloc(8), Buffer.alloc(8)];
    if (!w.GetProcessTimes(handle, creation, exit, kernel, user)) return undefined;
    // FILETIME : des centaines de nanosecondes.
    return Number(kernel.readBigUInt64LE(0) + user.readBigUInt64LE(0)) / 10_000;
  } finally {
    w.CloseHandle(handle);
  }
}

/** Noms des exécutables en cours (« PinUpMenu.exe »), une fois chacun. */
export function runningProcessNames(): string[] {
  if (process.platform !== 'win32') return [];
  const w = loadApi();
  const snapshot = Number(w.CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0));
  if (snapshot === INVALID_HANDLE_VALUE) return [];
  const names = new Set<string>();
  try {
    const entry = Buffer.alloc(ENTRY_SIZE);
    entry.writeUInt32LE(ENTRY_SIZE, 0);
    for (let ok = w.Process32FirstW(snapshot, entry); ok; ok = w.Process32NextW(snapshot, entry)) {
      const raw = entry.toString('utf16le', OFFSET_EXE_FILE, OFFSET_EXE_FILE + MAX_PATH * 2);
      const end = raw.indexOf('\0');
      names.add(end < 0 ? raw : raw.slice(0, end));
    }
  } finally {
    w.CloseHandle(snapshot);
  }
  return [...names];
}
