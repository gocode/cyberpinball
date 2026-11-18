// Doublure du service des retours (feedback-service.ts), voir neutre.ts : aucune proposition, rien
// n'est envoyé (un rapport « échoue »), écriture fermée.

import type { FeedbackService } from '../feedback-service';
import { noop, overlay } from './neutre';

export function fakeFeedbackService(over?: Partial<FeedbackService>): FeedbackService {
  return overlay<FeedbackService>(
    {
      refresh: async () => undefined,
      refreshIfOld: async () => undefined,
      list: () => [],
      net: () => 'idle',
      canWrite: () => false,
      propose: async () => ({ ok: false, why: 'offline' }),
      vote: async () => ({ ok: false, why: 'offline' }),
      forgetMe: async () => ({ ok: false, why: 'offline' }),
      news: {
        of: () => ({ counts: {} }),
        net: () => 'idle',
        refresh: async () => undefined,
        refreshIfOld: async () => undefined,
        react: async () => ({ ok: false, why: 'offline' }),
      },
      sendReport: async () => 'failed',
      queuedCount: () => 0,
      flush: async () => undefined,
      watch: noop,
      contributions: () => ({ count: 0, shipped: 0 }),
    },
    over,
  );
}
