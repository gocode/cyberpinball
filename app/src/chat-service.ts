// Messagerie entre amis (packages/core/src/chat.ts) sur le réseau des bornes (social-net.ts) :
// les messages des services d'amis, sur la même connexion chiffrée que la présence.
//
// Rien ne repose sur un message unique : un message écrit reste « en attente » jusqu'à l'accusé de
// la borne de l'ami (chat-ok). Il part tout de suite si l'ami est relié, de nouveau dès qu'il
// revient en ligne, et toutes les CHAT_RESEND_MS tant qu'il est relié sans avoir accusé ; une
// borne qui reçoit deux fois le même message ne le garde qu'une fois et accuse les deux.
//
// Chaque borne dit à ses amis, quand ils se relient, si elle a la messagerie et l'accepte
// (chat-hi) : une borne coupée affiche « N'accepte pas de messages » chez ses amis, et ce qu'on lui
// écrit attend qu'elle la rouvre ; une borne d'avant la messagerie ne répond rien.
//
// Sans electron à l'exécution : les tests du cœur le chargent avec un réseau d'essai.

import {
  acknowledge,
  clearAll,
  clearConversation,
  deleteMine,
  forgetInChat,
  CHAT_BATCH,
  loadChat,
  markRead,
  pendingFor,
  receiveLines,
  saveChat,
  saveOrWarn,
  chatFile,
  setAccepts,
  setMuted,
  tidyChat,
  toWire,
  verifyWire,
  writeLine,
  quoteOf,
  type QuoteRef,
  createTypingBoard,
  createTypingSender,
  type TypingSender,
  type ChatKeep,
  type ChatLine,
  type ChatReaction,
  type ChatState,
  type ChatMessage,
} from '@cyberpinball/core';
import type { FriendMessage, SocialNet } from './social-net';

/** Renvoi des messages en attente vers un ami relié qui ne les a pas accusés. */
export const CHAT_RESEND_MS = 20_000;
/** Ménage (messages abandonnés, conservation) : au démarrage, puis toutes les heures. */
const TIDY_MS = 60 * 60_000;

export interface ChatServiceOptions {
  net: Pick<SocialNet, 'state' | 'online' | 'send' | 'onMessage'>;
  dataDir: string;
  now?: () => Date;
  /** Quelque chose a changé (message reçu, accusé, ami relié) : redessiner. */
  onChange?: () => void;
  /** Messages nouveaux d'un ami (pas les réactions) : la notification, si l'ami n'est pas en sourdine. */
  onArrive?: (key: string, lines: ChatLine[]) => void;
  /** Essais : délai du renvoi (CHAT_RESEND_MS). */
  resendMs?: number;
  log?: (line: string) => void;
}

export interface ChatService {
  state(): ChatState;
  /**
   * Écrire à un ami : le message part s'il est relié, attend sinon ; false si le texte est vide ou trop
   * long, ou si la messagerie est coupée. `reply` : l'identifiant du message auquel je réponds, encore
   * dans la conversation (sa citation part avec, citations.ts).
   */
  send(key: string, text: string, reply?: string): boolean;
  /** Réagir à un message (son id) ; null : retirer ma réaction. */
  react(key: string, target: string, kind: ChatReaction | null): boolean;
  /** Supprimer mon message (son id) : ici, et chez l'ami dès que sa borne reçoit le retrait ; false si ce n'est pas un des miens. */
  remove(key: string, target: string): boolean;
  /**
   * « En train d'écrire » (typing.ts) : mon champ pour cet ami a changé (`active` : il reste du texte).
   * Le signal part au plus toutes les 3 s, s'il est relié et accepte les messages ; jamais gardé.
   */
  typing(key: string, active: boolean): void;
  /** Cet ami m'écrit-il en ce moment (du texte en cours dans son champ) ? */
  typingOf(key: string): boolean;
  /** Comptes supprimés par leur joueur (forget.ts) : leurs conversations effacées. */
  forget(keys: ReadonlySet<string>): void;
  markRead(key: string): void;
  setMuted(key: string, muted: boolean): void;
  clear(key: string): void;
  clearAll(): void;
  setEnabled(on: boolean): void;
  setKeep(keep: ChatKeep): void;
  setPhoneInGame(on: boolean): void;
  setSound(on: boolean): void;
  /**
   * À appeler quand le réseau change (social-net onChange) : un ami revenu en ligne reçoit mon
   * « chat-hi » et ce qui l'attendait. Le minuteur de renvoi le fait aussi, plus lentement.
   */
  observe(): void;
  stop(): void;
}

