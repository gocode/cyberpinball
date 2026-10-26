// Menu système > Borne > « Borne dédiée » : Cyber Pinball à la place du bureau Windows pour ce
// compte (Shell Launcher, dedicated.ts du cœur). L'écran explique, puis active ou désactive en
// demandant l'autorisation de Windows (UAC) à ce moment-là seulement, vérifie le résultat point
// par point et dit comment revenir en arrière. Tant que Cyber Pinball est le shell de la session,
// « Ouvrir l'Explorateur Windows » remplace « Bureau Windows » dans la rubrique Borne.
//
// Rien n'est écrit dans Windows ailleurs que dans activate() et deactivate(), lancées par leur
// action à l'écran (dedicated-menu.test.ts le vérifie). Sans electron à l'exécution : les tests
// du cœur chargent ce module avec un exécuteur simulé.

import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  activationProblems,
  elevatedScript,
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
import type { DedicatedProbe, DedicatedSystem, ElevatedResult } from './dedicated-system';
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
  now?(): Date;
}

/** Constat de la dernière opération, en tête de l'écran jusqu'à ce qu'on le quitte. */
interface Flash {
  rows: Row[];
}

export function createDedicatedMenu(host: DedicatedMenuHost) {
  let probe: DedicatedProbe | undefined;
  let probeError: string | undefined;
  let flash: Flash | undefined;
  const now = () => host.now?.() ?? new Date();

  async function readProbe(): Promise<void> {
    try {
      probe = await host.system.probe();
      probeError = undefined;
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
    const record = loadDedicatedRecord(host.dataDir);
    const built = record?.state === 'active' ? buildActive(record) : record?.state === 'restart' ? buildRestart(record) : buildInactive();
    // La sélection d'office va sur « Retour », la dernière action.
    return { ...built, heading: t('Borne dédiée'), icon: 'lock', back };
  }

  const backAction = (): Action => ({ label: t('Retour'), icon: 'back', run: back });
  const rescueAction = (): Action => ({ label: t('Secours : accéder à Windows'), detail: t('Gestionnaire des tâches, compte administrateur, script de désactivation'), icon: 'info', run: openRescue });

  function buildInactive(): Omit<Built, 'heading' | 'back'> {
    const blockers = prerequisites();
    const canActivate = blockers.every((r) => r.tone !== 'error' && r.tone !== 'info');
    const edition = probe ? windowsEditionLabel(probe.editionId, probe.build) : undefined;
    const sections: Section[] = [
      ...(flash ? [{ rows: flash.rows }] : []),
      { title: t('Avant d’activer'), rows: blockers },
      {
        title: t('Ce qui change'),
        rows: [
          { text: t('À l’ouverture de la session, Cyber Pinball à la place du bureau et de la barre des tâches') },
          { text: t('S’il se ferme ou plante, Windows le relance aussitôt') },
          { text: t('Les autres comptes, dont l’administrateur, gardent le bureau Windows') },
          { text: t('Rubrique Borne : « Ouvrir l’Explorateur Windows », une fenêtre de fichiers quand il le faut') },
        ],
      },
    ];
    return {
      subheading: probe && edition ? t('Désactivée · compte « {user} » · {edition}', { user: probe.user, edition }) : t('Désactivée'),
      lead: t('Pour ce compte Windows, Cyber Pinball remplace le bureau et la barre des tâches dès l’ouverture de session : le bureau ne se voit plus jamais, même au démarrage. Les autres comptes restent inchangés.'),
      sections,
      actions: [
        ...(canActivate ? [{ label: t('Activer pour ce compte'), detail: t('Windows demande votre autorisation ; effet à la prochaine ouverture de session'), icon: 'lock' as const, run: () => activate() }] : []),
        rescueAction(),
        backAction(),
      ],
    };
  }

  /** Ce qui permet, ou empêche, d'activer : l'édition de Windows, une installation, un administrateur de secours. */
  function prerequisites(): Row[] {
    if (!probe) return [{ text: t('État de Windows illisible : {error}', { error: probeError ?? '?' }), tone: 'error', badges: [t('Bloquant')] }];
    const rows: Row[] = [];
    const edition = windowsEditionLabel(probe.editionId, probe.build);
    if (!shellLauncherEdition(probe.editionId)) {
      // Rien à réparer : la fonction n'existe pas sur cette édition (neutre, pas une panne).
      rows.push({ text: t('Non disponible sur {edition}', { edition }), detail: t('Seulement dans les éditions Entreprise, Éducation et IoT Enterprise de Windows'), tone: 'info' });
      return rows;
    }
    rows.push({ text: t('{edition} : cette fonction est disponible', { edition }), tone: 'ok', badges: [t('Prêt')] });
    if (!host.command()) rows.push({ text: t('Cyber Pinball tourne depuis ses sources'), detail: t('Seule une installation (CyberPinball.exe) peut remplacer le bureau'), tone: 'error', badges: [t('Bloquant')] });
    if (probe.otherAdmins === undefined) {
      rows.push({ text: t('Comptes administrateurs illisibles'), detail: t('Vérifiez qu’un autre compte administrateur existe : c’est par lui qu’on reprend la main en secours'), tone: 'warning', badges: [t('À vérifier')] });
    } else if (!probe.otherAdmins.length) {
      rows.push({ text: t('Aucun autre compte administrateur que « {user} »', { user: probe.user }), detail: t('Créez-en un avant d’activer : c’est par lui qu’on reprend la main en secours'), tone: 'error', badges: [t('Bloquant')] });
    } else {
      rows.push({ text: t('Compte administrateur de secours : {names}', { names: formatList(probe.otherAdmins) }), tone: 'ok' });
    }
    return rows;
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

  function formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString(language() === 'en' ? 'en-GB' : 'fr-FR');
  }

  // ---------- Entrées du menu système ----------

  const dedicatedItem: ProvidedSystemItem = {
    get label() {
      const record = loadDedicatedRecord(host.dataDir);
      return record?.state === 'restart' ? t('Borne dédiée : à terminer') : record ? t('Borne dédiée : activée') : t('Borne dédiée');
    },
    get detail() {
      const record = loadDedicatedRecord(host.dataDir);
      if (record?.state === 'restart') return t('Activation commencée : redémarrez le PC, puis terminez-la ici');
      return record ? t('Cyber Pinball à la place du bureau Windows, pour le compte « {user} »', { user: record.user }) : t('Cyber Pinball à la place du bureau Windows, même au démarrage ; désactivée');
    },
    run: open,
  };

  const explorerItem: ProvidedSystemItem = {
    get detail() {
      return t('Cyber Pinball est le shell : une fenêtre de fichiers, tous les écrans libérés ; {keys} ramène le menu', { keys: host.desktopKeys });
    },
    run: () => host.showDesktop(),
  };

  return { dedicatedItem, explorerItem, open };
}
