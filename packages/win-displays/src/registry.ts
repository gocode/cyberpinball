// Lecture seule du registre de Windows par l'API Unicode (advapi32), sans passer
// par reg.exe : sa sortie suit la page de code de la console et abîme les
// accents (« Haut-parleurs/écouteurs »), alors que VPX compare les noms de
// sortie audio à l'octet près. Rien ici n'écrit dans le registre.

import * as koffi from 'koffi';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type NativeFn = (...args: any[]) => any;

/** HKEY_LOCAL_MACHINE, étendu sur 64 bits comme le fait winreg.h ((HKEY)(LONG)0x80000002). */
const HKEY_LOCAL_MACHINE = -0x7ffffffe;
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

interface Api {
  RegOpenKeyExW: NativeFn;
  RegEnumKeyExW: NativeFn;
  RegCloseKey: NativeFn;
  RegGetValueW: NativeFn;
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
  const w = loadApi();
  let size = 1024;
  for (let attempt = 0; attempt < 3; attempt++) {
    const data = Buffer.alloc(size);
    const type = [0];
    const length = [size];
    const rc = w.RegGetValueW(HKEY_LOCAL_MACHINE, path, name, RRF_RT_ANY, type, data, length);
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
