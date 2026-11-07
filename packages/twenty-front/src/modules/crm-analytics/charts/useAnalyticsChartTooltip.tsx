import { useLayoutEffect, useRef, useState } from 'react';
import { isDefined } from 'twenty-shared/utils';

import {
  AnalyticsChartTooltip,
  type AnalyticsChartTooltipContent,
} from '@/crm-analytics/charts/AnalyticsChartTooltip';

const POINTER_OFFSET_IN_PX = 12;
const CARD_PADDING_IN_PX = 8;

type AnalyticsChartPointer = { clientX: number; clientY: number };

const clampToRange = (value: number, lowest: number, highest: number) =>
  Math.max(lowest, Math.min(value, highest));

const getTooltipStart = ({
  pointer,
  size,
  boundStart,
  boundEnd,
}: {
  pointer: number;
  size: number;
  boundStart: number;
  boundEnd: number;
}) => {
  const afterPointer = pointer + POINTER_OFFSET_IN_PX;
  const fitsAfterPointer = afterPointer + size <= boundEnd - CARD_PADDING_IN_PX;

  return clampToRange(
    fitsAfterPointer ? afterPointer : pointer - POINTER_OFFSET_IN_PX - size,
    boundStart + CARD_PADDING_IN_PX,
    boundEnd - CARD_PADDING_IN_PX - size,
  );
};

const getScrollingAncestorBox = (element: Element) => {
  for (
    let ancestor = element.parentElement;
    isDefined(ancestor);
    ancestor = ancestor.parentElement
  ) {
    const { overflowY } = getComputedStyle(ancestor);

    if (overflowY === 'auto' || overflowY === 'scroll') {
      return ancestor.getBoundingClientRect();
    }
  }

  return null;
};

const placeTooltip = (
  tooltipElement: HTMLDivElement | null,
  pointer: AnalyticsChartPointer,
) => {
  const positionedParent = tooltipElement?.offsetParent;

  if (!isDefined(tooltipElement) || !isDefined(positionedParent)) {
    return;
  }

  const parentBox = positionedParent.getBoundingClientRect();
  const bounds = (
    tooltipElement.closest('[data-analytics-chart-card]') ?? positionedParent
  ).getBoundingClientRect();
  // A card can run past the fold, where the page body clips anything placed below its edge.
  const scrollingBox = getScrollingAncestorBox(tooltipElement);

  const left = getTooltipStart({
    pointer: pointer.clientX,
    size: tooltipElement.offsetWidth,
    boundStart: bounds.left,
    boundEnd: bounds.right,
  });
  const top = getTooltipStart({
    pointer: pointer.clientY,
    size: tooltipElement.offsetHeight,
    boundStart: Math.max(bounds.top, scrollingBox?.top ?? 0),
    boundEnd: Math.min(
      bounds.bottom,
      scrollingBox?.bottom ?? window.innerHeight,
    ),
  });

  tooltipElement.style.transform = `translate(${left - parentBox.left}px, ${top - parentBox.top}px)`;
};

// Render `tooltip` inside the chart, outside any scrolling element. It stays within the chart card.
// A tooltip built under another `dataSignature` stops showing, since new data under a still pointer fires no event.
export const useAnalyticsChartTooltip = (dataSignature?: string) => {
  const tooltipElementRef = useRef<HTMLDivElement>(null);
  const [activeTooltip, setActiveTooltip] = useState<{
    content: AnalyticsChartTooltipContent;
    pointer: AnalyticsChartPointer;
    dataSignature?: string;
  } | null>(null);
  const currentTooltip =
    activeTooltip?.dataSignature === dataSignature ? activeTooltip : null;

  useLayoutEffect(() => {
    if (isDefined(currentTooltip)) {
      placeTooltip(tooltipElementRef.current, currentTooltip.pointer);
    }
  }, [currentTooltip]);

  const showTooltip = (
    content: AnalyticsChartTooltipContent,
    { clientX, clientY }: AnalyticsChartPointer,
  ) =>
    setActiveTooltip({
      content,
      pointer: { clientX, clientY },
      dataSignature,
    });

  // Keyboard focus has no pointer, so the tooltip opens from the middle of the focused mark.
  const showTooltipAtElement = (
    content: AnalyticsChartTooltipContent,
    element: Element,
  ) => {
    const { left, top, width, height } = element.getBoundingClientRect();

    showTooltip(content, {
      clientX: left + width / 2,
      clientY: top + height / 2,
    });
  };

  const moveTooltip = (pointer: AnalyticsChartPointer) =>
    placeTooltip(tooltipElementRef.current, pointer);

  const hideTooltip = () => setActiveTooltip(null);

  const tooltip = isDefined(currentTooltip) ? (
    <AnalyticsChartTooltip
      content={currentTooltip.content}
      elementRef={tooltipElementRef}
    />
  ) : null;

  return {
    tooltip,
    showTooltip,
    showTooltipAtElement,
    moveTooltip,
    hideTooltip,
  };
};
