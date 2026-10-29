// Écran « Téléchargements » (première entrée du menu système, pastille du menu des tables, et
// Menu système > Tables > Téléchargements) : tout ce qui arrive, d'un site ou d'un ami, suivi en
// temps réel, à la manière d'une console de jeu (packages/core/src/downloadmanager.ts).
// - la liste : en cours et en attente, puis terminés et bloqués ; chaque ligne dit son état en
//   mot, sa source, ce qui est reçu, sa barre, et l'étape suivante (où il ramène, ou quand il
//   reprend). Les lignes se mettent à jour sur place : une ligne ne change de section, la liste
//   ne gagne ou ne perd une ligne qu'à un geste (ouverture, action), jamais à un tic de
//   progression ; le curseur suit le téléchargement, pas son rang ;
// - la fiche d'un téléchargement : « Revenir à… » (l'écran d'où il a été demandé, ou son repli
//   s'il n'existe plus), mettre en pause, reprendre, réessayer, annuler (après confirmation),
//   retirer de la liste ;
// - « Fichiers téléchargés » : l'inventaire de ce qui est gardé (downloads-screen.ts).
// Maquette et revue de Codex : docs/recherche/maquettes/gestionnaire-telechargements.cjs.

import * as path from 'node:path';
import {
  downloadClock,
  downloadFraction,
  downloadReasonText,
  downloadStateLabel,
  downloadTone,
  downloadVolume,
  fileRank,
  formatRate,
  formatRemaining,
  formatSize,
  isActive,
  resolveReturn,
  returnLabel,
  summarize,
  summaryText,
  t,
  tn,
  type DownloadJob,
  type DownloadManager,
  type IconName,
  type ReturnWorld,
} from '@cyberpinball/core';
import type { Action, Built, Row, Section, Tone } from './library';

export interface DownloadCenterContext {
  manager: DownloadManager;
  show(build: () => Built, at?: number): void;
  world: ReturnWorld;
  /** « Revenir à… » : l'écran d'origine (ou son repli), avec ce qui a été reçu. */
  deliver(job: DownloadJob): void;
  /** « Fichiers téléchargés » : ce qui est gardé sous downloads (inventaire). */
  files: { detail(): string; open(back: () => void): void };
  back(): void;
}

export interface DownloadCenter {
  /** La liste ; `focus` : le curseur sur ce téléchargement. */
  open(focus?: string, flash?: { text: string; tone: Tone }): void;
  /** La fiche d'un téléchargement. */
  openJob(id: string): void;
}

/** Icône de la source : un ami, un site, VPinMediaDB, la mise à jour… */
function sourceIcon(j: DownloadJob): IconName {
  if (j.source.kind === 'friend') return 'friends';
  if (j.kind === 'mediadb') return 'image-download';
  if (j.kind === 'update') return 'upgrade';
  if (j.kind === 'component' || j.kind === 'tool') return 'download';
  return 'globe';
}

