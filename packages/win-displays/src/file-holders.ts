// Programmes qui tiennent ouverts des fichiers, par le gestionnaire de redémarrage de Windows (Restart Manager,
// rstrtmgr.dll) : ce que l'Explorateur utilise pour dire « Le fichier est ouvert dans … ». Sert à expliquer un
// déplacement refusé (EPERM, EBUSY : une table qu'on met à la corbeille pendant que VPX, un lecteur ou l'Explorateur
// tient un de ses fichiers ; 19/11/2026). Lecture seule : rien n'est fermé ni arrêté.

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as koffi from 'koffi';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type NativeFn = (...args: any[]) => any;

const CCH_RM_SESSION_KEY = 32;
const ERROR_SUCCESS = 0;
const ERROR_MORE_DATA = 234;
/** Programmes lus au plus : au-delà, la liste n'aide plus à choisir quoi fermer. */
const MAX_HOLDERS = 16;
/** Fichiers d'un dossier soumis au plus : une table et ses médias, pas un disque entier. */
const MAX_FILES = 2000;

interface Api {
  RmStartSession: NativeFn;
  RmRegisterResources: NativeFn;
  RmGetList: NativeFn;
  RmEndSession: NativeFn;
}

let api: Api | undefined;

function loadApi(): Api {
  if (api) return api;
  const lib = koffi.load('rstrtmgr.dll');
  const unique = koffi.struct('CpRmUniqueProcess', { dwProcessId: 'uint32_t', startLow: 'uint32_t', startHigh: 'uint32_t' });
  const info = koffi.struct('CpRmProcessInfo', {
    Process: unique,
    strAppName: koffi.array('char16_t', 256, 'String'),
    strServiceShortName: koffi.array('char16_t', 64, 'String'),
    ApplicationType: 'int',
    AppStatus: 'uint32_t',
    TSSessionId: 'uint32_t',
    bRestartable: 'int',
  });
  const list = koffi.array(info, MAX_HOLDERS);
  api = {
    RmStartSession: lib.func('uint32_t __stdcall RmStartSession(_Out_ uint32_t *session, uint32_t flags, _Out_ char16_t *key)'),
    RmRegisterResources: lib.func('uint32_t __stdcall RmRegisterResources(uint32_t session, uint32_t nFiles, const char16_t **files, uint32_t nApps, void *apps, uint32_t nServices, void *services)'),
    RmGetList: lib.func('RmGetList', 'uint32_t', ['uint32_t', koffi.out(koffi.pointer('uint32_t')), koffi.inout(koffi.pointer('uint32_t')), koffi.out(koffi.pointer(list)), koffi.out(koffi.pointer('uint32_t'))]),
    RmEndSession: lib.func('uint32_t __stdcall RmEndSession(uint32_t session)'),
  };
  return api;
}

/** Les fichiers d'un chemin : lui-même, ou ceux d'un dossier (récursif, borné). */
function filesOf(target: string): string[] {
  const out: string[] = [];
  const walk = (p: string) => {
    if (out.length >= MAX_FILES) return;
    let stat: fs.Stats;
    try {
      stat = fs.lstatSync(p);
    } catch {
      return;
    }
    if (stat.isDirectory()) {
      let names: string[] = [];
      try {
        names = fs.readdirSync(p);
      } catch {
        return;
      }
      for (const n of names) walk(path.join(p, n));
    } else out.push(p);
  };
  walk(target);
  return out;
}

/** Programme qui tient un fichier : son nom affiché par Windows et son numéro de processus. */
export interface FileHolder {
  name: string;
  pid: number;
}

/**
 * Les programmes qui tiennent ouverts `target` (un fichier, ou les fichiers d'un dossier) ; [] si aucun, ou si Windows ne
 * sait pas le dire (hors Windows, droits insuffisants). Ne lève jamais : sert à expliquer une erreur, pas à en créer.
 */
export function fileHolders(target: string): FileHolder[] {
  if (process.platform !== 'win32') return [];
  const files = filesOf(target);
  if (!files.length) return [];
  let w: Api;
  try {
    w = loadApi();
  } catch {
    return [];
  }
  const session = [0];
  const key = Buffer.alloc((CCH_RM_SESSION_KEY + 1) * 2);
  try {
    if (w.RmStartSession(session, 0, key) !== ERROR_SUCCESS) return [];
  } catch {
    return [];
  }
  try {
    if (w.RmRegisterResources(session[0], files.length, files, 0, null, 0, null) !== ERROR_SUCCESS) return [];
    const needed = [0];
    const count = [MAX_HOLDERS];
    // Paramètre de sortie de koffi : un tableau d'un élément, rempli au retour (ici, le tableau des programmes).
    const out: ({ Process: { dwProcessId: number }; strAppName: string }[] | null)[] = [null];
    const reasons = [0];
    const status = w.RmGetList(session[0], needed, count, out, reasons) as number;
    if (status !== ERROR_SUCCESS && status !== ERROR_MORE_DATA) return [];
    const infos = out[0] ?? [];
    const holders: FileHolder[] = [];
    for (const info of infos.slice(0, Math.min(count[0]!, MAX_HOLDERS))) {
      const pid = info.Process.dwProcessId;
      if (!pid || pid === process.pid || holders.some((h) => h.pid === pid)) continue;
      holders.push({ name: info.strAppName || `pid ${pid}`, pid });
    }
    return holders;
  } catch {
    return [];
  } finally {
    try {
      w.RmEndSession(session[0]);
    } catch {
      // La session se ferme avec le processus.
    }
  }
}
