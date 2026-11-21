// Cadrage d'une table reprise d'une autre installation (17/11/2026, joueur venu de PinUP Popper : « je mets en manuel
// et tout est nickel », mais rien ne le gardait).
//
// VPX 10.8.0 et 10.7 jouaient en mode borne la vue de la table, retouchée et enregistrée pour elle seule dans son .ini
// ([TableOverride] ViewCabHOfs, ViewCabVOfs, ViewCabScaleX…). VPX 10.8.1 ajoute le cadrage automatique ([Player]
// CabinetAutofitMode : 1 Ajuster, 2 Remplir, 0 Manuel), que Cyber Pinball impose dans VPinballX.ini pour le sens des
// tables (sync.ts, requireAutofit) : en cadrage automatique, VPX recalcule la vue et ne lit plus ces valeurs. Une table
// reprise arrivait donc « non réglée », alors que son .ini portait le cadrage fait pour cette borne. Le point de vue
// de VPX 10.8.1 enregistre CabinetAutofitMode avec la vue (PointOfViewSettingsPage) : un .ini qui a la vue sans la clé
// vient d'un VPX plus ancien. Cyber Pinball y pose le cadrage manuel pour cette table seule, si le sens de la partie
// reste le bon sur cette borne ; un cadrage choisi pour la table (clé présente) n'est jamais touché.

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Finding } from './doctor';
import { t } from './i18n';
import { IniDocument } from './ini';
import type { PlayfieldOrientation } from './sync';
import { vpxPlayedFlipperEdge } from './vpx';
import { findTableIni } from './vpx-settings';

/**
 * Valeurs qui cadrent la table en vue borne : échelle, décalages, position de la caméra. Les hauteurs de vitre
 * (ViewCabWindowTop/Bot), le mode et la rotation seuls n'en font pas une vue : le menu de VPX les écrit dès qu'on passe
 * la table en cadrage manuel et qu'on enregistre (The Matrix sur le PinCab, 21/11/2026), et l'échelle et les décalages
 * restent alors ceux que l'auteur a enregistrés dans le .vpx, pour son écran.
 */
const OWN_VIEW = /^ViewCab(HOfs|VOfs|ScaleX|ScaleY|ScaleZ|PlayerX|PlayerY|PlayerZ|LookAt|FOV|Layback)$/i;

/** Le .ini de la table a sa propre vue de borne (réglée en partie, POV, ou reprise d'une autre installation). */
export function hasOwnCabinetView(doc: IniDocument): boolean {
  return doc.entries().some((e) => e.section.toLowerCase() === 'tableoverride' && OWN_VIEW.test(e.key) && e.value.trim() !== '');
}

/** Le .ini de la table touche à la vue borne (ViewCab…), même sans la cadrer (hauteurs de vitre, mode, rotation). */
export function touchesCabinetView(doc: IniDocument): boolean {
  return doc.entries().some((e) => e.section.toLowerCase() === 'tableoverride' && /^ViewCab/i.test(e.key) && e.value.trim() !== '');
}

/**
 * La table a sa vue de borne dans son .ini, sans mode de cadrage (VPX d'avant 10.8.1) : le constat, réparé avant
 * chaque partie (le cadrage manuel posé pour elle seule). undefined si le sens de la partie changerait sur cette borne.
 */
export function importedViewFinding(tableFile: string, orientation?: PlayfieldOrientation): Finding | undefined {
  const ini = findTableIni(tableFile);
  if (!ini.exists) return undefined;
  const doc = IniDocument.parse(fs.readFileSync(ini.path, 'utf8'));
  if ((doc.get('Player', 'CabinetAutofitMode')?.trim() ?? '') !== '' || !hasOwnCabinetView(doc)) return undefined;
  if (orientation) {
    const global = IniDocument.parse(orientation.globalIni);
    const read = (section: string, key: string) => {
      if (section.toLowerCase() === 'player' && key.toLowerCase() === 'cabinetautofitmode') return '0';
      const own = doc.get(section, key);
      return own !== undefined && own.trim() !== '' ? own : global.get(section, key);
    };
    if (vpxPlayedFlipperEdge(read, orientation.window).edge !== orientation.edge) return undefined;
  }
  doc.set('Player', 'CabinetAutofitMode', '0');
  const file = path.basename(ini.path);
  return {
    code: 'importedView',
    severity: 'info',
    title: t('Cadrage réglé pour cette table'),
    detail: t(
      '{file} garde le cadrage réglé pour cette table dans l’installation d’où elle vient, que VPX 10.8.1 n’applique qu’en cadrage manuel. Il est repris pour cette table seule ; « Régler l’affichage en partie » permet de le retoucher ou de passer au cadrage automatique.',
      { file },
    ),
    fix: { label: t('Reprendre le cadrage réglé pour cette table'), ops: [{ op: 'write', path: ini.path, content: doc.toString() }] },
  };
}
