// Doublures des téléchargements, voir neutre.ts : le gestionnaire (downloadmanager.ts du cœur), le
// monde qu'il interroge au retour d'un téléchargement (ReturnWorld), et ce que les menus des amis en
// attendent (FriendDownloads). Liste vide ; ajouter un téléchargement n'est pas simulé.

import type { DownloadManager, ReturnWorld } from '@cyberpinball/core';
import type { FriendDownloads } from '../friend-library-menu';
import { noop, overlay, unsimulated } from './neutre';

export function fakeDownloadManager(over?: Partial<DownloadManager>): DownloadManager {
  return overlay<DownloadManager>(
    {
      jobs: () => [],
      get: () => undefined,
      progress: () => undefined,
      add: unsimulated('fakeDownloadManager.add'),
      pending: () => undefined,
      track: unsimulated('fakeDownloadManager.track'),
      pause: noop,
      resume: noop,
      pauseAll: noop,
      resumeAll: noop,
      cancel: noop,
      remove: noop,
      clearFinished: () => 0,
      delivered: noop,
      seen: noop,
      patch: noop,
      owns: () => false,
      poke: noop,
      setTransport: noop,
      stop: noop,
    },
    over,
  );
}

export function fakeReturnWorld(over?: Partial<ReturnWorld>): ReturnWorld {
  return overlay<ReturnWorld>({ hasTable: () => false, hasFriend: () => false }, over);
}

export function fakeFriendDownloads(over?: Partial<FriendDownloads>): FriendDownloads {
  return overlay<FriendDownloads>(
    {
      manager: fakeDownloadManager(),
      finisher: noop,
      deliverer: noop,
      opener: noop,
      deliver: noop,
      openReturn: noop,
    },
    over,
  );
}
