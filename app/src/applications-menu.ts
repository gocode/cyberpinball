// Applications (26/11/2026, d'après les maquettes validées) : le médaillon de
// la roue qui ouvre les sites de vidéo et de musique (Netflix, YouTube, Spotify…) dans un vrai Edge, en
// plein écran sur le fronton ou sur le playfield. Trois surfaces :
// - l'affiche du médaillon au focus (app/renderer/applications.js, avec la mise en page des affiches de
//   la Communauté) ;
// - la grille, ouverte par Start : les tuiles au fronton, la fiche de l'application choisie, les
//   commandes et le QR du téléphone au playfield (Built.apps) ; flippers pour choisir, Start pour ouvrir,
//   Start tenu une seconde (ou MagnaSave) pour les réglages, Exit pour la roue ;
// - l'application ouverte : Edge a la main, les boutons de la borne lui sont relayés
//   (applications-browser.ts), Exit tenu une seconde la ferme et la grille revient.
// Le catalogue, la saisie d'une adresse et les réglages sont des écrans du front-end ordinaires.
//
// Sans electron à l'exécution : les essais chargent ce module avec des services d'essai.

import {
  APP_CATALOG,
  APP_DIM_MS,
  APP_EXIT_HOLD_MS,
  APP_ICON_MIN,
  DEFAULT_APPS,
  addApplication,
  appInitials,
  appScreenLabel,
  appSite,
  appsBrowserMissingText,
  appsInOrder,
  catalogApp,
  isLocalApp,
  loadApplications,
  markOpened,
  normalizeAppUrl,
  removeApplication,
  saveApplications,
  socialAgo,
  t,
  updateApplication,
  type AppEntry,
  type AppKey,
  type AppScreen,
  type AppsStore,
  type CabinetButtons,
  type CatalogApp,
  type IconName,
  type ScreenRect,
} from '@cyberpinball/core';
import type { Built } from './library-types';
import type { AppsBrowser, AppSession } from './applications-browser';
import type { SiteLook } from './applications-icons';
import type { MedallionPosterView } from './community-menu';
import type { ExternalTarget } from './phone-remote';

/** Une tuile de la grille (ou la fiche) : de quoi dessiner l'icône, relevée ou composée. */
export interface AppFace {
  id: string;
  name: string;
  initials: string;
  color: string;
  /** Adresse de l'icône relevée sur le site ; absente : la tuile composée. */
  icon?: string;
}

export interface AppTileView extends AppFace {
  where: string;
  whereIcon: IconName;
  /** Hors ligne : la raison, à la place de l'écran. */
  off?: string;
  local?: true;
  /** Rang de l'action qui l'ouvre (clic, téléphone). */
  action: number;
}

/** Ce que le rendu dessine (app/renderer/applications.js) ; textes déjà traduits. */
export interface AppsView {
  mode: 'grid' | 'open';
  heading: string;
  online: { on: boolean; text: string };
  /** La grille va au fronton ; sans fronton, au playfield à la place de la fiche. */
  fronton: boolean;
  tiles: AppTileView[];
  add: { label: string; detail: string; action: number };
  /** Rang choisi : une tuile, ou tiles.length pour « Ajouter ». */
  current: number;
  banner?: string;
  count: string;
  fiche?: AppFace & { pager: { count: number; at: number }; facts: { icon: IconName; label: string; value: string }[] };
  addCard?: { label: string; detail: string };
  commands: { key: string; text: string }[];
  /** Le nom au DMD (« APPLICATIONS » au-dessus). */
  dmd: { label: string; name: string };
  open?: AppFace & { label: string; where: string; buttonsTitle: string; buttons: { key: string; text: string; small?: string }[]; note: string };
  /** L'écran s'assombrit après APP_DIM_MS sans geste pendant une application. */
  dim: boolean;
  remote: { title: string; text: string };
}

