// Menu système > Borne > « Borne dédiée » : Cyber Pinball à la place du bureau Windows pour ce
// compte (Shell Launcher, dedicated.ts du cœur ; sans lui, sous Windows Pro ou Famille, le
// réglage « Interface utilisateur personnalisée » du compte et le surveillant, windowssettings.ts),
// ou seulement lancé au démarrage de Windows, le bureau masqué derrière (« Lancement au
// démarrage », la même page). L'écran explique, puis active ou désactive en
// demandant l'autorisation de Windows (UAC) à ce moment-là seulement, vérifie le résultat point
// par point et dit comment revenir en arrière. Tant que Cyber Pinball est le shell de la session,
// « Ouvrir l'Explorateur Windows » remplace « Bureau Windows » dans la rubrique Borne.
//
// Rien n'est écrit dans Windows ailleurs que dans activate() et deactivate() (Shell Launcher),
// install(), uninstall() et removeStartup() (réglages du compte), lancées par leur action à
// l'écran (dedicated-menu.test.ts le vérifie). Ces réglages sont relevés avant la première
// écriture : la sauvegarde, que la désactivation remet et vérifie. Sans electron à l'exécution : les tests
// du cœur chargent ce module avec un exécuteur simulé.

import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  activationProblems,
  elevatedScript,
  loadSettingsRecord,
  modeOf,
  needsElevation,
  readJsonFile,
  readSettingsOutcome,
  referenceFor,
  removeSettingsRecord,
  saveSettingsRecord,
  settingLabel,
  settingsDifferences,
  settingsRescueFile,
  settingsRescueResultFile,
  settingsScript,
  settingValueLabel,
  supervisorMarkerFile,
  wantedSettings,
  SETTING_KEYS,
  STARTUP_SHORTCUT,
  type CabinetMode,
  type SettingDifference,
  type SettingsOutcome,
  type SettingsRecord,
  type SettingsSnapshot,
  formatList,
  language,
  loadDedicatedRecord,
  readElevatedOutcome,
  referenceOf,
  removeDedicatedRecord,
  rescueResultFile,
  rescueScriptFile,
  restoreDifferences,
  saveDedicatedRecord,
  shellLauncherEdition,
  shellSettingFor,
  snapshotItemLabel,
  snapshotItemValue,
  SNAPSHOT_ITEMS,
  t,
  windowsEditionLabel,
  type DedicatedRecord,
  type ElevatedOutcome,
  type SnapshotDifference,
} from '@cyberpinball/core';
import type { DedicatedProbe, DedicatedSystem, ElevatedResult, SettingsResult } from './dedicated-system';
import type { Action, Built, ProvidedSystemItem, Row, Section } from './library';

export interface DedicatedMenuHost {
  library: {
    openCustom(build: () => Built, at?: number): void;
    openSystem(): void;
    /** Opération longue : le message à l'écran, les touches ignorées. */
    task(message: string, work: () => Promise<void> | void): Promise<void>;
  };
  system: DedicatedSystem;
  dataDir: string;
  /** Exécutable (et arguments) que Shell Launcher lancera ; undefined : lancé depuis les sources, pas d'activation. */
  command(): string[] | undefined;
  /** Cyber Pinball est le shell de cette session. */
  shellSession: boolean;
  /** Raccourci du mode bureau, tel qu'affiché (« Ctrl+Maj+D »). */
  desktopKeys: string;
  /** Mode bureau (frontend.ts) : il ouvre lui-même l'Explorateur dans une session de la borne dédiée. */
  showDesktop(): void;
  /** Autres menus de borne installés sur ce PC (« PinUP Popper ») ; undefined : aucun. */
  otherFrontends?(): string | undefined;
  now?(): Date;
}

/** Constat de la dernière opération, en tête de l'écran jusqu'à ce qu'on le quitte. */
interface Flash {
  rows: Row[];
}

