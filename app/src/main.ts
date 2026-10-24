// Point d'entrée de l'application. Premier démarrage (pas encore de borne
// configurée) ou --assistant : assistant (--boutons, --son… : une seule de ses étapes).
// --reglages : écran de réglages de VPX seul. Sinon : menu des tables.

// En premier : refuse toute écriture hors du bac à sable pendant un essai sans opérateur.
import './sandbox-guard';
// Puis, avant le démarrage d'Electron : le mode hors écran des essais sans opérateur.
import { OFFSCREEN, relaunchOnHiddenDesktop } from './offscreen';
// Puis la langue de l'interface, avant les modules qui affichent quelque chose.
import './language';
import { app } from 'electron';
import { layoutOf, loadCabinet, scanTables, wizardStepOf } from '@cyberpinball/core';
import { startFrontend } from './frontend';
import { locations } from './paths';
import { otherFrontendsGate } from './frontend-gate';
import { guardScreens } from './screen-guard';
import { startSettingsAlone } from './settings';
import { journalUncaught } from './uncaught';
import { startWizard } from './wizard';

const loc = locations();
// À l'écran, une erreur non rattrapée est notée dans <données>\logs\erreurs.txt et
// l'application continue, sans boîte modale (hors écran : l'essai s'arrête, offscreen.ts).
if (!OFFSCREEN) journalUncaught(loc.dataDir);
const wantsSettings = process.argv.includes('--reglages');
const wantsWizard = !wantsSettings && (process.argv.includes('--assistant') || wizardStepOf(process.argv) !== undefined || !loadCabinet(loc.dataDir));

// Essai sans opérateur lancé sur le bureau de l'utilisateur : il se refait sur le bureau caché.
if (!relaunchOnHiddenDesktop()) {
  app.whenReady().then(async () => {
    // Un autre menu de borne ouvert (PinUP Popper…) : aucun écran n'est pris avant qu'il soit
    // fermé, ou que l'utilisateur choisisse de continuer quand même.
    const gate = await otherFrontendsGate();
    if (!gate.proceed) return app.quit();
    // Avant toute autre fenêtre : chaque écran de la borne est couvert dès maintenant.
    guardScreens();
    if (wantsSettings) void startSettingsAlone(loc.root ? scanTables(layoutOf(loc.root).tables) : []);
    else if (wantsWizard) startWizard();
    else startFrontend();
    gate.close();
  });
  app.on('window-all-closed', () => app.quit());
}
