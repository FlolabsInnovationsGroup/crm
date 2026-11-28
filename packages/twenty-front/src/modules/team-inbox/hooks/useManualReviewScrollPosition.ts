import { useLayoutEffect, useRef } from 'react';
import { isDefined } from 'twenty-shared/utils';

import { MANUAL_REVIEW_CARD_ID_ATTRIBUTE } from '@/team-inbox/constants/ManualReviewCardIdAttribute';
import { manualReviewScrollPositionsState } from '@/team-inbox/states/manualReviewScrollPositionsState';
import { getAnchoredScrollTop } from '@/team-inbox/utils/getAnchoredScrollTop';
import { getManualReviewScrollAnchor } from '@/team-inbox/utils/getManualReviewScrollAnchor';

const getCardElements = (container: HTMLElement) =>
  Array.from(
    container.querySelectorAll<HTMLElement>(
      `[${MANUAL_REVIEW_CARD_ID_ATTRIBUTE}]`,
    ),
  );

// Remembers where the list was by the first card on screen, so the same card
// is back in place after Done, a refresh, or leaving the page and returning.
// Browsers without scroll anchoring would otherwise jump when cards above
// the fold come or go.
export const useManualReviewScrollPosition = ({
  viewKey,
  renderedCardIds,
  canSave,
}: {
  viewKey: string;
  renderedCardIds: string[];
  canSave: boolean;
}) => {
  const containerRef = useRef<HTMLElement>(null);
  const renderedCardsKey = renderedCardIds.join(',');

  const savePosition = () => {
    const container = containerRef.current;

    if (!isDefined(container)) {
      return;
    }

    const viewportTop = container.getBoundingClientRect().top;
    const cards = getCardElements(container).map((element) => {
      const box = element.getBoundingClientRect();

      return {
        threadId: element.getAttribute(MANUAL_REVIEW_CARD_ID_ATTRIBUTE) ?? '',
        top: box.top,
        bottom: box.bottom,
      };
    });

    manualReviewScrollPositionsState.set(viewKey, {
      scrollTop: container.scrollTop,
      anchor: getManualReviewScrollAnchor(cards, viewportTop),
    });
  };

  // A list still filling in page by page would save a clamped position.
  const handleScroll = () => {
    if (canSave) {
      savePosition();
    }
  };

  useLayoutEffect(() => {
    const container = containerRef.current;

    if (!isDefined(container)) {
      return;
    }

    const savedPosition = manualReviewScrollPositionsState.get(viewKey);

    if (!isDefined(savedPosition)) {
      return;
    }

    const anchorElement = isDefined(savedPosition.anchor)
      ? getCardElements(container).find(
          (element) =>
            element.getAttribute(MANUAL_REVIEW_CARD_ID_ATTRIBUTE) ===
            savedPosition.anchor?.threadId,
        )
      : undefined;
    const targetScrollTop =
      isDefined(anchorElement) && isDefined(savedPosition.anchor)
        ? getAnchoredScrollTop({
            anchor: savedPosition.anchor,
            anchorTop: anchorElement.getBoundingClientRect().top,
            viewportTop: container.getBoundingClientRect().top,
            scrollTop: container.scrollTop,
          })
        : savedPosition.scrollTop;

    if (Math.abs(container.scrollTop - targetScrollTop) > 1) {
      container.scrollTop = targetScrollTop;
    }
  }, [viewKey, renderedCardsKey]);

  const scrollToStart = () => containerRef.current?.scrollTo({ top: 0 });

  const scrollToEnd = () =>
    containerRef.current?.scrollTo({
      top: containerRef.current.scrollHeight,
    });

  return { containerRef, handleScroll, scrollToStart, scrollToEnd };
};
