// Port série de Windows (CreateFileW, SetCommState, ReadFile, WriteFile) par koffi, sans module natif.
//
// Sert au pilotage des LED hors partie (app/src/led-live.ts) : un Teensy ou un Wemos D1 (CH340,
// CP210x) parle par un port COM. L'ouverture est synchrone (elle échoue tout de suite si le port
// est pris ou absent) ; les lectures et écritures passent par les appels asynchrones de koffi,
// pour ne jamais bloquer le processus principal pendant qu'une carte ne répond pas.

import * as koffi from 'koffi';

export type SerialOpenFailure = 'busy' | 'missing' | 'denied' | 'other';

export class SerialOpenError extends Error {
  constructor(
    readonly reason: SerialOpenFailure,
    readonly code: number,
    message: string,
  ) {
    super(message);
    this.name = 'SerialOpenError';
  }
}

export interface SerialOptions {
  baudRate: number;
  dataBits: number;
  /** Délai maximal d'une lecture ou d'une écriture, en ms. */
  timeoutMs: number;
  dtr: boolean;
}

/** Un port ouvert. Tous les octets sont des `Uint8Array`. */
export interface SerialLink {
  write(data: Uint8Array): Promise<void>;
  /** Jusqu'à `n` octets : moins si le délai passe (jamais d'erreur pour un manque de réponse). */
  read(n: number, timeoutMs: number): Promise<Uint8Array>;
  /** Octets reçus et pas encore lus. */
  available(): Promise<number>;
  /** Vide les octets reçus. */
  flushInput(): Promise<void>;
  close(): Promise<void>;
}

const GENERIC_READ = 0x80000000;
const GENERIC_WRITE = 0x40000000;
const OPEN_EXISTING = 3;
const INVALID_HANDLE = -1;
const ERROR_FILE_NOT_FOUND = 2;
const ERROR_PATH_NOT_FOUND = 3;
const ERROR_ACCESS_DENIED = 5;
const ERROR_SHARING_VIOLATION = 32;
const PURGE_RXCLEAR = 0x0008;
const PURGE_TXCLEAR = 0x0004;
const MAXDWORD = 0xffffffff;
const SETDTR = 5;
const CLRDTR = 6;
const DCB_SIZE = 28;

interface Api {
  CreateFileW: (name: string, access: number, share: number, security: null, disposition: number, flags: number, template: null) => number;
  GetLastError: () => number;
  CloseHandle: (handle: number) => number;
  GetCommState: (handle: number, dcb: Buffer) => number;
  SetCommState: (handle: number, dcb: Buffer) => number;
  SetCommTimeouts: (handle: number, timeouts: Buffer) => number;
  PurgeComm: (handle: number, flags: number) => number;
  EscapeCommFunction: (handle: number, func: number) => number;
  ClearCommError: (handle: number, errors: Buffer | null, status: Buffer) => number;
  ReadFile: {
    async: (handle: number, buffer: Buffer, n: number, read: Buffer, overlapped: null, done: (error: Error | null, ok: number) => void) => void;
  };
  WriteFile: {
    async: (handle: number, buffer: Buffer, n: number, written: Buffer, overlapped: null, done: (error: Error | null, ok: number) => void) => void;
  };
}

let api: Api | undefined;
function load(): Api {
  if (api) return api;
  const k32 = koffi.load('kernel32.dll');
  api = {
    CreateFileW: k32.func('intptr_t __stdcall CreateFileW(str16 name, uint32_t access, uint32_t share, void *security, uint32_t disposition, uint32_t flags, void *template)'),
    GetLastError: k32.func('uint32_t __stdcall GetLastError()'),
    CloseHandle: k32.func('int __stdcall CloseHandle(intptr_t handle)'),
    GetCommState: k32.func('int __stdcall GetCommState(intptr_t handle, void *dcb)'),
    SetCommState: k32.func('int __stdcall SetCommState(intptr_t handle, void *dcb)'),
    SetCommTimeouts: k32.func('int __stdcall SetCommTimeouts(intptr_t handle, void *timeouts)'),
    PurgeComm: k32.func('int __stdcall PurgeComm(intptr_t handle, uint32_t flags)'),
    EscapeCommFunction: k32.func('int __stdcall EscapeCommFunction(intptr_t handle, uint32_t func)'),
    ClearCommError: k32.func('int __stdcall ClearCommError(intptr_t handle, void *errors, void *status)'),
    ReadFile: k32.func('int __stdcall ReadFile(intptr_t handle, void *buffer, uint32_t n, void *read, void *overlapped)'),
    WriteFile: k32.func('int __stdcall WriteFile(intptr_t handle, void *buffer, uint32_t n, void *written, void *overlapped)'),
  } as unknown as Api;
  return api;
}

/** `COM5` → `\\.\COM5` : le préfixe est nécessaire au-delà de COM9. */
export function serialDevicePath(port: string): string {
  return `\\\\.\\${port.trim().toUpperCase()}`;
}

