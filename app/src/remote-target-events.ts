import type { EventEmitter } from 'node:events';

const PAGE_EVENTS = ['did-navigate', 'did-navigate-in-page', 'page-title-updated', 'did-stop-loading'] as const;

/** Chaque rattachement au navigateur possède ses écouteurs et les retire en quittant sa cible. */
export function remoteTargetEvents(contents: EventEmitter, win: EventEmitter, callbacks: { page(): void; field(): void; closed(): void }): () => void {
  for (const event of PAGE_EVENTS) contents.on(event, callbacks.page);
  contents.on('did-stop-loading', callbacks.field);
  win.on('closed', callbacks.closed);
  return () => {
    for (const event of PAGE_EVENTS) contents.off(event, callbacks.page);
    contents.off('did-stop-loading', callbacks.field);
    win.off('closed', callbacks.closed);
  };
}
