import { isDefined } from 'twenty-shared/utils';

import { type ManualReviewScrollAnchor } from '@/team-inbox/types/ManualReviewScrollPosition';

type CardBox = { threadId: string; top: number; bottom: number };

// The first card still showing at the top of the list, and how far its top
// sits from the list's top.
export const getManualReviewScrollAnchor = (
  cards: CardBox[],
  viewportTop: number,
): ManualReviewScrollAnchor | null => {
  const firstVisible = cards.find((card) => card.bottom > viewportTop);

  return isDefined(firstVisible)
    ? {
        threadId: firstVisible.threadId,
        offset: firstVisible.top - viewportTop,
      }
    : null;
};
