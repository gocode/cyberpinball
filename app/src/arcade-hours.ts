// Horaire de la borne (packages/core/src/arcadehours.ts) : ce qui touche Windows, en lecture
// seulement. Quels boutons peuvent réveiller la borne ? Windows le dit (MSPower_DeviceWakeEnable,
// la case « Autoriser ce périphérique à sortir l'ordinateur du mode veille » du Gestionnaire de
// périphériques) ; Cyber Pinball ne la coche jamais lui-même.

import { execFile } from 'node:child_process';
import { parseWakeDevices } from '@cyberpinball/core';

const WAKE_SCRIPT = `
$w = Get-CimInstance -Namespace root/wmi -ClassName MSPower_DeviceWakeEnable -ErrorAction Stop | Where-Object Enable
$out = foreach ($d in $w) {
  $id = $d.InstanceName -replace '_\d+$', ''
  $p = Get-CimInstance Win32_PnPEntity -Filter ("PNPDeviceID='" + ($id -replace '\\', '\\') + "'")
  [pscustomobject]@{ name = $p.Name; cls = $p.PNPClass }
}
@($out) | ConvertTo-Json -Compress
`;

/**
 * Boutons, claviers et souris que Windows autorise à réveiller le PC ; null si Windows n'a pas
 * répondu (liste indisponible, à ne pas confondre avec une liste vide). En essai (`simulated`),
 * rien n'est lu : CYBERPINBALL_REVEIL en donne la liste (noms séparés par |, « - » : indisponible), vide sinon.
 */
export function readWakeDevices(simulated: boolean, env: NodeJS.ProcessEnv = process.env): Promise<string[] | null> {
  if (simulated) {
    const fake = env.CYBERPINBALL_REVEIL ?? '';
    return Promise.resolve(fake === '-' ? null : fake.split('|').map((s) => s.trim()).filter(Boolean));
  }
  return new Promise((resolve) => {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', WAKE_SCRIPT], { windowsHide: true, timeout: 15_000 }, (error, stdout) => {
      try {
        // Rien d'autorisé : ConvertTo-Json d'une liste vide ne dit rien.
        resolve(error ? null : stdout.trim() ? parseWakeDevices(JSON.parse(stdout)) : []);
      } catch {
        resolve(null);
      }
    });
  });
}