const call = <T extends unknown[]>(start: (...args: [...T, (error: Error | null, ok: number) => void]) => void, ...args: T): Promise<number> =>
  new Promise((resolve, reject) => start(...args, (error, ok) => (error ? reject(error) : resolve(ok))));

/** Ouvre un port COM (8N1, sans contrôle de flux). Lève `SerialOpenError` si le port est pris, absent ou refusé. */
export function openSerial(port: string, options: SerialOptions): SerialLink {
  const k = load();
  const handle = k.CreateFileW(serialDevicePath(port), GENERIC_READ | GENERIC_WRITE, 0, null, OPEN_EXISTING, 0, null);
  if (handle === INVALID_HANDLE) {
    const code = k.GetLastError();
    const reason: SerialOpenFailure =
      code === ERROR_FILE_NOT_FOUND || code === ERROR_PATH_NOT_FOUND ? 'missing' : code === ERROR_ACCESS_DENIED || code === ERROR_SHARING_VIOLATION ? 'busy' : 'other';
    throw new SerialOpenError(reason, code, `CreateFile ${port} : erreur ${code}`);
  }
  const fail = (what: string): never => {
    const code = k.GetLastError();
    k.CloseHandle(handle);
    throw new SerialOpenError('other', code, `${what} ${port} : erreur ${code}`);
  };
  const dcb = Buffer.alloc(DCB_SIZE);
  dcb.writeUInt32LE(DCB_SIZE, 0);
  if (!k.GetCommState(handle, dcb)) fail('GetCommState');
  dcb.writeUInt32LE(options.baudRate, 4);
  // Drapeaux : fBinary seul ; ni parité, ni contrôle de flux, DTR et RTS à la main.
  dcb.writeUInt32LE(0x1 | ((options.dtr ? 1 : 0) << 4), 8);
  dcb.writeUInt8(options.dataBits, 18);
  dcb.writeUInt8(0, 19);
  dcb.writeUInt8(0, 20);
  if (!k.SetCommState(handle, dcb)) fail('SetCommState');
  // Lecture : rend ce qui est là, sinon attend `timeoutMs` ; écriture : même délai en tout.
  const timeouts = Buffer.alloc(20);
  timeouts.writeUInt32LE(MAXDWORD, 0);
  timeouts.writeUInt32LE(MAXDWORD, 4);
  timeouts.writeUInt32LE(options.timeoutMs, 8);
  timeouts.writeUInt32LE(0, 12);
  timeouts.writeUInt32LE(options.timeoutMs, 16);
  if (!k.SetCommTimeouts(handle, timeouts)) fail('SetCommTimeouts');
  k.EscapeCommFunction(handle, options.dtr ? SETDTR : CLRDTR);

  let closed = false;
  const readOnce = async (n: number, timeoutMs: number): Promise<Uint8Array> => {
    const t = Buffer.alloc(20);
    t.writeUInt32LE(MAXDWORD, 0);
    t.writeUInt32LE(MAXDWORD, 4);
    t.writeUInt32LE(Math.max(1, timeoutMs), 8);
    t.writeUInt32LE(0, 12);
    t.writeUInt32LE(options.timeoutMs, 16);
    k.SetCommTimeouts(handle, t);
    const buffer = Buffer.alloc(n);
    const got = Buffer.alloc(4);
    await call((...a) => k.ReadFile.async(...(a as Parameters<Api['ReadFile']['async']>)), handle, buffer, n, got, null);
    return new Uint8Array(buffer.subarray(0, got.readUInt32LE(0)));
  };
  return {
    async write(data) {
      if (closed) throw new Error('Port closed');
      const buffer = Buffer.from(data);
      const written = Buffer.alloc(4);
      const ok = await call((...a) => k.WriteFile.async(...(a as Parameters<Api['WriteFile']['async']>)), handle, buffer, buffer.length, written, null);
      if (!ok || written.readUInt32LE(0) !== buffer.length) throw new Error(`Write to ${port}: ${written.readUInt32LE(0)} of ${buffer.length} bytes`);
    },
    async read(n, timeoutMs) {
      if (closed) return new Uint8Array(0);
      const out: number[] = [];
      const deadline = Date.now() + timeoutMs;
      while (out.length < n) {
        const left = deadline - Date.now();
        if (left <= 0) break;
        const chunk = await readOnce(n - out.length, left);
        if (!chunk.length) break;
        out.push(...chunk);
      }
      return Uint8Array.from(out);
    },
    async available() {
      if (closed) return 0;
      const status = Buffer.alloc(12);
      return k.ClearCommError(handle, null, status) ? status.readUInt32LE(4) : 0;
    },
    async flushInput() {
      if (!closed) k.PurgeComm(handle, PURGE_RXCLEAR | PURGE_TXCLEAR);
    },
    async close() {
      if (closed) return;
      closed = true;
      k.CloseHandle(handle);
    },
  };
}

