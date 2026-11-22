// Menu système > Communauté > Mon profil > Mon compte (18/11/2026) : tout ce qui est « moi » et de quoi retrouver son compte
// ailleurs. Un joueur avait perdu son niveau et ses XP en réinstallant Cyber Pinball : le compte
// n'existait que dans le dossier de la borne. Entrées de la rubrique fournies ici :
// - « Protéger et transférer mon compte » : copie de secours sur ce PC (toujours), code de
//   récupération (24 mots et leur QR, vérifié par ses trois premiers mots choisis dans l'ordre), mot de passe facultatif (le pseudo sert
//   d'identifiant), copie chiffrée sur le serveur, et « Reprendre un compte sur cette borne » ;
// - « Mon pseudo », « Mon pays », « Ce que voient les autres » (profil public, scores publiés,
//   présence), « Supprimer mon compte » (l'écran de friends-menu.ts) ;
// - la reprise d'un compte, aussi ouverte par « J'ai déjà un compte » au premier lancement
//   (profile-welcome.ts) : copie de secours de ce PC, code, pseudo et mot de passe, sauvegarde.
// Mon avatar, Mes badges et Mon profil public restent fournis par leurs modules.
//
// Sans electron à l'exécution : les tests du cœur chargent ce module avec un service en mémoire.

import {
  accountSummary,
  avatarView,
  countryCodes,
  countryName,
  flagView,
  formatDate,
  locale,
  NAME_MAX,
  NAME_MIN,
  parseRecoveryText,
  passwordProblem,
  passwordStrength,
  playerId,
  recoveryCheckChoices,
  recoveryQrText,
  RECOVERY_CHECK_COUNT,
  RECOVERY_WORD_COUNT,
  t,
  tn,
  type AccountBundle,
  type AccountCopy,
  type AccountSummary,
  type RecoveryProblem,
} from '@cyberpinball/core';
import type { AccountService, OpenResult } from './account-service';
import { onGesture } from './gesture-flash';
import type { Action, Built, ProvidedSystemItem, PromptOptions, Row, Section } from './library';

export interface AccountMenuHost {
  library: {
    openCustom(build: () => Built, at?: number): void;
    openPrompt(heading: string, label: string, value: string, done: (value: string | undefined) => void, lead?: string, options?: PromptOptions): void;
    runSystemItem(id: string, back: () => void): void;
    /** Le menu système, là où il était : le « Retour » des entrées de la rubrique. */
    openSystem(): void;
  };
  net: {
    state(): { key: { publicKey: string }; name: string; avatar?: string; badges: unknown[]; friends: unknown[]; shareScores?: boolean; publicProfile?: boolean; publicPresence?: boolean; friendsVisibility?: 'friends' | 'private'; country?: string };
    rename(name: string): boolean;
    avatarFile(key: string): string | undefined;
    country(): string | undefined;
    setCountry(code: string | undefined): void;
    setShareScores(on: boolean): void;
    setPublicProfile(on: boolean): void;
    setPublicPresence(on: boolean): void;
  setFriendsVisibility(v: 'public' | 'friends' | 'private'): void;
  };
  service: AccountService;
  /** Niveau du joueur : niveau, XP. */
  level(): { level: number; xp: number };
  /** « Supprimer mon compte » (friends-menu.ts), son « Annuler » vers `back`. */
  openDelete(back: () => void): void;
  /** Pose le paquet (fichiers du compte d'avant effacés, écritures gelées) et redémarre Cyber Pinball. */
  apply(bundle: AccountBundle): Promise<void>;
  now?(): Date;
}

export interface AccountMenu {
  items: {
    account: ProvidedSystemItem;
    'player-name': ProvidedSystemItem;
    country: ProvidedSystemItem;
    'account-privacy': ProvidedSystemItem;
    'account-delete': ProvidedSystemItem;
  };
  /** « Reprendre un compte sur cette borne », son « Retour » vers `back`. */
  openRestore(back: () => void): void;
  /** Le compte trouvé sur ce PC au premier lancement : sa confirmation, son « Annuler » vers `back`. */
  openCopy(copy: AccountCopy, back: () => void): void;
  /** Le code est-il encore à noter (pastille de la rubrique) ? */
  attention(): boolean;
}

/** Mots par ligne de l'écran du code : 24 mots, six lignes. */
const WORDS_PER_ROW = 4;

