// Les doublures des services et des hôtes de l'application (app\src\doublures, règle dans neutre.ts),
// pour les tests : chaque fabrique complète les surcharges du test par des membres neutres, et rend
// l'objet avec le type de ces surcharges (les tests ne voient pas les types de l'application).

import * as path from 'node:path';

type Fake = <T extends object>(over?: T) => T;
type FakeWith<K extends string> = <T extends Record<K, unknown>>(over: T) => T;

// eslint-disable-next-line @typescript-eslint/no-require-imports
const fakes = require(path.join(__dirname, '..', '..', '..', '..', 'app', 'dist', 'doublures', 'index.js')) as Record<string, Fake>;

export const fakeSocialNet: Fake = fakes.fakeSocialNet!;
export const fakeLibraryHost = fakes.fakeLibraryHost as FakeWith<'root' | 'dataDir'>;
export const fakeMenuLibrary: Fake = fakes.fakeMenuLibrary!;
export const fakeLiveGames: Fake = fakes.fakeLiveGames!;
export const fakeFriendContent: Fake = fakes.fakeFriendContent!;
export const fakeFriendDownloads: Fake = fakes.fakeFriendDownloads!;
export const fakeDownloadManager: Fake = fakes.fakeDownloadManager!;
export const fakeReturnWorld: Fake = fakes.fakeReturnWorld!;
export const fakeFeedbackService: Fake = fakes.fakeFeedbackService!;
export const fakeAcquireEvents = fakes.fakeAcquireEvents as FakeWith<'dir'>;
export const fakeMenuTarget: Fake = fakes.fakeMenuTarget!;
export const fakeActivityFriends: Fake = fakes.fakeActivityFriends!;
export const fakeActivityLive: Fake = fakes.fakeActivityLive!;
export const fakeCommunityMessages: Fake = fakes.fakeCommunityMessages!;
export const fakeTableScoresOptions = fakes.fakeTableScoresOptions as FakeWith<'dataDir'>;
export const fakeTableRankingsOptions: Fake = fakes.fakeTableRankingsOptions!;
export const fakeTableDoublesOptions: Fake = fakes.fakeTableDoublesOptions!;
