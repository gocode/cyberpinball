// Menu système > Ma borne > DMD et LED > « DMD réel » (bêta) : les afficheurs à LED branchés à la borne (ZeDMD,
// PIN2DMD, Pixelcade), reconnus à leur identifiant USB sans rien ouvrir, et ce qui empêchera VPX
// de les ouvrir (pilote manquant). Trois choix par modèle (automatique, oui, non) et le ZeDMD en
// wifi, gardés dans la configuration de la borne (cabinet.json, hardwareDmd) : VPinballX.ini
// ([Plugin.DMDUtil]) les reprend à la synchronisation qui précède chaque partie.
// Rien n'est envoyé au DMD hors partie : c'est VPX qui le pilote, par son plugin DMDUtil.

import {
  detectHardwareDmds,
  dmdServerDrivesPin2dmd,
  hardwareDmdChoice,
  hardwareDmdDriverProblem,
  hardwareDmdName,
  HARDWARE_DMD_MODELS,
  nextHardwareDmdChoice,
  pin2dmdProbeProblem,
  pin2dmdProduct,
  pin2dmdSize,
  t,
  tn,
  withHardwareDmdChoice,
  zedmdDoubt,
  zedmdWifiAddressProblem,
  ZEDMD_WIFI_DEFAULT_ADDR,
  type CabinetConfiguration,
  type DetectedDmd,
  type DmdPortHints,
  type HardwareDmdChoice,
  type HardwareDmdModel,
  type HardwareDmdSetup,
  type IconName,
  type ObservedUsbDevice,
} from '@cyberpinball/core';
import type { Action, Built, ProvidedSystemItem, Row } from './library';

export interface HardwareDmdMenuHost {
  library: {
    openCustom(build: () => Built, at?: number): void;
    openSystem(): void;
    openPrompt(heading: string, label: string, value: string, done: (value: string | undefined) => void, lead?: string): void;
    openNotice(heading: string, lines: string[], then?: () => void): void;
    /** Cet écran est-il celui qui est affiché ? */
    showing?(build: () => Built): boolean;
  };
  /** Périphériques USB présents ; undefined : illisibles. */
  usb(): ObservedUsbDevice[] | undefined;
  /** Ce que DOF et le dernier vpinball.log disent des ports série (dmd-hints.ts) ; absent : rien. */
  hints?(): DmdPortHints;
  /** Configuration active de la borne ; undefined avant l'assistant d'écrans. */
  cabinet(): CabinetConfiguration | undefined;
  save(cabinet: CabinetConfiguration): void;
  /** Après un changement : santé relevée de nouveau, dmdserver relancé ou arrêté selon les choix. */
  changed(): void;
  /** Image du menu sur le DMD réel (bêta, dmd-server.ts). */
  menuServer: {
    /** Pourquoi le serveur du DMD ne peut pas tourner sur cette borne ; undefined s'il le peut. */
    problem(): string | undefined;
    /** Le serveur tient le DMD et le menu y est connecté. */
    ready(): boolean;
  };
}

/** Icône de chaque choix : deux actions d'un écran n'ont jamais la même. */
const MODEL_ICONS: Record<HardwareDmdModel, IconName> = { ZeDMD: 'dmd', PIN2DMD: 'usb', Pixelcade: 'chip' };

function choiceWord(choice: HardwareDmdChoice): string {
  return { auto: t('automatique'), on: t('oui'), off: t('non') }[choice];
}

/** Ce que fait le choix, et ce que fera Start. */
function choiceDetail(model: HardwareDmdModel, choice: HardwareDmdChoice, found: DetectedDmd[]): string {
  if (choice === 'on') return t('Toujours allumé, même s’il n’est pas reconnu : DMDUtil le cherche au début de chaque partie (Start : non)');
  if (choice === 'off') return t('Jamais allumé : DMDUtil ne lui envoie rien, même branché (Start : automatique)');
  if (found.length) return t('Reconnu ({names}) : allumé pendant les parties (Start : oui)', { names: found.map((d) => hardwareDmdName(d)).join(', ') });
  return t('Allumé dès qu’un {model} est reconnu à son identifiant USB (Start : oui)', { model });
}

