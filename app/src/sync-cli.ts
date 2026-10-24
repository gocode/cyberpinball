// npm run sync : ce que fera l'application à chaque démarrage. Relit les écrans,
// reconnaît la configuration de borne branchée, retrouve ses écrans par leur
// empreinte et réécrit son VPinballX.ini s'ils ont bougé.
// Codes de sortie : 0 à jour ou corrigé, 1 problème bloquant, 2 pas encore configuré,
// 3 configuration à choisir (--configuration "Nom" la choisit pour ces écrans).

// En premier : refuse toute écriture hors du bac à sable pendant un essai sans opérateur.
import './sandbox-guard';
import { describeDisplays, explainScore, formatChanges, loadCabinet, loadCabinetSet, rememberChoice, updateCabinetSet } from '@cyberpinball/core';
import { observedDisplays } from './displays';
import { locations, vpxProfile } from './paths';
import { syncConfiguration } from './vpx-ini';
import { describeReset, resetButtons } from './buttons-reset';

const loc = locations();
const cabinet = loadCabinet(loc.dataDir);
if (!cabinet) {
  console.log(`Aucune borne configurée dans ${loc.dataDir}. Lancez d'abord l'assistant d'écrans.`);
  process.exit(2);
}

// --boutons-par-defaut : touches par défaut des encodeurs, quand un mauvais relevé empêche de piloter la borne.
if (process.argv.includes('--boutons-par-defaut')) {
  const reset = resetButtons()!;
  console.log('Touches par défaut des encodeurs remises dans cabinet.json.');
  for (const line of describeReset(reset)) console.log(line);
  process.exit(reset.sync.plan.findings.some((f) => f.severity === 'blocking') ? 1 : 0);
}

const displays = observedDisplays();

// --configuration "Nom" : comme un choix sur l'écran « Quelle configuration ? », retenu pour ces écrans.
const wanted = argument('--configuration');
if (wanted) {
  const set = loadCabinetSet(loc.dataDir)!;
  const target = set.configurations.find((c) => c.name.toLowerCase() === wanted.toLowerCase() || c.id === wanted);
  if (!target) {
    console.log(`Aucune configuration « ${wanted} ». Configurations : ${set.configurations.map((c) => `« ${c.name} »`).join(', ')}.`);
    process.exit(3);
  }
  updateCabinetSet(loc.dataDir, (s) => rememberChoice(s, displays, target.id));
}

const { profile, source } = vpxProfile(loc);
console.log(`Profil : ${source}`);
// --reecrire : remet les valeurs de Cyber Pinball sur les clés gérées changées à la main.
const { selection, iniPath, sync } = syncConfiguration(displays, profile, process.argv.includes('--reecrire'));
if (!selection?.configuration || !sync || !iniPath) {
  console.log(`Écrans branchés : ${describeDisplays(displays)}.`);
  console.log(`[BLOQUANT] ${selection?.summary ?? 'Aucune configuration.'}`);
  for (const score of selection?.choice.scores ?? []) console.log(`  « ${score.name} » : ${explainScore(score)}`);
  console.log("Choisissez-la au démarrage du menu, ou : npm run sync -- --configuration \"Nom\". Pour ces écrans, une nouvelle configuration se crée avec l'assistant (menu > Configurations de la borne).");
  process.exit(3);
}
const { plan, report } = sync;

for (const f of [...selection.findings, ...plan.findings]) {
  const tag = { blocking: 'BLOQUANT', warning: 'ATTENTION', info: 'info' }[f.severity];
  console.log(`[${tag}] ${f.message}`);
}

if (plan.findings.some((f) => f.severity === 'blocking')) process.exit(1);

if (!report) {
  if (plan.manualEdits.length) {
    console.log(`Rien n'a été écrit dans ${iniPath}. Pour remettre les valeurs de Cyber Pinball : npm run sync -- --reecrire`);
  } else console.log(`VPinballX.ini est à jour (${iniPath}).`);
  process.exit(0);
}

console.log(`VPinballX.ini corrigé (${report.path}) :`);
for (const line of formatChanges(plan.changes)) console.log(`  ${line}`);
if (report.backup) console.log(`Ancienne version sauvegardée : ${report.backup}`);

function argument(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : process.argv.find((a) => a.startsWith(`${name}=`))?.slice(name.length + 1);
}