export function createDedicatedMenu(host: DedicatedMenuHost) {
  let probe: DedicatedProbe | undefined;
  let probeError: string | undefined;
  /** Réglages du compte tels que Windows les donne à l'ouverture de l'écran (relevé, sans écriture). */
  let current: SettingsSnapshot | undefined;
  let flash: Flash | undefined;
  const now = () => host.now?.() ?? new Date();

  async function readProbe(): Promise<void> {
    try {
      probe = await host.system.probe();
      probeError = undefined;
      const read = await host.system.runSettings({ sid: probe.sid, startupDir: host.system.startupDir(), want: {} }, false);
      current = 'outcome' in read ? read.outcome.before : undefined;
    } catch (error) {
      probeError = (error as Error).message;
    }
  }

  function open(): void {
    void host.library.task(t('Lecture de l’état de Windows…'), readProbe).then(show);
  }

  /** L'écran, la sélection sur « Retour » : rien ne demande l'autorisation de Windows par mégarde. */
  function show(): void {
    host.library.openCustom(build, Number.MAX_SAFE_INTEGER);
  }

  function back(): void {
    flash = undefined;
    host.library.openSystem();
  }

  // ---------- Ce que l'écran montre ----------

  function build(): Built {
    reconcileRescue();
    reconcileSettingsRescue();
    const record = loadDedicatedRecord(host.dataDir);
    const settings = loadSettingsRecord(host.dataDir);
    const built = record?.state === 'active' ? buildActive(record) : record?.state === 'restart' ? buildRestart(record) : settings ? buildSettingsActive(settings) : buildInactive();
    // La sélection d'office va sur « Retour », la dernière action.
    return { ...built, heading: t('Borne dédiée'), icon: 'lock', back };
  }

  const backAction = (): Action => ({ label: t('Retour'), icon: 'back', run: back });
  const rescueAction = (): Action => ({ label: t('Secours : accéder à Windows'), detail: t('Gestionnaire des tâches, compte administrateur, script de désactivation'), icon: 'info', run: openRescue });

  function buildInactive(): Omit<Built, 'heading' | 'back'> {
    const launcher = probe ? shellLauncherEdition(probe.editionId) : false;
    const blockers = prerequisites();
    const edition = probe ? windowsEditionLabel(probe.editionId, probe.build) : undefined;
    const startupNow = typeof current?.startup === 'string' && Boolean(current.startup);
    const others = host.otherFrontends?.();
    const sections: Section[] = [
      ...(flash ? [{ rows: flash.rows }] : []),
      {
        title: t('Avant d’activer'),
        rows: [
          ...blockers,
          ...(others
            ? [{ text: t('Autre menu installé : {names}', { names: others }), detail: t('S’il se lance lui aussi à l’ouverture de session, les deux se disputeront les écrans : retirez son lancement automatique'), tone: 'warning' as const, badges: [t('À vérifier')] }]
            : []),
        ],
      },
      {
        title: t('Deux façons, au choix'),
        rows: [
          {
            text: t('Remplacer le bureau'),
            detail: launcher
              ? t('Par Shell Launcher : Cyber Pinball à la place du bureau et de la barre des tâches, relancé s’il se ferme ou plante')
              : t('Par le réglage « Interface utilisateur personnalisée » du compte : Cyber Pinball à la place du bureau et de la barre des tâches, relancé s’il se ferme ou plante'),
          },
          { text: t('Lancer au démarrage de Windows'), detail: t('Cyber Pinball s’ouvre à l’ouverture de session ; le bureau reste derrière, fond noir et icônes masquées') },
          { text: t('Les autres comptes, dont l’administrateur, gardent le bureau Windows') },
          { text: t('Rubrique Borne : « Ouvrir l’Explorateur Windows », une fenêtre de fichiers quand il le faut') },
        ],
      },
      {
        title: t('Sauvegarde'),
        rows: [
          {
            text: t('Avant d’écrire, Cyber Pinball relève chaque réglage de Windows qu’il va changer'),
            detail: t('« Désactiver » les remet tels qu’ils étaient, puis le vérifie ; un script de secours fait de même hors de Cyber Pinball'),
          },
          ...(startupNow ? [{ text: t('Cyber Pinball se lance déjà au démarrage de Windows'), detail: t('Raccourci du dossier Démarrage (case de l’installeur), sans sauvegarde'), tone: 'info' as const }] : []),
        ],
      },
    ];
    const replaceBlocker = blockers.find((r) => r.tone === 'error' || r.tone === 'info');
    const startupBlocker = blockers.find((r) => (r.tone === 'error' || r.tone === 'info') && r !== adminRow);
    const replace: Action = replaceBlocker
      ? { label: t('Remplacer le bureau pour ce compte'), detail: t('Indisponible : {reason}', { reason: replaceBlocker.text }), icon: 'lock', tone: 'quiet', run: () => undefined }
      : launcher
        ? { label: t('Activer pour ce compte'), detail: t('Shell Launcher ; Windows demande votre autorisation ; effet à la prochaine ouverture de session'), icon: 'lock', run: () => activate() }
        : { label: t('Remplacer le bureau pour ce compte'), detail: t('Windows demande votre autorisation ; effet à la prochaine ouverture de session'), icon: 'lock', run: () => install('shell') };
    const startup: Action = startupBlocker
      ? { label: t('Lancer au démarrage de Windows'), detail: t('Indisponible : {reason}', { reason: startupBlocker.text }), icon: 'power', tone: 'quiet', run: () => undefined }
      : {
          label: t('Lancer au démarrage de Windows'),
          detail: startupNow ? t('Déjà lancé au démarrage : ajoute le bureau masqué, avec sa sauvegarde') : t('Le bureau masqué derrière ; sans autorisation de Windows, effet à la prochaine ouverture de session'),
          icon: 'power',
          run: () => install('startup'),
        };
    return {
      subheading: probe && edition ? t('Désactivée · compte « {user} » · {edition}', { user: probe.user, edition }) : t('Désactivée'),
      lead: t('Pour ce compte Windows, Cyber Pinball s’ouvre dès l’ouverture de session : à la place du bureau et de la barre des tâches, ou devant le bureau masqué. Les autres comptes restent inchangés.'),
      sections,
      actions: [
        replace,
        startup,
        ...(startupNow && !startupBlocker ? [{ label: t('Retirer le lancement au démarrage'), detail: t('Supprime le raccourci du dossier Démarrage'), icon: 'close' as const, run: () => removeStartup() }] : []),
        rescueAction(),
        backAction(),
      ],
    };
  }

  /** Ligne du compte administrateur de secours (prerequisites) : elle ne bloque que le remplacement du bureau. */
  let adminRow: Row | undefined;

  /** Ce qui permet, ou empêche, d'activer : l'édition de Windows, une installation, un administrateur de secours. */
  function prerequisites(): Row[] {
    adminRow = undefined;
    if (!probe) return [{ text: t('État de Windows illisible : {error}', { error: probeError ?? '?' }), tone: 'error', badges: [t('Bloquant')] }];
    const rows: Row[] = [];
    const edition = windowsEditionLabel(probe.editionId, probe.build);
    if (shellLauncherEdition(probe.editionId)) rows.push({ text: t('{edition} : Shell Launcher est disponible', { edition }), tone: 'ok', badges: [t('Prêt')] });
    // Pas de Shell Launcher : le réglage du compte le remplace (neutre, pas une panne).
    else rows.push({ text: t('{edition} : sans Shell Launcher', { edition }), detail: t('Cyber Pinball passe par le réglage « Interface utilisateur personnalisée » du compte, et se relance lui-même'), tone: 'ok', badges: [t('Prêt')] });
    if (!host.command()) rows.push({ text: t('Cyber Pinball tourne depuis ses sources'), detail: t('Seule une installation (CyberPinball.exe) peut s’ouvrir avec Windows'), tone: 'error', badges: [t('Bloquant')] });
    if (probe.otherAdmins === undefined) {
      rows.push({ text: t('Comptes administrateurs illisibles'), detail: t('Vérifiez qu’un autre compte administrateur existe : c’est par lui qu’on reprend la main en secours'), tone: 'warning', badges: [t('À vérifier')] });
    } else if (!probe.otherAdmins.length) {
      adminRow = { text: t('Aucun autre compte administrateur que « {user} »', { user: probe.user }), detail: t('Créez-en un avant de remplacer le bureau : c’est par lui qu’on reprend la main en secours'), tone: 'error', badges: [t('Bloquant')] };
      rows.push(adminRow);
    } else {
      rows.push({ text: t('Compte administrateur de secours : {names}', { names: formatList(probe.otherAdmins) }), tone: 'ok' });
    }
    return rows;
  }

  /** Windows a ouvert une session sans le surveillant depuis l'activation, ou le surveillant a rendu la main. */
  function settingsIgnored(record: SettingsRecord): Row | undefined {
    if (record.mode !== 'shell' || host.shellSession) return undefined;
    const boot = host.system.bootTime();
    if (boot <= Date.parse(record.at)) return undefined;
    const marker = fs.existsSync(supervisorMarkerFile(host.dataDir)) ? Date.parse(String((readJsonFile(supervisorMarkerFile(host.dataDir)) as { at?: string }).at)) : NaN;
    if (marker > boot) return { text: t('Le surveillant a rendu la main à l’Explorateur : Cyber Pinball se fermait en boucle'), detail: t('La cause est notée dans {file}', { file: path.join(host.dataDir, 'logs', 'erreurs.txt') }), tone: 'error', badges: [t('À vérifier')] };
    return { text: t('Windows n’a pas appliqué le réglage : cette session a démarré avec le bureau'), detail: t('Le PC a redémarré depuis l’activation. « Désactiver et rétablir le bureau », puis « Lancer au démarrage de Windows »'), tone: 'error', badges: [t('À vérifier')] };
  }

  function buildSettingsActive(record: SettingsRecord): Omit<Built, 'heading' | 'back'> {
    const date = formatDate(record.at);
    const shell = record.mode === 'shell';
    const state: Row[] = shell
      ? [{ text: t('Activée pour le compte « {user} » : Cyber Pinball à la place du bureau et de la barre des tâches', { user: record.user }), detail: t('Réglage « Interface utilisateur personnalisée » ; relancé s’il se ferme ou plante'), tone: 'ok' }]
      : [{ text: t('Cyber Pinball se lance au démarrage de Windows, pour le compte « {user} »', { user: record.user }), detail: t('Le bureau reste derrière : fond noir, icônes masquées'), tone: 'ok' }];
    const ignored = settingsIgnored(record);
    if (ignored) state.push(ignored);
    else if (shell && !host.shellSession) state.push({ text: t('Cette session a démarré avec le bureau Windows'), detail: t('Ouvrez une nouvelle session (ou redémarrez le PC) pour l’appliquer'), tone: 'info' });
    return {
      subheading: shell
        ? host.shellSession
          ? t('Bureau remplacé depuis le {date} · cette session démarre directement dans Cyber Pinball', { date })
          : t('Bureau remplacé depuis le {date} · effet à la prochaine ouverture de session', { date })
        : t('Lancement au démarrage depuis le {date}', { date }),
      sections: [
        ...(flash ? [{ rows: flash.rows }] : [{ rows: state }]),
        {
          title: t('Sauvegarde du {date} : « Désactiver » remet', { date }),
          rows: SETTING_KEYS.filter((k) => k in record.reference).map((k) => ({
            text: settingLabel(k, record.user),
            detail: t('avant : {before} · maintenant : {now}', { before: settingValueLabel(k, record.reference[k]), now: settingValueLabel(k, record.want[k]) }),
          })),
        },
      ],
      actions: [
        {
          label: shell ? t('Désactiver et rétablir le bureau') : t('Ne plus lancer au démarrage'),
          detail: needsElevation(record.reference) ? t('Windows demande votre autorisation ; réglages d’avant remis et vérifiés') : t('Réglages d’avant remis et vérifiés'),
          icon: 'restore',
          run: () => uninstall(record),
        },
        ...(host.shellSession ? [{ label: t('Ouvrir l’Explorateur'), detail: t('Une fenêtre de fichiers ; {keys} ramène le menu', { keys: host.desktopKeys }), icon: 'folder' as const, run: () => host.showDesktop() }] : []),
        rescueAction(),
        backAction(),
      ],
    };
  }

  function buildActive(record: DedicatedRecord): Omit<Built, 'heading' | 'back'> {
    const date = formatDate(record.activatedAt);
    const state: Row[] = [
      { text: t('Activée pour le compte « {user} » : Cyber Pinball à la place du bureau et de la barre des tâches', { user: record.user }), detail: t('Relancé s’il se ferme ou plante ; les autres comptes gardent le bureau Windows'), tone: 'ok' },
    ];
    if (!host.shellSession) state.push({ text: t('Cette session a démarré avec le bureau Windows'), detail: t('Ouvrez une nouvelle session (ou redémarrez le PC) pour l’appliquer'), tone: 'info' });
    return {
      subheading: host.shellSession ? t('Activée le {date} · cette session démarre directement dans Cyber Pinball', { date }) : t('Activée le {date} · effet à la prochaine ouverture de session', { date }),
      sections: [
        ...(flash ? [{ rows: flash.rows }] : [{ rows: state }]),
        {
          title: t('Désactiver remet l’état d’avant'),
          rows: SNAPSHOT_ITEMS.filter((item) => item !== 'enabled' || record.reference.enabled !== undefined).map((item) => ({
            text: snapshotItemLabel(item, record.user),
            detail: t('avant : {value}', { value: snapshotItemValue(record.reference, item) }),
          })),
        },
      ],
      actions: [
        { label: t('Désactiver et rétablir le bureau'), detail: t('Windows demande votre autorisation ; le bureau revient à la prochaine ouverture de session'), icon: 'restore', run: () => deactivate(record) },
        ...(host.shellSession ? [{ label: t('Ouvrir l’Explorateur'), detail: t('Une fenêtre de fichiers ; {keys} ramène le menu', { keys: host.desktopKeys }), icon: 'folder' as const, run: () => host.showDesktop() }] : []),
        rescueAction(),
        backAction(),
      ],
    };
  }

  function buildRestart(record: DedicatedRecord): Omit<Built, 'heading' | 'back'> {
    return {
      subheading: t('Activation commencée le {date} · Windows doit redémarrer', { date: formatDate(record.activatedAt) }),
      sections: [
        ...(flash ? [{ rows: flash.rows }] : []),
        { rows: [{ text: t('Fonctions de Windows « Shell Launcher » activées : redémarrez le PC, puis revenez ici terminer l’activation'), tone: 'warning', badges: [t('À vérifier')] }] },
      ],
      actions: [
        { label: t('Terminer l’activation'), detail: t('Après le redémarrage ; Windows demande votre autorisation'), icon: 'lock', run: () => activate() },
        { label: t('Annuler et rétablir'), detail: t('Remet l’état d’avant ; Windows demande votre autorisation'), icon: 'restore', run: () => deactivate(record) },
        rescueAction(),
        backAction(),
      ],
    };
  }

  function openRescue(): void {
    const file = rescueScriptFile(host.dataDir);
    host.library.openCustom(
      () => ({
        heading: t('Secours : accéder à Windows'),
        icon: 'info',
        lead: t('Cyber Pinball ne répond plus, ou vous voulez travailler dans Windows ; en dernier recours, rétablir le bureau sans Cyber Pinball.'),
        sections: [
          {
            title: t('Sur la borne'),
            rows: [
              { text: t('Appuyez sur Ctrl+Alt+Suppr, puis « Gestionnaire des tâches »'), detail: t('Fichier > Exécuter une nouvelle tâche : explorer.exe (une fenêtre de fichiers), ou tout autre programme') },
              { text: t('Appuyez sur Ctrl+Alt+Suppr, puis « Se déconnecter »'), detail: t('Ouvrez ensuite la session d’un compte administrateur : il garde le bureau Windows') },
            ],
          },
          ...(loadSettingsRecord(host.dataDir)
            ? [
                {
                  title: t('Rétablir les réglages sauvegardés'),
                  rows: [
                    {
                      text: t('Gestionnaire des tâches > Fichier > Exécuter une nouvelle tâche'),
                      detail: t('powershell -ExecutionPolicy Bypass -File "{file}" (cochez « Créer cette tâche avec des privilèges d’administration » si le bureau est remplacé)', { file: settingsRescueFile(host.dataDir) }),
                    },
                  ],
                },
              ]
            : []),
          {
            title: t('Depuis un compte administrateur'),
            rows: [
              { text: t('Rétablir le bureau sans Cyber Pinball'), detail: t('PowerShell en administrateur : powershell -ExecutionPolicy Bypass -File "{file}"', { file }) },
              { text: t('Cyber Pinball redémarre en boucle'), detail: t('Le même script, puis redémarrer ; la cause est notée dans {file}', { file: path.join(host.dataDir, 'logs', 'erreurs.txt') }) },
            ],
          },
        ],
        actions: [{ label: t('Retour'), icon: 'back', run: show }],
        back: show,
      }),
      0,
    );
  }

  // ---------- Les deux seules écritures ----------

  /** Activer (ou terminer l'activation après un redémarrage) : le script élevé, puis la vérification. */
  async function activate(): Promise<void> {
    const command = host.command();
    if (!probe || !command) return show();
    const user = probe.user;
    const sid = probe.sid;
    const setting = shellSettingFor(command);
    const previous = loadDedicatedRecord(host.dataDir);
    let result = { error: '?' } as ElevatedResult;
    await host.library.task(t('Autorisation demandée à Windows : répondez dans la fenêtre « Contrôle de compte d’utilisateur »…'), async () => {
      result = await host.system.runElevated({ kind: 'activate', sid, setting });
    });
    flash = undefined;
    if ('cancelled' in result) flash = { rows: [{ text: t('Autorisation refusée dans la fenêtre de Windows : rien n’a changé'), tone: 'warning' }] };
    else if ('error' in result) flash = { rows: [{ text: t('L’activation n’a pas pu démarrer : {error}', { error: result.error }), tone: 'error', badges: [t('Bloquant')] }] };
    else {
      const outcome = result.outcome;
      const reference = referenceOf(outcome, previous?.sid === sid ? previous.reference : undefined);
      if (outcome.status === 'failed' || !reference) flash = { rows: failureRows(outcome) };
      else {
        const record: DedicatedRecord = { version: 1, sid, user, setting, state: outcome.status === 'restart' ? 'restart' : 'active', reference, activatedAt: previous?.activatedAt ?? now().toISOString() };
        saveDedicatedRecord(host.dataDir, record);
        writeRescue(record);
        const problems = outcome.status === 'done' ? activationProblems(outcome.after, setting) : [];
        flash =
          outcome.status === 'restart'
            ? { rows: [{ text: t('Fonctions de Windows activées : redémarrez le PC, puis revenez ici terminer l’activation'), tone: 'warning', badges: [t('À vérifier')] }] }
            : problems.length
              ? { rows: [{ text: t('Activation incomplète : Windows ne dit pas ce qui était demandé'), detail: t('« Désactiver et rétablir le bureau » remet l’état d’avant'), tone: 'error', badges: [t('Bloquant')] }, ...differenceRows(problems, user)] }
              : {
                  rows: [
                    { text: t('Activation enregistrée et vérifiée'), detail: t('Ouvrez une nouvelle session pour l’appliquer (redémarrez le PC)'), tone: 'ok' },
                    { text: t('Pour revenir en arrière : « Désactiver et rétablir le bureau », ici'), detail: t('En secours, depuis un compte administrateur : {file}', { file: rescueScriptFile(host.dataDir) }) },
                  ],
                };
      }
      console.log(`Borne dédiée : activation ${outcome.status}${outcome.error ? ` (${outcome.error})` : ''} ; ${(outcome.log ?? []).join(' ; ')}`);
    }
    show();
  }

  /** Désactiver : remettre l'état d'avant (référence enregistrée), puis le vérifier point par point. */
  async function deactivate(record: DedicatedRecord): Promise<void> {
    let result = { error: '?' } as ElevatedResult;
    await host.library.task(t('Autorisation demandée à Windows : répondez dans la fenêtre « Contrôle de compte d’utilisateur »…'), async () => {
      result = await host.system.runElevated({ kind: 'deactivate', sid: record.sid, reference: record.reference });
    });
    flash = undefined;
    if ('cancelled' in result) flash = { rows: [{ text: t('Autorisation refusée dans la fenêtre de Windows : rien n’a changé'), tone: 'warning' }] };
    else if ('error' in result) flash = { rows: [{ text: t('La désactivation n’a pas pu démarrer : {error}', { error: result.error }), tone: 'error', badges: [t('Bloquant')] }] };
    else {
      const outcome = result.outcome;
      const differences = outcome.status === 'done' ? restoreDifferences(record.reference, outcome.settled, outcome.after) : [];
      if (outcome.status === 'failed') flash = { rows: failureRows(outcome) };
      else if (differences.length) {
        flash = { rows: [{ text: t('L’état d’avant n’est pas tout à fait revenu'), detail: t('Choisissez de nouveau « Désactiver et rétablir le bureau », ou voyez « Secours »'), tone: 'error', badges: [t('Bloquant')] }, ...differenceRows(differences, record.user)] };
      } else {
        removeDedicatedRecord(host.dataDir);
        fs.rmSync(rescueScriptFile(host.dataDir), { force: true });
        flash = {
          rows: [
            { text: t('Configuration précédente restaurée et vérifiée'), detail: t('Le bureau revient à la prochaine ouverture de session'), tone: 'ok' },
            ...SNAPSHOT_ITEMS.filter((item) => item !== 'enabled' || record.reference.enabled !== undefined).map((item) => ({
              text: t('{item} : {value}, comme avant', { item: snapshotItemLabel(item, record.user), value: snapshotItemValue(record.reference, item) }),
              ...(item === 'features' && outcome.restartNeeded && { detail: t('Retrait complet au prochain redémarrage') }),
              tone: 'ok' as const,
              badges: [t('Vérifié')],
            })),
          ],
        };
      }
      console.log(`Borne dédiée : désactivation ${outcome.status}${differences.length ? `, ${differences.length} différence(s)` : ''} ; ${(outcome.log ?? []).join(' ; ')}`);
    }
    show();
  }

  /**
   * Script de secours lancé depuis un compte administrateur : s'il a remis l'état d'avant (vérifié
   * comme une désactivation), l'activation est oubliée ; sinon, son constat est affiché.
   */
  function reconcileRescue(): void {
    const record = loadDedicatedRecord(host.dataDir);
    const file = rescueResultFile(host.dataDir);
    const outcome = record && fs.existsSync(file) ? readElevatedOutcome(file) : undefined;
    if (!record || !outcome || outcome.kind !== 'deactivate') return;
    fs.rmSync(file, { force: true });
    const differences = outcome.status === 'done' ? restoreDifferences(record.reference, outcome.settled, outcome.after) : [];
    if (outcome.status !== 'done' || differences.length) {
      flash = { rows: [...(outcome.status === 'done' ? [{ text: t('L’état d’avant n’est pas tout à fait revenu'), tone: 'error' as const, badges: [t('Bloquant')] }] : failureRows(outcome)), ...differenceRows(differences, record.user)] };
      return;
    }
    removeDedicatedRecord(host.dataDir);
    fs.rmSync(rescueScriptFile(host.dataDir), { force: true });
    flash = { rows: [{ text: t('Désactivée par le script de secours : état d’avant vérifié'), detail: t('Le bureau revient à la prochaine ouverture de session'), tone: 'ok' }] };
    console.log('Borne dédiée : désactivée par le script de secours, état d’avant vérifié.');
  }

  function failureRows(outcome: ElevatedOutcome): Row[] {
    const reason = outcome.error === 'absent-features' ? t('les fonctions « Shell Launcher » n’existent pas sur cette édition de Windows') : (outcome.error ?? '?');
    const verb = outcome.kind === 'activate' ? t('L’activation a échoué : {reason}', { reason }) : t('La désactivation a échoué : {reason}', { reason });
    const rows: Row[] = [{ text: verb, tone: 'error', badges: [t('Bloquant')] }];
    if (outcome.rolledBack) rows.push({ text: t('L’état d’avant est remis'), tone: 'ok' });
    else if (outcome.rollbackError) rows.push({ text: t('Retour en arrière incomplet : {error}', { error: outcome.rollbackError }), detail: t('Voyez « Secours »'), tone: 'error' });
    return rows;
  }

  function differenceRows(differences: SnapshotDifference[], user: string): Row[] {
    return differences.map((d) => ({ text: snapshotItemLabel(d.item, user), detail: t('attendu : {expected} · constaté : {actual}', { expected: d.expected, actual: d.actual }), tone: 'error' as const }));
  }

  /** Script de secours : la désactivation, prête à lancer depuis un compte administrateur. */
  function writeRescue(record: DedicatedRecord): void {
    const file = rescueScriptFile(host.dataDir);
    const result = rescueResultFile(host.dataDir);
    const lines = [
      '#Requires -RunAsAdministrator',
      '# Secours de la borne dédiée de Cyber Pinball : remet Windows dans l’état d’avant l’activation.', // i18n-ignore : script pour l'administrateur
      `# PowerShell en administrateur : powershell -ExecutionPolicy Bypass -File "${file}"`, // i18n-ignore : script pour l'administrateur
      elevatedScript({ kind: 'deactivate', sid: record.sid, reference: record.reference }, result),
      'Get-Content -LiteralPath $ResultFile',
      '',
    ];
    fs.writeFileSync(file, '﻿' + lines.join('\r\n'), 'utf8');
  }

  // ---------- Réglages du compte : trois écritures ----------

  /** Message d'attente : l'UAC à répondre, ou l'écriture dans la session. */
  function settingsTask(elevate: boolean): string {
    return elevate ? t('Autorisation demandée à Windows : répondez dans la fenêtre « Contrôle de compte d’utilisateur »…') : t('Réglages de Windows en cours…');
  }

  /** Installer une façon : relever (la sauvegarde), écrire, vérifier. */
  async function install(mode: CabinetMode): Promise<void> {
    const command = host.command();
    if (!probe || !command) return show();
    const { user, sid } = probe;
    const startupDir = host.system.startupDir();
    const want = wantedSettings(mode, command);
    const elevate = needsElevation(want);
    let result = { error: '?' } as SettingsResult;
    await host.library.task(settingsTask(elevate), async () => {
      result = await host.system.runSettings({ sid, startupDir, want }, elevate);
    });
    flash = undefined;
    if ('cancelled' in result) flash = { rows: [{ text: t('Autorisation refusée dans la fenêtre de Windows : rien n’a changé'), tone: 'warning' }] };
    else if ('error' in result) flash = { rows: [{ text: t('L’activation n’a pas pu démarrer : {error}', { error: result.error }), tone: 'error', badges: [t('Bloquant')] }] };
    else {
      const outcome = result.outcome;
      if (outcome.status === 'failed' || !outcome.before) flash = { rows: settingsFailureRows(outcome, t('L’activation a échoué : {reason}', { reason: outcome.error ?? '?' })) };
      else {
        const record: SettingsRecord = { version: 1, mode, sid, user, startupDir, want, reference: referenceFor(want, outcome.before), at: now().toISOString() };
        saveSettingsRecord(host.dataDir, record);
        writeSettingsRescue(record);
        const problems = settingsDifferences(want, outcome.after);
        flash = problems.length
          ? { rows: [{ text: t('Activation incomplète : Windows ne dit pas ce qui était demandé'), detail: t('« Désactiver » remet l’état d’avant'), tone: 'error', badges: [t('Bloquant')] }, ...settingsDifferenceRows(problems, user)] }
          : {
              rows: [
                { text: t('Sauvegarde prise, réglages écrits et vérifiés'), detail: t('Effet à la prochaine ouverture de session (redémarrez le PC)'), tone: 'ok' },
                { text: t('Pour revenir en arrière : « Désactiver », ici'), detail: t('En secours, hors de Cyber Pinball : {file}', { file: settingsRescueFile(host.dataDir) }) },
              ],
            };
      }
      console.log(`Réglages de Windows de la borne : ${mode} ${outcome.status}${outcome.error ? ` (${outcome.error})` : ''} ; ${(outcome.log ?? []).join(' ; ')}`);
    }
    show();
  }

  /** Désactiver : remettre la sauvegarde, puis la vérifier point par point. */
  async function uninstall(record: SettingsRecord): Promise<void> {
    const elevate = needsElevation(record.reference);
    let result = { error: '?' } as SettingsResult;
    await host.library.task(settingsTask(elevate), async () => {
      result = await host.system.runSettings({ sid: record.sid, startupDir: record.startupDir, want: record.reference }, elevate);
    });
    flash = undefined;
    if ('cancelled' in result) flash = { rows: [{ text: t('Autorisation refusée dans la fenêtre de Windows : rien n’a changé'), tone: 'warning' }] };
    else if ('error' in result) flash = { rows: [{ text: t('La désactivation n’a pas pu démarrer : {error}', { error: result.error }), tone: 'error', badges: [t('Bloquant')] }] };
    else {
      const outcome = result.outcome;
      const differences = settingsDifferences(record.reference, outcome.after);
      if (outcome.status === 'failed') flash = { rows: settingsFailureRows(outcome, t('La désactivation a échoué : {reason}', { reason: outcome.error ?? '?' })) };
      else if (differences.length) {
        flash = { rows: [{ text: t('L’état d’avant n’est pas tout à fait revenu'), detail: t('Choisissez de nouveau « Désactiver », ou voyez « Secours »'), tone: 'error', badges: [t('Bloquant')] }, ...settingsDifferenceRows(differences, record.user)] };
      } else forgetSettings(record, t('Configuration précédente restaurée et vérifiée'));
      console.log(`Réglages de Windows de la borne : désactivation ${outcome.status}${differences.length ? `, ${differences.length} différence(s)` : ''} ; ${(outcome.log ?? []).join(' ; ')}`);
    }
    show();
  }

  /** Le raccourci du dossier Démarrage posé par l'installeur, sans sauvegarde : le retirer. */
  async function removeStartup(): Promise<void> {
    if (!probe) return show();
    const run = { sid: probe.sid, startupDir: host.system.startupDir(), want: { startup: null } };
    let result = { error: '?' } as SettingsResult;
    await host.library.task(settingsTask(false), async () => {
      result = await host.system.runSettings(run, false);
    });
    flash = undefined;
    if (!('outcome' in result)) flash = { rows: [{ text: t('Le raccourci n’a pas pu être retiré : {error}', { error: 'error' in result ? result.error : '?' }), tone: 'error' }] };
    else if (result.outcome.status === 'failed' || settingsDifferences(run.want, result.outcome.after).length) flash = { rows: settingsFailureRows(result.outcome, t('Le raccourci n’a pas pu être retiré : {error}', { error: result.outcome.error ?? '?' })) };
    else {
      current = result.outcome.after;
      flash = { rows: [{ text: t('Cyber Pinball ne se lance plus au démarrage de Windows'), detail: t('Raccourci du dossier Démarrage retiré, vérifié'), tone: 'ok', badges: [t('Vérifié')] }] };
    }
    show();
  }

  /** Sauvegarde remise et vérifiée : l'installation est oubliée, le constat affiché. */
  function forgetSettings(record: SettingsRecord, heading: string): void {
    removeSettingsRecord(host.dataDir);
    fs.rmSync(settingsRescueFile(host.dataDir), { force: true });
    flash = {
      rows: [
        { text: heading, detail: t('Effet à la prochaine ouverture de session'), tone: 'ok' },
        ...SETTING_KEYS.filter((k) => k in record.reference).map((k) => ({
          text: t('{item} : {value}, comme avant', { item: settingLabel(k, record.user), value: settingValueLabel(k, record.reference[k]) }),
          tone: 'ok' as const,
          badges: [t('Vérifié')],
        })),
      ],
    };
  }

  /** Script de secours lancé hors de Cyber Pinball : s'il a remis la sauvegarde (vérifiée), l'installation est oubliée. */
  function reconcileSettingsRescue(): void {
    const record = loadSettingsRecord(host.dataDir);
    const file = settingsRescueResultFile(host.dataDir);
    const outcome = record && fs.existsSync(file) ? readSettingsOutcome(file) : undefined;
    if (!record || !outcome) return;
    fs.rmSync(file, { force: true });
    const differences = settingsDifferences(record.reference, outcome.after);
    if (outcome.status !== 'done' || differences.length) {
      flash = { rows: [{ text: t('Le script de secours n’a pas tout remis'), tone: 'error', badges: [t('Bloquant')] }, ...settingsDifferenceRows(differences, record.user)] };
      return;
    }
    forgetSettings(record, t('Désactivée par le script de secours : état d’avant vérifié'));
    console.log('Réglages de Windows de la borne : remis par le script de secours, vérifiés.');
  }

  function settingsFailureRows(outcome: SettingsOutcome, text: string): Row[] {
    const rows: Row[] = [{ text, tone: 'error', badges: [t('Bloquant')] }];
    if (outcome.rolledBack) rows.push({ text: t('L’état d’avant est remis'), tone: 'ok' });
    else if (outcome.rollbackError) rows.push({ text: t('Retour en arrière incomplet : {error}', { error: outcome.rollbackError }), detail: t('Voyez « Secours »'), tone: 'error' });
    return rows;
  }

  function settingsDifferenceRows(differences: SettingDifference[], user: string): Row[] {
    return differences.map((d) => ({ text: settingLabel(d.key, user), detail: t('attendu : {expected} · constaté : {actual}', { expected: settingValueLabel(d.key, d.expected), actual: settingValueLabel(d.key, d.actual) }), tone: 'error' as const }));
  }

  /** Script de secours : la sauvegarde remise, prête à lancer hors de Cyber Pinball. */
  function writeSettingsRescue(record: SettingsRecord): void {
    const file = settingsRescueFile(host.dataDir);
    const elevate = needsElevation(record.reference);
    const lines = [
      ...(elevate ? ['#Requires -RunAsAdministrator'] : []),
      '# Secours de Cyber Pinball : remet les réglages de Windows sauvegardés avant l’activation.', // i18n-ignore : script de secours
      `# ${elevate ? 'PowerShell en administrateur' : 'PowerShell'} : powershell -ExecutionPolicy Bypass -File "${file}"`, // i18n-ignore : script de secours
      settingsScript({ sid: record.sid, startupDir: record.startupDir, want: record.reference }, settingsRescueResultFile(host.dataDir)),
      'Get-Content -LiteralPath $ResultFile',
      '',
    ];
    fs.writeFileSync(file, '\ufeff' + lines.join('\r\n'), 'utf8');
  }

  function formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString(language() === 'en' ? 'en-GB' : 'fr-FR');
  }

  // ---------- Entrées du menu système ----------

  const dedicatedItem: ProvidedSystemItem = {
    get label() {
      const record = loadDedicatedRecord(host.dataDir);
      const settings = loadSettingsRecord(host.dataDir);
      return record?.state === 'restart' ? t('Borne dédiée : à terminer') : record || settings?.mode === 'shell' ? t('Borne dédiée : activée') : t('Borne dédiée');
    },
    get detail() {
      const record = loadDedicatedRecord(host.dataDir);
      const settings = loadSettingsRecord(host.dataDir);
      if (record?.state === 'restart') return t('Activation commencée : redémarrez le PC, puis terminez-la ici');
      const user = record?.user ?? (settings?.mode === 'shell' ? settings.user : undefined);
      return user ? t('Cyber Pinball à la place du bureau Windows, pour le compte « {user} »', { user }) : t('Cyber Pinball à la place du bureau Windows, ou lancé au démarrage ; désactivée');
    },
    run: open,
  };

  /** « Lancement au démarrage » : la même page, nommée là où on la cherche. */
  const startupItem: ProvidedSystemItem = {
    get label() {
      return loadSettingsRecord(host.dataDir) || loadDedicatedRecord(host.dataDir) || startupShortcutExists() ? t('Lancement au démarrage : oui') : t('Lancement au démarrage : non');
    },
    get detail() {
      const settings = loadSettingsRecord(host.dataDir);
      if (loadDedicatedRecord(host.dataDir) || settings?.mode === 'shell') return t('Cyber Pinball remplace le bureau dès l’ouverture de session (« Borne dédiée »)');
      if (settings) return t('Cyber Pinball s’ouvre avec Windows, le bureau masqué derrière');
      if (startupShortcutExists()) return t('Raccourci du dossier Démarrage, posé par l’installeur');
      return t('Ouvrir Cyber Pinball dès l’ouverture de la session Windows');
    },
    run: open,
  };

  /** Lecture seule : le raccourci du dossier Démarrage (le même que celui de l'installeur). */
  function startupShortcutExists(): boolean {
    return fs.existsSync(path.join(host.system.startupDir(), STARTUP_SHORTCUT));
  }

  const explorerItem: ProvidedSystemItem = {
    get detail() {
      return t('Cyber Pinball est le shell : une fenêtre de fichiers, tous les écrans libérés ; {keys} ramène le menu', { keys: host.desktopKeys });
    },
    run: () => host.showDesktop(),
  };

  return { dedicatedItem, startupItem, explorerItem, open };
}
