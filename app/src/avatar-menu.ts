// Menu système > Amis > Mon avatar (packages/core/src/avatar.ts) : l'image que vos amis voient à
// côté de votre nom, partout (Mes amis, votre fiche chez eux, les demandes, l'historique des
// parties, la partie en direct, les notifications). Pour l'instant, toujours une image à soi : une
// photo ou une image choisie sur ce PC (sélecteur de fichiers de Cyber Pinball), ou prise dans le
// navigateur intégré (clic droit sur une image : « Télécharger cette image »).
//
// L'image choisie devient une image de travail (réduite, redessinée en JPEG : une photo y perd ses
// métadonnées, position GPS comprise), puis se recadre aux boutons de la borne : les flippers
// choisissent un geste (zoom, déplacer le cadre, recentrer), Start l'applique, autant de fois qu'il
// faut ; à la souris, on glisse l'image et la molette zoome. « Valider ce cadrage » découpe le
// carré en JPEG de 256 pixels, l'enregistre et l'annonce aux bornes reliées. L'image de travail
// et son cadrage restent : « Recadrer mon avatar » y revient, même après un redémarrage.
//
// Sans electron à l'exécution : les tests du cœur chargent ce module avec un réseau et un
// convertisseur d'essai.

import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  AVATAR_PICK_MAX_BYTES,
  AVATAR_SIZE,
  AVATAR_SOURCE_SIDE,
  avatarsDir,
  avatarView,
  clampCrop,
  cropBox,
  cropLimits,
  cropRect,
  dragCrop,
  initialCrop,
  mediaUrl,
  moveCrop,
  readAvatarImage,
  t,
  webEngineUrl,
  zoomCrop,
  type AvatarCrop,
  type AvatarImage,
  type IconName,
} from '@cyberpinball/core';
import type { PickRequest } from './file-picker';
import type { Action, Built, Row, Tone } from './library';

/** Images que le sélecteur propose : celles que Chromium décode. */
export const AVATAR_PICK_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'avif'];

export interface AvatarMenuHost {
  library: {
    openCustom(build: () => Built, at?: number): void;
    task(message: string, work: () => Promise<void> | void): Promise<void>;
    /** Sélecteur de fichiers de Cyber Pinball ; undefined à l'abandon. */
    pick(request: Omit<PickRequest, 'done' | 'cancel'>): Promise<string[] | undefined>;
  };
  net: {
    state(): { key: { publicKey: string }; name: string; avatar?: string };
    setAvatar(image: AvatarImage | undefined): void;
    avatarFile(key: string): string | undefined;
  };
  /** Conversions par le moteur de Chromium (media-convert.ts) : image de travail, puis carré final. */
  convert(): {
    fitJpeg(file: string, out: string, maxSide: number): Promise<{ width: number; height: number }>;
    cropJpeg(file: string, rect: { x: number; y: number; side: number }, size: number, quality?: number): Promise<Buffer>;
  };
  /** Le protocole cyber-media:// laisse lire ce fichier (aperçu hors des dossiers de médias). */
  allowPreview(file: string): void;
  /**
   * Navigateur intégré (fenêtre « Récupérer ») sur une recherche d'images : l'image téléchargée
   * revient à `received` ; undefined si le navigateur n'est pas disponible (raison à montrer).
   */
  browse(url: string, received: (file: string) => void): string | undefined;
  dataDir: string;
}

export interface AvatarMenu {
  /** L'écran « Mon avatar » ; `back` : l'écran d'où l'on vient. */
  open(back: () => void): void;
  /** Ce que dit l'entrée du menu système. */
  detail(): string;
}

/** Image de travail et son cadrage, gardés pour « Recadrer mon avatar ». */
interface Work {
  file: string;
  width: number;
  height: number;
  crop: AvatarCrop;
}

const WORK_IMAGE = 'image.jpg';
const WORK_META = 'cadrage.json';

