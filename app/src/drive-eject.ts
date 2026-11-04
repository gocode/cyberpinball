// Éjecter une clé USB après une sauvegarde (« Éjecter la clé ») : le verbe « Éjecter » de
// l'Explorateur, demandé par PowerShell sans fenêtre, puis vérifié : la clé peut être débranchée
// quand son lecteur a disparu. Hors écran (essais) : jamais un vrai lecteur, la réponse est simulée.

import { execFile } from 'node:child_process';
import * as fs from 'node:fs';
import type { DriveInfo } from '@cyberpinball/core';

export function ejectDrive(drive: DriveInfo, simulated: boolean): Promise<boolean> {
  if (simulated || drive.path) return Promise.resolve(true);
  const letter = drive.letter.replace(/[^A-Za-z:]/g, '');
  if (!/^[A-Za-z]:$/.test(letter)) return Promise.resolve(false);
  const script = `(New-Object -ComObject Shell.Application).Namespace(17).ParseName('${letter}').InvokeVerb('Eject'); Start-Sleep -Seconds 2`;
  return new Promise((resolve) => {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true, timeout: 15000 }, () => {
      resolve(!fs.existsSync(`${letter}\\`));
    });
  });
}
