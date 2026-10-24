// node packages/installer/dist/cli.js <commande>
//   setup <racine>     choisir la racine (vérification, dossiers, reprise des données)
//   install [id]       installer un composant du manifeste, ou tous les composants automatiques
//   status             état de la racine et des composants

import { resolveLocations } from '@cyberpinball/core';
import { componentStatus, findComponent, installComponent, loadManifest, setupRoot, type Component } from './index';

async function main(): Promise<number> {
  const [command, arg] = process.argv.slice(2);
  const locations = resolveLocations();

  if (command === 'setup') {
    if (!arg) throw new Error('Indiquez la racine, par exemple : setup D:\\CyberPinball');
    const report = setupRoot(arg, locations);
    console.log(`Racine de Cyber Pinball : ${report.root}`);
    for (const m of report.migrated) console.log(`  repris : ${m}`);
    return 0;
  }

  if (!locations.root) {
    console.log("Aucune racine choisie. Lancez d'abord : setup <dossier>");
    return 2;
  }

  if (command === 'install') {
    const components = arg ? [findComponent(arg)] : loadManifest().filter((c) => c.distribution === 'automatic');
    for (const component of components) await install(locations.root, component);
    return 0;
  }

  if (command === 'status') {
    console.log(`Racine : ${locations.root}`);
    console.log(`Données : ${locations.dataDir}`);
    console.log(`VPinballX.ini : ${locations.vpxIni}`);
    for (const component of loadManifest()) {
      const s = componentStatus(locations.root, component);
      const state = s.installed ? (s.active ? 'installé, actif' : 'installé, inactif') : 'non installé';
      console.log(`${component.name} ${component.version} : ${state}`);
      if (s.executable) console.log(`  ${s.executable}`);
    }
    return 0;
  }

  console.log('Commandes : setup <racine>, install [id], status');
  return 1;
}

async function install(root: string, component: Component): Promise<void> {
  console.log(`${component.name} ${component.version} (${component.variant ?? ''} ${component.platform}, ${component.channel})`);
  let lastShown = -1;
  const result = await installComponent(root, component, (received, total) => {
    const pct = Math.floor((received / total) * 100);
    if (pct !== lastShown && pct % 5 === 0) {
      lastShown = pct;
      process.stdout.write(`\r  téléchargement ${pct} % (${(received / 1e6).toFixed(0)} / ${(total / 1e6).toFixed(0)} Mo)`);
    }
  });
  if (lastShown >= 0) process.stdout.write('\n');
  console.log(result.alreadyInstalled ? '  déjà installé, version rendue active' : '  installé et vérifié (SHA-256)');
  console.log(`  dossier     : ${result.dir}`);
  console.log(`  active via  : ${result.current}`);
  console.log(`  exécutable  : ${result.executable}`);
}

main().then(
  (code) => process.exit(code),
  (error: Error) => {
    console.error(error.message);
    process.exit(1);
  },
);
