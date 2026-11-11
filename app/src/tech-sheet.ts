// « Fiche technique » (Menu système > Borne) : tout ce qui compose la borne sur une page, un bloc
// par ligne (PC, Windows, Écrans, Contrôleurs, Logiciels, Cyber Pinball) avec son état ; Start ouvre
// le détail du bloc, en grille « libellé | valeur » (Section.kind 'spec'), et l'écran qui répare.
// « Envoyer un rapport » fait un ZIP anonymisé (packages/core/src/techsheet.ts, buildReport) et le
// donne au téléphone connecté (il le télécharge, prépare un e-mail ou copie le résumé : la borne n'a
// pas de messagerie), l'écrit sur une clé USB ou dans un dossier de la borne, ou envoie son résumé à
// un ami dans la messagerie.
//
// Le relevé (tech-facts.ts) tourne en arrière-plan : la page s'ouvre sur le dernier, gardé dans
// <données>\cache\fiche.json, et le refait. La santé de la borne s'en sert pour son groupe « PC et
// Windows » (health.ts).

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  blockTitle,
  buildReport,
  formatDateTime,
  formatSize,
  healthLines,
  journalSince,
  readTextIfExists,
  reportMailto,
  SYSTEM_ITEMS,
  t,
  techBlocks,
  tn,
  type DriveInfo,
  type HealthFacts,
  type Report,
  type SystemItemId,
  type TechBlock,
  type TechBlockId,
  type TechFacts,
  type TechRowState,
  writeFileAtomic,
} from '@cyberpinball/core';
import type { Action, Built, Row, Section, Tone } from './library';

/** Un ami à qui envoyer le résumé. */
export interface ReportFriend {
  key: string;
  name: string;
  online: boolean;
}

export interface TechSheetContext {
  dataDir: string;
  /** Le relevé complet (tech-facts.ts, collectTechFacts). */
  collect(): Promise<TechFacts>;
  /** Le dernier relevé de la santé (sante.json), pour le rapport. */
  health(): HealthFacts | undefined;
  /** Relevé de la santé à refaire après celui de la fiche (son groupe « PC et Windows » en dépend). */
  healthChanged(facts: TechFacts): void;
  load(): TechFacts | undefined;
  save(facts: TechFacts): void;
  openCustom(build: () => Built, at?: number): void;
  openSystem(): void;
  runSystemItem(id: SystemItemId, back: () => void): void;
  prompt(heading: string, label: string, value: string, done: (value: string | undefined) => void, lead?: string): void;
  showing(build: () => Built): boolean;
  broadcast(): void;
  /** Installer la version de VPX que Cyber Pinball connaît (Santé de la borne). */
  installVpx?(): void;
  /** Lecteurs de la borne (file-picker.ts). */
  drives(): Promise<DriveInfo[]>;
  eject?(drive: DriveInfo): Promise<boolean>;
  /** Le téléphone connecté qui pilote le menu : son nom (« Android · Chrome »), sinon undefined. */
  phone(): string | undefined;
  /** Donne le rapport au téléphone connecté ; faux s'il n'y en a plus. */
  offerPhone(report: { name: string; data: Buffer; summary: string; mailto: string }): boolean;
  /** Amis à qui écrire ; undefined : réseau des amis coupé. */
  friends?(): ReportFriend[] | undefined;
  sendFriend?(key: string, text: string): void;
  /** Noms à retirer du rapport : le joueur, la borne, ses amis. */
  names(): string[];
  /** Fichiers à joindre : journal de VPX de la dernière partie, VPinballX.ini, configurations (anonymisées ici). */
  attachments(): { name: string; text: string; about: string }[];
}

const TONE: Record<TechRowState, Tone | undefined> = { ok: undefined, check: 'warning', blocking: 'error', info: 'info', quiet: 'quiet' };
const BADGE = (state: TechRowState | undefined): string[] | undefined => (state === 'check' ? [t('! À vérifier')] : state === 'blocking' ? [t('✕ Bloquant')] : undefined);
const stateBadge = (state: TechBlock['state']) => (state === 'ok' ? t('✓ OK') : state === 'check' ? t('! À vérifier') : t('✕ Bloquant'));

