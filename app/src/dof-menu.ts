// Menu système > Borne > « LED et retours (DOF) » : les contrôleurs de retours que DOF verra
// (reconnus à leur identifiant USB, sans rien ouvrir), sa configuration (les directoutputconfig.ini
// du configtool, Cabinet.xml), ce qui empêchera une LED de s'allumer, et trois gestes :
// - ouvrir configtool.vpuniverse.com dans « Récupérer » : le ZIP téléchargé revient ici et s'importe ;
// - importer un ZIP déjà téléchargé ;
// - décrire les bandes de LED adressables (Teensy, Wemos D1) : Cabinet.xml et GlobalConfig écrits
//   par Cyber Pinball, jamais à la place de fichiers écrits à la main.
// Rien n'est envoyé aux contrôleurs hors partie : c'est VPX qui les pilote, par son plugin DOF.

import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  cabinetXml,
  detectDofControllers,
  DOF_ADDRESSABLE_NUMBER,
  DOF_CONTROLLERS,
  dofControllerLabels,
  dofFindings,
  isDofControllerType,
  LED_ARRANGEMENTS,
  LED_COLOR_ORDERS,
  LED_CONTROLLER_TYPES,
  LED_MAX_OUTPUTS,
  ARTNET_LEDS_PER_UNIVERSE,
  ARTNET_MAX_UNIVERSES,
  artnetUniverse,
  wledLedCount,
  wledSegments,
  ledOutputCount,
  ledsOnBoard,
  ledsOnSerial,
  ledProblems,
  ledsFromCabinet,
  ledsPerOutput,
  nextDofOutput,
  planDofImport,
  planLedWrite,
  readDofSetup,
  renameWithRetry,
  serialPortCandidates,
  stripLedCount,
  t,
  tn,
  writeFileAtomic,
  type CabinetLeds,
  type DofSetup,
  type HidName,
  type IconName,
  type LedArrangement,
  type LedColorOrder,
  type LedControllerType,
  type LedStripSpec,
  type ObservedUsbDevice,
} from '@cyberpinball/core';
import type { Action, Built, ProvidedSystemItem, Row } from './library';

/** Adresse du configtool : la configuration DOF de la borne s'y fait, avec un compte VPUniverse. */
export const CONFIGTOOL_URL = 'https://configtool.vpuniverse.com/';

export interface DofMenuHost {
  library: {
    openCustom(build: () => Built, at?: number): void;
    openSystem(): void;
    openPrompt(heading: string, label: string, value: string, done: (value: string | undefined) => void, lead?: string): void;
    openNotice(heading: string, lines: string[], then?: () => void): void;
    pick(request: { title: string; icon?: IconName; purpose: string; filter?: { label: string; extensions: string[] }; mode: 'file'; start?: 'cp' | 'windows' }): Promise<string[] | undefined>;
    task(message: string, work: () => Promise<void> | void): Promise<void>;
  };
  /** Dossier que lit le plugin DOF ; undefined sans VPX. */
  dir(): string | undefined;
  /** Dossier de travail de VPX, dernier recours de libdof. */
  workDir(): string | undefined;
  /** Périphériques USB présents ; undefined : illisibles. */
  usb(): ObservedUsbDevice[] | undefined;
  /** Noms HID connus (joysticks relevés) : départagent Pinscape et LedWiz. */
  hidNames(): HidName[];
  /** Dossier des sauvegardes de Cyber Pinball : l'ancienne configuration y est mise de côté. */
  backupDir(): string;
  /** Dossier de travail pour déballer un ZIP. */
  stagingDir(): string;
  unpack(file: string, dest: string): Promise<boolean>;
  /** Ouvre une page dans « Récupérer » ; le fichier téléchargé revient à `received`. Absent : pas de navigateur intégré. */
  browse?(url: string, received: (file: string) => void): void;
  /** Après un changement : VPinballX.ini resynchronisé ([Plugin.DOF] Enable), santé relevée de nouveau. */
  changed(): void;
}

const arrangementLabel = (a: LedArrangement): string => {
  const parts: Record<string, string> = {
    LeftRight: t('de gauche à droite'),
    RightLeft: t('de droite à gauche'),
    TopDown: t('de haut en bas'),
    BottomUp: t('de bas en haut'),
  };
  const m = /^(LeftRight|RightLeft|TopDown|BottomUp)(Alternate)?(LeftRight|RightLeft|TopDown|BottomUp)$/.exec(a)!;
  const label = t('{first}, puis {second}', { first: parts[m[1]!]!, second: parts[m[3]!]! });
  return m[2] ? t('{label}, en serpentin', { label }) : label;
};

const controllerLabel = (c: LedControllerType) => DOF_CONTROLLERS[c].label;

const SIZE_CHOICES = [1, 8, 10, 16, 20, 24, 30, 32, 36, 48, 60, 64, 72, 96, 120, 144, 150, 180, 240, 300];
const BRIGHTNESS_CHOICES = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];