export function createChatService(opts: ChatServiceOptions): ChatService {
  const now = () => opts.now?.() ?? new Date();
  const log = (line: string) => opts.log?.(line);
  const me = () => opts.net.state().key;
  let state = tidyChat(loadChat(opts.dataDir), now());
  let saveTimer: NodeJS.Timeout | undefined;
  let stopped = false;

  function save(): void {
    saveTimer ??= setTimeout(() => {
      saveTimer = undefined;
      saveOrWarn(chatFile(opts.dataDir), () => saveChat(opts.dataDir, state));
    }, 300);
    saveTimer.unref?.();
  }
  function commit(next: ChatState): void {
    if (next === state) return;
    state = next;
    save();
    opts.onChange?.();
  }

  const isFriend = (key: string) => opts.net.state().friends.some((f) => f.key === key);
  /** Amis reliés au dernier relevé, et le moment du dernier envoi de leur file. */
  const linked = new Set<string>();
  const lastFlush = new Map<string, number>();

  function send(key: string, message: ChatMessage): boolean {
    return opts.net.send(key, message as FriendMessage);
  }

  /** Ce qui attend de partir vers cet ami, s'il est relié et accepte les messages. */
  function flush(key: string): void {
    if (!isFriend(key) || !opts.net.online(key)) return;
    if (state.conversations[key]?.accepts === false) return;
    const pending = pendingFor(state, key);
    if (!pending.length) return;
    lastFlush.set(key, Date.now());
    for (let i = 0; i < pending.length; i += CHAT_BATCH) {
      if (!send(key, { t: 'chat', m: pending.slice(i, i + CHAT_BATCH).map(toWire) })) return;
    }
  }

  function hello(key: string): void {
    send(key, { t: 'chat-hi', on: state.enabled });
  }

  function observe(): void {
    if (stopped) return;
    const friends = opts.net.state().friends.map((f) => f.key);
    for (const key of friends) {
      const online = opts.net.online(key);
      if (online && !linked.has(key)) {
        linked.add(key);
        hello(key);
        flush(key);
      } else if (!online) linked.delete(key);
    }
    for (const key of linked) if (!friends.includes(key)) linked.delete(key);
  }

  const resendTimer = setInterval(() => {
    observe();
    for (const key of linked) if (Date.now() - (lastFlush.get(key) ?? 0) >= (opts.resendMs ?? CHAT_RESEND_MS)) flush(key);
  }, Math.max(1000, Math.round((opts.resendMs ?? CHAT_RESEND_MS) / 2)));
  resendTimer.unref?.();
  const tidyTimer = setInterval(() => commit(tidyChat(state, now())), TIDY_MS);
  tidyTimer.unref?.();

  // « En train d'écrire » : qui m'écrit en ce moment (en mémoire), et mon signal vers chaque ami.
  const typers = createTypingBoard(() => opts.onChange?.());
  const signals = new Map<string, TypingSender>();

  const unsubscribe = opts.net.onMessage((key, message) => {
    if (message.t !== 'chat' && message.t !== 'chat-ok' && message.t !== 'chat-hi' && message.t !== 'chat-typing') return;
    switch (message.t) {
      case 'chat-typing':
        // Messagerie coupée ici : ses points ne s'affichent pas (il voit « N'accepte pas de messages »).
        if (!state.enabled || !isFriend(key)) return;
        if (typers.note(key, key, '', message.on)) opts.onChange?.();
        return;
      case 'chat-hi': {
        const was = state.conversations[key]?.accepts;
        commit(setAccepts(state, key, message.on));
        // Sa borne vient de s'annoncer : la mienne aussi, si elle ne l'a pas encore fait sur cette liaison.
        if (!linked.has(key)) {
          linked.add(key);
          hello(key);
        }
        if (message.on && was !== true) flush(key);
        return;
      }
      case 'chat-ok':
        commit(acknowledge(state, key, message.ids));
        return;
      case 'chat': {
        // Messagerie coupée ici : rien n'est gardé, ni accusé ; l'ami l'apprend par chat-hi.
        if (!state.enabled) {
          hello(key);
          return;
        }
        const mine = me().publicKey;
        const lines = message.m.map((w) => verifyWire(w, key, mine, now())).filter((l): l is ChatLine => !!l);
        if (lines.length < message.m.length) log(`Messagerie : ${message.m.length - lines.length} message(s) de ${key.slice(0, 8)} à la signature fausse, écartés.`); // i18n-ignore : journal
        if (!lines.length) return;
        const r = receiveLines(state, key, lines);
        // Son message est là : ses trois points partent (redessiné par commit, ou ci-dessous).
        if (typers.clear(key, key) && r.state === state) opts.onChange?.();
        commit(r.state);
        send(key, { t: 'chat-ok', ids: r.ack });
        const texts = r.fresh.filter((l) => l.text);
        if (texts.length && !state.conversations[key]?.muted) opts.onArrive?.(key, texts);
        return;
      }
    }
  });

  /** La citation d'un message de la conversation (le mien ou le sien) ; undefined s'il n'y est plus. */
  function quoteFor(key: string, id: string): QuoteRef | undefined {
    const original = state.conversations[key]?.lines.find((l) => l.id === id && l.text);
    if (!original) return undefined;
    const s = opts.net.state();
    const by = original.out ? s.key.publicKey : key;
    const name = original.out ? s.name : (s.friends.find((f) => f.key === key)?.name ?? '');
    return quoteOf({ id: original.id, by, name, text: original.text! });
  }

  function write(key: string, content: Parameters<typeof writeLine>[3]): boolean {
    if (!state.enabled || !isFriend(key)) return false;
    const r = writeLine(state, me(), key, content, now());
    if (!r.line) return false;
    commit(r.state);
    flush(key);
    return true;
  }

  return {
    state: () => state,
    send: (key, text, reply) => {
      const quote = reply ? quoteFor(key, reply) : undefined;
      return write(key, quote ? { text, reply: quote } : { text });
    },
    react: (key, target, kind) => write(key, { react: { target, kind } }),
    remove: (key, target) => {
      const r = deleteMine(state, me(), key, target, now());
      if (r.state === state) return false;
      commit(r.state);
      if (r.line) flush(key);
      return true;
    },
    typing: (key, active) => {
      let signal = signals.get(key);
      // Rien ne partirait : messagerie coupée ici ou chez lui, plus un ami, hors ligne. Un signal en cours se termine.
      const may = state.enabled && isFriend(key) && opts.net.online(key) && state.conversations[key]?.accepts !== false;
      if (!may && !signal?.on) return;
      if (!signal) signals.set(key, (signal = createTypingSender((on) => send(key, { t: 'chat-typing', on }))));
      signal.input(may && active);
    },
    typingOf: (key) => typers.who(key).length > 0,
    forget: (keys) => commit(forgetInChat(state, keys)),
    markRead: (key) => commit(markRead(state, key)),
    setMuted: (key, muted) => commit(setMuted(state, key, muted)),
    clear: (key) => commit(clearConversation(state, key)),
    clearAll: () => commit(clearAll(state)),
    setEnabled: (on) => {
      if (state.enabled === on) return;
      commit({ ...state, enabled: on });
      for (const key of linked) hello(key);
    },
    setKeep: (keep) => commit(tidyChat({ ...state, keep }, now())),
    setPhoneInGame: (on) => commit(state.phoneInGame === on ? state : { ...state, phoneInGame: on }),
    setSound: (on) => commit(state.sound === on ? state : { ...state, sound: on }),
    observe,
    stop: () => {
      stopped = true;
      unsubscribe();
      typers.stop();
      clearInterval(resendTimer);
      clearInterval(tidyTimer);
      if (saveTimer) {
        clearTimeout(saveTimer);
        saveTimer = undefined;
        saveOrWarn(chatFile(opts.dataDir), () => saveChat(opts.dataDir, state));
      }
    },
  };
}