export function createHardwareDmdMenu(host: HardwareDmdMenuHost) {
  const { library } = host;
  let flash: { text: string; tone: 'ok' | 'warning' | 'error' } | undefined;

  /** Lecture des périphériques gardée quelques secondes : le détail de l'entrée se redessine souvent. */
  let cache: { at: number; devices: ObservedUsbDevice[]; hints: DmdPortHints | undefined } | undefined;
  const CACHE_MS = 5000;
  function read(fresh = false) {
    if (!fresh && cache && Date.now() - cache.at < CACHE_MS) return cache;
    cache = { at: Date.now(), devices: host.usb() ?? [], hints: host.hints?.() };
    return cache;
  }
  function devices(fresh = false): ObservedUsbDevice[] {
    return read(fresh).devices;
  }

  /** DMD reconnus, sans les ponts USB-série qui ne sont sans doute pas des ZeDMD (zedmdDoubt). */
  function detectedDmds(): { detected: DetectedDmd[]; doubted: { d: DetectedDmd; message: string; failed: boolean }[] } {
    const { devices: list, hints } = read();
    const s = setup();
    const all = detectHardwareDmds(list);
    const doubted = all.flatMap((d) => {
      const doubt = zedmdDoubt(d, hints, s);
      return doubt ? [{ d, message: doubt.message, failed: doubt.reason === 'failed' }] : [];
    });
    return { detected: all.filter((d) => !doubted.some((x) => x.d === d)), doubted };
  }

  function setup(): HardwareDmdSetup | undefined {
    return host.cabinet()?.hardwareDmd;
  }

  function open(at?: number): void {
    library.openCustom(build, at);
  }

  function save(next: HardwareDmdSetup, text: string): void {
    const cabinet = host.cabinet();
    if (!cabinet) return;
    const updated: CabinetConfiguration = { ...cabinet, hardwareDmd: next };
    if (!next.models && !next.zedmdWifi && next.menu === undefined) delete updated.hardwareDmd;
    host.save(updated);
    flash = { text, tone: 'ok' };
    host.changed();
  }

  function noCabinet(): void {
    library.openNotice(t('Borne à configurer'), [t('Les choix du DMD réel sont gardés avec la configuration de la borne : faites d’abord l’assistant d’écrans (Menu système > Ma borne > Configuration de la borne).')], () => open());
  }

  function build(): Built {
    const back = () => library.openSystem();
    const s = setup();
    const cabinet = host.cabinet();
    const { detected, doubted } = detectedDmds();
    const sections: Built['sections'] = [];
    if (flash) sections.push({ rows: [{ text: flash.text, tone: flash.tone }] });

    // Reconnus : chaque DMD branché, et le ZeDMD en wifi.
    const found: Row[] = detected.map((d) => {
      const off = hardwareDmdChoice(s, d.model) === 'off';
      const problem = !off && hardwareDmdDriverProblem(d);
      const size = d.model === 'PIN2DMD' ? pin2dmdSize(pin2dmdProduct(d.device)) : undefined;
      const detail = [
        size ? t('{width} × {height} points', { width: size.width, height: size.height }) : undefined,
        t('USB {usb}', { usb: d.usb }),
        off
          ? t('éteint par « {model} : non »', { model: d.model })
          : problem
            ? // La sonde (pin2dmd-probe.ts) a vu le pilote en place, mais la carte refuse de s'ouvrir.
              problem === pin2dmdProbeProblem(d.device.libusbProbe, d.device.service)
              ? t('ne s’ouvre pas : voir « À vérifier »')
              : t('pilote à installer')
            : d.device.libusbProbe?.stage === 'ok'
              ? t('ouvert puis relâché : le serveur du DMD pourra l’allumer')
              : t('pilote prêt'),
      ]
        .filter(Boolean)
        .join(' · ');
      return { icon: 'usb' as const, text: hardwareDmdName(d), detail, ...(off ? { tone: 'quiet' as const } : problem ? { tone: 'warning' as const } : {}) };
    });
    // Un pont USB-série qui n'est sans doute pas un ZeDMD : montré pour ce qu'il est, pas comme un ZeDMD.
    for (const x of doubted) {
      found.push({
        icon: 'usb',
        text: t('{port} : pont USB-série, pas un ZeDMD', { port: x.d.device.port ?? x.d.usb }),
        detail: t('USB {usb} · ZeDMD pas allumé d’office', { usb: x.d.usb }),
        tone: x.failed ? 'warning' : 'quiet',
      });
    }
    if (s?.zedmdWifi?.enabled) found.push({ icon: 'network', text: t('ZeDMD en wifi'), detail: t('{address} · VPX s’y connecte au début de chaque partie', { address: s.zedmdWifi.address }) });
    // dmdserver, quand l'image du menu est demandée ou qu'un PIN2DMD est allumé (VPX ne sait pas le piloter
    // seul : PIN2DMD_ONLY_THROUGH_SERVER) : il tient le DMD, ou il attend qu'on le branche.
    const pin2dmdServer = dmdServerDrivesPin2dmd(
      detected.map((d) => d.device),
      s,
    );
    if (pin2dmdServer || (s?.menu && (detected.some((d) => hardwareDmdChoice(s, d.model) !== 'off') || s.zedmdWifi?.enabled))) {
      const problem = host.menuServer.problem();
      found.push(
        problem
          ? {
              icon: 'monitor',
              text: t('Serveur du DMD'),
              detail: pin2dmdServer
                ? t('{problem} ; le PIN2DMD restera noir : le module DMD de VPX ne sait pas le piloter seul', { problem })
                : t('{problem} ; VPX ouvre le DMD lui-même pendant les parties', { problem }),
              tone: 'warning',
            }
          : host.menuServer.ready()
            ? {
                icon: 'monitor',
                text: t('Serveur du DMD'),
                detail: s?.menu ? t('Le front-end tient le DMD réel ; VPX le reprend pendant les parties') : t('Pilote le PIN2DMD ; VPX lui envoie ses images pendant les parties'),
                tone: 'ok',
              }
            : {
                icon: 'monitor',
                text: t('Serveur du DMD'),
                detail: pin2dmdServer ? t('Démarre, ou attend que le PIN2DMD réponde') : t('Démarre, ou attend que le DMD réponde ; en attendant, VPX ouvre le DMD lui-même'),
              },
      );
    }
    if (!found.length) found.push({ icon: 'info', text: t('Aucun DMD réel branché en USB'), detail: t('ZeDMD, PIN2DMD, Pixelcade : branchez-le, puis « Vérifier de nouveau ».'), tone: 'quiet' });
    sections.push({ title: t('Reconnus'), rows: found });

    // À vérifier : les pilotes d'abord (ils laissent le DMD noir), puis les puces USB-série courantes.
    const checks: Row[] = doubted.map((x) => ({ icon: x.failed ? ('alert' as const) : ('info' as const), text: x.message, tone: x.failed ? ('warning' as const) : ('info' as const) }));
    for (const d of detected) {
      if (hardwareDmdChoice(s, d.model) === 'off') continue;
      const problem = hardwareDmdDriverProblem(d);
      if (problem) checks.push({ icon: 'alert', text: problem, tone: 'warning' });
    }
    for (const d of detected) {
      if (hardwareDmdChoice(s, d.model) !== 'auto' || !d.generic || hardwareDmdDriverProblem(d)) continue;
      checks.push({
        icon: 'info',
        text: t('{usb} est une puce USB-série courante : si ce n’est pas un {model} (carte Arduino, contrôleur de boutons…), choisissez « {model} : non ».', { usb: d.usb, model: d.model }),
        tone: 'info',
      });
    }
    if (checks.length) sections.push({ title: t('À vérifier'), rows: checks });

    const actions: Action[] = HARDWARE_DMD_MODELS.map((model) => {
      const choice = hardwareDmdChoice(s, model);
      return {
        label: t('{model} : {choice}', { model, choice: choiceWord(choice) }),
        detail: cabinet ? choiceDetail(model, choice, detected.filter((d) => d.model === model)) : t('Indisponible : configurez d’abord la borne (assistant d’écrans)'),
        icon: MODEL_ICONS[model],
        key: `choice-${model}`,
        ...(cabinet ? {} : { tone: 'quiet' as const }),
        run: () => {
          if (!cabinet) return noCabinet();
          const next = nextHardwareDmdChoice(choice);
          save(withHardwareDmdChoice(s, model, next), t('{model} : {choice}. Appliqué au lancement de la prochaine partie.', { model, choice: choiceWord(next) }));
          open();
        },
      };
    });
    const wifi = s?.zedmdWifi;
    actions.push({
      label: wifi?.enabled ? t('ZeDMD en wifi : {address}', { address: wifi.address }) : t('ZeDMD en wifi : non'),
      detail: !cabinet
        ? t('Indisponible : configurez d’abord la borne (assistant d’écrans)')
        : wifi?.enabled
          ? t('VPX s’y connecte au début de chaque partie (Start : changer l’adresse, ou la vider pour couper)')
          : t('Un ZeDMD relié par le réseau, que l’USB ne voit pas (Start : indiquer son adresse)'),
      icon: 'network',
      key: 'wifi',
      ...(cabinet ? {} : { tone: 'quiet' as const }),
      run: () => (cabinet ? askWifi() : noCabinet()),
    });
    // Image du menu (bêta) : dmdserver tient le DMD, le menu et VPX lui envoient leurs images.
    const anyOn = detected.some((d) => hardwareDmdChoice(s, d.model) !== 'off') || HARDWARE_DMD_MODELS.some((m) => hardwareDmdChoice(s, m) === 'on') || Boolean(wifi?.enabled);
    const menuOn = Boolean(s?.menu);
    const serverProblem = host.menuServer.problem();
    actions.push({
      label: menuOn ? t('Image du front-end : oui') : t('Image du front-end : non'),
      detail: !cabinet
        ? t('Indisponible : configurez d’abord la borne (assistant d’écrans)')
        : menuOn
          ? t('Le DMD réel montre aussi le DMD du front-end ; VPX le reprend pendant les parties (Start : non)')
          : !anyOn
            ? t('Indisponible : aucun DMD réel allumé (branchez-le, ou choisissez « oui » pour son modèle)')
            : serverProblem
              ? t('Indisponible : {problem}', { problem: serverProblem })
              : t('Le DMD réel montre aussi le DMD du front-end, entre les parties (Start : oui)'),
      icon: 'monitor',
      key: 'menu',
      ...(cabinet && (menuOn || (anyOn && !serverProblem)) ? {} : { tone: 'quiet' as const }),
      run: () => (cabinet ? toggleMenu(anyOn) : noCabinet()),
    });
    actions.push({ label: t('Vérifier de nouveau'), detail: t('Relit les périphériques USB et leurs pilotes'), icon: 'refresh', key: 'refresh', run: () => refresh() });
    actions.push({ label: t('Retour'), icon: 'back', run: back });

    return {
      heading: t('DMD réel'),
      icon: 'usb',
      // Dit franchement : la prise en charge attend les bornes équipées.
      lead: t('Un afficheur à LED branché à la borne (ZeDMD, PIN2DMD, Pixelcade). VPX l’allume pendant les parties ; « Image du front-end » lui fait aussi montrer le front-end. Bêta : à confirmer sur les bornes équipées.'),
      sections,
      actions,
      back,
    };
  }

  function askWifi(value?: string): void {
    const current = setup()?.zedmdWifi;
    library.openPrompt(
      t('ZeDMD en wifi'),
      t('Nom ou adresse IP du ZeDMD'),
      value ?? current?.address ?? ZEDMD_WIFI_DEFAULT_ADDR,
      (entered) => {
        if (entered === undefined) return open();
        const address = entered.trim();
        const s = setup();
        if (!address) {
          if (current?.enabled) save({ ...s, zedmdWifi: { enabled: false, address: current.address } }, t('ZeDMD en wifi coupé. Appliqué au lancement de la prochaine partie.'));
          return open();
        }
        const problem = zedmdWifiAddressProblem(address);
        if (problem) return library.openNotice(t('Adresse refusée'), [problem], () => askWifi(address));
        save({ ...s, zedmdWifi: { enabled: true, address } }, t('ZeDMD en wifi : {address}. Appliqué au lancement de la prochaine partie.', { address }));
        open();
      },
      t('Le ZeDMD et la borne sur le même réseau local. Sans réglage, le ZeDMD s’annonce sous le nom {name}. Laissez vide pour couper le wifi.', { name: ZEDMD_WIFI_DEFAULT_ADDR }),
    );
  }

  /** Image du menu : oui (si le serveur du DMD peut tourner) ou non. */
  function toggleMenu(anyOn: boolean): void {
    const s = setup();
    if (s?.menu) {
      save({ ...s, menu: false }, t('Image du front-end : non. VPX ouvre de nouveau le DMD lui-même.'));
      return open();
    }
    if (!anyOn) {
      return library.openNotice(t('Image du front-end'), [t('Aucun DMD réel n’est allumé : branchez-le (puis « Vérifier de nouveau »), ou choisissez « oui » pour son modèle, ou indiquez un ZeDMD en wifi.')], () => open());
    }
    const problem = host.menuServer.problem();
    if (problem) return library.openNotice(t('Image du front-end'), [problem, t('Le DMD réel reste piloté par VPX pendant les parties.')], () => open());
    save({ ...s, menu: true }, t('Image du front-end : oui. Le serveur du DMD démarre ; le DMD réel montre le front-end dès qu’il répond.'));
    open();
  }

  function refresh(): void {
    flash = undefined;
    devices(true);
    host.changed();
    open();
  }

  const item: ProvidedSystemItem = {
    badge: 'beta',
    get detail() {
      const s = setup();
      const on = detectedDmds().detected.filter((d) => hardwareDmdChoice(s, d.model) !== 'off');
      const names = on.map((d) => hardwareDmdName(d));
      if (s?.zedmdWifi?.enabled) names.push(t('ZeDMD en wifi'));
      if (!names.length) return t('ZeDMD, PIN2DMD, Pixelcade : aucun reconnu');
      const problems = on.filter((d) => hardwareDmdDriverProblem(d)).length;
      return [names.join(', '), problems ? tn(problems, '{n} point à vérifier', '{n} points à vérifier') : t('prêt')].join(' · ');
    },
    run: () => {
      flash = undefined;
      devices(true);
      open();
    },
  };

  return {
    item,
    /** Essais : ce que la page montre. */
    build,
    /** La sonde du PIN2DMD a répondu (pin2dmd-probe.ts) : la page affichée se redessine, curseur gardé. */
    probed(): void {
      cache = undefined;
      if (library.showing?.(build)) open();
    },
  };
}
