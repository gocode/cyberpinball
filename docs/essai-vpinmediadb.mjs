// Essai réel de VPinMediaDB (T10), sans fenêtre : lit le vrai index sur GitHub,
// mesure les poids en 1k et en 4k (requêtes HEAD), puis télécharge les médias d'un
// jeu dans un bac à sable (tmp\essai-vpinmediadb par défaut), comme le ferait
// « Chercher les médias ». Rien n'est écrit hors du bac à sable.
//
//   npm run build
//   node docs/essai-vpinmediadb.mjs [--racine <dossier>] [--jeu BunvWvh9] [--types Wheel,Backglass] [--qualite 1k|4k] [--echantillon 12]
//
// Sans --types, rien n'est téléchargé hormis l'index : seulement les mesures.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const core = require(path.join(here, '..', 'packages', 'core', 'dist', 'index.js'));

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const racine = path.resolve(opt('racine', path.join(here, '..', 'tmp', 'essai-vpinmediadb')));
const jeu = opt('jeu', 'BunvWvh9');
const types = opt('types', '').split(',').filter(Boolean);
const qualite = opt('qualite', '1k');
const echantillon = Number(opt('echantillon', '12'));

const downloads = path.join(racine, 'downloads');
const t0 = Date.now();
const refresh = await core.refreshMediaDb(downloads, { force: true });
const db = core.loadMediaDb(downloads);
if (!db) {
  console.log(`Index introuvable (${refresh.status} ${refresh.message ?? ''}).`);
  process.exit(1);
}
const indexSize = fs.statSync(path.join(downloads, core.MEDIADB_INDEX_FILE)).size;
console.log(`Index : ${refresh.status}, ${db.entries.size} jeux, ${core.formatSize(indexSize)} en ${Date.now() - t0} ms -> ${downloads}`);
const again = await core.refreshMediaDb(downloads);
console.log(`Deuxième lecture : ${again.status} (moins de 12 h : GitHub n’est pas interrogé)`);
const forced = await core.refreshMediaDb(downloads, { force: true });
console.log(`Vérification forcée : ${forced.status} (ETag, réponse 304 si l’index n’a pas changé)`);

// Poids d'un jeu et d'un échantillon, en 1k et en 4k : la sélection par défaut
// (vidéo du plateau quand elle existe), puis l'image du plateau seule.
async function volumes(entry) {
  const out = {};
  for (const q of ['1k', '4k']) {
    const offers = core.mediaDbOffers(entry, q);
    const files = offers.flatMap((o) => o.variants.map((v) => v.file));
    const sizes = await core.mediaDbSizes(files, { downloadsDir: downloads });
    const sum = (list) => list.reduce((n, f) => n + (sizes.get(f.url) ?? 0), 0);
    const image = offers.find((o) => o.type === 'Playfield')?.variants.find((v) => v.kind === 'image');
    out[q] = {
      defaut: sum(offers.map((o) => o.variants[0].file)),
      imagesSeules: sum(offers.map((o) => (o.variants.find((v) => v.kind !== 'video') ?? o.variants[0]).file)),
      plateauImage: image ? sizes.get(image.file.url) ?? 0 : 0,
      detail: offers.map((o) => `${o.type} ${o.variants.map((v) => `${v.key} ${core.formatSize(sizes.get(v.file.url) ?? 0)}`).join(' / ')}`),
    };
  }
  return out;
}

const entry = db.entries.get(jeu);
if (!entry) {
  console.log(`Jeu ${jeu} absent de l’index.`);
  process.exit(1);
}
const v = await volumes(entry);
console.log(`\nJeu ${jeu} :`);
for (const line of v['4k'].detail) console.log(`  ${line}`);
for (const q of ['1k', '4k']) {
  console.log(`  ${q} : tout par défaut ${core.formatSize(v[q].defaut)} · images seules ${core.formatSize(v[q].imagesSeules)} · image du plateau ${core.formatSize(v[q].plateauImage)}`);
}

if (echantillon > 0) {
  const ids = [...db.entries.keys()].sort();
  const step = Math.max(1, Math.floor(ids.length / echantillon));
  const picked = ids.filter((_, i) => i % step === 0).slice(0, echantillon);
  const totals = { '1k': { defaut: 0, imagesSeules: 0, plateauImage: 0 }, '4k': { defaut: 0, imagesSeules: 0, plateauImage: 0 } };
  for (const id of picked) {
    const x = await volumes(db.entries.get(id));
    for (const q of ['1k', '4k']) for (const k of Object.keys(totals[q])) totals[q][k] += x[q][k];
  }
  console.log(`\nÉchantillon de ${picked.length} jeux (un sur ${step} dans l’ordre des identifiants), moyenne par jeu :`);
  for (const q of ['1k', '4k']) {
    const t = totals[q];
    console.log(`  ${q} : tout par défaut ${core.formatSize(t.defaut / picked.length)} · images seules ${core.formatSize(t.imagesSeules / picked.length)} · image du plateau ${core.formatSize(t.plateauImage / picked.length)}`);
  }
}

if (types.length) {
  // Bac à sable : une table dans son dossier, .info avec l'identifiant VPS.
  const folder = path.join(racine, 'tables', 'Terminator 2 (Williams 1991)');
  fs.rmSync(path.join(racine, 'tables'), { recursive: true, force: true });
  fs.mkdirSync(path.join(folder, 'medias'), { recursive: true });
  fs.writeFileSync(path.join(folder, 'Terminator 2 (Williams 1991) VPW 1.25.vpx'), '');
  const infoFile = path.join(folder, 'Terminator 2 (Williams 1991).info');
  fs.writeFileSync(infoFile, JSON.stringify({ Info: { Title: 'Terminator 2', Manufacturer: 'Williams', Year: 1991, VPSId: jeu } }, null, 2));
  const table = core.scanTables(path.join(racine, 'tables'))[0];
  const match = core.matchMediaDb(db, table);
  console.log(`\nCorrespondance : ${match.how}, ${match.candidates[0]?.entry.id}, sûre : ${match.confident}`);
  const proposals = core.proposeMediaDb(table, match.candidates[0].entry, qualite, { root: racine });
  const choices = proposals.filter((p) => types.includes(p.type)).map((p) => ({ offer: p.variants[p.variants.findIndex((x) => x.kind !== 'video') >= 0 && types.includes(`${p.type}:image`) ? p.variants.findIndex((x) => x.kind !== 'video') : 0], replaces: p.replaces }));
  const started = Date.now();
  let last = '';
  const result = await core.installMediaDb(table, choices, {
    infoFile,
    trashDir: path.join(racine, 'trash', 'essai'),
    stagingDir: core.mediaDbStagingDir(downloads),
    entry: match.candidates[0].entry,
    onProgress: (p) => {
      const line = `${p.index + 1}/${p.total} ${p.type}`;
      if (line !== last) console.log(`  téléchargement ${line}…`);
      last = line;
    },
  });
  console.log(`Rangé en ${Date.now() - started} ms :`);
  for (const i of result.installed) console.log(`  ${path.basename(i.file)} · ${core.formatSize(i.size)} · ${JSON.stringify(core.readMediaDimensions(i.file) ?? {})}`);
  for (const f of result.failed) console.log(`  ÉCHEC ${f.type} : ${f.reason}`);
  console.log(`Sources dans le .info : ${JSON.stringify(core.mediaMemory(core.readInfo(infoFile)).sources, null, 2)}`);
  console.log(`Reste dans le dossier de réception : ${JSON.stringify(fs.readdirSync(core.mediaDbStagingDir(downloads)))}`);
}