export function createDownloadCenter(ctx: DownloadCenterContext): DownloadCenter {
  const m = ctx.manager;
  let flash: { text: string; tone: Tone } | undefined;
  /** Sections figées au dernier geste : qui est où, dans quel ordre. */
  let snapshot: { active: string[]; finished: string[] } = { active: [], finished: [] };

  const take = () => {
    const jobs = m.jobs();
    snapshot = { active: jobs.filter(isActive).map((j) => j.id), finished: jobs.filter((j) => !isActive(j)).map((j) => j.id) };
  };

  const back = (j: DownloadJob) => resolveReturn(j, ctx.world);
  const backLabel = (j: DownloadJob) => returnLabel(back(j).to, ctx.world);

  /** Faits de la ligne : source, volume, temps restant ou raison, en peu de mots. */
  function facts(j: DownloadJob): string {
    const parts = [j.source.label, downloadVolume(j)];
    if (j.state === 'running') {
      const p = m.progress(j.id);
      const left = p?.remaining !== undefined ? formatRemaining(p.remaining) : undefined;
      if (left) parts.push(t('reste {left}', { left }));
    } else if (j.state === 'waiting' || j.state === 'failed') {
      const why = downloadReasonText(j);
      if (why) parts.push(why);
    } else if (j.state === 'done' && j.finished) {
      parts.push(t('terminé à {time}', { time: downloadClock(j.finished) }), j.source.kind === 'friend' || j.files.some((f) => f.sha256) ? t('vérifié') : '');
    }
    return parts.filter(Boolean).join(' · ');
  }

  /** L'étape suivante, signe et mot : où il ramène, quand il reprend, ce qu'il faut faire. */
  function next(j: DownloadJob): NonNullable<Row['note']> {
    const to = backLabel(j);
    switch (j.state) {
      case 'running':
      case 'queued':
        return { sign: '↩', text: t('Puis : {screen}', { screen: to }), tone: 'quiet' };
      case 'waiting':
        if (j.attached) return { sign: '↻', text: t('Reprise automatique tant que son écran est ouvert'), tone: 'warning' };
        if (j.source.kind === 'friend') return { sign: '↻', text: t('Reprise automatique au retour de {name}', { name: j.source.label }), tone: 'warning' };
        return { sign: '↻', text: j.retryAt ? t('Nouvel essai à {time}, à partir des données reçues', { time: downloadClock(j.retryAt) }) : t('Reprise automatique, à partir des données reçues'), tone: 'warning' };
      case 'paused':
        return { sign: '‖', text: t('En pause : reprise manuelle'), tone: 'quiet' };
      case 'done':
        return j.delivered ? { sign: '✓', text: t('Rendu à : {screen}', { screen: to }), tone: 'ok' } : { sign: '↩', text: t('Revenir à : {screen}', { screen: to }), tone: 'ok' };
      case 'failed':
        return j.attached || j.reason === 'login'
          ? { sign: '!', text: t('Start : rouvrir {screen} pour reprendre', { screen: to }), tone: 'error' }
          : { sign: '!', text: t('Start : réessayer, à partir des données reçues'), tone: 'error' };
      case 'cancelled':
        return { sign: '×', text: t('Annulé : ce qui était reçu est effacé'), tone: 'quiet' };
    }
  }

  function row(j: DownloadJob, action: number): Row {
    const tone = downloadTone(j);
    const fraction = downloadFraction(j);
    return {
      text: j.title,
      detail: facts(j),
      badges: [downloadStateLabel(j)],
      icon: sourceIcon(j),
      // En pause : la ligne reste lisible (revue de Codex) ; seule la barre s'éteint.
      tone: j.state === 'paused' || j.state === 'cancelled' ? undefined : tone,
      progress: { ...(fraction !== undefined ? { value: fraction } : {}), tone },
      note: next(j),
      action,
      pick: true,
    };
  }

  function buildList(): Built {
    const jobs = new Map(m.jobs().map((j) => [j.id, j]));
    const actions: Action[] = [];
    const rowsOf = (ids: string[]) =>
      ids
        .map((id) => jobs.get(id))
        .filter((j): j is DownloadJob => !!j)
        .map((j) => {
          const index = actions.push({ label: j.title, key: `job:${j.id}`, run: () => openJob(j.id) }) - 1;
          return row(j, index);
        });
    const sections: Section[] = [];
    if (flash) sections.push({ rows: [{ text: flash.text, tone: flash.tone }] });
    const active = rowsOf(snapshot.active);
    const finished = rowsOf(snapshot.finished);
    if (active.length) sections.push({ title: t('En cours et en attente'), rows: active });
    if (finished.length) sections.push({ title: t('Terminés et bloqués'), rows: finished });
    if (!active.length && !finished.length)
      sections.push({ rows: [{ text: t('Aucun téléchargement en cours'), detail: t('Ce que vous demandez à un site ou à un ami arrive ici : vous le suivez, il reprend seul après une coupure, et il vous ramène là où vous l’avez demandé.'), tone: 'quiet' }] });

    const all = [...jobs.values()];
    const pausable = all.filter((j) => isActive(j) && j.state !== 'paused' && !j.attached);
    const paused = all.filter((j) => j.state === 'paused');
    if (pausable.length)
      actions.push({ label: t('Tout mettre en pause'), detail: tn(pausable.length, '{n} téléchargement', '{n} téléchargements'), icon: 'pause', key: 'pause-all', run: () => (m.pauseAll(), gesture('pause-all')) });
    else if (paused.length) actions.push({ label: t('Tout reprendre'), detail: tn(paused.length, '{n} téléchargement', '{n} téléchargements'), icon: 'play', key: 'resume-all', run: () => (m.resumeAll(), gesture('resume-all')) });
    const done = all.filter((j) => j.state === 'done' || j.state === 'cancelled');
    if (done.length)
      actions.push({
        label: t('Retirer les terminés'),
        detail: t('{n} de la liste ; les fichiers restent où ils ont été rangés', { n: done.length }),
        icon: 'broom',
        key: 'clear',
        run: () => {
          for (const j of done) m.remove(j.id);
          gesture('clear');
        },
      });
    actions.push({ label: t('Fichiers téléchargés'), detail: ctx.files.detail(), icon: 'folder-download', key: 'files', run: () => ctx.files.open(() => open('files')) });
    actions.push({ label: t('Retour'), icon: 'back', key: 'back', run: () => ctx.back() });

    const s = summarize(all);
    const left = s.left > 0 ? (s.fraction !== undefined ? t('{size} à recevoir', { size: formatSize(s.left) }) : t('au moins {size} à recevoir', { size: formatSize(s.left) })) : undefined;
    return {
      heading: t('Téléchargements'),
      icon: 'download',
      subheading: [summaryText(s), left].filter(Boolean).join(' · '),
      lead: t('Vos téléchargements, leurs reprises et les écrans où continuer.'),
      sections,
      actions,
      back: () => ctx.back(),
      variant: 'downloads',
    };
  }

  /** Un geste : la liste se refait (sections, lignes), le curseur sur ce qu'on vient d'utiliser. */
  function gesture(key: string): void {
    flash = undefined;
    take();
    showList(key);
  }

  function showList(key?: string): void {
    const at = key ? buildList().actions.findIndex((a) => a.key === key || a.key === `job:${key}`) : -1;
    ctx.show(buildList, Math.max(0, at));
  }

  function open(focus?: string, notice?: { text: string; tone: Tone }): void {
    flash = notice;
    take();
    for (const j of m.jobs()) if (!isActive(j)) m.seen(j.id);
    showList(focus);
  }

  // ---------- Fiche d'un téléchargement ----------

  function openJob(id: string): void {
    flash = undefined;
    ctx.show(() => buildJob(id), 0);
  }

  function buildJob(id: string): Built {
    const j = m.get(id);
    const list = () => open(id);
    if (!j) return { heading: t('Téléchargement retiré'), sections: [], actions: [{ label: t('Retour'), icon: 'back', run: list }], back: list };
    const r = back(j);
    const to = returnLabel(r.to, ctx.world);
    const tone = downloadTone(j);
    const fraction = downloadFraction(j);
    const p = j.state === 'running' ? m.progress(id) : undefined;
    const received = [downloadVolume(j), fileRank(j), p?.rate !== undefined ? formatRate(p.rate) : undefined, p?.remaining !== undefined ? formatRemaining(p.remaining) : undefined].filter(Boolean).join(' · ');
    const why = downloadReasonText(j);
    const sign = { running: '↓', queued: '…', waiting: '↻', paused: '‖', done: '✓', failed: '!', cancelled: '×' }[j.state];
    const rows: Row[] = [
      { text: t('État'), detail: `${sign} ${downloadStateLabel(j)}${why && j.state !== 'done' ? ` : ${why}` : ''}`, tone: j.state === 'paused' ? undefined : tone, progress: { ...(fraction !== undefined ? { value: fraction } : {}), tone } },
      { text: t('Reçu'), detail: received },
      { text: t('Source'), detail: j.source.label },
    ];
    if (j.state === 'waiting' && !j.attached)
      rows.push({ text: t('Reprise'), detail: j.source.kind === 'friend' ? t('Automatique au retour de {name}, à partir des données déjà reçues. Le fichier repris est vérifié en entier.', { name: j.source.label }) : t('Automatique, à partir des données déjà reçues. Le fichier repris est vérifié en entier.') });
    rows.push({ text: t('Retour vers'), detail: r.lost ? `! ${r.lost} ${t('Retour vers : {screen}', { screen: to })}` : to, tone: r.lost ? 'warning' : undefined });
    const where = j.files.find((f) => f.file)?.file ?? j.files[0]?.dest ?? j.files[0]?.part;
    if (where) rows.push({ text: t('Rangé dans'), detail: path.dirname(where) });

    const actions: Action[] = [];
    const returnAction = (primary: boolean): Action => ({
      label: t('Revenir à {screen}', { screen: to }),
      detail: j.state === 'done' ? (j.kind === 'friend-media' ? t('Vérifiez, puis enregistrez') : j.kind === 'friend-table' ? t('Le plan d’ajout, avant toute installation') : undefined) : t('Le téléchargement continue'),
      icon: 'back',
      tone: primary ? 'ok' : undefined,
      key: 'return',
      run: () => ctx.deliver(j),
    });
    const pause: Action = { label: t('Mettre en pause'), detail: t('Il ne reprendra plus seul'), icon: 'pause', key: 'pause', run: () => (m.pause(id), openJob(id)) };
    const cancel: Action = { label: t('Annuler le téléchargement'), detail: t('Ce qui est reçu est effacé'), icon: 'close', tone: 'error', key: 'cancel', run: () => confirmCancel(id) };
    const remove: Action = { label: t('Retirer de la liste'), detail: t('Les fichiers reçus restent où ils ont été rangés'), icon: 'broom', key: 'remove', run: () => (m.remove(id), open()) };
    switch (j.state) {
      case 'done':
        actions.push(returnAction(true), remove);
        break;
      case 'running':
      case 'queued':
        if (!j.attached) actions.push(pause);
        actions.push(returnAction(false));
        if (!j.attached) actions.push(cancel);
        break;
      case 'waiting':
        // Un ami absent : rien à relancer, la reprise est automatique (revue de Codex) ; un site : réessayer tout de suite.
        if (j.source.kind === 'friend' || j.attached) actions.push(returnAction(true));
        else actions.push({ label: t('Réessayer maintenant'), detail: t('Sans attendre l’essai prévu'), icon: 'restart', tone: 'ok', key: 'retry', run: () => (m.resume(id), openJob(id)) }, returnAction(false));
        if (!j.attached) actions.push(pause, cancel);
        break;
      case 'paused':
        actions.push({ label: t('Reprendre'), detail: t('À partir des données déjà reçues'), icon: 'play', tone: 'ok', key: 'resume', run: () => (m.resume(id), openJob(id)) }, returnAction(false), cancel);
        break;
      case 'failed':
        if (j.attached || j.reason === 'login') actions.push(returnAction(true));
        else actions.push({ label: t('Réessayer'), detail: t('À partir des données déjà reçues'), icon: 'restart', tone: 'ok', key: 'retry', run: () => (m.resume(id), openJob(id)) }, returnAction(false));
        actions.push(remove);
        break;
      case 'cancelled':
        if (!j.attached) actions.push({ label: t('Recommencer'), detail: t('Depuis le début'), icon: 'restart', key: 'retry', run: () => (m.resume(id), openJob(id)) });
        actions.push(remove);
        break;
    }
    actions.push({ label: t('Retour'), icon: 'back', key: 'back', run: list });
    // Deux actions ne portent jamais la même icône : « Revenir à » prend celle de son écran.
    const ret = actions.find((a) => a.key === 'return');
    if (ret) ret.icon = r.to.screen === 'table-medias' ? 'image' : r.to.screen === 'game-parts' ? 'layers' : r.to.screen === 'friend-library' ? 'friends' : r.to.screen === 'wait-list' ? 'inbox' : r.to.screen === 'updates' ? 'upgrade' : r.to.screen === 'table-sheet' ? 'tables' : 'download';
    const head = [t('de {source}', { source: j.source.label }), j.state === 'done' && j.finished ? t('terminé à {time}', { time: downloadClock(j.finished) }) : fraction !== undefined ? t('{pct} %', { pct: Math.floor(fraction * 100) }) : undefined, downloadStateLabel(j).toLowerCase()]
      .filter(Boolean)
      .join(' · ');
    return { heading: j.title, icon: 'download', subheading: head, sections: [{ rows }], actions, back: list, variant: 'facts' };
  }

  /** Annuler efface ce qui est reçu : confirmation, le curseur sur « Garder ». */
  function confirmCancel(id: string): void {
    const j = m.get(id);
    if (!j) return open();
    ctx.show(
      () => ({
        heading: t('Annuler « {title} » ?', { title: j.title }),
        icon: 'close',
        sections: [{ rows: [{ text: t('Reçu'), detail: downloadVolume(j) }, { text: t('Après l’annulation'), detail: t('Ce qui est reçu est effacé ; il faudra tout recevoir de nouveau.'), tone: 'warning' }] }],
        actions: [
          { label: t('Garder le téléchargement'), icon: 'back', run: () => openJob(id) },
          { label: t('Annuler le téléchargement'), icon: 'close', tone: 'error', run: () => (m.cancel(id), openJob(id)) },
        ],
        back: () => openJob(id),
        variant: 'facts',
      }),
      0,
    );
  }

  return { open: (focus, notice) => open(focus, notice), openJob };
}