export function createDofMenu(host: DofMenuHost) {
  const { library } = host;
  let flash: { text: string; tone: 'ok' | 'warning' | 'error' } | undefined;
  /** Bandes en cours de description ; reprises du Cabinet.xml à chaque ouverture de l'éditeur. */
  let draft: CabinetLeds | undefined;

  /**
   * Lecture des périphériques et du dossier de DOF, gardée quelques secondes : le détail de
   * l'entrée du menu se redessine souvent, et lire le registre pour chaque image serait lent.
   */
  let cache: { at: number; setup: DofSetup | undefined; devices: ObservedUsbDevice[] } | undefined;
  const CACHE_MS = 5000;
  function read(fresh = false) {
    if (!fresh && cache && Date.now() - cache.at < CACHE_MS) return cache;
    const dir = host.dir();
    cache = { at: Date.now(), setup: dir ? readDofSetup(dir, host.workDir()) : undefined, devices: host.usb() ?? [] };
    return cache;
  }

  function setup(): DofSetup | undefined {
    return read().setup;
  }

  function state() {
    const { setup: s, devices } = read();
    const detected = detectDofControllers(devices, host.hidNames());
    return { setup: s, devices, detected, findings: s ? dofFindings(s, detected, devices) : [] };
  }

  // ---------- Page ----------

  function open(at = 0): void {
    library.openCustom(build, at);
  }

  function build(): Built {
    const back = () => library.openSystem();
    const { setup: s, detected, findings } = state();
    const sections: Built['sections'] = [];
    if (flash) sections.push({ rows: [{ text: flash.text, tone: flash.tone }] });

    const controllerRows: Row[] = [];
    for (const d of detected) {
      const info = DOF_CONTROLLERS[d.type];
      const detail = [
        d.alternatives?.length ? t('identifiant partagé : {list}', { list: [d.type, ...d.alternatives].map((x) => DOF_CONTROLLERS[x].label).join(t(' ou ')) }) : undefined,
        d.unitAssumed ? t('unité 1 supposée (réglée sur la carte)') : undefined,
        info.addressable ? t('LED adressables') : undefined,
        t('USB {usb}', { usb: d.usb }),
      ]
        .filter(Boolean)
        .join(' · ');
      controllerRows.push({ icon: 'chip', text: t('{controller} · directoutputconfig{n}.ini', { controller: info.label + (d.device.port ? ` (${d.device.port})` : ''), n: d.numbers.join(t(' ou ')) }), detail });
    }
    for (const c of s?.cabinet?.controllers ?? []) {
      if (detected.some((d) => d.type === c.type)) continue;
      controllerRows.push({
        icon: 'chip',
        text: isDofControllerType(c.type) ? DOF_CONTROLLERS[c.type].label : c.type,
        detail: t('déclaré dans Cabinet.xml{port}', { port: c.comPort ? ` · ${c.comPort}` : '' }),
        tone: 'quiet',
      });
    }
    if (!controllerRows.length) controllerRows.push({ icon: 'info', text: t('Aucun contrôleur de retours reconnu'), detail: t('Pinscape, LedWiz, Teensy, DudesCab, PacLed… : branchez-le, puis « Vérifier de nouveau ».'), tone: 'quiet' });
    // La KL25Z ne pilote pas de LED adressables : cas réel du 04/11/2026.
    const kl25z = detected.some((d) => d.type === 'Pinscape' || d.alternatives?.includes('Pinscape'));
    const addressable = detected.some((d) => DOF_CONTROLLERS[d.type].addressable) || (s?.cabinet?.strips.length ?? 0) > 0;
    if (kl25z && !addressable) {
      controllerRows.push({
        icon: 'info',
        text: t('La KL25Z ne pilote pas de LED adressables'),
        detail: t('Des bandes WS2812 (3 fils) demandent un contrôleur à elles : Teensy (TeensyStripController), Wemos D1, DudesCab ou Pinscape Pico. La KL25Z garde les boutons, le lanceur et les sorties classiques.'),
        tone: 'info',
      });
    }
    sections.push({ title: t('Contrôleurs'), rows: controllerRows });

    const files: Row[] = [];
    if (!s) files.push({ icon: 'alert', text: t('VPX n’est pas installé : pas de dossier de DOF'), tone: 'warning' });
    else {
      files.push({
        icon: 'folder',
        text: s.ini.length ? tn(s.ini.length, '{n} fichier du configtool', '{n} fichiers du configtool') : t('Aucune configuration du configtool'),
        detail: s.ini.length ? t('{list} · {dir}', { list: s.ini.map((f) => path.basename(f.file)).join(', '), dir: s.iniDir ?? s.dir }) : s.dir,
        tone: s.ini.length ? undefined : 'warning',
      });
      const roms = new Set(s.ini.flatMap((f) => f.roms.map((r) => r.toLowerCase())));
      if (roms.size) files.push({ icon: 'chip', text: tn(roms.size, '{n} ROM configurée', '{n} ROM configurées'), detail: t('Seules les tables à ROM PinMAME déclenchent DOF en mode plugins de VPX.') });
      if (s.cabinet) {
        files.push({
          icon: 'bulb',
          text: s.cabinet.owned ? t('Cabinet.xml écrit par Cyber Pinball') : t('Cabinet.xml écrit à la main'),
          detail: tn(s.cabinet.strips.length, '{n} bande de LED · {file}', '{n} bandes de LED · {file}', { file: s.cabinet.file }),
        });
      }
    }
    sections.push({ title: t('Configuration'), rows: files });

    const problems = findings.filter((f) => f.severity !== 'info');
    if (problems.length) sections.push({ title: t('À vérifier'), rows: problems.map((f) => ({ icon: 'alert' as const, text: f.message, tone: 'warning' as const })) });
    else if (s && (detected.length || s.ini.length)) sections.push({ rows: [{ icon: 'check', text: t('Rien n’empêche DOF d’allumer la borne'), tone: 'ok' }] });

    const actions: Action[] = [
      host.browse && s
        ? {
            label: t('Ouvrir configtool.vpuniverse.com'),
            detail: t('Décrire la borne, puis « Generate Config » : le ZIP téléchargé revient ici et s’importe'),
            icon: 'link',
            run: () => openConfigtool(),
          }
        : {
            label: t('Ouvrir configtool.vpuniverse.com'),
            detail: s ? t('Navigateur intégré indisponible : téléchargez le ZIP ailleurs, puis importez-le') : t('Indisponible sans VPX installé'),
            icon: 'link',
            tone: 'quiet',
            run: () => library.openNotice(t('Configtool indisponible'), [s ? t('Le navigateur intégré n’est pas disponible ici.') : t('Installez d’abord VPX : DOF fait partie de VPX.')], () => open()),
          },
      s
        ? { label: t('Importer la configuration du configtool…'), detail: t('Le ZIP téléchargé depuis configtool.vpuniverse.com ; l’ancienne configuration est sauvegardée'), icon: 'import', run: () => void pickZip() }
        : { label: t('Importer la configuration du configtool…'), detail: t('Indisponible sans VPX installé'), icon: 'import', tone: 'quiet', run: () => library.openNotice(t('Import indisponible'), [t('Installez d’abord VPX : DOF fait partie de VPX.')], () => open()) },
      {
        label: t('Bandes de LED adressables…'),
        detail: s?.cabinet?.strips.length ? tn(s.cabinet.strips.length, '{n} bande décrite', '{n} bandes décrites') : t('Décrire vos bandes WS2812 : Cabinet.xml écrit pour vous'),
        icon: 'bulb',
        ...(s ? {} : { tone: 'quiet' as const }),
        run: () => (s ? openEditor() : library.openNotice(t('LED adressables indisponibles'), [t('Installez d’abord VPX : DOF fait partie de VPX.')], () => open())),
      },
      { label: t('Vérifier de nouveau'), detail: t('Relit les périphériques USB et le dossier de DOF'), icon: 'refresh', run: () => refresh() },
      { label: t('Retour'), icon: 'back', run: back },
    ];
    return {
      heading: t('LED et retours (DOF)'),
      icon: 'bulb',
      lead: t('DOF allume les LED, flashers, contacteurs et le vibreur de la borne pendant les parties, d’après la configuration faite sur configtool.vpuniverse.com.'),
      sections,
      actions,
      back,
    };
  }

  function refresh(): void {
    flash = undefined;
    read(true);
    host.changed();
    open(3);
  }

  // ---------- Configtool ----------

  function openConfigtool(): void {
    host.browse!(CONFIGTOOL_URL, (file) => void importZip(file));
  }

  async function pickZip(): Promise<void> {
    const paths = await library.pick({
      title: t('Configuration DOF : choisir le ZIP du configtool'),
      icon: 'import',
      purpose: t('Import de la configuration DOF'),
      filter: { label: t('Archives ZIP'), extensions: ['zip'] },
      mode: 'file',
      start: 'windows',
    });
    if (paths?.[0]) await importZip(paths[0]);
    else open(1);
  }

  async function importZip(file: string): Promise<void> {
    const dir = host.dir();
    if (!dir) return;
    let message: string[] = [];
    let ok = false;
    await library.task(t('Import de la configuration DOF…'), async () => {
      const staging = path.join(host.stagingDir(), `dof-${Date.now()}`);
      try {
        fs.mkdirSync(staging, { recursive: true });
        if (!(await host.unpack(file, staging))) throw new Error(t('Archive illisible : {file}', { file: path.basename(file) }));
        const plan = planDofImport(staging, dir);
        const stamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-');
        const saved = path.join(host.backupDir(), 'dof', stamp);
        fs.mkdirSync(dir, { recursive: true });
        if (plan.replaced.length) {
          fs.mkdirSync(saved, { recursive: true });
          for (const f of plan.replaced) renameWithRetry(f, path.join(saved, path.basename(f)));
        }
        for (const c of plan.copies) fs.copyFileSync(c.from, c.to);
        ok = true;
        message = [
          tn(plan.numbers.length, '{n} fichier importé : directoutputconfig{list}.ini.', '{n} fichiers importés : directoutputconfig{list}.ini.', { list: plan.numbers.join(', ') }),
          ...(plan.replaced.length ? [t('L’ancienne configuration est sauvegardée dans {dir}.', { dir: saved })] : []),
          ...plan.skipped.filter((s) => s.reason !== t('inutile à DOF')).map((s) => t('{file} : {reason}', { file: path.basename(s.file), reason: s.reason })),
        ];
      } catch (error) {
        message = [(error as Error).message];
      } finally {
        fs.rmSync(staging, { recursive: true, force: true });
      }
    });
    cache = undefined;
    if (ok) host.changed();
    flash = { text: message[0] ?? '', tone: ok ? 'ok' : 'error' };
    library.openNotice(ok ? t('Configuration DOF importée') : t('Import impossible'), message, () => open());
  }

  // ---------- LED adressables ----------

  function initialDraft(): CabinetLeds {
    const s = setup();
    const fromFile = s?.cabinet ? ledsFromCabinet(s.cabinet) : undefined;
    if (fromFile) return fromFile;
    const { devices } = read();
    const detected = detectDofControllers(devices, host.hidNames());
    const teensy = detected.find((d) => d.type === 'TeensyStripController');
    // Une carte qui porte elle-même ses bandes (DudesCab, Pinscape Pico), sans Teensy : on part d'elle.
    const onBoard = !teensy ? detected.find((d) => d.type === 'DudesCab' || d.type === 'PinscapePico') : undefined;
    return { controller: (onBoard?.type as LedControllerType | undefined) ?? 'TeensyStripController', port: teensy?.device.port ?? serialPortCandidates(devices)[0]?.port ?? '', strips: [] };
  }

  function openEditor(at = 0): void {
    draft ??= initialDraft();
    library.openCustom(buildEditor, at);
  }

  function leaveEditor(): void {
    draft = undefined;
    open(2);
  }

  /** Lignes de l'éditeur avant les bandes : contrôleur, puis port (série) ou adresse et univers (Art-Net). */
  function settingsRows(d: CabinetLeds): number {
    return d.controller === 'ArtNet' ? 3 : ledsOnSerial(d.controller) ? 2 : 1;
  }
  const stripRow = (i: number) => settingsRows(draft ?? initialDraft()) + i;
  const addRow = () => settingsRows(draft ?? initialDraft()) + (draft?.strips.length ?? 0);

  /** « Sortie 2 » ou « Univers 1 » : où arrivent les données d'une bande. */
  function outputLabel(d: CabinetLeds, output: number): string {
    return d.controller === 'ArtNet' ? t('Univers {n}', { n: artnetUniverse(d, output) }) : t('Sortie {n}', { n: output });
  }

  /** Ce qu'il faut savoir du câblage, selon la carte. */
  function wiringRows(d: CabinetLeds): Row[] {
    if (d.controller === 'DudesCab') {
      return [
        {
          icon: 'info',
          text: t('Les bandes du DudesCab se décrivent dans son propre outil'),
          detail: t('Nombre de LED, sorties et numéro DOF se règlent dans l’outil de configuration du DudesCab (micrologiciel 1.9 ou plus récent, mode MX). VPX les lit sur la carte à chaque partie : Cyber Pinball n’a pas de Cabinet.xml à écrire, il en créerait des doublons.'),
        },
      ];
    }
    if (d.controller === 'PinscapePico') {
      return [
        {
          icon: 'info',
          text: t('Les LED de la Pinscape Pico se déclarent dans sa configuration'),
          detail: t('Dans l’outil de configuration de la Pinscape Pico, chaque LED adressable devient une sortie de la carte. DOF la pilote comme les autres sorties (directoutputconfig120.ini pour l’unité 1) : Cyber Pinball n’a pas de Cabinet.xml à écrire.'),
        },
      ];
    }
    if (d.controller === 'ArtNet') {
      return [
        {
          icon: 'info',
          text: t('Un nœud Art-Net sur le réseau (WLED sur un ESP32…)'),
          detail: t('Dans WLED : Config > Sync Interfaces > Realtime, réception « Art-Net », univers de départ {universe}, adresse DMX de départ 1, mode « Multi RGB ». Config > WiFi Setup : décocher le sommeil du Wi-Fi (« WiFi sleep »), sinon les effets saccadent. Le PC de la borne et l’ESP32 sur le même réseau.', { universe: d.universe ?? 0 }),
        },
        {
          icon: 'info',
          text: t('{max} LED par univers : chaque bande au début du sien', { max: ARTNET_LEDS_PER_UNIVERSE }),
          detail: t('WLED range 170 LED par univers à la suite. Une bande sur le 2e univers commence donc à la LED 170 dans WLED, pas juste après la précédente : saisissez dans LED Preferences le « Start » indiqué plus bas pour chaque bande, sinon ses couleurs arrivent décalées.'),
        },
        {
          icon: 'info',
          text: t('Données des bandes en 5 V'),
          detail: t('L’ESP32 sort ses données en 3,3 V : un adaptateur de niveau rapide (74AHCT125, 74HCT245) entre lui et la bande. Les petits modules bidirectionnels à BSS138 sont souvent trop lents pour les WS2812. Art-Net est prévu par le plugin DOF de VPX mais pas encore éprouvé : à vérifier en partie.'),
        },
      ];
    }
    return [
      {
        icon: 'info',
        text: t('Les bandes se branchent sur le contrôleur, pas sur la KL25Z'),
        detail: t('Données (DIN) sur une sortie du contrôleur, +5 V et masse sur une alimentation 5 V à part, masses reliées. Les LED d’une même sortie se suivent : la première bande, puis celle branchée à sa suite.'),
      },
      {
        icon: 'info',
        text: t('Câble de données long (jusqu’au fronton)'),
        detail: t('Un câble Ethernet depuis la carte OctoWS2811 du Teensy : chaque fil de données torsadé avec une masse. Une résistance de 100 à 330 Ω au départ des données (déjà sur l’OctoWS2811), et le 5 V amené à la bande par son propre câble, pas par celui des données.'),
      },
    ];
  }

  function buildEditor(): Built {
    // Un écran se redessine à tout moment (relevé de la santé…) : sans description en cours, on la relit.
    const d = (draft ??= initialDraft());
    const onBoard = ledsOnBoard(d.controller);
    const problems = ledProblems(d);
    const counts = ledsPerOutput(d);
    const total = counts.reduce((a, b) => a + b, 0);
    const sections: Built['sections'] = [];
    // Art-Net : ce qu'il faut saisir dans WLED pour que chaque bande reçoive ses propres couleurs.
    if (d.controller === 'ArtNet' && d.strips.length) {
      sections.push({
        title: t('Dans WLED (LED Preferences)'),
        rows: wledSegments(d)
          .map((g): Row => ({ text: t('« {name} » : Start {start}, {n} LED', { name: g.name, start: g.start, n: g.length }), detail: t('Univers {n}', { n: g.universe }) }))
          .concat([{ text: t('LED en tout dans WLED : {n}', { n: wledLedCount(d) }), detail: t('Trous compris : les LED entre deux bandes n’existent pas, WLED les ignore.') }]),
      });
    }
    // Les valeurs à saisir d'abord (WLED), puis le câblage et les réglages, puis les sorties.
    sections.push({ rows: wiringRows(d) });
    if (counts.length && !onBoard) {
      sections.push({
        title: d.controller === 'ArtNet' ? t('Univers Art-Net') : t('Sorties du contrôleur'),
        rows: counts
          .map((n, i) => ({ text: outputLabel(d, i + 1), detail: tn(n, '{n} LED', '{n} LED'), ...(d.controller === 'ArtNet' && n > ARTNET_LEDS_PER_UNIVERSE ? { tone: 'warning' as const } : {}) }))
          .filter((r) => r.detail !== tn(0, '{n} LED', '{n} LED'))
          .concat([{ text: t('En tout'), detail: tn(total, '{n} LED', '{n} LED') }]),
      });
    }
    if (problems.length && !onBoard) sections.push({ title: t('Avant d’enregistrer'), rows: problems.map((p) => ({ icon: 'alert' as const, text: p, tone: 'warning' as const })) });

    const unavailable = (label: string, icon: Action['icon'], reason: string): Action => ({ label, detail: reason, icon, tone: 'quiet', run: () => library.openNotice(label, [reason], () => openEditor()) });
    const actions: Action[] = [
      { label: t('Contrôleur : {controller}', { controller: controllerLabel(d.controller) }), detail: t('Start : choisir la carte des LED adressables'), icon: 'chip', run: () => openControllers() },
    ];
    if (ledsOnSerial(d.controller)) {
      actions.push({ label: t('Port série : {port}', { port: d.port || t('à choisir') }), detail: t('Start : choisir parmi les ports branchés'), icon: 'link', run: () => openPorts() });
    } else if (d.controller === 'ArtNet') {
      actions.push(
        {
          label: t('Adresse du nœud : {address}', { address: d.address?.trim() || t('tout le réseau') }),
          detail: t('L’adresse IP du nœud Art-Net, ou rien pour diffuser'),
          icon: 'link',
          run: () =>
            library.openPrompt(t('Adresse du nœud Art-Net'), t('Adresse IP (192.168.1.50), vide : tout le réseau'), d.address ?? '', (value) => {
              if (value !== undefined) d.address = value.trim();
              openEditor(1);
            }),
        },
        {
          label: t('Premier univers : {n}', { n: d.universe ?? 0 }),
          detail: t('Celui que le nœud attend (0 pour WLED par défaut)'),
          icon: 'list',
          run: () => openUniverse(),
        },
      );
    }
    if (!onBoard) {
      actions.push(
        ...d.strips.map(
          (s, i): Action => ({
            key: `strip-${i}`,
            label: s.name || t('Bande sans nom'),
            detail: t('{output} · {w} × {h} = {n} LED · DOF {dof}', { output: outputLabel(d, s.output), w: s.width, h: s.height, n: stripLedCount(s), dof: s.dofOutput }),
            run: () => openStrip(i),
          }),
        ),
        { label: t('Ajouter une bande'), detail: t('Une bande simple ou une matrice (lignes × colonnes)'), icon: 'plus', run: () => addStrip() },
        problems.length
          ? { label: t('Enregistrer'), detail: problems[0]!, icon: 'check', tone: 'quiet', run: () => library.openNotice(t('Pas encore'), problems, () => openEditor()) }
          : { label: t('Enregistrer'), detail: t('Écrit Cabinet.xml dans le dossier de DOF'), icon: 'check', tone: 'ok', run: () => save() },
      );
    } else {
      const reason = problems[0]!;
      actions.push(unavailable(t('Ajouter une bande'), 'plus', reason), unavailable(t('Enregistrer'), 'check', reason));
    }
    actions.push({ label: t('Retour sans enregistrer'), icon: 'back', run: () => leaveEditor() });
    return {
      heading: t('LED adressables'),
      icon: 'bulb',
      lead: onBoard
        ? t('{controller} : les bandes se décrivent dans l’outil de la carte.', { controller: controllerLabel(d.controller) })
        : t('Chaque bande devient un toy de DOF ; dans le configtool, votre contrôleur de LED adressables porte le numéro {n} et chaque toy la sortie DOF indiquée ici.', { n: DOF_ADDRESSABLE_NUMBER }),
      sections,
      actions,
      back: () => leaveEditor(),
    };
  }

  /** Choix de la carte des LED adressables : les trois familles de libdof. */
  function openControllers(): void {
    const d = draft ?? initialDraft();
    const details: Record<LedControllerType, () => string> = {
      TeensyStripController: () => t('Port série, jusqu’à 8 sorties avec la carte OctoWS2811 ; Cabinet.xml écrit par Cyber Pinball'),
      WemosD1MPStripController: () => t('Port série (CH340 ou CP210x) ; Cabinet.xml écrit par Cyber Pinball'),
      ArtNet: () => t('Nœud réseau (WLED sur un ESP32…), {max} LED par univers ; Cabinet.xml écrit par Cyber Pinball', { max: ARTNET_LEDS_PER_UNIVERSE }),
      DudesCab: () => t('Bandes décrites dans l’outil du DudesCab, lues par VPX sur la carte'),
      PinscapePico: () => t('LED déclarées dans la configuration de la Pinscape Pico, comme des sorties'),
    };
    library.openCustom(
      () => ({
        heading: t('Carte des LED adressables'),
        icon: 'chip',
        sections: [],
        actions: [
          ...LED_CONTROLLER_TYPES.map(
            (c): Action => ({
              key: c,
              label: controllerLabel(c),
              detail: c === d.controller ? t('{detail} · choix actuel', { detail: details[c]() }) : details[c](),
              tone: c === d.controller ? 'ok' : undefined,
              run: () => {
                d.controller = c;
                draft = d;
                // Les sorties d'un univers Art-Net ne sont pas celles d'un Teensy : on garde les bandes, l'utilisateur revoit leur sortie.
                openEditor(0);
              },
            }),
          ),
          { label: t('Retour'), icon: 'back', run: () => openEditor(0) },
        ],
        back: () => openEditor(0),
      }),
      Math.max(0, LED_CONTROLLER_TYPES.indexOf(d.controller)),
    );
  }

  function openUniverse(): void {
    const d = draft!;
    const values = Array.from({ length: ARTNET_MAX_UNIVERSES }, (_, k) => k);
    library.openCustom(
      () => ({
        heading: t('Premier univers Art-Net'),
        icon: 'list',
        sections: [],
        actions: [
          ...values.map(
            (v): Action => ({
              key: String(v),
              label: String(v),
              detail: v === (d.universe ?? 0) ? t('choix actuel') : undefined,
              tone: v === (d.universe ?? 0) ? 'ok' : undefined,
              run: () => {
                d.universe = v;
                openEditor(2);
              },
            }),
          ),
          { label: t('Retour'), icon: 'back', run: () => openEditor(2) },
        ],
        back: () => openEditor(2),
      }),
      d.universe ?? 0,
    );
  }

  function openPorts(): void {
    const d = draft!;
    const ports = serialPortCandidates(read(true).devices);
    library.openCustom(() => ({
      heading: t('Port série du contrôleur'),
      icon: 'link',
      lead: t('Le port que Windows a donné au Teensy ou au Wemos (Gestionnaire de périphériques, « Ports (COM et LPT) »).'),
      sections: ports.length ? [] : [{ rows: [{ icon: 'alert', text: t('Aucun port série branché'), tone: 'warning' }] }],
      actions: [
        ...ports.map(
          (p): Action => ({
            key: p.port,
            label: p.port,
            detail: [p.name, p.usb, p.port === d.port ? t('choix actuel') : undefined].filter(Boolean).join(' · '),
            tone: p.port === d.port ? 'ok' : undefined,
            run: () => {
              d.port = p.port;
              openEditor(1);
            },
          }),
        ),
        {
          label: t('Autre port…'),
          icon: 'keyboard',
          run: () =>
            library.openPrompt(t('Port série'), t('Port (COM5…)'), d.port, (value) => {
              if (value !== undefined) d.port = value.trim().toUpperCase();
              openEditor(1);
            }),
        },
        { label: t('Retour'), icon: 'back', run: () => openEditor(1) },
      ],
      back: () => openEditor(1),
    }));
  }

  /**
   * Modèles de bande : ceux d'une borne courante (bandes verticales de part et d'autre du
   * playfield, anneaux autour des haut-parleurs du fronton, matrice au fond du playfield).
   * Chacun prend la première sortie libre du contrôleur et la sortie DOF suivante (1, 4, 7…).
   */
  const STRIP_PRESETS: { label: () => string; detail: () => string; name: () => string; width: number; height: number; arrangement: LedArrangement }[] = [
    { label: () => t('Bande verticale à gauche du playfield'), detail: () => t('1 × 120 LED, première LED en haut'), name: () => t('Côté gauche'), width: 1, height: 120, arrangement: 'TopDownLeftRight' },
    { label: () => t('Bande verticale à droite du playfield'), detail: () => t('1 × 120 LED, première LED en haut'), name: () => t('Côté droit'), width: 1, height: 120, arrangement: 'TopDownLeftRight' },
    { label: () => t('Anneau du haut-parleur gauche'), detail: () => t('24 LED en cercle autour du haut-parleur du fronton'), name: () => t('Haut-parleur gauche'), width: 24, height: 1, arrangement: 'LeftRightTopDown' },
    { label: () => t('Anneau du haut-parleur droit'), detail: () => t('24 LED en cercle autour du haut-parleur du fronton'), name: () => t('Haut-parleur droit'), width: 24, height: 1, arrangement: 'LeftRightTopDown' },
    { label: () => t('Matrice au fond du playfield'), detail: () => t('32 × 8 LED, en serpentin'), name: () => t('Fond du playfield'), width: 32, height: 8, arrangement: 'LeftRightAlternateTopDown' },
    { label: () => t('Autre bande'), detail: () => t('1 × 60 LED, à régler ensuite'), name: () => t('Bande {n}', { n: (draft?.strips.length ?? 0) + 1 }), width: 1, height: 60, arrangement: 'TopDownLeftRight' },
  ];

  function addStrip(): void {
    library.openCustom(() => ({
      heading: t('Ajouter une bande'),
      icon: 'plus',
      lead: t('Un modèle pour commencer : nombre de LED, câblage et sortie se règlent ensuite. Chaque bande sur sa propre sortie du contrôleur, ou à la suite d’une autre sur la même sortie.'),
      sections: [],
      actions: [
        ...STRIP_PRESETS.map(
          (preset): Action => ({
            label: preset.label(),
            detail: preset.detail(),
            run: () => {
              const d = (draft ??= initialDraft());
              const used = new Set(d.strips.map((x) => x.output));
              let output = 1;
              while (used.has(output) && output < ledOutputCount(d.controller)) output++;
              d.strips.push({
                name: preset.name(),
                output,
                width: preset.width,
                height: preset.height,
                arrangement: preset.arrangement,
                colorOrder: 'GRB',
                brightness: 100,
                dofOutput: nextDofOutput(d.strips),
              });
              openStrip(d.strips.length - 1);
            },
          }),
        ),
        { label: t('Retour'), icon: 'back', run: () => openEditor(addRow()) },
      ],
      back: () => openEditor(addRow()),
    }));
  }

  function openStrip(i: number, at = 0): void {
    library.openCustom(() => {
      const s = (draft ??= initialDraft()).strips[i];
      if (!s) return buildEditor();
      const back = () => openEditor(stripRow(i));
      const choose = <T extends string | number>(row: number, heading: string, values: readonly T[], label: (v: T) => string, current: T, set: (v: T) => void, other?: () => void) =>
        library.openCustom(
          () => ({
            heading,
            icon: 'bulb',
            sections: [],
            actions: [
              ...values.map(
                (v): Action => ({
                  key: String(v),
                  label: label(v),
                  detail: v === current ? t('choix actuel') : undefined,
                  tone: v === current ? 'ok' : undefined,
                  run: () => {
                    set(v);
                    openStrip(i, row);
                  },
                }),
              ),
              ...(other ? [{ label: t('Autre valeur…'), icon: 'keyboard' as const, run: other }] : []),
              { label: t('Retour'), icon: 'back', run: () => openStrip(i, row) },
            ],
            back: () => openStrip(i, row),
          }),
          Math.max(0, values.indexOf(current)),
        );
      const number = (row: number, heading: string, current: number, set: (v: number) => void) => () =>
        library.openPrompt(heading, t('Nombre'), String(current), (value) => {
          const n = Number(value);
          if (value !== undefined && Number.isInteger(n) && n > 0 && n <= 2000) set(n);
          openStrip(i, row);
        });
      const dofChoices = Array.from({ length: 16 }, (_, k) => 1 + 3 * k);
      return {
        heading: s.name || t('Bande sans nom'),
        icon: 'bulb',
        lead: t('{n} LED. La sortie DOF est celle que le configtool donne à ce toy (1, 4, 7… : une matrice occupe trois numéros).', { n: stripLedCount(s) }),
        sections: [],
        actions: [
          {
            label: t('Nom : {name}', { name: s.name }),
            detail: t('Start : écrire'),
            icon: 'edit',
            run: () =>
              library.openPrompt(t('Nom de la bande'), t('Nom'), s.name, (value) => {
                if (value?.trim()) s.name = value.trim();
                openStrip(i, 0);
              }),
          },
          draft!.controller === 'ArtNet'
            ? {
                label: t('Univers Art-Net : {n}', { n: artnetUniverse(draft!, s.output) }),
                detail: t('{max} LED au plus par univers', { max: ARTNET_LEDS_PER_UNIVERSE }),
                icon: 'link',
                run: () =>
                  choose(1, t('Univers Art-Net'), Array.from({ length: ARTNET_MAX_UNIVERSES }, (_, k) => k + 1), (v) => t('Univers {n}', { n: artnetUniverse(draft!, v) }), s.output, (v) => (s.output = v)),
              }
            : {
                label: t('Sortie du contrôleur : {n}', { n: s.output }),
                detail: t('Le connecteur où arrivent ses données'),
                icon: 'link',
                run: () => choose(1, t('Sortie du contrôleur'), Array.from({ length: LED_MAX_OUTPUTS }, (_, k) => k + 1), (v) => t('Sortie {n}', { n: v }), s.output, (v) => (s.output = v)),
              },
          {
            label: t('Colonnes : {n}', { n: s.width }),
            detail: t('1 pour une bande simple'),
            icon: 'layout',
            run: () => choose(2, t('Colonnes'), SIZE_CHOICES, String, s.width, (v) => (s.width = v), number(2, t('Colonnes'), s.width, (v) => (s.width = v))),
          },
          {
            label: t('Lignes : {n}', { n: s.height }),
            detail: t('Nombre de LED d’une bande simple'),
            icon: 'list',
            run: () => choose(3, t('Lignes'), SIZE_CHOICES, String, s.height, (v) => (s.height = v), number(3, t('Lignes'), s.height, (v) => (s.height = v))),
          },
          {
            label: t('Câblage : {label}', { label: arrangementLabel(s.arrangement) }),
            detail: t('Ordre des LED depuis la première'),
            icon: 'shuffle',
            run: () => choose(4, t('Câblage de la bande'), LED_ARRANGEMENTS, arrangementLabel, s.arrangement, (v) => (s.arrangement = v)),
          },
          {
            label: t('Ordre des couleurs : {order}', { order: s.colorOrder }),
            detail: t('GRB pour la plupart des WS2812 : rouge et vert inversés, essayez RGB'),
            icon: 'palette',
            run: () => choose(5, t('Ordre des couleurs'), LED_COLOR_ORDERS, String, s.colorOrder, (v: LedColorOrder) => (s.colorOrder = v)),
          },
          {
            label: t('Luminosité : {n} %', { n: s.brightness }),
            detail: t('Moins de lumière, moins de courant demandé à l’alimentation'),
            icon: 'sun',
            run: () => choose(6, t('Luminosité'), BRIGHTNESS_CHOICES, (v) => `${v} %`, s.brightness, (v) => (s.brightness = v)),
          },
          {
            label: t('Sortie DOF : {n}', { n: s.dofOutput }),
            detail: t('Celle du toy dans le configtool'),
            icon: 'chip',
            run: () => choose(7, t('Sortie DOF'), dofChoices, String, s.dofOutput, (v) => (s.dofOutput = v)),
          },
          {
            label: t('Supprimer cette bande'),
            icon: 'trash',
            tone: 'warning',
            run: () => {
              draft!.strips.splice(i, 1);
              openEditor(addRow());
            },
          },
          { label: t('Retour'), icon: 'back', run: back },
        ],
        back,
      };
    }, at);
  }

  function save(): void {
    const dir = host.dir();
    if (!dir || !draft) return;
    const plan = planLedWrite(dir, draft);
    const lines: string[] = [];
    try {
      fs.mkdirSync(dir, { recursive: true });
      const stamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-');
      for (const f of plan.files) {
        if (fs.existsSync(f.file)) {
          const saved = path.join(host.backupDir(), 'dof', stamp);
          fs.mkdirSync(saved, { recursive: true });
          fs.copyFileSync(f.file, path.join(saved, path.basename(f.file)));
        }
        fs.mkdirSync(path.dirname(f.file), { recursive: true });
        writeFileAtomic(f.file, f.content);
        lines.push(t('Écrit : {file}', { file: f.file }));
      }
    } catch (error) {
      lines.push((error as Error).message);
    }
    for (const r of plan.refused) lines.push(t('Non écrit : {file}. {reason}', { file: r.file, reason: r.reason }));
    const leds = draft;
    if (leds.controller === 'ArtNet') {
      lines.push(
        t('Dans WLED, LED Preferences, le « Start » de chaque bande : {list} ({n} LED en tout).', {
          list: wledSegments(leds).map((g) => t('« {name} » {start}', { name: g.name, start: g.start })).join(', '),
          n: wledLedCount(leds),
        }),
      );
    }
    lines.push(
      t('Dans le configtool : contrôleur de LED adressables numéro {n}, avec {list}. Puis « Generate Config » et importez le ZIP.', {
        n: leds.number ?? DOF_ADDRESSABLE_NUMBER,
        list: leds.strips.map((s) => t('« {name} » sur la sortie {n}', { name: s.name, n: s.dofOutput })).join(', '),
      }),
    );
    flash = { text: plan.refused.length ? t('Cabinet.xml non écrit : voir le détail') : t('Bandes enregistrées dans Cabinet.xml'), tone: plan.refused.length ? 'warning' : 'ok' };
    // L'avis d'abord : l'éditeur n'est plus à l'écran quand la santé relève et redessine.
    library.openNotice(t('LED adressables'), lines, () => open(2));
    draft = undefined;
    cache = undefined;
    host.changed();
  }

  const item: ProvidedSystemItem = {
    get detail() {
      const { setup: s, devices } = read();
      if (!s) return t('LED, flashers, contacteurs : VPX à installer d’abord');
      const detected = detectDofControllers(devices, host.hidNames());
      const labels = dofControllerLabels(s, detected);
      const problems = dofFindings(s, detected, devices).filter((f) => f.severity !== 'info').length;
      if (!labels.length && !s.ini.length) return t('LED, flashers, contacteurs : aucun contrôleur reconnu');
      return [labels.length ? tn(labels.length, '{n} contrôleur', '{n} contrôleurs') : undefined, problems ? tn(problems, '{n} point à vérifier', '{n} points à vérifier') : t('prêt')].filter(Boolean).join(' · ');
    },
    run: () => {
      flash = undefined;
      read(true);
      open();
    },
  };

  return {
    item,
    /** Essais : ce que la page montre, Cabinet.xml que l'éditeur écrirait. */
    build,
    preview: (leds: CabinetLeds) => cabinetXml(leds),
  };
}
