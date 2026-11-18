// Sonde du PIN2DMD (bêta du DMD réel) : un PIN2DMD reconnu à son identifiant USB, au bon pilote, peut
// quand même rester noir en partie, parce que libdmdutil abandonne en silence quand libusb_open ou
// libusb_claim_interface échoue (pilote que la libusb de VPX ne sait pas utiliser, carte déjà tenue
// par dmdext ou un autre front-end), ou quand la carte ne donne pas l'un des trois noms qu'il connaît.
// La sonde (sonde-pin2dmd.ts, processus à part) fait les mêmes étapes que VPX, avec sa libusb, puis
// relâche tout.
//
// Quand : au démarrage du front-end, au retour d'une partie et après un choix de « DMD réel »
// (applyMenuDmdServer), et quand le serveur du DMD abandonne faute d'afficheur (dmd-server.ts) ; jamais
// pendant une partie, ni tant que le serveur du DMD tourne (il tient la carte, ou essaie de la prendre). Son résultat est joint au PIN2DMD de la liste
// des périphériques (libusbProbe) : l'écran « DMD réel », la Santé de la borne et les points à
// vérifier avant chaque partie le disent sans rien sonder eux-mêmes.

import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { dmdHolders, HARDWARE_DMD_IDS, offscreenMode, simulatedProcessNames, type LibusbProbe, type ObservedUsbDevice } from '@cyberpinball/core';
import { runningProcessNames } from '@cyberpinball/win-displays';
import { locations, vpxInstall } from './paths';

/** Au-delà, la sonde est arrêtée et rien n'est conclu (un pilote figé ne fige pas le front-end). */
const PROBE_TIMEOUT_MS = 8000;

const PIN2DMD_IDS = HARDWARE_DMD_IDS.PIN2DMD;

let result: { ids: string[]; probe: LibusbProbe } | undefined;
let running = false;
let again = false;
const listeners: (() => void)[] = [];

function isPin2dmd(d: ObservedUsbDevice): boolean {
  return PIN2DMD_IDS.some((id) => id.vid === d.vid && id.pid === d.pid);
}

/**
 * Programmes ouverts qui gardent souvent un DMD réel. Pendant un essai sans opérateur (périphériques
 * simulés, rendu hors écran), seulement ceux de CYBERPINBALL_AUTRES_MENUS : le résultat ne dépend pas
 * de ce qui tourne sur le poste.
 */
export function dmdHolderNames(): string[] {
  const simulated = simulatedProcessNames(process.env, fs.existsSync);
  if (simulated) return dmdHolders(simulated);
  if (process.env.CYBERPINBALL_USB_DEVICES || offscreenMode(process.env)) return [];
  try {
    return dmdHolders(runningProcessNames());
  } catch {
    return [];
  }
}

/** La libusb de VPX (plugins\dmdutil), celle que DMDUtil chargera ; undefined sans VPX. */
export function vpxLibusb(): string | undefined {
  const vpx = vpxInstall(locations());
  if (!vpx) return undefined;
  const dll = path.join(path.dirname(vpx.exe), 'plugins', 'dmdutil', 'libusb64-1.0.dll');
  return fs.existsSync(dll) ? dll : undefined;
}

/** Une sonde, dans CyberPinball.exe en mode Node ; undefined : pas de réponse lisible. */
export function runPin2dmdProbe(dll: string, script = path.join(__dirname, 'sonde-pin2dmd.js')): Promise<LibusbProbe | undefined> {
  return new Promise((resolve) => {
    let out = '';
    const child = spawn(process.execPath, [script, dll], {
      windowsHide: true,
      // Dossier de la DLL : ses voisines (UsbDk, CRT) y sont cherchées en premier.
      cwd: path.dirname(dll),
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const timer = setTimeout(() => {
      child.kill();
      resolve(undefined);
    }, PROBE_TIMEOUT_MS);
    child.stdout?.on('data', (data: Buffer) => (out += data.toString('utf8')));
    const finish = () => {
      clearTimeout(timer);
      try {
        const line = out.trim().split(/\r?\n/).pop() ?? '';
        const parsed = JSON.parse(line) as LibusbProbe;
        const known = ['list', 'open', 'claim', 'name', 'ok'].includes(parsed.stage) && typeof parsed.code === 'number';
        resolve(known ? { stage: parsed.stage, code: parsed.code, ...(typeof parsed.product === 'string' ? { product: parsed.product } : {}) } : undefined);
      } catch {
        resolve(undefined);
      }
    };
    child.once('exit', finish);
    child.once('error', () => {
      clearTimeout(timer);
      resolve(undefined);
    });
  });
}

/** La liste des périphériques, avec le résultat de la dernière sonde joint au PIN2DMD. */
export function withPin2dmdProbe(devices: ObservedUsbDevice[]): ObservedUsbDevice[] {
  if (!result) return devices;
  const { ids, probe } = result;
  return devices.map((d) => (ids.includes(d.instanceId) ? { ...d, libusbProbe: probe } : d));
}

/** Le serveur du DMD tient l'afficheur (image du front-end) : la dernière sonde ne vaut plus. */
export function clearPin2dmdProbe(): void {
  if (!result) return;
  result = undefined;
  for (const l of listeners) l();
}

/** Après chaque sonde : la Santé et l'écran « DMD réel » se redessinent. */
export function onPin2dmdProbe(listener: () => void): void {
  listeners.push(listener);
}

/**
 * Sonde de nouveau le PIN2DMD branché, s'il y en a un. Une seule sonde à la fois ; une demande pendant
 * qu'elle tourne en relance une à la fin. Sans PIN2DMD, la dernière sonde est oubliée.
 */
export function refreshPin2dmdProbe(devices: ObservedUsbDevice[]): void {
  // Périphériques simulés : leur fichier porte déjà, s'il le faut, le résultat de la sonde.
  if (process.env.CYBERPINBALL_USB_DEVICES) return;
  const ids = devices.filter(isPin2dmd).map((d) => d.instanceId);
  if (!ids.length) return clearPin2dmdProbe();
  const dll = vpxLibusb();
  if (!dll) return;
  if (running) {
    again = true;
    return;
  }
  running = true;
  void runPin2dmdProbe(dll).then((probe) => {
    running = false;
    if (probe) {
      const busy = probe.stage === 'open' || probe.stage === 'claim';
      const holders = busy ? dmdHolderNames() : [];
      result = { ids, probe: holders.length ? { ...probe, holders } : probe };
      const named = probe.product === undefined ? '' : `, nom « ${probe.product} »`; // i18n-ignore : journal
      console.log(`DMD réel, sonde du PIN2DMD : étape ${probe.stage}, code ${probe.code}${named}${holders.length ? ` ; ouverts : ${holders.join(', ')}` : ''}.`); // i18n-ignore : journal
      for (const l of listeners) l();
    } else {
      console.log('DMD réel, sonde du PIN2DMD : pas de réponse (8 s), rien de conclu.'); // i18n-ignore : journal
    }
    if (again) {
      again = false;
      refreshPin2dmdProbe(devices);
    }
  });
}
