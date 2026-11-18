// « Retours et propositions » (Menu système > Cyber Pinball) : le seul formulaire des retours, où mènent
// aussi l'écran d'un plantage de VPX, la fiche technique et l'appli du téléphone :
// chaque porte peut y mener, sans y obliger. Une partie échouée et le Diagnostic d'une table ont
// en plus « Envoyer un rapport aux développeurs » : un appui, le problème déjà connu (openSendReport).
//   - L'accueil : le tableau public des propositions, les plus demandées d'abord, par nature (onglets) ;
//     Start sur une proposition : son détail, où l'on vote. Puis « Proposer une idée », « Signaler un
//     problème » et le réglage des rapports de plantage automatiques.
//   - Le formulaire : la nature, le titre et la description (au clavier à l'écran ou au téléphone), le
//     rapport technique joint ou non ; les propositions proches s'affichent dès le titre écrit
//     (« Déjà proposé ? Votez plutôt »). « Publier » la rend publique tout de suite ; « Envoyer à
//     l'équipe seulement » n'en fait qu'un rapport privé.
//   - Au premier plantage : la question des rapports automatiques, retenue (core/feedback.ts).
// Le service : feedback-service.ts ; les textes publics sont masqués par le filtre de mots des salons.

import {
  crashDue,
  crashSignature,
  maskWords,
  noteCrashSent,
  PROPOSAL_KIND_VIEW,
  PROPOSAL_KINDS,
  PROPOSAL_STATUS_VIEW,
  PROPOSAL_TITLE_MAX,
  PROPOSAL_TITLE_MIN,
  cleanProposalText,
  cleanProposalTitle,
  formatDateTime,
  loadFeedbackState,
  saveFeedbackState,
  similarProposals,
  t,
  tn,
  type CrashConsent,
  type FeedbackState,
  type Proposal,
  type ProposalKind,
  type ReportEnvelope,
} from '@cyberpinball/core';
import type { FeedbackService } from './feedback-service';
import type { Action, Built, Row } from './library';

/** Ce que le formulaire sait déjà en venant d'un plantage ou de la fiche technique. */
export interface FeedbackContext {
  /** Ligne d'en-tête du formulaire (« Glass Lagoon · VPX arrêté : accès mémoire (0xC0000005) »). */
  about?: string;
  table?: string;
  /** Plantage : sa signature, rappelée dans le rapport. */
  signature?: string;
  /** Rapport technique joint d'office (fiche technique, plantage). */
  attach?: boolean;
  /** Description déjà écrite (« Décrire le problème » de la fiche technique). */
  text?: string;
}

/**
 * Ce que sait l'écran « Envoyer un rapport aux développeurs » : un problème vu par Cyber Pinball
 * (partie échouée, Diagnostic d'une table), envoyé en un appui, sans rien écrire.
 */
export interface DevReport {
  /** Ligne du problème (« Glass Lagoon · VPX arrêté : accès mémoire (0xC0000005) »). */
  about: string;
  table?: string;
  /** Regroupe les rapports d'un même problème (crashSignature). */
  signature: string;
  /** Constats joints (Diagnostic d'une table), une ligne chacun. */
  findings?: string[];
  /** Le rapport automatique de ce plantage est déjà parti : seule la description du joueur reste à envoyer. */
  notified?: boolean;
}

/**
 * Le rapport du Diagnostic d'une table : ses constats (titre et détail), ce qui vient d'être réparé, et
 * une signature qui regroupe les mêmes constats sur la même table.
 */
export function doctorReport(table: { id: string; title: string }, findings: readonly { code: string; title: string; detail?: string }[], repaired: readonly string[] = []): DevReport {
  const codes = [...new Set(findings.map((f) => f.code))].sort();
  return {
    about: [table.title, t('Diagnostic'), findings.length ? tn(findings.length, '{n} constat', '{n} constats') : t('Aucun problème détecté')].join(' · '),
    table: table.title,
    signature: crashSignature('diagnostic', codes.join('+') || 'aucun', table.id),
    findings: [...findings.map((f) => (f.detail ? `${f.title} : ${f.detail}` : f.title)), ...repaired.map((fix) => t('Réparé : {fix}', { fix }))],
  };
}

