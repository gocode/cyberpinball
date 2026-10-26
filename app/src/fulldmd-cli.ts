// npm run habillage : l'habillage FullDMD de chaque table, sans rien lancer ni rien changer aux
// tables (seul le cache des cadres, <racine>\data\cache\fulldmd-cadres.json, est complété).
// Pour chaque table : le cadre trouvé dans son média FullDMD, la fenêtre du DMD que VPX ouvrira
// en partie, et si elle recouvre l'habillage (le défaut signalé sur The Walking Dead, 26 octobre
// 2026 : le DMD étiré sur tout l'écran). Lancé par Electron (npm run habillage), il lit aussi les
// vidéos FullDMD, hors écran ; par Node seul (node app/dist/fulldmd-cli.js), les images PNG et le cache.
// Codes de sortie : 0 aucune table touchée, 1 au moins une table dont le DMD recouvrirait
// l'habillage, 2 pas de borne ou pas de FullDMD.

// En premier : refuse toute écriture hors du bac à sable pendant un essai sans opérateur.
import './sandbox-guard';
import * as path from 'node:path';
import { dmdKindOf, dressCoverage, DRESS_COVERED, fullDmdReasonLabel, gameDmdWindow, layoutOf, loadCabinet, resolveLanguage, scanTables, setLanguage, t, type TableDressing } from '@cyberpinball/core';
import { analyseDressing } from './fulldmd';
import { app } from 'electron';
import { createConverter, type Converter } from './media-convert';
import { locations } from './paths';
import { cachedScript } from './vbs';

const loc = locations();
setLanguage(resolveLanguage({ env: process.env, dataDir: loc.dataDir, system: [Intl.DateTimeFormat().resolvedOptions().locale] }));

/** Ce que voit le joueur en partie, d'après l'habillage et le .ini de la table. */
function verdict(d: TableDressing): { touched: boolean; line: string } {
  const plan = d.plan;
  if (!plan.dressed) return { touched: false, line: t('pas d’habillage : {reason}', { reason: fullDmdReasonLabel(plan.reason) }) };
  const w = plan.window;
  const frame = { w: w.width, h: w.height, x: w.x, y: w.y };
  if (d.ours) return { touched: false, line: t('habillé (cadre {w} × {h} en {x}, {y}), DMD posé dans le cadre', frame) };
  if (!d.current.keys.length) return { touched: false, line: t('habillé (cadre {w} × {h} en {x}, {y}), DMD posé dans le cadre à la prochaine partie', frame) };
  const share = d.zone ? dressCoverage(gameDmdWindow(d)!, d.zone, w) : 0;
  if (share >= DRESS_COVERED) {
    return { touched: true, line: t('DMD sur l’habillage ({share} % recouvert) : place réglée dans {file} ; fiche > Diagnostic pour le poser dans le cadre ({w} × {h} en {x}, {y})', { ...frame, share: Math.round(share * 100), file: path.basename(d.iniPath) }) };
  }
  return { touched: false, line: t('habillé (cadre {w} × {h} en {x}, {y}), place du DMD réglée en partie et gardée', frame) };
}

async function main(converter?: Pick<Converter, 'mediaFrames'>): Promise<number> {
  const cabinet = loadCabinet(loc.dataDir);
  if (!loc.root || !cabinet) {
    console.log(`Aucune borne configurée dans ${loc.dataDir}.`);
    return 2;
  }
  if (dmdKindOf(cabinet) !== 'fulldmd') {
    console.log("L'écran du DMD de la configuration active n'est pas un FullDMD : pas d'habillage en partie.");
    return 2;
  }
  let touched = 0;
  for (const entry of scanTables(layoutOf(loc.root).tables)) {
    const d = await analyseDressing(entry, { root: loc.root, dataDir: loc.dataDir, cabinet, facts: cachedScript(entry.file, loc.dataDir), converter });
    const v = verdict(d);
    if (v.touched) touched++;
    console.log(`${v.touched ? '[À CORRIGER]' : '           '} ${entry.title} : ${v.line}`);
  }
  console.log(touched ? `${touched} table(s) dont le DMD recouvrirait l'habillage en partie.` : 'Aucune table dont le DMD recouvrirait l’habillage en partie.');
  return touched ? 1 : 0;
}

if (process.versions.electron) {
  // Par Electron : les vidéos FullDMD sont lues dans une page hors écran, jamais montrée.
  // Sous Node, « electron » n'est que le chemin de son exécutable : rien n'en est utilisé.
  // Sans fenêtre, Electron ne doit pas s'arrêter de lui-même ; une erreur arrête le diagnostic en échec.
  app.on('window-all-closed', () => undefined);
  process.on('uncaughtException', (error) => {
    console.error(`Diagnostic interrompu : ${error?.stack ?? String(error)}`);
    app.exit(3);
  });
  void (async () => {
    app.disableHardwareAcceleration();
    await app.whenReady();
    try {
      app.exit(await main(createConverter()));
    } catch (error) {
      console.error(`Diagnostic interrompu : ${(error as Error)?.stack ?? String(error)}`);
      app.exit(3);
    }
  })();
} else {
  void main().then((code) => process.exit(code));
}
