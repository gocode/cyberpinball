// QR code de la télécommande du téléphone (phone-remote.ts) : la matrice d'une adresse, sans
// Electron (les tests la décodent : remote.test.ts). Bibliothèque qrcode-generator (MIT).

import qrcode from 'qrcode-generator';

/** Matrice du QR code d'une adresse : lignes de « 0 » et « 1 ». Correction M : lisible un peu flou ou de biais. */
export function qrRows(text: string): string[] {
  const q = qrcode(0, 'M');
  q.addData(text, 'Byte');
  q.make();
  const n = q.getModuleCount();
  return Array.from({ length: n }, (_, y) => Array.from({ length: n }, (_, x) => (q.isDark(y, x) ? '1' : '0')).join(''));
}