/** Ce qu'a fait un plantage (crashed) : question à poser, rapport parti, déjà parti aujourd'hui, ou envois refusés. */
export type CrashOutcome = 'ask' | 'sent' | 'known' | 'off';

/**
 * Ce qu'un plantage change sur l'écran de la partie échouée : la question des rapports automatiques à
 * poser en quittant, ou, le rapport parti, l'encart « L'équipe a été prévenue 👌 » sous l'erreur
 * (frontend.js) et le flipper qui n'ajoute plus que des détails.
 */
export function noteCrashOutcome(message: { report?: { consent?: boolean; notified?: boolean } }, outcome: CrashOutcome): void {
  if (!message.report) return;
  if (outcome === 'ask') message.report.consent = true;
  if (outcome === 'sent' || outcome === 'known') message.report.notified = true;
}

export interface FeedbackMenuContext {
  dataDir: string;
  service: FeedbackService;
  version: string;
  language(): string;
  openCustom(build: () => Built, at?: number): void;
  /** Lecture d'un écran faite à son ouverture, gardée pour les touches qui suivent (library.ts). */
  kept?<T>(key: string, read: () => T): T;
  openSystem(): void;
  prompt(heading: string, label: string, value: string, done: (value: string | undefined) => void, lead?: string): void;
  showing(build: () => Built): boolean;
  /** Le rapport technique de la fiche (ZIP anonymisé), avec ce texte en description. */
  techReport(text: string): Buffer | undefined;
  /** Le contenu du rapport, page de la fiche technique, avec son retour. */
  openReportContents?(back: () => void): void;
  log(line: string): void;
}

type Tab = 'all' | ProposalKind | 'mine';

interface Draft {
  kind: ProposalKind;
  title: string;
  text: string;
  attach: boolean;
  context: FeedbackContext;
  sending?: boolean;
}