/** Ce que chaque bloc propose pour réparer ou aller plus loin : des entrées du menu système. */
function blockItems(id: TechBlockId, facts: TechFacts): { item: SystemItemId; detail?: string }[] {
  switch (id) {
    case 'pc':
      return [{ item: 'downloads', detail: t('Faire de la place sur le disque des tables') }];
    case 'windows':
      return [...(facts.windows?.rebootPending ? [{ item: 'restart' as const, detail: t('Termine la mise à jour en attente') }] : []), { item: 'dedicated' }];
    case 'displays':
      return [{ item: 'cabinet', detail: facts.configuration ? t('{name} · {found} écrans sur {total} branchés', { name: facts.configuration.name, found: facts.configuration.found, total: facts.configuration.total }) : undefined }];
    case 'controllers':
      return [{ item: 'controls' }, { item: 'dof' }];
    case 'software':
      return [{ item: 'vpx-settings' }];
    case 'app':
      return [{ item: 'updates' }, { item: 'activity' }];
  }
}

export function createTechSheet(ctx: TechSheetContext) {
  let facts: TechFacts | undefined = ctx.load();
  let running: Promise<void> | undefined;
  let awaitingFirst = false;
  let description = '';
  let report: Report | undefined;

  const age = () => (facts ? t('relevée le {when}', { when: formatDateTime(facts.at, { dateStyle: 'short', timeStyle: 'short' }) }) : '');

  function refresh(): Promise<void> {
    running ??= ctx
      .collect()
      .then((next) => {
        facts = next;
        report = undefined;
        try {
          ctx.save(next);
        } catch {
          // Données en lecture seule : le relevé reste en mémoire.
        }
        ctx.healthChanged(next);
      })
      .catch((error: Error) => console.error(`Fiche technique : ${error.message}`)) // i18n-ignore : journal
      .finally(() => {
        running = undefined;
        if (awaitingFirst && facts && ctx.showing(build)) open(false);
        awaitingFirst = false;
        ctx.broadcast();
      });
    ctx.broadcast();
    return running;
  }

  // ---------- La page ----------

  function open(check = true): void {
    awaitingFirst = !facts;
    const blocks = facts ? techBlocks(facts) : [];
    const first = blocks.findIndex((b) => b.state !== 'ok');
    ctx.openCustom(build, Math.max(0, first));
    if (check && !running) void refresh();
  }

  function build(): Built {
    const back = () => ctx.openSystem();
    const blocks = facts ? techBlocks(facts) : [];
    const checks = blocks.filter((b) => b.state !== 'ok').length;
    const rows: Row[] = blocks.map((b, i) => ({ action: i, pick: true, icon: b.icon, text: b.title, detail: b.summary, tone: b.state === 'ok' ? 'ok' : b.state === 'check' ? 'warning' : 'error', badges: [stateBadge(b.state)] }));
    const actions: Action[] = blocks.map((b) => ({ label: b.title, key: `sheet:${b.id}`, run: () => openBlock(b.id) }));
    actions.push({ label: t('Envoyer un rapport'), detail: t('Au téléphone, sur une clé USB ou à un ami · anonymisé'), icon: 'upload', tone: 'ok', key: 'sheet:report', run: () => openReport() });
    actions.push({ label: SYSTEM_ITEMS.health.label, icon: SYSTEM_ITEMS.health.icon, key: 'sheet:health', run: () => ctx.runSystemItem('health', () => open(false)) });
    actions.push({ label: running ? t('Relevé en cours…') : t('Relever à nouveau'), icon: 'refresh', tone: running ? 'quiet' : undefined, key: 'sheet:refresh', run: () => void refresh() });
    actions.push({ label: t('Retour'), icon: 'back', run: back });
    return {
      heading: SYSTEM_ITEMS['tech-sheet'].label,
      icon: SYSTEM_ITEMS['tech-sheet'].icon,
      subheading: facts ? (running ? t('{age} · nouveau relevé en cours…', { age: age() }) : age()) : undefined,
      lead: facts
        ? checks
          ? tn(checks, 'Tout ce qui compose la borne. {n} bloc a un point à vérifier.', 'Tout ce qui compose la borne. {n} blocs ont un point à vérifier.')
          : t('Tout ce qui compose la borne, pour repérer un problème ou le décrire à qui vous aide.')
        : t('Premier relevé en cours : PC, Windows, écrans, contrôleurs et logiciels.'),
      sections: blocks.length ? [{ options: true, rows }] : [],
      actions,
      back,
    };
  }

  /** Une ligne de la fiche : libellé à gauche, valeur, détail ; état écrit, jamais la couleur seule. */
  function specRow(r: TechBlock['sections'][number]['rows'][number]): Row {
    return { label: r.label, text: r.value, detail: r.detail, tone: r.state ? TONE[r.state] : undefined, badges: BADGE(r.state) };
  }

  /** Le détail d'un bloc ; son « Retour » ramène à la page, ou à `back` (Santé de la borne). */
  function openBlock(id: TechBlockId, back: () => void = () => open(false)): void {
    ctx.openCustom(() => {
      const b = facts ? techBlocks(facts).find((x) => x.id === id) : undefined;
      if (!b) return build();
      const sections: Section[] = b.sections.map((s) => ({ ...(s.title && { title: s.title }), kind: 'spec', rows: s.rows.map(specRow) }));
      if (b.notes.length) sections.push({ title: t('À vérifier'), rows: b.notes.map((n) => ({ icon: 'alert', text: n.title, detail: n.detail, tone: n.state === 'blocking' ? 'error' : 'warning' })) });
      const actions: Action[] = [];
      if (id === 'software' && facts?.software?.vpx?.known && facts.software.vpx.known !== facts.software.vpx.version && ctx.installVpx)
        actions.push({ label: t('Installer VPX {version}', { version: facts.software.vpx.known }), detail: t('L’ancienne version reste à côté'), icon: 'upgrade', run: () => ctx.installVpx!() });
      for (const { item, detail } of blockItems(id, facts!)) {
        const entry = SYSTEM_ITEMS[item];
        actions.push({ label: entry.label, icon: entry.icon, ...(detail && { detail }), run: () => ctx.runSystemItem(item, () => openBlock(id, back)) });
      }
      actions.push({ label: t('Retour'), icon: 'back', run: back });
      return { heading: b.title, icon: b.icon, subheading: t('Fiche technique · {age}', { age: age() }), sections, actions, back };
    });
  }

  // ---------- Le rapport ----------

  /** Le rapport tel qu'il partirait maintenant (refait si la description ou le relevé a changé). */
  function current(): Report | undefined {
    if (!facts) return undefined;
    if (report) return report;
    const health = ctx.health();
    const lines = health ? healthLines(health) : [];
    const logs = path.join(ctx.dataDir, 'logs');
    const since = Date.now() - 7 * 24 * 3600_000;
    const journal = [readTextIfExists(path.join(logs, 'journal-ancien.txt')), readTextIfExists(path.join(logs, 'journal.txt'))].map((x) => journalSince(x, since)).filter(Boolean).join('\n');
    const attachments = [...(journal ? [{ name: 'journal.txt', text: journal, about: t('le journal de Cyber Pinball, 7 jours') }] : []), ...ctx.attachments()]; // i18n-ignore : nom de fichier
    report = buildReport({
      facts,
      health: lines,
      description,
      attachments,
      healthJson: health,
      secrets: { user: os.userInfo().username, profile: os.homedir(), computer: os.hostname(), names: ctx.names() },
    });
    return report;
  }

  async function openReport(): Promise<void> {
    if (!facts) return open();
    const drives = (await ctx.drives().catch(() => [] as DriveInfo[])).filter((d) => d.type === 'usb');
    const back = () => open(false);
    const self = () => void openReport();
    ctx.openCustom(() => {
      const r = current();
      if (!r) return build();
      const phone = ctx.phone();
      const friends = ctx.friends?.();
      const rows: Row[] = [];
      const actions: Action[] = [];
      const pick = (row: Omit<Row, 'action' | 'pick'>, action: Action) => {
        rows.push({ ...row, action: actions.length, pick: true });
        actions.push(action);
      };
      if (phone) pick({ icon: 'phone', text: t('Sur le téléphone connecté'), detail: t('{phone} · il le partage ensuite par e-mail, WhatsApp, Messenger…', { phone }) }, { label: t('Sur le téléphone connecté'), key: 'report:phone', run: () => sendPhone() });
      else pick({ icon: 'phone', text: t('Connecter un téléphone'), detail: t('Start : un QR code à lire avec l’appareil photo, le téléphone sur le même réseau que la borne'), tone: 'info' }, { label: t('Connecter un téléphone'), key: 'report:phone', run: () => ctx.runSystemItem('phone-remote', self) });
      for (const d of drives)
        pick(
          { icon: 'usb', text: d.name ? t('Sur la clé « {name} » ({letter})', { name: d.name, letter: d.letter }) : t('Sur la clé {letter}', { letter: d.letter }), detail: d.free !== undefined ? t('{free} libres · pour l’ouvrir sur un autre ordinateur', { free: formatSize(d.free) }) : t('Pour l’ouvrir sur un autre ordinateur') },
          { label: t('Sur la clé {letter}', { letter: d.letter }), key: `report:usb:${d.letter}`, run: () => sendFolder(path.join(d.path ?? `${d.letter}\\`, t('Rapports Cyber Pinball')), d) },
        );
      if (!drives.length) pick({ icon: 'usb', text: t('Sur une clé USB'), detail: t('Aucune clé branchée : elle apparaît ici dès qu’elle l’est'), tone: 'quiet' }, { label: t('Sur une clé USB'), key: 'report:usb', run: self });
      if (friends?.length) pick({ icon: 'message', text: t('À un ami'), detail: t('Le résumé, dans la messagerie · {online}', { online: tn(friends.filter((f) => f.online).length, '{n} ami en ligne', '{n} amis en ligne') }) }, { label: t('À un ami'), key: 'report:friend', run: () => openFriends() });
      else pick({ icon: 'message', text: t('À un ami'), detail: friends ? t('Aucun ami pour l’instant : Menu système > Amis > Trouver un joueur') : t('Réseau des amis coupé'), tone: 'quiet' }, { label: t('À un ami'), key: 'report:friend', run: self });
      pick({ icon: 'folder', text: t('Dans un dossier de la borne'), detail: t('{dir} · à copier vous-même', { dir: reportDir() }) }, { label: t('Dans un dossier de la borne'), key: 'report:folder', run: () => sendFolder(reportDir()) });
      const contents: Row[] = [
        { icon: 'report', text: t('La fiche technique et la santé de la borne'), detail: t('Une page lisible dans tout navigateur, sur ordinateur ou téléphone') },
        { icon: 'list', text: t('Les journaux'), detail: t('Cyber Pinball sur 7 jours, VPX de la dernière partie') },
        { icon: 'sliders', text: t('Les réglages de la borne et de VPX'), detail: t('VPinballX.ini, configurations des écrans et des boutons') },
        { icon: 'lock', text: t('Jamais : votre nom d’utilisateur, le nom du PC, les adresses IP'), detail: t('Ni les noms de vos amis, vos messages ou les clés du réseau : remplacés ou retirés avant l’envoi'), tone: 'info' },
      ];
      actions.push({
        label: t('Décrire le problème'),
        detail: description ? `« ${description.length > 60 ? `${description.slice(0, 60)}…` : description} »` : t('Facultatif : ce qui se passe, sur quelle table · au téléphone ou au clavier'),
        icon: 'edit',
        key: 'report:describe',
        run: () =>
          ctx.prompt(t('Décrire le problème'), t('Ce qui se passe'), description, (value) => {
            if (value !== undefined) {
              description = value.trim();
              report = undefined;
            }
            self();
          }, t('Ce qui se passe, sur quelle table, depuis quand. Il part dans le rapport, anonymisé.')),
      });
      actions.push({ label: t('Voir le contenu du rapport'), detail: tn(r.files.length, '{n} fichier', '{n} fichiers'), icon: 'eye', key: 'report:contents', run: () => openContents() });
      actions.push({ label: t('Retour'), icon: 'back', run: back });
      return {
        heading: t('Envoyer un rapport'),
        icon: 'upload',
        subheading: t('Fiche technique, santé, réglages et journaux · {files} · {size}', { files: tn(r.files.length, '{n} fichier', '{n} fichiers'), size: formatSize(r.zip.length) }),
        lead: t('Anonymisé : ni votre nom, ni le nom du PC, ni adresse IP, ni noms d’amis. Pour qu’un ami, un forum ou un dépanneur comprenne votre borne sans venir la voir.'),
        hint: t('Flippers : choisir · Start : envoyer ici · Exit : revenir'),
        sections: [
          { title: t('Où l’envoyer'), options: true, rows },
          { title: t('Ce qu’il contient'), rows: contents },
        ],
        actions,
        back,
      };
    });
  }

  function reportDir(): string {
    return path.join(ctx.dataDir, 'rapports');
  }

  function openContents(): void {
    const back = () => void openReport();
    ctx.openCustom(() => {
      const r = current();
      if (!r) return build();
      const user = path.join(path.dirname(os.homedir()), `‹${t('utilisateur')}›`);
      return {
        heading: t('Contenu du rapport'),
        icon: 'eye',
        subheading: t('{name} · {files} · {size}', { name: r.name, files: tn(r.files.length, '{n} fichier', '{n} fichiers'), size: formatSize(r.zip.length) }),
        sections: [
          { title: t('Fichiers'), kind: 'spec', rows: r.files.map((f) => ({ label: f.name, text: f.about, detail: formatSize(f.size) })) },
          {
            title: t('Remplacé avant l’envoi'),
            kind: 'spec',
            rows: [
              { label: t('Chemins'), text: `${user}\\…`, detail: t('Votre nom d’utilisateur, partout où il apparaît'), tone: 'info' },
              { label: t('Noms'), text: t('‹PC›, ‹ami 1›, ‹ami 2›…'), detail: t('Nom du PC, de la borne et des joueurs, noms des amis'), tone: 'info' },
              { label: t('Adresses'), text: t('‹adresse IP›, ‹adresse e-mail›'), detail: t('Retirées des journaux et des réglages'), tone: 'info' },
            ],
          },
        ],
        actions: [{ label: t('Retour'), icon: 'back', run: back }],
        back,
      };
    });
  }

  function done(heading: string, icon: Built['icon'], subheading: string, rows: Row[], extra: Action[] = []): void {
    const back = () => open(false);
    ctx.openCustom(() => ({
      heading,
      icon,
      subheading,
      sections: [{ rows }],
      actions: [...extra, { label: t('Retour à la fiche technique'), icon: 'report', tone: extra.length ? undefined : 'ok', run: back }, { label: t('Retour au menu'), icon: 'back', run: () => ctx.openSystem() }],
      back,
    }));
  }

  function sendPhone(): void {
    const r = current();
    if (!r) return;
    const phone = ctx.phone();
    const sent = ctx.offerPhone({ name: r.name, data: r.zip, summary: r.summary, mailto: reportMailto(r.summary, r.name) });
    if (!sent || !phone) return void openReport();
    console.log(`Fiche technique : rapport donné au téléphone (${formatSize(r.zip.length)}).`); // i18n-ignore : journal
    done(t('Rapport disponible sur le téléphone'), 'phone', t('{phone} · {when}', { phone, when: formatDateTime(Date.now(), { timeStyle: 'short' }) }), [
      { icon: 'check', text: t('{name} · {size}', { name: r.name, size: formatSize(r.zip.length) }), detail: t('Sur le téléphone : touchez « Télécharger le rapport »'), tone: 'ok', badges: [t('Prêt à télécharger')] },
      { icon: 'message', text: t('Ensuite, depuis le téléphone'), detail: t('« Préparer un e-mail » ouvre sa messagerie avec le résumé ; joignez-y le fichier téléchargé. « Copier le résumé » pour un forum ou WhatsApp.'), tone: 'info' },
    ]);
  }

  async function sendFolder(dir: string, drive?: DriveInfo): Promise<void> {
    const r = current();
    if (!r) return;
    const file = path.join(dir, r.name);
    try {
      writeFileAtomic(file, r.zip);
      const back = await fs.promises.readFile(file);
      if (!back.equals(r.zip)) throw new Error(t('le fichier relu ne correspond pas'));
    } catch (error) {
      console.error(`Fiche technique : rapport non écrit dans ${dir} (${(error as Error).message}).`); // i18n-ignore : journal
      return done(t('Rapport non enregistré'), 'alert', dir, [{ icon: 'alert', text: t('Écriture impossible : {reason}', { reason: (error as Error).message }), detail: t('Essayez une autre destination.'), tone: 'error' }], [
        { label: t('Choisir une autre destination'), icon: 'upload', run: () => void openReport() },
      ]);
    }
    console.log(`Fiche technique : rapport écrit (${formatSize(r.zip.length)}).`); // i18n-ignore : journal
    const eject = drive && ctx.eject ? [{ label: t('Éjecter la clé'), detail: t('Attendez le message avant de la débrancher'), icon: 'usb' as const, tone: 'ok' as const, run: () => void ejectDrive(drive) }] : [];
    done(t('Rapport enregistré'), drive ? 'usb' : 'folder', drive ? (drive.name ? t('Clé « {name} » ({letter})', { name: drive.name, letter: drive.letter }) : drive.letter) : dir, [
      { icon: 'check', text: r.name, detail: t('Dans {dir} · {size} · relu après l’écriture', { dir, size: formatSize(r.zip.length) }), tone: 'ok', badges: [t('✓ Vérifié')] },
      { icon: 'desktop', text: t('Sur un autre ordinateur'), detail: t('Ouvrez le fichier .zip, puis rapport.html pour le lire ; joignez le .zip à un e-mail pour l’envoyer.'), tone: 'info' },
    ], eject);
  }

  async function ejectDrive(drive: DriveInfo): Promise<void> {
    const ok = await ctx.eject!(drive);
    done(ok ? t('Clé éjectée') : t('Clé encore utilisée'), 'usb', drive.letter, [
      ok ? { icon: 'check', text: t('Vous pouvez débrancher la clé'), tone: 'ok' } : { icon: 'alert', text: t('Windows n’a pas libéré la clé'), detail: t('Fermez ce qui l’utilise, puis réessayez.'), tone: 'warning' },
    ]);
  }

  function openFriends(): void {
    const back = () => void openReport();
    ctx.openCustom(() => {
      const friends = [...(ctx.friends?.() ?? [])].sort((a, b) => Number(b.online) - Number(a.online) || a.name.localeCompare(b.name));
      const rows: Row[] = friends.map((f, i) => ({ action: i, pick: true, icon: 'friends', text: f.name, detail: f.online ? t('En ligne · il le reçoit tout de suite') : t('Il le recevra à sa reconnexion'), ...(f.online && { tone: 'ok' as const, badges: [t('En ligne')] }) }));
      const actions: Action[] = friends.map((f) => ({ label: f.name, key: `friend:${f.key}`, run: () => sendFriend(f) }));
      actions.push({ label: t('Retour'), icon: 'back', run: back });
      return {
        heading: t('Envoyer le résumé à un ami'),
        icon: 'message',
        subheading: t('Le résumé du rapport arrive dans votre fil avec lui, comme un message'),
        lead: t('Le fichier complet passe par le téléphone ou une clé USB : la messagerie ne transporte que du texte.'),
        hint: t('Flippers : choisir · Start : envoyer à cet ami · Exit : revenir'),
        sections: [{ options: true, rows }],
        actions,
        back,
      };
    });
  }

  function sendFriend(friend: ReportFriend): void {
    const r = current();
    if (!r || !ctx.sendFriend) return;
    ctx.sendFriend(friend.key, r.short);
    if (description) ctx.sendFriend(friend.key, `${t('Le problème :')} ${description}`.slice(0, 500));
    console.log('Fiche technique : résumé du rapport envoyé à un ami.'); // i18n-ignore : journal
    done(t('Résumé envoyé à {name}', { name: friend.name }), 'message', friend.online ? t('Il est en ligne : il le reçoit tout de suite') : t('Il le recevra à sa reconnexion'), [
      { icon: 'check', text: t('Le résumé est dans votre fil avec {name}', { name: friend.name }), detail: r.short.split('\n').slice(0, 3).join(' · '), tone: 'ok', badges: [friend.online ? t('Envoyé') : t('En attente')] },
      { icon: 'info', text: t('Le fichier complet'), detail: t('S’il le demande : « Sur le téléphone connecté » ou « Sur une clé USB »'), tone: 'info' },
    ]);
  }

  // ---------- Pour le reste de l'application ----------

  /** Sous l'entrée du menu : l'essentiel du dernier relevé. */
  function summary(): string {
    if (!facts) return t('PC, Windows, écrans, contrôleurs, logiciels · envoyer un rapport');
    const checks = techBlocks(facts).filter((b) => b.state !== 'ok').length;
    return checks ? tn(checks, 'Matériel, logiciels et rapport · {n} bloc à vérifier', 'Matériel, logiciels et rapport · {n} blocs à vérifier') : t('Matériel, logiciels et rapport de dépannage');
  }

  /**
   * Premier relevé peu après le démarrage (après celui de la santé), puis toutes les 30 minutes : le
   * groupe « PC et Windows » de la santé suit sans qu'on ouvre la fiche. Jamais pendant une partie.
   */
  function watch(quiet: () => boolean = () => false): void {
    const tick = () => {
      if (!quiet()) void refresh();
    };
    setTimeout(tick, 25_000).unref?.();
    setInterval(tick, 30 * 60_000).unref?.();
  }

  return {
    open,
    openBlock,
    refresh,
    watch,
    summary,
    facts: () => facts,
    running: () => Boolean(running),
  };
}