export function createAvatarMenu(host: AvatarMenuHost): AvatarMenu {
  const workDir = () => path.join(avatarsDir(host.dataDir), 'recadrage');
  let flash: Row | undefined;
  let back: () => void = () => undefined;
  let work: Work | undefined;

  const me = () => host.net.state();
  const myView = () => avatarView(me().key.publicKey, me().name, host.net.avatarFile(me().key.publicKey));

  // ---------- Image de travail ----------

  /** Image de travail gardée (dernier choix), relue du disque ; undefined si elle manque. */
  function savedWork(): Work | undefined {
    if (work && fs.existsSync(work.file)) return work;
    try {
      const meta = JSON.parse(fs.readFileSync(path.join(workDir(), WORK_META), 'utf8')) as Partial<Work>;
      const file = path.join(workDir(), WORK_IMAGE);
      const ok = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0;
      if (!ok(meta.width) || !ok(meta.height) || !meta.crop || !fs.existsSync(file)) return undefined;
      const c = meta.crop;
      const crop = ok(c.side) && Number.isFinite(c.cx) && Number.isFinite(c.cy) ? clampCrop(c, meta.width, meta.height) : initialCrop(meta.width, meta.height);
      work = { file, width: meta.width, height: meta.height, crop };
      host.allowPreview(file);
      return work;
    } catch {
      return undefined;
    }
  }

  function saveWork(): void {
    if (!work) return;
    try {
      fs.writeFileSync(path.join(workDir(), WORK_META), JSON.stringify({ width: work.width, height: work.height, crop: work.crop }));
    } catch {
      // Le cadrage ne se retrouvera pas au prochain démarrage : rien de plus grave.
    }
  }

  /** Une image choisie (sur ce PC, ou reçue du navigateur) devient l'image de travail, puis le recadrage s'ouvre. */
  function prepare(file: string): void {
    let size = 0;
    try {
      size = fs.statSync(file).size;
    } catch {
      flash = { text: t('Image introuvable : {file}', { file: path.basename(file) }), tone: 'error' };
      return openMain();
    }
    if (size > AVATAR_PICK_MAX_BYTES) {
      flash = { text: t('Image trop lourde : {mb} Mo au plus', { mb: Math.round(AVATAR_PICK_MAX_BYTES / 1024 / 1024) }), tone: 'error' };
      return openMain();
    }
    void host.library.task(t('Préparation de l’image…'), async () => {
      const out = path.join(workDir(), WORK_IMAGE);
      try {
        fs.mkdirSync(workDir(), { recursive: true });
        const fitted = await host.convert().fitJpeg(file, out, AVATAR_SOURCE_SIDE);
        work = { file: out, width: fitted.width, height: fitted.height, crop: initialCrop(fitted.width, fitted.height) };
        host.allowPreview(out);
        saveWork();
      } catch (error) {
        flash = { text: t('Image illisible : {error}', { error: (error as Error).message }), detail: path.basename(file), tone: 'error' };
        return openMain();
      }
      openCrop(0);
    });
  }

  // ---------- Mon avatar ----------

  function openMain(at?: number): void {
    host.library.openCustom(buildMain, at);
  }

  function buildMain(): Built {
    const has = Boolean(me().avatar);
    const saved = savedWork();
    const rows: Row[] = [];
    if (flash) {
      rows.push(flash);
      flash = undefined;
    }
    rows.push(
      has
        ? { text: t('Votre avatar : une image à vous'), detail: t('Vos amis la voient à côté de votre nom'), tone: 'ok', badges: [t('Choisi')] }
        : { text: t('Pas encore d’avatar : vos initiales'), detail: t('Choisissez une photo ou une image : vos amis la verront à côté de votre nom'), tone: 'info' },
      { text: t('Qui le voit'), detail: t('Vos amis, et les joueurs d’une demande d’ami en cours. Jamais l’annuaire : les autres joueurs voient vos initiales.'), icon: 'eye' },
    );
    const actions: Action[] = [
      { label: t('Choisir une image sur ce PC…'), detail: t('Une photo ou une image : {formats}', { formats: AVATAR_PICK_EXTENSIONS.map((e) => `.${e}`).join(', ') }), icon: 'image', tone: has ? undefined : 'ok', run: () => void pickFile() },
      { label: t('Chercher une image sur le web…'), detail: t('Navigateur intégré : clic droit sur une image, « Télécharger cette image »'), icon: 'image-download', run: () => browseWeb() },
      saved
        ? { label: t('Recadrer mon avatar'), detail: t('Reprend la dernière image choisie et son cadrage'), icon: 'crop', run: () => openCrop(0) }
        : { label: t('Recadrer mon avatar'), detail: t('Indisponible : choisissez d’abord une image'), icon: 'crop', tone: 'quiet', run: () => undefined },
    ];
    if (has) actions.push({ label: t('Retirer mon avatar'), detail: t('Vos amis voient de nouveau vos initiales'), icon: 'trash', run: () => confirmRemove() });
    actions.push({ label: t('Retour'), icon: 'back', run: () => back() });
    return {
      heading: t('Mon avatar'),
      icon: 'avatar',
      avatar: myView(),
      subheading: me().name,
      lead: t('Une photo ou une image, recadrée en carré aux boutons de la borne ou à la souris.'),
      sections: [{ rows }],
      actions,
      back: () => back(),
    };
  }

  async function pickFile(): Promise<void> {
    const paths = await host.library.pick({
      title: t('Mon avatar : choisir une image'),
      icon: 'image',
      purpose: t('Avatar'),
      filter: { label: t('Images'), extensions: AVATAR_PICK_EXTENSIONS },
      mode: 'file',
      start: 'desktop',
    });
    if (!paths?.[0]) return openMain();
    prepare(paths[0]);
  }

  function browseWeb(): void {
    const refused = host.browse(webEngineUrl(t('avatar flipper'), 'images'), (file) => prepare(file));
    flash = refused
      ? { text: t('Navigateur intégré indisponible : {reason}', { reason: refused }), tone: 'warning' }
      : { text: t('Navigateur intégré ouvert : clic droit sur une image, « Télécharger cette image » ; elle revient ici pour le recadrage.'), tone: 'info' };
    openMain(1);
  }

  function confirmRemove(): void {
    const cancel = () => openMain();
    host.library.openCustom(
      () => ({
        heading: t('Retirer votre avatar ?'),
        icon: 'alert',
        avatar: myView(),
        sections: [{ rows: [{ text: t('Vos amis verront de nouveau vos initiales'), tone: 'info' }] }],
        actions: [
          {
            label: t('Retirer'),
            icon: 'check',
            tone: 'warning',
            run: () => {
              host.net.setAvatar(undefined);
              flash = { text: t('Avatar retiré : vos amis voient vos initiales'), tone: 'ok' };
              openMain();
            },
          },
          { label: t('Annuler'), icon: 'back', run: cancel },
        ],
        back: cancel,
      }),
      1,
    );
  }

  // ---------- Recadrage ----------

  function openCrop(at: number): void {
    host.library.openCustom(buildCrop, at);
  }

  /** Applique un geste au cadrage, et redessine l'écran le curseur sur ce geste. */
  function gesture(at: number, change: (w: Work) => AvatarCrop): void {
    const w = savedWork();
    if (!w) return openMain();
    w.crop = change(w);
    saveWork();
    openCrop(at);
  }

  function buildCrop(): Built {
    const w = savedWork();
    if (!w) {
      return { heading: t('Recadrer mon avatar'), icon: 'crop', sections: [{ rows: [{ text: t('L’image choisie n’est plus là : choisissez-en une autre'), tone: 'info' }] }], actions: [{ label: t('Retour'), icon: 'back', run: () => openMain() }], back: () => openMain() };
    }
    const limits = cropLimits(w.crop, w.width, w.height);
    const actions: Action[] = [];
    const add = (label: string, icon: IconName, run: (at: number) => void, opts: { detail?: string; tone?: Tone } = {}) => {
      const at = actions.length;
      actions.push({ label, icon, ...opts, run: () => run(at) });
    };
    add(t('Valider ce cadrage'), 'check', () => void save(), { tone: 'ok', detail: t('Enregistré, et envoyé à vos amis reliés') });
    add(t('Zoom avant'), 'zoom-in', (at) => (limits.closest ? undefined : gesture(at, (x) => zoomCrop(x.crop, 1, x.width, x.height))), limits.closest ? { tone: 'quiet', detail: t('Au plus près') } : {});
    add(t('Zoom arrière'), 'zoom-out', (at) => (limits.widest ? undefined : gesture(at, (x) => zoomCrop(x.crop, -1, x.width, x.height))), limits.widest ? { tone: 'quiet', detail: t('Toute l’image est dans le cadre') } : {});
    add(t('Déplacer vers la gauche'), 'move-left', (at) => gesture(at, (x) => moveCrop(x.crop, -1, 0, x.width, x.height)));
    add(t('Déplacer vers la droite'), 'move-right', (at) => gesture(at, (x) => moveCrop(x.crop, 1, 0, x.width, x.height)));
    add(t('Déplacer vers le haut'), 'move-up', (at) => gesture(at, (x) => moveCrop(x.crop, 0, -1, x.width, x.height)));
    add(t('Déplacer vers le bas'), 'move-down', (at) => gesture(at, (x) => moveCrop(x.crop, 0, 1, x.width, x.height)));
    add(t('Recentrer'), 'refresh', (at) => gesture(at, (x) => initialCrop(x.width, x.height)));
    add(t('Choisir une autre image'), 'image', () => openMain(0));
    add(t('Annuler'), 'close', () => openMain());
    return {
      heading: t('Recadrer mon avatar'),
      icon: 'crop',
      lead: t('Flippers : choisir un geste · Start : l’appliquer, autant de fois qu’il faut. À la souris : glissez le cadre, la molette zoome.'),
      sections: [],
      crop: {
        src: mediaUrl(w.file),
        width: w.width,
        height: w.height,
        box: cropBox(w.crop, w.width, w.height),
        caption: t('Ce que verront vos amis'),
        input: (g) => {
          const x = savedWork();
          if (!x) return;
          let crop = x.crop;
          // Le cadre glissé à la souris : son déplacement, en parts de la largeur et de la hauteur de l'image.
          if (g.dx || g.dy) crop = dragCrop(crop, (g.dx ?? 0) * x.width, (g.dy ?? 0) * x.height, x.width, x.height);
          if (g.zoom) crop = zoomCrop(crop, Math.max(-3, Math.min(3, g.zoom)), x.width, x.height);
          x.crop = crop;
          saveWork();
        },
      },
      actions,
      back: () => openMain(),
    };
  }

  /** Le carré gardé, en JPEG de 256 pixels ; un JPEG trop lourd (image très détaillée) est refait moins fin. */
  async function save(): Promise<void> {
    const w = savedWork();
    if (!w) return openMain();
    await host.library.task(t('Enregistrement de l’avatar…'), async () => {
      try {
        const rect = cropRect(w.crop, w.width, w.height);
        let image: AvatarImage | undefined;
        for (const quality of [0.86, 0.72, 0.55]) {
          image = readAvatarImage(await host.convert().cropJpeg(w.file, rect, AVATAR_SIZE, quality));
          if (image) break;
        }
        if (!image) throw new Error(t('image trop lourde même réduite'));
        host.net.setAvatar(image);
        flash = { text: t('Avatar enregistré : vos amis le reçoivent'), detail: t('Ceux qui ne sont pas en ligne le recevront à leur prochaine connexion'), tone: 'ok' };
      } catch (error) {
        flash = { text: t('Avatar pas enregistré : {error}', { error: (error as Error).message }), tone: 'error' };
      }
      openMain(Number.MAX_SAFE_INTEGER);
    });
  }

  return {
    open(from) {
      back = from;
      openMain();
    },
    detail() {
      return me().avatar ? t('Votre image, vue par vos amis') : t('Pas encore d’avatar : une photo ou une image à vous');
    },
  };
}
