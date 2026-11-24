// Lecture du registre de Windows par l'API Unicode (advapi32), sans passer
// par reg.exe : sa sortie suit la page de code de la console et abîme les
// accents (« Haut-parleurs/écouteurs »), alors que VPX compare les noms de
// sortie audio à l'octet près. Seule écriture : hkcuSetValue (réglages d'un jeu
// de l'utilisateur, HKCU, jamais HKLM), voir plus bas.

import * as koffi from 'koffi';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type NativeFn = (...args: any[]) => any;

/** HKEY_LOCAL_MACHINE, étendu sur 64 bits comme le fait winreg.h ((HKEY)(LONG)0x80000002). */
const HKEY_LOCAL_MACHINE = -0x7ffffffe;
/** HKEY_CURRENT_USER ((HKEY)(LONG)0x80000001) : réglages de l'utilisateur (dossier de Steam). */
const HKEY_CURRENT_USER = -0x7fffffff;
const KEY_READ = 0x20019;
const KEY_WOW64_64KEY = 0x0100;
const RRF_RT_ANY = 0x0000ffff;
const ERROR_SUCCESS = 0;
const ERROR_MORE_DATA = 234;
const ERROR_NO_MORE_ITEMS = 259;

const REG_SZ = 1;
const REG_EXPAND_SZ = 2;
const REG_DWORD = 4;
const REG_MULTI_SZ = 7;
const REG_QWORD = 11;

export type RegistryValue = string | number | bigint | Uint8Array;

const KEY_SET_VALUE = 0x0002;

interface Api {
  RegOpenKeyExW: NativeFn;
  RegEnumKeyExW: NativeFn;
  RegCloseKey: NativeFn;
  RegGetValueW: NativeFn;
  RegSetValueExW: NativeFn;
}

let api: Api | undefined;

function loadApi(): Api {
  if (api) return api;
  const advapi32 = koffi.load('advapi32.dll');
  api = {
    RegOpenKeyExW: advapi32.func(
      'long __stdcall RegOpenKeyExW(intptr_t key, const char16_t *subKey, uint32_t options, uint32_t sam, _Out_ intptr_t *result)',
    ),
    RegEnumKeyExW: advapi32.func(
      'long __stdcall RegEnumKeyExW(intptr_t key, uint32_t index, void *name, _Inout_ uint32_t *nameLength, void *reserved, void *cls, void *clsLength, void *lastWrite)',
    ),
    RegCloseKey: advapi32.func('long __stdcall RegCloseKey(intptr_t key)'),
    RegGetValueW: advapi32.func(
      'long __stdcall RegGetValueW(intptr_t key, const char16_t *subKey, const char16_t *value, uint32_t flags, _Out_ uint32_t *type, void *data, _Inout_ uint32_t *size)',
    ),
    RegSetValueExW: advapi32.func('long __stdcall RegSetValueExW(intptr_t key, const char16_t *name, uint32_t reserved, uint32_t type, const void *data, uint32_t size)'),
  };
  return api;
}

/** Noms des sous-clés de HKLM\<path> ; vide si la clé n'existe pas. */
export function hklmSubkeys(path: string): string[] {
  const w = loadApi();
  const handle = [0];
  if (w.RegOpenKeyExW(HKEY_LOCAL_MACHINE, path, 0, KEY_READ | KEY_WOW64_64KEY, handle) !== ERROR_SUCCESS) return [];
  const names: string[] = [];
  try {
    const buffer = Buffer.alloc(512);
    for (let index = 0; ; index++) {
      const length = [buffer.length / 2];
      const rc = w.RegEnumKeyExW(handle[0], index, buffer, length, null, null, null, null);
      if (rc === ERROR_NO_MORE_ITEMS) break;
      if (rc !== ERROR_SUCCESS) throw new Error(`RegEnumKeyExW a échoué (code Win32 ${rc}).`); // i18n-ignore : erreur technique d'un appel Win32
      names.push(buffer.toString('utf16le', 0, length[0]! * 2));
    }
  } finally {
    w.RegCloseKey(handle[0]);
  }
  return names;
}

/**
 * Valeur HKLM\<path>\<name> : texte pour REG_SZ, nombre pour REG_DWORD, bigint
 * pour REG_QWORD, octets bruts sinon ; undefined si elle est absente ou illisible.
 */
export function hklmValue(path: string, name: string): RegistryValue | undefined {
  return valueAt(HKEY_LOCAL_MACHINE, path, name);
}

/** Valeur HKCU\<path>\<name>, lue comme hklmValue. */
export function hkcuValue(path: string, name: string): RegistryValue | undefined {
  return valueAt(HKEY_CURRENT_USER, path, name);
}

/**
 * Écrit HKCU\<path>\<name> : REG_DWORD pour un nombre, REG_SZ pour un texte. La clé doit déjà exister
 * (un jeu qui n'a jamais tourné n'a pas de réglages à corriger : on ne les invente pas). Lève une
 * erreur si l'écriture échoue.
 */
export function hkcuSetValue(path: string, name: string, value: string | number): void {
  const w = loadApi();
  const handle = [0];
  const opened = w.RegOpenKeyExW(HKEY_CURRENT_USER, path, 0, KEY_SET_VALUE, handle);
  if (opened !== ERROR_SUCCESS) throw new Error(`clé HKCU\\${path} introuvable (code Win32 ${opened}).`); // i18n-ignore : erreur technique d'un appel Win32
  try {
    let data: Buffer;
    let type: number;
    if (typeof value === 'number') {
      data = Buffer.alloc(4);
      data.writeUInt32LE(value >>> 0, 0);
      type = REG_DWORD;
    } else {
      data = Buffer.from(`${value}\0`, 'utf16le');
      type = REG_SZ;
    }
    const rc = w.RegSetValueExW(handle[0], name, 0, type, data, data.length);
    if (rc !== ERROR_SUCCESS) throw new Error(`RegSetValueExW a échoué pour ${name} (code Win32 ${rc}).`); // i18n-ignore : erreur technique d'un appel Win32
  } finally {
    w.RegCloseKey(handle[0]);
  }
}

function valueAt(root: number, path: string, name: string): RegistryValue | undefined {
  const w = loadApi();
  let size = 1024;
  for (let attempt = 0; attempt < 3; attempt++) {
    const data = Buffer.alloc(size);
    const type = [0];
    const length = [size];
    const rc = w.RegGetValueW(root, path, name, RRF_RT_ANY, type, data, length);
    if (rc === ERROR_MORE_DATA) {
      size = length[0]! + 2;
      continue;
    }
    if (rc !== ERROR_SUCCESS) return undefined;
    const bytes = data.subarray(0, length[0]);
    switch (type[0]) {
      case REG_SZ:
      case REG_EXPAND_SZ:
      case REG_MULTI_SZ:
        return bytes.toString('utf16le').replace(/\0+$/, '');
      case REG_DWORD:
        return bytes.readUInt32LE(0);
      case REG_QWORD:
        return bytes.readBigUInt64LE(0);
      default:
        return new Uint8Array(bytes);
    }
  }
  return undefined;
}
