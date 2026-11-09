// Intégrité de la mémoire de Windows (Sécurité Windows > Sécurité de l'appareil > Isolation du noyau,
// « HVCI ») : activée, Windows refuse les pilotes qui ne la respectent pas, comme celui de la Kinect
// pour Xbox 360 (kinectcamera.sys, 2013 : « Impossible de charger un pilote sur cet appareil »).
// Lecture seule du registre ; Cyber Pinball ne change jamais ce réglage de sécurité.

import { hklmValue } from './registry';

const HVCI = 'SYSTEM\\CurrentControlSet\\Control\\DeviceGuard\\Scenarios\\HypervisorEnforcedCodeIntegrity';

/** true : l'intégrité de la mémoire est activée (valeur Enabled = 1, effective depuis le dernier démarrage). */
export function memoryIntegrityEnabled(): boolean {
  if (process.platform !== 'win32') return false;
  try {
    return hklmValue(HVCI, 'Enabled') === 1;
  } catch {
    return false;
  }
}