export function createFeedbackMenu(ctx: FeedbackMenuContext) {
  let state: FeedbackState = loadFeedbackState(ctx.dataDir);
  let tab: Tab = 'all';
  let current: (() => Built) | undefined;

  const save = () => {
    try {
      saveFeedbackState(ctx.dataDir, state);
    } catch {
      // Données en lecture seule : le réglage reste en mémoire.
    }
  };

  /** Rouvre l'écran montré, s'il l'est encore, quand la liste change. */
  function changed(): void {
    if (current && ctx.showing(current)) ctx.openCustom(current);
  }

  function show(build: () => Built, at?: number): void {
    current = build;
    ctx.openCustom(build, at);
  }

  const consentLabel = (c: CrashConsent) => (c === 'yes' ? t('Oui') : c === 'no' ? t('Non') : t('Demander au prochain plantage'));

  // ---------- L'accueil : le tableau des propositions ----------

  function open(back: () => void = () => ctx.openSystem()): void {
    void ctx.service.refreshIfOld();
    const self = () => open(back);
    const build = (): Built => {
      const all = ctx.service.list();
      const net = ctx.service.net();
      const shown = all.filter((p) => (tab === 'all' ? true : tab === 'mine' ? p.mine || p.voted : p.kind === tab));
      const actions: Action[] = [];
      const rows: Row[] = shown.slice(0, 60).map((p) => {
        actions.push({ label: p.title, key: `feedback:${p.id}`, run: () => openProposal(p.id, self) });
        return proposalRow(p, actions.length - 1);
      });
      const tabs: Built['tabs'] = (['all', ...PROPOSAL_KINDS, 'mine'] as Tab[]).map((id) => {
        const n = all.filter((p) => (id === 'all' ? true : id === 'mine' ? p.mine || p.voted : p.kind === id)).length;
        actions.push({ label: tabLabel(id), key: `feedback-tab:${id}`, run: () => ((tab = id), self()) });
        return { label: tabLabel(id), count: String(n), current: tab === id, action: actions.length - 1 };
      });
      actions.push({ label: t('Proposer une idée'), detail: t('Amélioration ou nouvelle fonction · publique, les autres joueurs votent'), icon: 'plus', tone: 'ok', key: 'feedback:idea', run: () => openForm({ kind: 'feature', title: '', text: '', attach: false, context: {} }, self) });
      actions.push({ label: t('Signaler un problème'), detail: t('Ce qui ne marche pas · rapport technique joint, lu par l’équipe seule'), icon: 'alert', key: 'feedback:bug', run: () => openForm({ kind: 'bug', title: '', text: '', attach: true, context: {} }, self) });
      actions.push({
        label: t('Rapports de plantage automatiques'),
        detail: consentLabel(state.crashes),
        icon: 'report',
        key: 'feedback:auto',
        run: () => {
          setConsent(state.crashes === 'yes' ? 'no' : 'yes');
          self();
        },
      });
      actions.push({ label: t('Retour'), icon: 'back', run: back });
      // Rapports en attente (le dossier d'envoi relu) : à l'ouverture de l'écran, gardé pour les touches.
      const queued = ctx.kept ? ctx.kept('rapports-en-attente', () => ctx.service.queuedCount()) : ctx.service.queuedCount();
      return {
        heading: t('Retours et propositions'),
        icon: 'inbox',
        subheading:
          net === 'offline'
            ? t('Service injoignable : la liste reviendra quand la borne sera en ligne')
            : net === 'loading' && !all.length
              ? t('Lecture des propositions…')
              : tn(all.length, '{n} proposition · les plus demandées d’abord', '{n} propositions · les plus demandées d’abord'),
        lead: queued
          ? tn(queued, 'Votez pour ce qui compte pour vous : l’équipe commence par le plus demandé. {n} rapport attend la connexion pour partir.', 'Votez pour ce qui compte pour vous : l’équipe commence par le plus demandé. {n} rapports attendent la connexion pour partir.')
          : t('Votez pour ce qui compte pour vous : l’équipe commence par le plus demandé.'),
        hint: t('Flippers : choisir · Start : ouvrir, voter · Exit : revenir'),
        tabs,
        sections: rows.length
          ? [{ title: tab === 'mine' ? t('Proposées ou votées depuis cette borne') : t('Les plus demandées'), rows }]
          : [{ rows: [{ icon: 'info', text: net === 'offline' ? t('Pas de liste sans connexion') : tab === 'mine' ? t('Rien proposé ni voté d’ici pour l’instant') : t('Aucune proposition ici pour l’instant'), detail: t('« Proposer une idée » : la vôtre sera la première.'), tone: 'quiet' }] }],
        actions,
        back,
      };
    };
    show(build);
  }

  function tabLabel(id: Tab): string {
    if (id === 'all') return t('Toutes');
    if (id === 'mine') return t('Les miennes');
    return PROPOSAL_KIND_VIEW[id].label;
  }

  function proposalRow(p: Proposal, action?: number): Row {
    const status = PROPOSAL_STATUS_VIEW[p.status];
    return {
      ...(action !== undefined ? { action, pick: true } : {}),
      icon: PROPOSAL_KIND_VIEW[p.kind].icon,
      text: maskWords(p.title),
      detail: [PROPOSAL_KIND_VIEW[p.kind].label, p.merged ? tn(p.merged, '{n} doublon regroupé', '{n} doublons regroupés') : '', p.reply ? t('réponse de l’équipe') : ''].filter(Boolean).join(' · '),
      aside: tn(p.votes, '{n} vote', '{n} votes'),
      // L'état et le vote se lisent dans les badges : la couleur de la ligne reste au choix courant.
      badges: [...(p.status !== 'new' ? [status.label] : []), ...(p.voted ? [t('✓ Voté')] : [])],
    };
  }

  // ---------- Une proposition ----------

  function openProposal(id: string, back: () => void): void {
    const self = () => openProposal(id, back);
    show(() => {
      const p = ctx.service.list().find((x) => x.id === id);
      if (!p) return { heading: t('Proposition introuvable'), icon: 'alert', sections: [{ rows: [{ icon: 'info', text: t('Elle a été retirée ou regroupée avec une autre.'), tone: 'quiet' }] }], actions: [{ label: t('Retour'), icon: 'back', run: back }], back };
      const actions: Action[] = [];
      const canVote = ctx.service.canWrite();
      actions.push(
        p.voted
          ? { label: t('Retirer mon vote'), detail: tn(p.votes, '{n} vote, le vôtre compris', '{n} votes, le vôtre compris'), icon: 'close', key: 'feedback:unvote', run: () => void ctx.service.vote(p.id, false).then(self) }
          : canVote
            ? { label: t('Voter pour cette proposition'), detail: t('Une voix par borne · l’équipe commence par les plus demandées'), icon: 'check', tone: 'ok', key: 'feedback:vote', run: () => void ctx.service.vote(p.id, true).then(self) }
            : { label: t('Voter pour cette proposition'), detail: t('Indisponible : la borne n’a pas encore sa clé de joueur'), icon: 'check', tone: 'quiet', key: 'feedback:vote', run: self },
      );
      actions.push({ label: t('Retour'), icon: 'back', run: back });
      const status = PROPOSAL_STATUS_VIEW[p.status];
      const rows: Row[] = [];
      if (p.text) rows.push({ icon: 'edit', text: maskWords(p.text) });
      rows.push({ icon: 'info', text: t('État : {status}', { status: status.label }), detail: t('Proposée le {when}', { when: formatDateTime(p.at, { dateStyle: 'medium' }) }), ...(status.tone ? { tone: status.tone } : {}) });
      return {
        heading: maskWords(p.title),
        icon: PROPOSAL_KIND_VIEW[p.kind].icon,
        subheading: [PROPOSAL_KIND_VIEW[p.kind].label, tn(p.votes, '{n} vote', '{n} votes'), p.mine ? t('proposée depuis cette borne') : ''].filter(Boolean).join(' · '),
        sections: [{ rows }, ...(p.reply ? [{ title: t('Réponse de l’équipe'), rows: [{ icon: 'message' as const, text: maskWords(p.reply), tone: 'info' as const }] }] : [])],
        actions,
        back,
      };
    });
  }

  // ---------- Le formulaire ----------

  /** Le formulaire, d'où que l'on vienne (menu, plantage, fiche technique, téléphone). */
  function openForm(draft: Draft, back: () => void): void {
    void ctx.service.refreshIfOld();
    const self = () => openForm(draft, back);
    show(() => {
      const kindRows: Row[] = [];
      const actions: Action[] = [];
      for (const k of PROPOSAL_KINDS) {
        actions.push({ label: PROPOSAL_KIND_VIEW[k].label, key: `feedback-kind:${k}`, run: () => ((draft.kind = k), (draft.attach = k === 'bug' ? true : draft.attach), self()) });
        kindRows.push({ action: actions.length - 1, pick: true, icon: PROPOSAL_KIND_VIEW[k].icon, text: PROPOSAL_KIND_VIEW[k].label, detail: PROPOSAL_KIND_VIEW[k].lead, check: draft.kind === k ? 'on' : 'off', ...(draft.kind === k ? { current: true } : {}) });
      }
      const title = cleanProposalTitle(draft.title);
      const near = draft.title.trim() ? similarProposals(`${draft.title} ${draft.text}`, ctx.service.list()) : [];
      const nearRows: Row[] = near.map((p) => {
        actions.push({ label: p.title, key: `feedback-near:${p.id}`, run: () => openProposal(p.id, self) });
        return proposalRow(p, actions.length - 1);
      });
      actions.push({
        label: t('Titre'),
        detail: draft.title ? `« ${draft.title} »` : t('{min} à {max} caractères · au clavier ou au téléphone', { min: PROPOSAL_TITLE_MIN, max: PROPOSAL_TITLE_MAX }),
        icon: 'edit',
        key: 'feedback:title',
        ...(draft.title ? {} : { attention: true }),
        run: () =>
          ctx.prompt(t('Titre'), t('En une phrase'), draft.title, (value) => {
            if (value !== undefined) draft.title = value.replace(/\s+/g, ' ').trim().slice(0, PROPOSAL_TITLE_MAX);
            self();
          }, draft.kind === 'bug' ? t('Ce qui ne marche pas, en une phrase : « Le DMD reste noir sur Glass Lagoon ».') : t('Ce que vous aimeriez, en une phrase : « Trier les tables par fabricant ».')),
      });
      actions.push({
        label: t('Description'),
        detail: draft.text ? `« ${draft.text.length > 60 ? `${draft.text.slice(0, 60)}…` : draft.text} »` : t('Facultatif : les détails, depuis quand, sur quelle table'),
        icon: 'list',
        key: 'feedback:text',
        run: () =>
          ctx.prompt(t('Description'), t('Les détails'), draft.text, (value) => {
            if (value !== undefined) draft.text = cleanProposalText(value.slice(0, 2000)) ?? '';
            self();
          }, t('Visible de tous avec le titre. Ni nom, ni adresse, ni numéro de téléphone.')),
      });
      actions.push({
        label: t('Joindre le rapport technique'),
        detail: draft.attach ? t('Oui · privé, lu par l’équipe seule, anonymisé') : t('Non'),
        icon: 'report',
        key: 'feedback:attach',
        run: () => ((draft.attach = !draft.attach), self()),
      });
      if (draft.attach && ctx.openReportContents) actions.push({ label: t('Voir le contenu du rapport'), icon: 'eye', key: 'feedback:contents', run: () => ctx.openReportContents!(self) });
      const ready = Boolean(title) && !draft.sending;
      const why = draft.sending ? t('Envoi en cours…') : !title ? t('Indisponible : écrivez d’abord un titre ({min} caractères au moins)', { min: PROPOSAL_TITLE_MIN }) : !ctx.service.canWrite() ? t('Indisponible : la borne n’a pas encore sa clé de joueur') : undefined;
      actions.push({
        label: t('Publier'),
        detail: why ?? (near.length ? t('Visible de tous tout de suite · si l’une des propositions proches est la même, votez plutôt pour elle') : t('Visible de tous tout de suite · les autres joueurs pourront voter')),
        icon: 'upload',
        tone: ready && ctx.service.canWrite() ? 'ok' : 'quiet',
        key: 'feedback:publish',
        run: () => (ready && ctx.service.canWrite() ? void send(draft, true, back) : self()),
      });
      actions.push({
        label: t('Envoyer à l’équipe seulement'),
        detail: draft.sending ? t('Envoi en cours…') : draft.title || draft.text ? t('Privé : rien n’est publié') : t('Indisponible : écrivez d’abord un titre ou une description'),
        icon: 'lock',
        tone: (draft.title || draft.text) && !draft.sending ? undefined : 'quiet',
        key: 'feedback:private',
        run: () => ((draft.title || draft.text) && !draft.sending ? void send(draft, false, back) : self()),
      });
      actions.push({ label: t('Retour'), icon: 'back', run: back });
      const sections: Built['sections'] = [];
      if (draft.context.about) sections.push({ rows: [{ icon: 'alert', text: draft.context.about, detail: t('Rappelé dans le rapport'), tone: 'warning' }] });
      sections.push({ title: t('Nature'), options: true, rows: kindRows });
      if (nearRows.length) sections.push({ title: t('Déjà proposé ? Votez plutôt'), rows: nearRows });
      return {
        heading: draft.kind === 'bug' ? t('Signaler un problème') : t('Proposer une idée'),
        icon: draft.kind === 'bug' ? 'alert' : 'plus',
        subheading: t('Retours et propositions'),
        lead: t('Le titre et la description sont publics ; le rapport technique reste privé.'),
        hint: t('Flippers : choisir · Start : écrire, changer, envoyer · Exit : revenir'),
        sections,
        actions,
        back,
      };
    });
  }

  function envelope(draft: Draft, proposal?: string): ReportEnvelope {
    const text = [draft.title, draft.text].filter(Boolean).join('\n\n');
    return {
      v: 1,
      kind: 'report',
      ...(draft.context.signature ? { signature: draft.context.signature } : {}),
      ...(text ? { text } : {}),
      ...(proposal ? { proposal } : {}),
      ...(draft.context.table ? { table: draft.context.table } : {}),
      version: ctx.version,
      lang: ctx.language(),
      borne: state.borne,
      at: Date.now(),
    };
  }

  async function send(draft: Draft, publish: boolean, back: () => void): Promise<void> {
    draft.sending = true;
    changed();
    let id: string | undefined;
    let published: 'ok' | 'offline' | 'quota' | 'refused' | 'key' | undefined;
    if (publish) {
      const r = await ctx.service.propose(draft.kind, cleanProposalTitle(draft.title)!, cleanProposalText(draft.text) ?? '', ctx.language());
      published = r.ok ? 'ok' : r.why;
      id = r.ok ? r.id : undefined;
    }
    // Le rapport privé : demandé (joint), ou seul quand rien n'est publié.
    let report: 'sent' | 'queued' | 'failed' | undefined;
    if (draft.attach || !publish || published !== 'ok') {
      const zip = draft.attach ? ctx.techReport([draft.title, draft.text].filter(Boolean).join('\n\n')) : undefined;
      report = await ctx.service.sendReport(envelope(draft, id), zip);
    }
    draft.sending = false;
    openSent(draft, published, report, id, back);
  }

  function openSent(draft: Draft, published: string | undefined, report: string | undefined, id: string | undefined, back: () => void): void {
    const rows: Row[] = [];
    if (published === 'ok') rows.push({ icon: 'check', text: t('Proposition publiée'), detail: t('« {title} » · votre vote compte déjà', { title: draft.title }), tone: 'ok', badges: [t('✓ Publiée')] });
    else if (published === 'quota') rows.push({ icon: 'alert', text: t('Pas publiée : cinq propositions par jour au plus'), detail: t('Elle est partie à l’équipe en privé ; republiez-la demain si vous voulez que les autres votent.'), tone: 'warning' });
    else if (published) rows.push({ icon: 'alert', text: t('Pas publiée : le service ne répond pas'), detail: t('Elle part à l’équipe en privé dès que la borne est en ligne.'), tone: 'warning' });
    if (report === 'sent') rows.push({ icon: 'lock', text: draft.attach ? t('Rapport technique envoyé à l’équipe') : t('Message envoyé à l’équipe'), detail: t('Chiffré : seule l’équipe peut le lire'), tone: 'ok', badges: [t('✓ Envoyé')] });
    else if (report === 'queued') rows.push({ icon: 'clock', text: t('Envoi en attente'), detail: t('La borne n’est pas en ligne : il partira tout seul dès qu’elle le sera'), tone: 'info', badges: [t('En attente')] });
    else if (report === 'failed') rows.push({ icon: 'alert', text: t('Rapport non envoyé'), detail: t('Écriture impossible dans les données de la borne'), tone: 'error' });
    const home = () => open(back);
    show(() => ({
      heading: t('Merci !'),
      icon: 'check',
      subheading: t('Retours et propositions'),
      sections: [{ rows }],
      actions: [
        ...(id ? [{ label: t('Voir ma proposition'), icon: 'eye' as const, tone: 'ok' as const, run: () => openProposal(id, home) }] : []),
        { label: t('Toutes les propositions'), icon: 'inbox', ...(id ? {} : { tone: 'ok' as const }), run: home },
      ],
      // Le formulaire est derrière : Exit ramène au tableau, pas à un formulaire déjà envoyé.
      back: draft.context.signature ? back : home,
    }));
  }

  // ---------- Plantages ----------

  function setConsent(c: CrashConsent): void {
    state = { ...state, crashes: c };
    save();
    ctx.log(`Retours : rapports de plantage automatiques ${c === 'yes' ? 'acceptés' : c === 'no' ? 'refusés' : 'à demander'}.`); // i18n-ignore : journal
  }

  /**
   * Un plantage : parti tout de suite avec l'accord (une fois par jour pour un même plantage).
   * 'ask' : la question n'a jamais été posée (l'appelant la pose, askConsent) ; 'sent' et 'known' :
   * les développeurs ont le rapport (parti maintenant, ou déjà aujourd'hui) et l'écran le dit ;
   * 'off' : envois refusés, l'écran propose de l'envoyer quand même.
   */
  function crashed(signature: string, table: string | undefined, about: string): CrashOutcome {
    if (state.crashes === 'ask') return 'ask';
    if (state.crashes !== 'yes') return 'off';
    if (!crashDue(state, signature)) return 'known';
    state = noteCrashSent(state, signature);
    save();
    void ctx.service.sendReport({ v: 1, kind: 'crash', signature, text: about, ...(table ? { table } : {}), version: ctx.version, lang: ctx.language(), borne: state.borne, at: Date.now() }, ctx.techReport(about));
    return 'sent';
  }

  // ---------- Envoyer un rapport aux développeurs ----------

  /**
   * Un appui suffit : le problème est déjà connu (partie échouée, Diagnostic d'une table), le rapport
   * technique part avec lui ; une description reste possible, jamais exigée. Un plantage dont le
   * rapport automatique est déjà parti (`notified`) le dit, et n'envoie que la description.
   */
  function openSendReport(report: DevReport, back: () => void): void {
    let text = '';
    let sending = false;
    let result: 'sent' | 'queued' | 'failed' | undefined;
    const findings = report.findings ?? [];
    const send = async () => {
      sending = true;
      changed();
      const body = [report.about, ...findings.map((f) => `- ${f}`), ...(text ? ['', text] : [])].join('\n');
      const envelope: ReportEnvelope = { v: 1, kind: 'report', signature: report.signature, text: body, ...(report.table ? { table: report.table } : {}), version: ctx.version, lang: ctx.language(), borne: state.borne, at: Date.now() };
      // Déjà prévenus : le rapport technique est parti avec le rapport automatique, il ne repart pas.
      result = await ctx.service.sendReport(envelope, report.notified ? undefined : ctx.techReport(body));
      sending = false;
      // Envoyé à la main : un « Oui » à la question des rapports automatiques ne le renvoie pas aujourd'hui.
      if (result !== 'failed') {
        state = noteCrashSent(state, report.signature);
        save();
      }
      ctx.log(`Retours : rapport aux développeurs (${report.signature}) : ${result}.`); // i18n-ignore : journal
      changed();
    };
    const build = (): Built => {
      const head: Row[] = [{ icon: 'alert', text: report.about, tone: 'warning' }];
      if (report.notified) head.push({ icon: 'check', text: t('Les développeurs ont été prévenus de ce plantage'), detail: t('Le rapport automatique est parti : ils vont l’examiner. Ce que vous faisiez à ce moment les aidera.'), tone: 'ok', badges: [t('✓ Prévenus')] });
      const what: Row[] = report.notified
        ? [{ icon: 'edit', text: t('Votre description, ce plantage rappelé'), detail: t('Le rapport technique est déjà parti : il ne repart pas') }]
        : [
            ...(findings.length ? [{ icon: 'list' as const, text: t('Le diagnostic de la table'), detail: findings.slice(0, 3).join(' · ') + (findings.length > 3 ? ' …' : '') }] : []),
            { icon: 'report', text: t('La fiche technique, la santé de la borne et les journaux'), detail: t('Ce qu’envoie « Envoyer un rapport » de la fiche technique') },
          ];
      what.push({ icon: 'lock', text: t('Chiffré pour les développeurs, anonymisé'), detail: t('Ni votre nom, ni le nom du PC, ni adresse IP, ni noms d’amis'), tone: 'info' });
      const sections: Built['sections'] = [{ rows: head }];
      if (result === 'sent') sections.push({ rows: [{ icon: 'check', text: t('Rapport envoyé aux développeurs'), detail: t('Chiffré : seuls les développeurs peuvent le lire. Ils vont l’examiner.'), tone: 'ok', badges: [t('✓ Envoyé')] }] });
      else if (result === 'queued') sections.push({ rows: [{ icon: 'clock', text: t('Envoi en attente'), detail: t('La borne n’est pas en ligne : il partira tout seul dès qu’elle le sera'), tone: 'info', badges: [t('En attente')] }] });
      else if (result === 'failed') sections.push({ rows: [{ icon: 'alert', text: t('Rapport non envoyé'), detail: t('Écriture impossible dans les données de la borne'), tone: 'error' }] });
      else sections.push({ title: t('Ce qui part'), rows: what });
      const actions: Action[] = [];
      if (result === 'sent' || result === 'queued') actions.push({ label: t('Retour'), icon: 'back', tone: 'ok', run: back });
      else {
        const ready = !sending && (!report.notified || Boolean(text));
        actions.push({
          label: report.notified ? t('Envoyer ma description') : t('Envoyer le rapport'),
          detail: sending ? t('Envoi en cours…') : ready ? t('Aux développeurs · chiffré, anonymisé') : t('Indisponible : décrivez d’abord ce qui s’est passé'),
          icon: 'upload',
          tone: ready ? 'ok' : 'quiet',
          key: 'devreport:send',
          run: () => (ready ? void send() : show(build)),
        });
        actions.push({
          label: t('Décrire ce qui s’est passé'),
          detail: text ? `« ${text.length > 60 ? `${text.slice(0, 60)}…` : text} »` : t('Facultatif : ce que vous faisiez, depuis quand, ce que vous avez essayé'),
          icon: 'edit',
          key: 'devreport:text',
          ...(report.notified && !text ? { attention: true } : {}),
          run: () =>
            ctx.prompt(t('Description'), t('Les détails'), text, (value) => {
              if (value !== undefined) text = cleanProposalText(value.slice(0, 2000)) ?? '';
              show(build);
            }, t('Lue par les développeurs seuls. Ni nom, ni adresse, ni numéro de téléphone.')),
        });
        if (!report.notified && ctx.openReportContents) actions.push({ label: t('Voir le contenu du rapport'), icon: 'eye', key: 'devreport:contents', run: () => ctx.openReportContents!(() => show(build)) });
        actions.push({ label: t('Retour'), icon: 'back', run: back });
      }
      return {
        heading: report.notified ? t('Ajouter des détails pour les développeurs') : t('Envoyer un rapport aux développeurs'),
        icon: 'report',
        ...(report.table ? { subheading: report.table } : {}),
        lead: report.notified ? undefined : t('Un rapport anonymisé aide les développeurs à corriger ce problème pour tout le monde.'),
        hint: t('Flippers : choisir · Start : écrire, envoyer · Exit : revenir'),
        sections,
        actions,
        back,
      };
    };
    show(build);
  }

  /** La question du premier plantage. `then` : là où l'on va ensuite (le menu, la roue). */
  function askConsent(signature: string, table: string | undefined, about: string, then: () => void): void {
    const answer = (c: CrashConsent) => {
      setConsent(c);
      if (c === 'yes') crashed(signature, table, about);
      then();
    };
    show(() => ({
      heading: t('Envoyer les rapports de plantage ?'),
      icon: 'report',
      subheading: about,
      lead: t('Un rapport anonymisé aide l’équipe à corriger ce plantage pour tout le monde. La réponse est retenue ; elle se change dans Retours et propositions.'),
      sections: [
        {
          title: t('Ce qui part'),
          rows: [
            { icon: 'report', text: t('La fiche technique, la santé de la borne et les journaux'), detail: t('Ce qu’envoie « Envoyer un rapport » de la fiche technique') },
            { icon: 'lock', text: t('Chiffré pour l’équipe, anonymisé'), detail: t('Ni votre nom, ni le nom du PC, ni adresse IP, ni noms d’amis ; un même plantage une fois par jour au plus'), tone: 'info' },
          ],
        },
      ],
      actions: [
        { label: t('Oui, à chaque plantage'), icon: 'check', tone: 'ok', key: 'consent:yes', run: () => answer('yes') },
        { label: t('Non'), icon: 'close', key: 'consent:no', run: () => answer('no') },
        // Le retour du formulaire ramène à la question, encore sans réponse.
        { label: t('Décrire ce qui s’est passé'), detail: t('Le formulaire, avec ce plantage déjà rappelé'), icon: 'edit', key: 'consent:describe', run: () => openForm({ kind: 'bug', title: '', text: '', attach: true, context: { about, table, signature, attach: true } }, () => askConsent(signature, table, about, then)) },
        ...(ctx.openReportContents ? [{ label: t('Voir le contenu du rapport'), icon: 'eye' as const, key: 'consent:contents', run: () => ctx.openReportContents!(() => askConsent(signature, table, about, then)) }] : []),
      ],
      back: then,
    }));
  }

  return {
    open,
    /** Le formulaire directement (plantage, fiche technique, téléphone) ; `kind` : la nature proposée. */
    openForm: (context: FeedbackContext, back: () => void, kind: ProposalKind = 'bug') => openForm({ kind, title: '', text: context.text ?? '', attach: context.attach ?? kind === 'bug', context }, back),
    crashed,
    askConsent,
    /** « Envoyer un rapport aux développeurs » : écran d'une partie échouée, Diagnostic d'une table. */
    openSendReport,
    consent: () => state.crashes,
    detail: () => {
      const n = ctx.service.list().length;
      return n ? tn(n, 'Votez et proposez · {n} proposition', 'Votez et proposez · {n} propositions') : t('Votez pour les idées des joueurs, proposez les vôtres, signalez un problème');
    },
    changed,
  };
}

export type FeedbackMenu = ReturnType<typeof createFeedbackMenu>;