export function createAccountMenu(host: AccountMenuHost): AccountMenu {
  const now = () => host.now?.() ?? new Date();
  const svc = host.service;
  const me = () => host.net.state();
  let flash: Row | undefined;
  onGesture(() => (flash = undefined));
  const flashSections = (): Section[] => (flash ? [{ rows: [flash] }] : []);
  const backAction = (run: () => void): Action => ({ label: t('Retour'), icon: 'back', run });
  const myAvatar = () => avatarView(me().key.publicKey, me().name, host.net.avatarFile(me().key.publicKey));
  const day = (iso: string) => formatDate(new Date(iso));

  // ---------- Protéger et transférer ----------

  function protectRows(): Row[] {
    const p = svc.protection();
    const vault = svc.vaultState();
    const rows: Row[] = [
      { text: t('Copie de secours sur ce PC'), detail: t('Hors du dossier de Cyber Pinball : reprise d’office s’il est réinstallé ici, même ailleurs'), tone: 'ok', badges: [t('Active')], icon: 'drive' },
      p.codeNotedAt
        ? { text: t('Code de récupération : noté'), detail: t('Le {date} · 24 mots qui redonnent votre compte sur n’importe quel PC', { date: day(p.codeNotedAt) }), tone: 'ok', badges: [t('Noté')], icon: 'lock' }
        : { text: t('Code de récupération : pas encore noté'), detail: t('24 mots à noter, ou leur QR à photographier : ils redonnent votre compte sur n’importe quel PC'), tone: 'warning', badges: [t('À noter')], icon: 'lock' },
      p.password
        ? { text: t('Mot de passe : identifiant {name}', { name: p.password.name }), detail: t('Créé le {date} · retrouver son compte avec son pseudo et ce mot de passe', { date: day(p.password.at) }), tone: 'ok', badges: [t('Actif')], icon: 'unlock' }
        : { text: t('Mot de passe : aucun'), detail: svc.online() ? t('Facultatif : retrouver son compte avec son pseudo et un mot de passe') : t('Indisponible : service du compte injoignable'), tone: 'quiet', icon: 'unlock' },
    ];
    if (p.codeNotedAt || p.password) {
      rows.push(
        vault === 'off'
          ? { text: t('Copie chiffrée sur le serveur : coupée'), detail: t('Le code ne redonnera que la clé : ni amis, ni niveau, ni badges'), tone: 'warning', badges: [t('Coupée')], icon: 'upload' }
          : vault === 'offline'
            ? { text: t('Copie chiffrée sur le serveur : pas à jour'), detail: t('Service injoignable : nouvel essai tout seul'), tone: 'warning', badges: [t('En attente')], icon: 'upload' }
            : { text: t('Copie chiffrée sur le serveur'), detail: p.vaultSent ? t('À jour le {date} · le serveur ne peut pas l’ouvrir : seuls votre code ou votre mot de passe l’ouvrent', { date: day(p.vaultSent.at) }) : t('Envoi en cours'), tone: 'ok', badges: [p.vaultSent ? t('À jour') : t('Envoi')], icon: 'upload' },
      );
    }
    return rows;
  }

  function buildProtect(): Built {
    const p = svc.protection();
    const actions: Action[] = [
      p.codeNotedAt
        ? { label: t('Revoir mon code de récupération…'), detail: t('Affiché à l’abri des regards'), icon: 'lock', key: 'code', run: () => openCode() }
        : { label: t('Noter mon code de récupération…'), detail: t('24 mots et leur QR, à l’abri des regards'), icon: 'lock', tone: 'ok', key: 'code', run: () => openCode() },
      p.password
        ? { label: t('Changer de mot de passe…'), detail: t('Identifiant {name}', { name: p.password.name }), icon: 'unlock', key: 'password', run: () => askPassword() }
        : { label: t('Créer un mot de passe…'), detail: svc.online() ? t('Votre pseudo devient votre identifiant') : t('Indisponible : service du compte injoignable'), icon: 'unlock', key: 'password', ...(svc.online() ? {} : { tone: 'quiet' as const }), run: () => (svc.online() ? askPassword() : undefined) },
    ];
    if (p.password) actions.push({ label: t('Retirer le mot de passe'), detail: t('Le code de récupération reste'), icon: 'close', key: 'password-off', run: () => void removePassword() });
    if (p.codeNotedAt || p.password) {
      actions.push(
        svc.vaultState() === 'off'
          ? { label: t('Garder une copie chiffrée sur le serveur'), detail: t('Pour retrouver amis, niveau et badges avec le code ou le mot de passe'), icon: 'upload', key: 'vault', run: () => { svc.setVault(true); flash = { text: t('Copie chiffrée gardée sur le serveur'), tone: 'ok' }; reopenProtect(); } }
          : { label: t('Ne plus garder de copie chiffrée sur le serveur'), detail: p.password ? t('Le mot de passe sera retiré aussi') : t('Le code ne redonnera plus que la clé'), icon: 'upload', key: 'vault', run: () => void vaultOff() },
      );
    }
    actions.push(
      { label: t('Reprendre un compte sur cette borne…'), detail: t('Code, mot de passe, copie de ce PC ou sauvegarde'), icon: 'restore', key: 'restore', run: () => openRestore(reopenProtect) },
      { label: t('Sauvegardes'), detail: t('« Réglages et scores » contient aussi votre compte'), icon: 'drive', key: 'backups', run: () => host.library.runSystemItem('backups', reopenProtect) },
      backAction(protectBack),
    );
    return {
      heading: t('Protéger et transférer mon compte'),
      icon: 'lock',
      avatar: myAvatar(),
      subheading: t('{name} · niveau {level}', { name: me().name, level: host.level().level }),
      lead: t('Votre compte n’existe que sur cette borne : notez votre code de récupération pour le retrouver sur un autre PC ou après une réinstallation.'),
      sections: [...flashSections(), { rows: protectRows() }],
      actions,
      back: protectBack,
    };
  }

  let protectBack: () => void = () => host.library.openSystem();
  const reopenProtect = (at?: number) => host.library.openCustom(buildProtect, at ?? 0);
  // Un retour et son action sont la même fonction : le libellé dit alors où il mène (« Retour : Mon compte »).
  const toProtect = () => reopenProtect();
  function openProtect(back: () => void): void {
    protectBack = back;
    reopenProtect();
  }

  async function vaultOff(): Promise<void> {
    if (svc.protection().password) await svc.removePassword();
    svc.setVault(false);
    flash = { text: t('Plus de copie chiffrée sur le serveur'), tone: 'ok' };
    reopenProtect();
  }

  async function removePassword(): Promise<void> {
    const r = await svc.removePassword();
    flash = r.ok ? { text: t('Mot de passe retiré'), tone: 'ok' } : { text: t('Mot de passe pas retiré : service du compte injoignable'), tone: 'error' };
    reopenProtect();
  }

  // ---------- Le code ----------

  function openCode(): void {
    const words = svc.words();
    const rows: Row[] = [];
    for (let i = 0; i < words.length; i += WORDS_PER_ROW) rows.push({ text: words.slice(i, i + WORDS_PER_ROW).map((w, k) => `${i + k + 1} ${w}`).join('  ·  '), icon: 'lock' });
    const qr = { url: recoveryQrText(words), title: t('Le même code en QR'), caption: t('24 mots, en texte : aucune adresse'), hint: t('Photographiez-le avec votre téléphone. Pour reprendre le compte, l’appareil photo du téléphone le lit et colle les mots.') };
    host.library.openCustom(
      () => ({
        heading: t('Votre code de récupération'),
        icon: 'lock',
        subheading: t('{name} · 24 mots, dans l’ordre', { name: me().name }),
        lead: t('Notez ces mots sur papier, ou photographiez le QR avec votre téléphone. Quiconque les a peut prendre votre compte : ne les partagez jamais.'),
        sections: [
          { title: t('Les 24 mots'), rows },
          { rows: [{ text: t('Le code ne quitte jamais cette borne'), detail: t('Cyber Pinball ne peut pas le retrouver pour vous : gardez-le à l’abri'), icon: 'info' }] },
        ],
        actions: [
          { label: t('Je l’ai noté'), detail: t('Vous choisirez ses trois premiers mots, dans l’ordre'), icon: 'check', tone: 'ok', qr, run: () => verifyCode() },
          { label: t('Plus tard'), detail: t('Mon compte le rappellera'), icon: 'clock', qr, run: () => reopenProtect() },
        ],
        back: toProtect,
      }),
      0,
    );
  }

  /**
   * Les trois premiers mots, mélangés, remis dans l'ordre aux flippers (19/11/2026 : deux mots au
   * hasard à taper demandaient le clavier). Chaque mot choisi prend son numéro dans sa case ; le
   * troisième choisi, tout est jugé d'un coup : juste, le code est noté et le coffre part ; faux, on
   * recommence, sans dire quel mot était faux (sinon on trouverait l'ordre à tâtons).
   */
  function verifyCode(): void {
    const words = svc.words();
    const choices = recoveryCheckChoices(words);
    let picked: number[] = [];
    const restart = (error?: Row) => {
      picked = [];
      flash = error;
      host.library.openCustom(build, 0);
    };
    const pick = (i: number) => {
      // Le dernier mot choisi se rechoisit pour l'enlever ; les autres restent à leur place.
      if (picked.at(-1) === i) picked.pop();
      else if (!picked.includes(i)) picked.push(i);
      if (picked.length < RECOVERY_CHECK_COUNT) return host.library.openCustom(build);
      if (picked.every((c, n) => choices[c] === words[n])) {
        svc.noteCode();
        flash = { text: t('Code de récupération noté : votre compte est protégé'), tone: 'ok' };
        return reopenProtect();
      }
      restart({ text: t('Ce ne sont pas les trois premiers mots dans l’ordre : revoyez le code et recommencez'), tone: 'error' });
    };
    // Exit et « Quitter » sont la même fonction : le bouton de retour en tête le dit aussi.
    const quit = () => openCode();
    const build = (): Built => {
      const next = picked.length + 1;
      const actions: Action[] = choices.map((w, i) => ({ label: w, key: `word-${i}`, run: () => pick(i) }));
      const rows: Row[] = choices.map((w, i) => {
        const rank = picked.indexOf(i) + 1;
        return { text: w, action: i, pick: true, check: rank ? 'on' : 'off', checkRank: rank || next, ...(rank ? { current: true } : {}) };
      });
      actions.push(
        { label: t('Recommencer'), detail: t('Tous les mots décochés'), icon: 'restore', key: 'restart', ...(picked.length ? {} : { tone: 'quiet' as const }), run: () => restart() },
        { label: t('Quitter'), detail: t('Revoir le code'), icon: 'back', key: 'quit', run: quit },
      );
      return {
        heading: t('Vérifier le code'),
        icon: 'lock',
        subheading: t('Mot n° {n} sur {count}', { n: Math.min(next, RECOVERY_CHECK_COUNT), count: RECOVERY_CHECK_COUNT }),
        lead: t('Choisissez les trois premiers mots de votre code, dans l’ordre : le mot n° 1, puis le 2, puis le 3. Son numéro s’inscrit dans la case.'),
        sections: [...flashSections(), { title: t('Mots proposés'), options: true, rows }],
        actions,
        back: quit,
      };
    };
    flash = undefined;
    host.library.openCustom(build, 0);
  }

  // ---------- Mot de passe ----------

  function askPassword(): void {
    const login = me().name;
    host.library.openPrompt(
      t('Créer un mot de passe'),
      t('Votre mot de passe'),
      '',
      (first) => {
        if (first === undefined) return reopenProtect();
        const problem = passwordProblem(first);
        if (problem) {
          flash = { text: problem === 'short' ? t('Mot de passe trop court : au moins 8 caractères') : t('Mot de passe trop long'), tone: 'error' };
          return reopenProtect(1);
        }
        host.library.openPrompt(t('Créer un mot de passe'), t('Le même, encore une fois'), '', (second) => {
          if (second === undefined) return reopenProtect();
          if (second !== first) {
            flash = { text: t('Les deux mots de passe ne sont pas les mêmes'), tone: 'error' };
            return reopenProtect(1);
          }
          reviewPassword(login, first);
        }, t('Retapez-le pour être sûr qu’il est bien celui que vous voulez.'), { secret: true });
      },
      t('Identifiant : {name}. Au moins 8 caractères. Le serveur ne le connaît pas et ne peut pas le retrouver : sans lui, seul votre code de récupération vous rendra votre compte.', { name: login }),
      { secret: true },
    );
  }

  function reviewPassword(login: string, password: string): void {
    const strength = passwordStrength(password);
    const strengthText = strength === 'strong' ? t('Solide') : strength === 'fair' ? t('Correct') : t('Faible');
    let busy = false;
    const save = async () => {
      if (busy) return;
      busy = true;
      host.library.openCustom(() => ({ heading: t('Créer un mot de passe'), icon: 'unlock', sections: [{ rows: [{ text: t('Envoi au serveur…'), detail: t('Votre compte part chiffré : le serveur ne peut pas l’ouvrir'), icon: 'clock' }] }], actions: [{ label: t('Patientez…'), tone: 'quiet', run: () => undefined }], back: () => undefined }), 0);
      const r = await svc.setPassword(password, login);
      flash = r.ok
        ? { text: t('Mot de passe créé : identifiant {name}', { name: login }), tone: 'ok' }
        : r.why === 'taken'
          ? { text: t('L’identifiant {name} est déjà pris : changez de pseudo, puis recommencez', { name: login }), tone: 'error' }
          : r.why === 'offline'
            ? { text: t('Mot de passe pas créé : service du compte injoignable'), tone: 'error' }
            : { text: t('Mot de passe refusé par le service'), tone: 'error' };
      reopenProtect(1);
    };
    host.library.openCustom(
      () => ({
        heading: t('Créer un mot de passe'),
        icon: 'unlock',
        avatar: myAvatar(),
        subheading: t('Identifiant : {name}', { name: login }),
        lead: t('Votre compte est chiffré sur cette borne avec votre mot de passe, puis gardé sur le serveur de Cyber Pinball. Le serveur ne peut pas l’ouvrir, et ne connaît pas votre mot de passe.'),
        sections: [
          {
            rows: [
              { text: t('Identifiant : {name}', { name: login }), detail: t('Votre pseudo, sans tenir compte des majuscules ; réservé pour vous'), icon: 'friend-list' },
              { text: t('Mot de passe : {dots}', { dots: '●'.repeat(Math.min(16, [...password].length)) }), detail: tn([...password].length, '{n} caractère', '{n} caractères'), tone: strength === 'weak' ? 'warning' : 'ok', badges: [strengthText], icon: 'lock' },
              { text: t('Mot de passe oublié : pas de réinitialisation'), detail: t('Aucune adresse e-mail n’est demandée : seul votre code de récupération vous sauvera'), tone: 'warning', icon: 'alert' },
            ],
          },
        ],
        actions: [
          { label: t('Enregistrer'), detail: t('Chiffré ici, puis envoyé au serveur'), icon: 'check', tone: 'ok', run: () => void save() },
          { label: t('Changer le mot de passe…'), icon: 'edit', run: () => askPassword() },
          backAction(toProtect),
        ],
        back: toProtect,
      }),
      0,
    );
  }

  // ---------- Reprendre un compte ----------

  let restoreBack: () => void = () => undefined;
  const reopenRestore = (at = 0) => host.library.openCustom(buildRestore, at);
  const toRestore = () => reopenRestore();
  const toRestoreBack = () => restoreBack();
  function openRestore(back: () => void): void {
    restoreBack = back;
    reopenRestore();
  }

  function otherCopies(): AccountCopy[] {
    return svc.copies().filter((c) => c.summary.key !== me().key.publicKey);
  }

  function buildRestore(): Built {
    const copies = otherCopies();
    const actions: Action[] = [
      { label: t('Avec mon code de récupération…'), detail: t('Les 24 mots, tapés ou collés depuis le téléphone'), icon: 'lock', tone: 'ok', run: () => askWords('') },
      { label: t('Avec mon pseudo et mon mot de passe…'), detail: svc.online() ? t('Il faut Internet') : t('Indisponible : service du compte injoignable'), icon: 'unlock', ...(svc.online() ? {} : { tone: 'quiet' as const }), run: () => (svc.online() ? askLogin() : undefined) },
      { label: t('Depuis une sauvegarde…'), detail: t('Clé USB, disque ou lecteur réseau : « Restaurer une sauvegarde »'), icon: 'usb', run: () => host.library.runSystemItem('backups', () => reopenRestore(2)) },
      ...(copies.length
        ? copies.map((c) => ({ label: t('Copie de ce PC : {name}', { name: c.summary.name }), detail: copyDetail(c.summary), icon: 'drive' as const, key: `copy-${c.summary.key}`, run: () => openCopy(c, () => reopenRestore()) }))
        : [{ label: t('Copie de secours de ce PC'), detail: t('Indisponible : aucun autre compte sur ce PC'), icon: 'drive' as const, tone: 'quiet' as const, run: () => undefined }]),
      backAction(toRestoreBack),
    ];
    return {
      heading: t('Reprendre un compte'),
      icon: 'restore',
      lead: t('Le compte repris remplacera celui de cette borne. Rien ne change avant votre confirmation.'),
      sections: flashSections(),
      actions,
      back: toRestoreBack,
    };
  }

  const copyDetail = (s: AccountSummary) => t('Niveau {level} · {badges} · {friends} · copie du {date}', { level: s.level, badges: tn(s.badges, '{n} badge', '{n} badges'), friends: tn(s.friends, '{n} ami', '{n} amis'), date: day(s.at) });

  function problemText(p: RecoveryProblem): string {
    if (p.kind === 'count') return t('{n} mots sur 24 : continuez', { n: p.count });
    if (p.kind === 'unknown') return t('Le mot n° {n} « {word} » n’est pas dans la liste : vérifiez-le', { n: p.position, word: p.word });
    return t('Un mot est faux ou deux sont inversés : vérifiez le code');
  }

  /** Les 24 mots : tapés au clavier à l'écran, ou collés d'un coup par le téléphone (le QR lu). */
  function askWords(value: string): void {
    host.library.openPrompt(
      t('Saisir le code de récupération'),
      t('Les 24 mots, dans l’ordre'),
      value,
      (text) => {
        if (!text?.trim()) return reopenRestore();
        const words = parseRecoveryText(text);
        if (words.length < RECOVERY_WORD_COUNT) {
          flash = { text: problemText({ kind: 'count', count: words.length }), tone: 'warning' };
          return openWordsProgress(words);
        }
        void open(() => svc.openWithWords(words), () => askWords(words.join(' ')));
      },
      t('Séparez les mots par des espaces. Avec le téléphone : visez le QR du code avec son appareil photo, copiez le texte, collez-le ici.'),
    );
  }

  function openWordsProgress(words: string[]): void {
    host.library.openCustom(
      () => ({
        // Pas le titre de l'écran du code : le parcours (backtrail.ts) reconnaît un écran à son titre.
        heading: t('Saisir le code de récupération'),
        icon: 'lock',
        subheading: t('{n} mots sur 24', { n: words.length }),
        sections: [...flashSections(), ...(words.length ? [{ title: t('Déjà tapés'), rows: chunk(words).map((ws, i) => ({ text: ws.map((w, k) => `${i * WORDS_PER_ROW + k + 1} ${w}`).join('  ·  '), icon: 'check' as const, tone: 'ok' as const })) }] : [])],
        actions: [
          { label: t('Continuer à taper…'), detail: t('Au clavier à l’écran ou avec votre téléphone'), icon: 'keyboard', tone: 'ok', run: () => askWords(words.join(' ') + (words.length ? ' ' : '')) },
          backAction(toRestore),
        ],
        back: toRestore,
      }),
      0,
    );
  }

  const chunk = (words: string[]) => Array.from({ length: Math.ceil(words.length / WORDS_PER_ROW) }, (_, i) => words.slice(i * WORDS_PER_ROW, (i + 1) * WORDS_PER_ROW));

  function askLogin(): void {
    host.library.openPrompt(t('Reprendre un compte'), t('Identifiant (votre pseudo)'), '', (login) => {
      if (!login?.trim()) return reopenRestore(1);
      host.library.openPrompt(
        t('Reprendre un compte'),
        t('Votre mot de passe'),
        '',
        (password) => {
          if (!password) return reopenRestore(1);
          void open(() => svc.openWithPassword(login, password), () => askLogin());
        },
        t('Le mot de passe du compte {name}.', { name: login }),
        { secret: true },
      );
    });
  }

  /** Cherche le compte (coffre), en attendant ; puis la confirmation, ou ce qui ne va pas. */
  async function open(find: () => Promise<OpenResult>, retry: () => void): Promise<void> {
    host.library.openCustom(() => ({ heading: t('Reprendre un compte'), icon: 'restore', sections: [{ rows: [{ text: t('Recherche de votre compte…'), detail: t('Votre copie chiffrée, sur le serveur de Cyber Pinball'), icon: 'clock' }] }], actions: [{ label: t('Patientez…'), tone: 'quiet', run: () => undefined }], back: () => undefined }), 0);
    const r = await find();
    if (r.ok) return confirm(r.bundle, r.from, () => reopenRestore());
    const text =
      r.why === 'words'
        ? problemText(r.problem)
        : r.why === 'wrong'
          ? t('Mot de passe faux')
          : r.why === 'unknown'
            ? t('Aucun compte avec cet identifiant et un mot de passe')
            : r.why === 'tries'
              ? t('Trop d’essais : réessayez dans une heure, ou prenez votre code de récupération')
              : r.why === 'damaged'
                ? t('Copie chiffrée illisible : prenez une sauvegarde ou la copie de ce PC')
                : t('Service du compte injoignable : vérifiez Internet, ou prenez votre code de récupération');
    host.library.openCustom(
      () => ({
        heading: t('Reprendre un compte'),
        icon: 'restore',
        sections: [{ rows: [{ text, tone: 'error', icon: 'alert' }] }],
        actions: [
          { label: t('Réessayer…'), icon: 'refresh', tone: 'ok', run: retry },
          backAction(toRestore),
        ],
        back: toRestore,
      }),
      0,
    );
  }

  function openCopy(copy: AccountCopy, back: () => void): void {
    confirm(copy.bundle, 'copy', back);
  }

  /** Ce qui revient, ce qui est remplacé ; le curseur sur « Annuler ». */
  function confirm(bundle: AccountBundle, from: 'vault' | 'key' | 'copy', back: () => void): void {
    const s = accountSummary(bundle);
    if (!s) return back();
    const current = me();
    const same = s.key === current.key.publicKey;
    const replaced: Row[] = same
      ? [{ text: t('C’est déjà le compte de cette borne'), detail: t('Le reprendre remet son état de la copie'), tone: 'info', icon: 'info' }]
      : [
          {
            text: t('Le compte « {name} » de cette borne', { name: current.name }),
            detail: current.friends.length || host.level().xp > 0 ? t('Niveau {level} · {friends} : notez d’abord son code s’il compte pour vous', { level: host.level().level, friends: tn(current.friends.length, '{n} ami', '{n} amis') }) : t('Sans partie ni ami'),
            tone: current.friends.length || host.level().xp > 0 ? 'warning' : 'quiet',
            icon: 'trash',
          },
        ];
    const back_ = (row: Row) => row;
    host.library.openCustom(
      () => ({
        heading: t('Reprendre le compte de {name} ?', { name: s.name }),
        icon: 'restore',
        subheading: t('Identifiant {id}', { id: playerId(s.key) }),
        sections: [
          {
            title: t('Revient sur cette borne'),
            rows:
              from === 'key'
                ? [
                    back_({ text: t('Votre clé de joueur : vos amis vous reconnaissent'), detail: t('Pas de copie chiffrée sur le serveur : ni pseudo, ni amis, ni niveau, ni badges ; choisissez votre pseudo ensuite'), tone: 'warning', icon: 'account' }),
                  ]
                : [
                    { text: t('Pseudo {name} et son avatar', { name: s.name }), icon: 'account' },
                    { text: t('Niveau {level}, {xp} XP et {badges}', { level: s.level, xp: s.xp, badges: tn(s.badges, '{n} badge', '{n} badges') }), icon: 'medal' },
                    { text: tn(s.friends, '{n} ami', '{n} amis'), detail: t('Ils vous reconnaissent : rien à redemander'), icon: 'friends' },
                    { text: t('Les scores de vos tables restent sur l’autre borne'), detail: t('Une sauvegarde « Réglages et scores » les ramène'), tone: 'quiet', icon: 'trophy' },
                  ],
          },
          { title: t('Remplacé'), rows: replaced },
        ],
        actions: [
          { label: t('Reprendre le compte de {name}', { name: s.name }), detail: t('Cyber Pinball redémarre avec ce compte'), icon: 'restore', tone: 'ok', run: () => void host.apply(bundle) },
          { label: t('Annuler'), icon: 'close', run: back },
        ],
        back,
      }),
      1,
    );
  }

  // ---------- Pseudo, pays, ce que voient les autres ----------

  const itemBack = () => host.library.openSystem();

  function askName(back: () => void): void {
    host.library.openPrompt(t('Mon pseudo'), t('Pseudo'), me().name, (value) => {
      if (value !== undefined && !host.net.rename(value)) flash = { text: t('Pseudo refusé : {min} à {max} lettres, chiffres, espaces, tirets ou points', { min: NAME_MIN, max: NAME_MAX }), tone: 'error' };
      else if (value !== undefined) flash = { text: t('Pseudo changé : vos amis et l’annuaire le reçoivent'), tone: 'ok' };
      back();
    }, t('De {min} à {max} caractères : lettres, chiffres, espaces, tirets ou points.', { min: NAME_MIN, max: NAME_MAX }));
  }

  /** Le pays : celui de Windows d'abord, puis tous, par ordre alphabétique. */
  function openCountry(back: () => void): void {
    const codes = countryCodes(locale());
    const current = host.net.country();
    const choose = (code: string | undefined) => {
      host.net.setCountry(code);
      back();
    };
    host.library.openCustom(
      () => ({
        heading: t('Mon pays'),
        icon: 'globe',
        lead: t('Il accompagne vos scores : il vous place au classement national, et se voit à côté de votre nom.'),
        sections: [],
        actions: [
          { label: t('D’après la région de Windows'), detail: t('Le pays réglé dans Windows, s’il se lit'), icon: 'refresh', key: 'windows', run: () => choose(undefined) },
          ...codes.map((code) => ({ label: countryName(code, locale()), flag: flagView(code, locale()), detail: code === current ? t('choix actuel') : undefined, tone: code === current ? ('ok' as const) : undefined, key: `country-${code}`, run: () => choose(code) })),
          backAction(back),
        ],
        back,
      }),
      current ? codes.indexOf(current) + 1 : 0,
    );
  }

  function buildPrivacy(): Built {
    const s = me();
    const reopen = () => host.library.openCustom(buildPrivacy, Number.MAX_SAFE_INTEGER);
    const toggle = (set: () => void, text: string) => () => {
      set();
      flash = { text, tone: 'ok' };
      reopen();
    };
    return {
      heading: t('Ce que voient les autres'),
      icon: 'pulse',
      lead: t('Vos amis voient toujours votre présence, votre table et vos parties. Pour les autres joueurs, choisissez.'),
      sections: [
        ...flashSections(),
        {
          rows: [
            s.publicProfile === false ? { text: t('Profil public : désactivé'), detail: t('Les autres ne voient que votre pseudo dans l’annuaire'), tone: 'quiet', icon: 'eye' } : { text: t('Profil public : visible de tous'), detail: t('Pays, badges, records et activité récente'), tone: 'ok', icon: 'eye' },
            s.shareScores === false ? { text: t('Scores : pas publiés'), detail: t('Vous voyez les classements ; vos parties n’y entrent pas'), tone: 'quiet', icon: 'trophy' } : { text: t('Scores : publiés aux classements'), detail: t('Amis, national et mondial ; jamais en mode invité'), tone: 'ok', icon: 'trophy' },
            s.publicPresence === false ? { text: t('Présence : vos amis seulement'), detail: t('Les autres ne vous voient pas dans « Joueurs en ligne »'), tone: 'quiet', icon: 'pulse' } : { text: t('Présence : en ligne pour tous'), detail: t('« En ligne » ou « En partie », jamais la table'), tone: 'ok', icon: 'pulse' },
            s.friendsVisibility === 'private'
              ? { text: t('Amis : privés'), detail: t('Personne ne voit vos amis en commun'), tone: 'quiet', icon: 'friend-list' }
              : s.friendsVisibility === 'friends'
                ? { text: t('Amis : vos amis seulement'), detail: t('Vos amis voient vos amis en commun ; les autres, non'), tone: 'ok', icon: 'friend-list' }
                : { text: t('Amis : publics'), detail: t('Les joueurs voient les amis que vous avez en commun avec eux'), tone: 'ok', icon: 'friend-list' },
          ],
        },
      ],
      actions: [
        s.publicProfile === false
          ? { label: t('Activer mon profil public'), icon: 'eye', run: toggle(() => host.net.setPublicProfile(true), t('Profil public activé')) }
          : { label: t('Désactiver mon profil public'), icon: 'eye', run: toggle(() => host.net.setPublicProfile(false), t('Profil public désactivé')) },
        s.shareScores === false
          ? { label: t('Publier mes scores'), icon: 'trophy', sends: true as const, run: toggle(() => host.net.setShareScores(true), t('Vos scores sont publiés aux classements')) }
          : { label: t('Ne plus publier mes scores'), icon: 'trophy', run: toggle(() => host.net.setShareScores(false), t('Vos scores ne sont plus publiés')) },
        s.publicPresence === false
          ? { label: t('Apparaître en ligne pour tous'), icon: 'pulse', run: toggle(() => host.net.setPublicPresence(true), t('Vous apparaissez en ligne pour tous')) }
          : { label: t('Ne plus apparaître en ligne pour tous'), icon: 'pulse', run: toggle(() => host.net.setPublicPresence(false), t('Vous n’apparaissez plus en ligne pour les autres joueurs')) },
        // Qui voit mes amis : Start passe au choix suivant (publics, amis seulement, privés), le curseur reste dessus.
        s.friendsVisibility === 'private'
          ? { label: t('Mes amis : privés'), detail: t('Start : publics'), icon: 'friend-list', run: toggle(() => host.net.setFriendsVisibility('public'), t('Vos amis sont publics')) }
          : s.friendsVisibility === 'friends'
            ? { label: t('Mes amis : vos amis seulement'), detail: t('Start : privés'), icon: 'friend-list', run: toggle(() => host.net.setFriendsVisibility('private'), t('Vos amis sont privés')) }
            : { label: t('Mes amis : publics'), detail: t('Start : vos amis seulement'), icon: 'friend-list', run: toggle(() => host.net.setFriendsVisibility('friends'), t('Vos amis ne sont visibles que de vos amis')) },
        backAction(itemBack),
      ],
      back: itemBack,
    };
  }

  const attention = () => !svc.protection().codeNotedAt && !svc.protection().password;

  return {
    items: {
      account: {
        get detail() {
          const p = svc.protection();
          return p.codeNotedAt || p.password ? t('Protégé · copie de secours, code{password}', { password: p.password ? t(', mot de passe') : '' }) : t('Code de récupération à noter');
        },
        get attention() {
          return attention();
        },
        run: () => openProtect(() => host.library.openSystem()),
      },
      'player-name': {
        get detail() {
          return t('{name} · identifiant {id}', { name: me().name, id: playerId(me().key.publicKey) });
        },
        run: () => askName(() => itemBack()),
      },
      country: {
        get detail() {
          const code = host.net.country();
          return code ? countryName(code, locale()) : t('Pas choisi');
        },
        run: () => openCountry(() => itemBack()),
      },
      'account-privacy': {
        get detail() {
          const s = me();
          const hidden = [s.publicProfile === false, s.shareScores === false, s.publicPresence === false, s.friendsVisibility === 'private'].filter(Boolean).length;
          return hidden ? tn(hidden, '{n} élément réservé aux amis', '{n} éléments réservés aux amis') : t('Profil public, scores publiés, présence en ligne');
        },
        run: () => host.library.openCustom(buildPrivacy, 0),
      },
      'account-delete': {
        detail: t('Votre nom, vos amis, vos messages, vos scores publiés : effacés ici et chez les autres'),
        run: () => host.openDelete(() => itemBack()),
      },
    },
    openRestore,
    openCopy,
    attention,
  };
}