export interface ApplicationsMenuHost {
  dataDir: string;
  library: {
    openCustom(build: () => Built, at?: number): void;
    openPrompt(heading: string, label: string, value: string, done: (value: string | undefined) => void, lead?: string): void;
    openNotice(heading: string, lines: string[], then?: () => void): void;
    changed(): void;
  };
  keys(): { previous: readonly string[]; next: readonly string[]; confirm: readonly string[]; exit: readonly string[] };
  /** MagnaSave (changer de zone ailleurs) : les réglages de l'application choisie. */
  zoneKeys(): readonly string[];
  /** Rectangle de l'écran, en pixels physiques du bureau ; undefined : la borne n'a pas cet écran. */
  screen(where: AppScreen): ScreenRect | undefined;
  /** La borne a un fronton : la grille y va. */
  fronton(): boolean;
  /**
   * Le playfield tourné pour qu'Edge y dessine le site à l'endroit : son rectangle tourné, et de quoi
   * rendre l'orientation de jeu. undefined : rien à tourner (ou pas de playfield relevé).
   */
  portrait?(): { rect: ScreenRect; leave(): void } | undefined;
  browser: AppsBrowser;
  /** Boutons de la borne pendant une application (watchAppButtons). */
  buttons: {
    keys(): Readonly<CabinetButtons>;
    watch(input: { keys: Readonly<CabinetButtons>; key(key: AppKey, lift?: number): void; quit(): void; intercept(button: string): boolean; activity(): void }): () => void;
  };
  phone?: {
    attachExternal(target: ExternalTarget): void;
    detachExternal(target: ExternalTarget): void;
    pending(): boolean;
    accept(): void;
    refuse(): void;
  };
  /** L'application fermée : Cyber Pinball reprend la main (Windows ne la rend pas toujours). */
  takeForeground(): void;
  /** Page web hors de la borne (télécharger Edge). */
  openExternal(url: string): void;
  online(): boolean;
  /** Nom, couleur et icône relevés sur le site (fetchSiteLook). */
  look(id: string, url: string): Promise<SiteLook>;
  /** Adresse d'une icône gardée (fichier du dossier des icônes) pour la page. */
  iconUrl(file: string): string;
  /** Plus petit côté d'une icône gardée (storedIconSide) ; undefined : inconnu, elle est laissée. */
  iconSide?(file: string): number | undefined;
  /** Edge à télécharger (EDGE_DOWNLOAD_URL). */
  edgeDownloadUrl: string;
  log?(line: string): void;
  now?(): Date;
}

export interface ApplicationsMenu {
  /** La grille (Start sur le médaillon) ; Exit vers `back` (la roue). */
  open(back: () => void): void;
  /** L'affiche du médaillon au focus. */
  poster(): MedallionPosterView;
  /** Ce que dit le médaillon sous son titre dans la roue. */
  card(): { title: string; subtitle: string };
  /** L'application ouverte, s'il y en a une. */
  running(): AppEntry | undefined;
  /** Ferme l'application ouverte (sortie du front-end, partie lancée). */
  close(): void;
}

const ADD = 'add';
const IN_GRID = 4;

