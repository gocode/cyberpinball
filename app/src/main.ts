// Point d'entrée de l'application. Premier démarrage (pas encore de borne
// configurée) ou --assistant : assistant (--boutons, --son… : une seule de ses étapes).
// --reglages : écran de réglages de VPX seul. Sinon : menu des tables.

// En premier : refuse toute écriture hors du bac à sable pendant un essai sans opérateur.
import './sandbox-guard';
// Puis, en bac à sable, un profil de Chromium à lui : deux essais en même temps ne se gênent plus.
import './sandbox-profile';
// Puis, avant le démarrage d'Electron : le mode hors écran des essais sans opérateur.
import { OFFSCREEN, relaunchOnHiddenDesktop } from './offscreen';
// Puis une restauration préparée (Sauvegardes) : ses fichiers posés avant que quoi que ce soit ne les lise.
import './restore-on-start';
// Puis l'orientation des écrans pendant la session : sa sortie (will-quit) passe avant celle de la
// borne dédiée, qui sort avec son propre code.
import { startOrientation } from './display-orientation';
// Puis la borne dédiée (Cyber Pinball lancé par Shell Launcher) : son option retirée des
// arguments, ceux d'une relance repris, avant les modules qui les lisent.
import './dedicated-session';
// Puis la langue de l'interface, avant les modules qui affichent quelque chose.
import './language';
import { app } from 'electron';
import { layoutOf, loadCabinet, scanTables, wizardStepOf } from '@cyberpinball/core';
import { startFrontend } from './frontend';
import { locations } from './paths';
import { otherFrontendsGate } from './frontend-gate';
import { guardScreens } from './screen-guard';
import { startSettingsAlone } from './settings';
import { superviseCabinet } from './supervisor';
import { journalConsole } from './journal';
import { journalUncaught } from './uncaught';
import { startWizard } from './wizard';

const loc = locations();
// Tout ce que l'application écrit dans sa console, aussi dans <données>\logs\journal.txt : un essai sur la borne s'explique après coup.
journalConsole(loc.dataDir);
// À l'écran, une erreur non rattrapée est notée dans <données>\logs\erreurs.txt et
// l'application continue, sans boîte modale (hors écran : l'essai s'arrête, offscreen.ts).
if (!OFFSCREEN) journalUncaught(loc.dataDir);
const wantsSettings = process.argv.includes('--reglages');
const wantsWizard = !wantsSettings && (process.argv.includes('--assistant') || wizardStepOf(process.argv) !== undefined || !loadCabinet(loc.dataDir));

// Shell du compte (« Borne dédiée » sans Shell Launcher) : ce processus n'est que le surveillant
// qui lance et relance Cyber Pinball. Sinon, un essai sans opérateur lancé sur le bureau de
// l'utilisateur se refait sur le bureau caché.
if (!superviseCabinet(loc.dataDir) && !relaunchOnHiddenDesktop()) {
  app.whenReady().then(async () => {
    // Un autre menu de borne ouvert (PinUP Popper…) : aucun écran n'est pris avant qu'il soit
    // fermé, ou que l'utilisateur choisisse de continuer quand même.
    const gate = await otherFrontendsGate();
    if (!gate.proceed) return app.quit();
    // Avant toute autre fenêtre : chaque écran de la borne est couvert dès maintenant.
    guardScreens();
    // Puis l'écran du playfield dans son orientation de jeu, pour la session seulement, avant que
    // le menu ou l'assistant ne lisent les écrans.
    await startOrientation();
    if (wantsSettings) void startSettingsAlone(loc.root ? scanTables(layoutOf(loc.root).tables) : []);
    else if (wantsWizard) startWizard();
    else startFrontend();
    gate.close();
  });
  app.on('window-all-closed', () => app.quit());
}
