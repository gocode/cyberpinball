import type { FingerprintStrength, ObservedDisplay, PhysicalScreen } from './model';

// Valeurs de série binaires que certains fabricants mettent par défaut : inutilisables.
const BOGUS_SERIALS = new Set([0, 0x01010101, 0xffffffff]);

export interface Fingerprint {
  key: string;
  strength: FingerprintStrength;
  /** Modèle sans numéro de série : sert à rapprocher les empreintes faibles. */
  modelKey: string;
}

/**
 * Empreinte stable d'un écran. Forte quand l'EDID porte un numéro de série ;
 * faible sinon, et complétée par l'instance de connexion (port), qui survit à un
 * redémarrage mais pas à un changement de câble.
 */
export function fingerprintOf(display: ObservedDisplay): Fingerprint {
  const edid = display.edid;
  if (!edid) {
    const key = `UNKNOWN@${connectionInstance(display.devicePath)}`;
    return { key, strength: 'weak', modelKey: key };
  }

  const product = edid.productCode.toString(16).toUpperCase().padStart(4, '0');
  const size = `${edid.widthCm}x${edid.heightCm}cm`;
  const modelKey = `${edid.manufacturer}-${product}-${size}`;

  const serial = edid.serialText || (BOGUS_SERIALS.has(edid.serialNumber) ? '' : String(edid.serialNumber));
  if (serial) {
    return { key: `${edid.manufacturer}-${product}-${sanitize(serial)}-${size}`, strength: 'strong', modelKey };
  }
  return { key: `${modelKey}@${connectionInstance(display.devicePath)}`, strength: 'weak', modelKey };
}

/** Extrait l'identifiant d'instance du chemin de périphérique (« 8&20834467&0&UID257 »). */
export function connectionInstance(devicePath: string): string {
  const parts = devicePath.split('#');
  return parts.length >= 3 ? parts[2]! : devicePath;
}

function sanitize(value: string): string {
  return value.replace(/[^0-9A-Za-z_.]/g, '_');
}

export function modelKeyOfScreen(screen: PhysicalScreen): string {
  const at = screen.fingerprint.indexOf('@');
  if (at !== -1) return screen.fingerprint.slice(0, at);
  // Empreinte forte « MFG-PROD-SERIE-WxHcm » : on retire la série.
  const parts = screen.fingerprint.split('-');
  return parts.length >= 4 ? `${parts[0]}-${parts[1]}-${parts.at(-1)}` : screen.fingerprint;
}

/** Libellé lisible pour l'assistant et le médecin. */
export function describeDisplay(display: ObservedDisplay): string {
  const name = display.friendlyName || display.edid?.monitorName || display.monitorDescription || 'Écran sans nom';
  return `${name} (${display.bounds.width} × ${display.bounds.height})`;
}

export function toPhysicalScreen(display: ObservedDisplay): PhysicalScreen {
  const fp = fingerprintOf(display);
  return {
    fingerprint: fp.key,
    strength: fp.strength,
    label: describeDisplay(display),
    widthPx: display.bounds.width,
    heightPx: display.bounds.height,
    widthCm: display.edid?.widthCm ?? 0,
    heightCm: display.edid?.heightCm ?? 0,
    lastSeen: display,
  };
}
