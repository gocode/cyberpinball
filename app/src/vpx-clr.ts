// La politique .NET de l'hôte s'applique à toutes les tables et tous leurs objets COM historiques.
import { ensureVpxClr } from '@cyberpinball/core';

export function prepareVpxClr(exe: string | undefined): void {
  if (!exe) return;
  try {
    if (ensureVpxClr(exe)) console.log('VPX : activation des composants ActiveX .NET avec le moteur .NET installé.'); // i18n-ignore : journal
  } catch (error) {
    console.error(`VPX : configuration de l’activation .NET impossible : ${(error as Error).message}`); // i18n-ignore : journal
  }
}
