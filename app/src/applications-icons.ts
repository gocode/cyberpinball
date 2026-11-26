// Applications (26/11/2026) : l'icône d'une application, relevée sur le site lui-même (aucun logo n'est
// livré) : le manifeste de la page, puis l'icône Apple, puis les icônes de la page, puis le favicon. La
// première image qui remplit la tuile (APP_ICON_MIN) est gardée dans le dossier des icônes ; à défaut,
// la plus grande trouvée (un favicon de 32 px, posé en pastille par la grille) ; sans aucune, la tuile
// composée (initiales sur la couleur du site). Le format se lit dans les octets (siteicon.ts : un .ico
// devient un PNG). Le nom du site et sa couleur viennent avec, pour une adresse ajoutée à la main.
//
// Le front-end passe le fetch de Chromium (net.fetch) : celui de Node refuse les en-têtes de plus de
// 16 Ko, et YouTube en envoie davantage. Sans electron : les essais chargent ce module avec un faux fetch.

import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  APP_ICON_MIN,
  APP_ICON_SMALLEST,
  applicationsIconDir,
  rankIcons,
  readIconImage,
  readManifest,
  readPageFacts,
  writeFileAtomic,
  type IconCandidate,
  type IconImage,
} from '@cyberpinball/core';

/** Ce qu'une page a donné : son nom, sa couleur et le fichier de l'icône gardée (dans le dossier des icônes). */
export interface SiteLook {
  name?: string;
  color?: string;
  icon?: string;
}

export interface SiteLookOptions {
  dataDir: string;
  /** Le front-end : net.fetch d'Electron ; les essais : un faux serveur. */
  fetch?: typeof fetch;
  timeoutMs?: number;
  log?: (line: string) => void;
}

const PAGE_MAX = 1_500_000;
const ICON_MAX = 2_000_000;
const TRIES = 6;
/** Un navigateur ordinaire : certains sites ne donnent leur vraie page qu'à lui. */
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0'; // i18n-ignore : en-tête HTTP

/** Relève le nom, la couleur et l'icône du site `url` ; l'icône est écrite sous `<id>.<ext>`. Jamais d'erreur : ce qui manque reste absent. */
export async function fetchSiteLook(id: string, url: string, opts: SiteLookOptions): Promise<SiteLook> {
  const get = opts.fetch ?? fetch;
  const timeout = opts.timeoutMs ?? 8000;
  const log = opts.log ?? (() => undefined);
  const request = (to: string) => get(to, { headers: { 'user-agent': USER_AGENT, accept: '*/*' }, redirect: 'follow', signal: AbortSignal.timeout(timeout) });
  const look: SiteLook = {};
  const candidates: IconCandidate[] = [];
  try {
    const page = await request(url);
    const html = page.ok ? (await page.text()).slice(0, PAGE_MAX) : '';
    const facts = readPageFacts(html, page.url || url);
    look.name = facts.name;
    look.color = facts.color;
    if (facts.manifest) {
      try {
        const m = await request(facts.manifest);
        if (m.ok) {
          const manifest = readManifest(await m.json(), m.url || facts.manifest);
          look.name = manifest.name ?? look.name;
          look.color = look.color ?? manifest.color;
          candidates.push(...manifest.icons);
        }
      } catch {
        // Manifeste illisible : les icônes de la page suffisent.
      }
    }
    candidates.push(...facts.icons);
  } catch (error) {
    log(`Applications : page de ${url} illisible (${(error as Error).message})`); // i18n-ignore : journal
    candidates.push({ url: new URL('/favicon.ico', url).href, kind: 'favicon', size: 0 });
  }
  // La plus grande icône gardée ; la recherche s'arrête à la première qui remplit la tuile.
  let best: { image: IconImage; kind: IconCandidate['kind'] } | undefined;
  for (const c of rankIcons(candidates).slice(0, TRIES)) {
    try {
      const r = await request(c.url);
      if (!r.ok) continue;
      const data = Buffer.from(await r.arrayBuffer());
      if (!data.length || data.length > ICON_MAX) continue;
      const image = readIconImage(data);
      const side = image ? Math.min(image.width, image.height) : 0;
      if (!image || side < APP_ICON_SMALLEST) continue;
      if (!best || side > Math.min(best.image.width, best.image.height)) best = { image, kind: c.kind };
      if (side >= APP_ICON_MIN) break;
    } catch {
      // Icône injoignable : la suivante.
    }
  }
  if (best) {
    const { image, kind } = best;
    const dir = applicationsIconDir(opts.dataDir);
    fs.mkdirSync(dir, { recursive: true });
    // Une seule icône par application : l'ancienne (autre format) s'en va.
    for (const old of fs.readdirSync(dir)) if (old.startsWith(`${id}.`)) fs.rmSync(path.join(dir, old), { force: true });
    writeFileAtomic(path.join(dir, `${id}.${image.ext}`), image.data);
    look.icon = `${id}.${image.ext}`;
    log(`Applications : icône de ${id} relevée (${kind}, ${image.width} px)`); // i18n-ignore : journal
  } else log(`Applications : aucune icône lisible pour ${id} (${candidates.length} annoncées)`); // i18n-ignore : journal
  return look;
}