export function createApplicationsMenu(host: ApplicationsMenuHost): ApplicationsMenu {
  const now = () => host.now?.() ?? new Date();
  const log = (line: string) => host.log?.(line);
  let store: AppsStore = loadApplications(host.dataDir);
  let at = 0;
  let back: () => void = () => undefined;
  let running: { app: AppEntry; session: AppSession; stop(): void } | undefined;
  const closedOutside = new WeakSet<AppSession>();
  let lastGesture = Date.now();
  let dimTimer: ReturnType<typeof setTimeout> | undefined;
  let dim = false;
  /** Start appuyé sur la grille : Start relâché avant APP_EXIT_HOLD_MS ouvre, tenu il ouvre les réglages. */
  let startDown: ReturnType<typeof setTimeout> | undefined;
  /** Icônes déjà demandées pendant cette session : un site muet n'est pas relu à chaque ouverture. */
  const asked = new Set<string>();

  const apps = () => appsInOrder(store);
  const save = (next: AppsStore) => {
    store = next;
    try {
      saveApplications(host.dataDir, store);
    } catch (error) {
      log(`Applications : enregistrement impossible (${(error as Error).message})`); // i18n-ignore : journal
    }
  };
  const face = (a: Pick<AppEntry, 'id' | 'name' | 'color' | 'icon'>): AppFace => ({ id: a.id, name: a.name, initials: appInitials(a.name), color: a.color, ...(a.icon ? { icon: host.iconUrl(a.icon) } : {}) });
  const whereOf = (a: AppEntry): { where: string; whereIcon: IconName } =>
    isLocalApp(a) ? { where: t('{screen} · local', { screen: shortScreen(a.screen) }), whereIcon: 'network' } : { where: shortScreen(a.screen), whereIcon: a.screen === 'playfield' ? 'playfield' : 'monitor' };

  // ---------- Icônes relevées sur les sites ----------

  /**
   * Les applications sans icône, ou dont l'icône ne remplit pas sa tuile : la leur est cherchée sur
   * leur site, une à une, puis la grille se redessine.
   */
  async function fetchIcons(): Promise<void> {
    for (const a of store.apps) {
      const small = a.icon ? (host.iconSide?.(a.icon) ?? APP_ICON_MIN) < APP_ICON_MIN : false;
      if ((a.icon && !small) || asked.has(a.id) || !host.online()) continue;
      asked.add(a.id);
      const look = await host.look(a.id, a.url).catch(() => ({}) as SiteLook);
      if (!look.icon && !look.color) continue;
      const known = DEFAULT_APPS.some((d) => d.id === a.id) || catalogApp(a.id);
      // Couleur du catalogue gardée (choisie à la main) ; celle du site pour une adresse ajoutée.
      save(updateApplication(store, a.id, { ...(look.icon ? { icon: look.icon } : {}), ...(!known && look.color ? { color: look.color } : {}) }));
      host.library.changed();
    }
  }

  // ---------- La grille ----------

  function view(mode: AppsView['mode']): AppsView {
    const list = apps();
    const online = host.online();
    const tiles: AppTileView[] = list.map((a, i) => ({ ...face(a), ...whereOf(a), ...(!online && !isLocalApp(a) ? { off: t('Hors ligne') } : {}), ...(isLocalApp(a) ? { local: true as const } : {}), action: i }));
    const current = Math.min(at, tiles.length);
    const chosen = list[current];
    const k = (key: string, text: string) => ({ key, text });
    const v: AppsView = {
      mode,
      heading: t('Applications'),
      online: { on: online, text: online ? t('En ligne') : t('Hors ligne') },
      fronton: host.fronton(),
      tiles,
      add: { label: t('Ajouter'), detail: t('Catalogue ou adresse'), action: tiles.length },
      current,
      ...(online ? {} : { banner: t('Pas de connexion Internet. Les applications du réseau local restent disponibles.') }),
      count: host.fronton() ? t('{n} applications · choix sur le fronton', { n: tiles.length }) : t('{n} applications', { n: tiles.length }),
      commands: chosen
        ? [k(t('Flippers'), t('Choisir')), k(t('Start'), t('Ouvrir {name}', { name: chosen.name })), k(t('Start maintenu 1 s'), t('Réglages de l’application')), k(t('Exit'), t('Retour à la roue'))]
        : [k(t('Flippers'), t('Choisir')), k(t('Start'), t('Ajouter une application')), k(t('Exit'), t('Retour à la roue'))],
      dmd: { label: t('Applications'), name: chosen?.name ?? t('Ajouter') },
      dim,
      remote: { title: t('Télécommande'), text: t('Scanne pour piloter depuis ton téléphone : croix, pavé tactile et clavier.') },
    };
    if (chosen) {
      v.fiche = {
        ...face(chosen),
        pager: { count: tiles.length, at: current },
        facts: [
          { icon: 'monitor', label: t('S’ouvre sur'), value: chosen.screen === 'playfield' ? t('Playfield, plein écran') : t('Fronton, plein écran') },
          { icon: 'history', label: t('Dernière ouverture'), value: chosen.opened ? socialAgo(chosen.opened, now()) : t('Jamais ouverte') },
          { icon: isLocalApp(chosen) ? 'network' : 'globe', label: t('Site'), value: appSite(chosen.url) },
        ],
      };
    } else v.addCard = { label: t('Ajouter une application'), detail: t('Choisis dans le catalogue ou tape l’adresse d’un site.') };
    if (mode === 'open' && running) {
      const a = running.app;
      v.open = {
        ...face(a),
        label: t('En cours'),
        where: a.screen === 'playfield' ? t('Ouverte sur le playfield') : t('Ouverte sur le fronton'),
        buttonsTitle: t('Boutons de la borne'),
        buttons: [
          { key: t('Flippers'), text: t('Élément précédent, suivant'), small: t('Tenus : reculer, avancer') },
          { key: t('MagnaSave'), text: t('Gauche, droite') },
          { key: t('Start'), text: t('OK') },
          { key: t('Lancer la bille'), text: t('Lecture, pause') },
          { key: t('Exit'), text: t('Retour') },
          { key: t('Exit maintenu 1 s'), text: t('Quitter {name}', { name: a.name }) },
        ],
        note: t('L’écran s’assombrit après 30 secondes sans geste ; un bouton le rallume.'),
      };
      v.remote = { title: t('Sur ton téléphone'), text: t('Croix et OK pour naviguer, pavé tactile et clavier pour te connecter ou chercher un titre.') };
      v.dmd = { label: t('En cours'), name: a.name };
    }
    return v;
  }

  function move(dir: -1 | 1): void {
    const n = apps().length + 1;
    at = (Math.min(at, n - 1) + dir + n) % n;
  }

  function activate(index: number): void {
    const list = apps();
    at = Math.min(index, list.length);
    const app = list[at];
    if (app) openApp(app);
    else openAdd();
  }

  function settingsOfCurrent(): void {
    const app = apps()[Math.min(at, apps().length)];
    if (app) openSettings(app.id);
    else openAdd();
  }

  function gridBuilt(): Built {
    const list = apps();
    const v = view('grid');
    return {
      heading: t('Applications'),
      icon: 'layout',
      sections: [],
      apps: v,
      phone: true,
      actions: [
        ...list.map((a, i) => ({ label: t('Ouvrir {name}', { name: a.name }), key: `app:${a.id}`, run: () => activate(i) })),
        { label: t('Ajouter une application'), icon: 'plus' as const, key: ADD, run: () => activate(list.length) },
        { label: t('Retour à la roue'), icon: 'back' as const, key: 'back', run: () => back() },
      ],
      keysUp: true,
      keys: (input) => {
        const k = host.keys();
        if (k.confirm.includes(input.code)) {
          if (input.type === 'keyDown') {
            if (input.isAutoRepeat || startDown) return true;
            startDown = setTimeout(() => {
              startDown = undefined;
              settingsOfCurrent();
            }, APP_EXIT_HOLD_MS);
            return true;
          }
          if (input.type === 'keyUp' && startDown) {
            clearTimeout(startDown);
            startDown = undefined;
            activate(at);
          }
          return true;
        }
        if (input.type !== 'keyDown') return false;
        if (k.previous.includes(input.code)) return (move(-1), true);
        if (k.next.includes(input.code)) return (move(1), true);
        if (host.zoneKeys().includes(input.code)) return (settingsOfCurrent(), true);
        return false;
      },
      back: () => back(),
    };
  }

  function showGrid(): void {
    host.library.openCustom(gridBuilt);
    void fetchIcons();
  }

  // ---------- L'application ouverte ----------

  function openBuilt(): Built {
    const a = running?.app;
    return {
      heading: a?.name ?? t('Applications'),
      icon: 'layout',
      sections: [],
      apps: view('open'),
      phone: true,
      actions: a ? [{ label: t('Quitter {name}', { name: a.name }), icon: 'exit', key: 'quit', run: () => running?.session.finish() }] : [],
      back: () => running?.session.finish(),
    };
  }

  function wake(): void {
    lastGesture = Date.now();
    if (dim) {
      dim = false;
      host.library.changed();
    }
    clearTimeout(dimTimer);
    dimTimer = setTimeout(() => {
      if (!running || Date.now() - lastGesture < APP_DIM_MS) return;
      dim = true;
      host.library.changed();
    }, APP_DIM_MS);
    dimTimer.unref?.();
  }

  function openMissing(): void {
    host.library.openCustom(() => ({
      heading: t('Microsoft Edge est introuvable'),
      icon: 'alert',
      lead: appsBrowserMissingText(),
      sections: [{ rows: [{ text: t('Le téléchargement vient du site de Microsoft.'), tone: 'quiet' }] }],
      actions: [
        { label: t('Réinstaller Edge'), icon: 'download', key: 'edge', run: () => host.openExternal(host.edgeDownloadUrl) },
        { label: t('Retour aux applications'), icon: 'back', key: 'back', run: showGrid },
      ],
      back: showGrid,
    }));
  }

  function openApp(app: AppEntry): void {
    if (running) running.session.finish();
    if (!host.browser.browser()) return openMissing();
    let turned: { rect: ScreenRect; leave(): void } | undefined;
    let rect = host.screen(app.screen);
    if (app.screen === 'playfield' && rect) {
      turned = host.portrait?.();
      if (turned) rect = turned.rect;
    }
    rect ??= host.screen('backglass') ?? host.screen('playfield');
    if (!rect) return host.library.openNotice(t('Applications'), [t('Aucun écran pour ouvrir {name}.', { name: app.name })], showGrid);
    const session = host.browser.open(app, rect);
    if (!session) {
      turned?.leave();
      return openMissing();
    }
    save(markOpened(store, app.id, now().toISOString()));
    at = 0;
    const phone = host.phone;
    const external: ExternalTarget = {
      page: () => ({ title: app.name, host: appSite(app.url) }),
      rect: () => session.rect(),
      pointer: (x, y) => session.pointer(x, y),
      click: (button, count) => session.click(button, count),
      scroll: (dx, dy) => session.wheel(dx, dy),
      text: (del, ins) => {
        for (let i = 0; i < del; i++) session.key('Backspace');
        if (ins) session.type(ins);
      },
      set: (value) => session.set(value),
      key: (key, shift) => session.key(key, { shift }),
      nav: (action) => {
        if (action === 'close') session.finish();
        else if (action === 'back') session.key('ArrowLeft', { alt: true });
        else if (action === 'reload') session.front();
      },
      actions: () => [{ id: 'quit', label: t('Quitter {name}', { name: app.name }) }],
      act: (id) => id === 'quit' && session.finish(),
    };
    phone?.attachExternal(external);
    const stopButtons = host.buttons.watch({
      keys: host.buttons.keys(),
      // Flipper gauche appuyé : Maj+Tab, l'élément précédent.
      key: (key, lift) => (key === 'TabBack' ? session.key('Tab', { shift: true }) : session.key(key, lift === undefined ? undefined : { lift })),
      quit: () => session.finish(),
      // Un téléphone attend d'être accepté (codes comparés à l'écran) : Start accepte, Exit refuse.
      intercept: (button) => {
        if (!phone?.pending()) return false;
        if (button === 'start') phone.accept();
        else if (button === 'exit') phone.refuse();
        else return false;
        return true;
      },
      activity: wake,
    });
    running = { app, session, stop: stopButtons };
    wake();
    host.library.openCustom(openBuilt);
    void session.done.finally(() => {
      stopButtons();
      phone?.detachExternal(external);
      clearTimeout(dimTimer);
      dim = false;
      if (running?.session === session) running = undefined;
      turned?.leave();
      // Fermée par le front-end (une partie se lance, il se ferme) : ni premier plan ni grille.
      if (closedOutside.delete(session)) return;
      host.takeForeground();
      showGrid();
    });
  }

  // ---------- Ajouter ----------

  function catalogRows(): { theme: string; app: CatalogApp }[] {
    const themes = [{ title: t('Les essentiels'), apps: DEFAULT_APPS as readonly CatalogApp[] }, ...APP_CATALOG];
    return themes.flatMap((theme) => theme.apps.map((app) => ({ theme: theme.title, app })));
  }

  function openAdd(): void {
    const build = (): Built => {
      const rows = catalogRows();
      const has = (a: CatalogApp) => store.apps.some((e) => e.id === a.id || appSite(e.url) === appSite(a.url));
      return {
        heading: t('Ajouter une application'),
        icon: 'plus',
        lead: t('Les sites s’ouvrent dans Microsoft Edge, en plein écran ; la connexion à ton compte se fait à la première ouverture et reste sur la borne.'),
        sections: [],
        actions: [
          { label: t('Taper une adresse…'), detail: t('Un site, ou un logiciel de ta maison (Plex, Home Assistant…)'), icon: 'globe', key: 'url', run: () => openAddress('', undefined) },
          ...rows.map(({ theme, app }) => ({
            label: app.name,
            detail: has(app) ? t('{theme} · déjà ajoutée', { theme }) : `${theme} · ${app.detail}`,
            key: `cat:${app.id}`,
            ...(has(app) ? { tone: 'quiet' as const } : {}),
            run: () => (has(app) ? undefined : app.needsAddress ? openAddress(app.url, app) : addFromCatalog(app)),
          })),
          { label: t('Retour aux applications'), icon: 'back', key: 'back', run: showGrid },
        ],
        back: showGrid,
      };
    };
    host.library.openCustom(build);
  }

  function addFromCatalog(app: CatalogApp, url = app.url): void {
    const r = addApplication(store, { id: app.id, name: app.name, url, color: app.color }, now().toISOString());
    if (!r.ok) return host.library.openNotice(t('Ajouter une application'), [r.reason], showGrid);
    save(r.store);
    at = apps().findIndex((a) => a.id === r.app.id);
    showGrid();
  }

  /** Adresse tapée (ou à compléter pour un logiciel de la maison) : l'aperçu relevé sur le site, puis l'ajout. */
  function openAddress(value: string, from: CatalogApp | undefined): void {
    host.library.openPrompt(t('Ajouter une adresse'), t('Adresse du site'), value, (typed) => {
      if (typed === undefined) return openAdd();
      const url = normalizeAppUrl(typed);
      if (!url) return host.library.openNotice(t('Ajouter une adresse'), [t('Cette adresse n’est pas celle d’un site (http ou https).')], () => openAddress(typed, from));
      if (from) return addFromCatalog(from, url);
      void preview(url);
    }, t('Tapée sur le téléphone ou au clavier'));
  }

  async function preview(url: string): Promise<void> {
    let draft: { name: string; color?: string; icon?: string; screen: AppScreen; found: boolean } = { name: appSite(url), screen: 'backglass', found: false };
    let searching = true;
    const id = `essai-${Date.now().toString(36)}`;
    const build = (): Built => {
      return {
        heading: draft.name,
        icon: 'globe',
        lead: searching ? t('Recherche du nom et de l’icône sur le site…') : t('Aperçu de l’application'),
        sections: [
          {
            kind: 'facts',
            rows: [
              { label: t('Nom affiché'), text: draft.name },
              { label: t('Icône'), text: draft.icon ? t('Trouvée sur le site') : t('Initiales sur la couleur du site') },
              { label: t('Site'), text: appSite(url) },
            ],
          },
        ],
        variant: 'facts',
        actions: [
          { label: t('Ajouter {name}', { name: draft.name }), detail: t('À la fin de la grille'), icon: 'plus', key: 'add', run: () => commit() },
          { label: t('Changer le nom'), detail: draft.name, icon: 'edit', key: 'name', run: () => rename() },
          { label: t('S’ouvre sur'), activeChoice: appScreenLabel(draft.screen), icon: draft.screen === 'playfield' ? 'playfield' : 'monitor', key: 'screen', run: () => ((draft.screen = draft.screen === 'playfield' ? 'backglass' : 'playfield'), host.library.openCustom(build)) },
          { label: t('Retour'), icon: 'back', key: 'back', run: () => openAddress(url, undefined) },
        ],
        back: () => openAddress(url, undefined),
      };
    };
    const rename = () =>
      host.library.openPrompt(t('Changer le nom'), t('Nom affiché'), draft.name, (name) => {
        if (name?.trim()) draft = { ...draft, name: name.trim().slice(0, 40) };
        host.library.openCustom(build);
      });
    const commit = () => {
      // L'icône relevée pour l'aperçu (gardée sous le nom de l'essai) devient celle de l'application.
      const r = addApplication(store, { name: draft.name, url, screen: draft.screen, ...(draft.color ? { color: draft.color } : {}), ...(draft.icon ? { icon: draft.icon } : {}) }, now().toISOString());
      if (!r.ok) return host.library.openNotice(t('Ajouter une adresse'), [r.reason], showGrid);
      save(r.store);
      at = apps().findIndex((a) => a.id === r.app.id);
      asked.delete(r.app.id);
      showGrid();
    };
    host.library.openCustom(build);
    const look = host.online() ? await host.look(id, url).catch(() => ({}) as SiteLook) : {};
    searching = false;
    draft = { ...draft, ...(look.name ? { name: look.name.slice(0, 40) } : {}), ...(look.color ? { color: look.color } : {}), ...(look.icon ? { icon: look.icon } : {}), found: Boolean(look.name || look.icon) };
    host.library.changed();
  }

  // ---------- Réglages d'une application ----------

  function openSettings(id: string): void {
    const build = (): Built => {
      const a = store.apps.find((e) => e.id === id);
      if (!a) return { heading: t('Applications'), sections: [], actions: [{ label: t('Retour aux applications'), icon: 'back', key: 'back', run: showGrid }], back: showGrid };
      const other: AppScreen = a.screen === 'playfield' ? 'backglass' : 'playfield';
      return {
        heading: a.name,
        subheading: t('Réglages'),
        icon: 'gear',
        sections: [],
        actions: [
          { label: t('Écran'), activeChoice: appScreenLabel(a.screen), detail: t('Start : {screen}', { screen: appScreenLabel(other) }), icon: 'screens', key: 'screen', run: () => (save(updateApplication(store, id, { screen: other })), host.library.openCustom(build)) },
          {
            label: t('Nom'),
            activeChoice: a.name,
            icon: 'edit',
            key: 'name',
            run: () =>
              host.library.openPrompt(t('Nom'), t('Nom affiché'), a.name, (name) => {
                if (name?.trim()) save(updateApplication(store, id, { name: name.trim().slice(0, 40) }));
                host.library.openCustom(build);
              }),
          },
          {
            label: t('Adresse'),
            activeChoice: appSite(a.url),
            icon: 'globe',
            key: 'url',
            run: () =>
              host.library.openPrompt(t('Adresse'), t('Adresse du site'), a.url, (typed) => {
                const url = typed === undefined ? undefined : normalizeAppUrl(typed);
                if (typed !== undefined && !url) return host.library.openNotice(t('Adresse'), [t('Cette adresse n’est pas celle d’un site (http ou https).')], () => host.library.openCustom(build));
                if (url) save(updateApplication(store, id, { url }));
                host.library.openCustom(build);
              }),
          },
          {
            label: t('Reprendre l’icône du site'),
            detail: t('Si le site a changé de logo'),
            icon: 'refresh',
            key: 'icon',
            run: async () => {
              const look = await host.look(id, a.url).catch(() => ({}) as SiteLook);
              if (look.icon) save(updateApplication(store, id, { icon: look.icon }));
              host.library.changed();
            },
          },
          {
            label: t('Retirer l’application'),
            detail: catalogApp(id) ? t('Elle reste dans le catalogue') : t('Son adresse est oubliée'),
            icon: 'trash',
            tone: 'error',
            key: 'remove',
            run: () => {
              save(removeApplication(store, id));
              at = 0;
              showGrid();
            },
          },
          { label: t('Retour aux applications'), icon: 'back', key: 'back', run: showGrid },
        ],
        back: showGrid,
      };
    };
    host.library.openCustom(build);
  }

  // ---------- Le médaillon ----------

  function poster(): MedallionPosterView {
    const list = apps();
    const last = list.find((a) => a.opened);
    return {
      edition: t('Vidéo, musique et maison'),
      label: t('Ta borne. Tes écrans.'),
      title: t('Applications'),
      stats: t('{n} applications sur la borne', { n: list.length }),
      empty: list.length === 0,
      eyebrow: last ? t('Dernière ouverte') : t('Pour commencer'),
      heading: last ? last.name : list.slice(0, IN_GRID).map((a) => a.name).join(' · ') || t('Ajoute une application'),
      ...(last?.opened ? { detail: socialAgo(last.opened, now()) } : {}),
      tagline: t('En plein écran sur le fronton ou le playfield.'),
      start: t('Start'),
      open: t('Ouvrir les applications'),
    };
  }

  return {
    open(to) {
      back = to;
      store = loadApplications(host.dataDir);
      at = 0;
      if (running) host.library.openCustom(openBuilt);
      else showGrid();
    },
    poster,
    card: () => ({ title: t('Applications'), subtitle: t('{n} applications', { n: apps().length }) }),
    running: () => running?.app,
    close: () => {
      if (!running) return;
      closedOutside.add(running.session);
      running.session.finish();
    },
  };
}

function shortScreen(screen: AppScreen): string {
  return screen === 'playfield' ? t('Playfield') : t('Fronton');
}
