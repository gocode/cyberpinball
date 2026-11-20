// Clé développeur de cette machine (packages/core/src/devkey.ts) : lue et vérifiée une fois par
// processus. Ouvre les fonctions réservées à qui maintient Cyber Pinball (VPX d'essai).
import { checkDevKey, readDevKeyText, updatePublicKey } from '@cyberpinball/core';
import { hklmValue } from '@cyberpinball/win-displays';

/** MachineGuid de Windows, lu dans le registre sans lancer de processus. */
export function machineGuid(): string | undefined {
  if (process.platform !== 'win32') return undefined;
  try {
    const value = hklmValue('SOFTWARE\\Microsoft\\Cryptography', 'MachineGuid');
    return typeof value === 'string' && value ? value : undefined;
  } catch {
    return undefined;
  }
}

let cached: { nom: string } | undefined | null = null;

/** La clé développeur de cette machine, si elle est là et valable ; sinon undefined. */
export function devKeyHere(): { nom: string } | undefined {
  if (cached === null) {
    cached = checkDevKey(readDevKeyText(), machineGuid(), updatePublicKey());
    console.log(cached ? `Clé développeur : valable (${cached.nom}).` : 'Clé développeur : aucune valable sur cette machine.'); // i18n-ignore : journal
  }
  return cached;
}
