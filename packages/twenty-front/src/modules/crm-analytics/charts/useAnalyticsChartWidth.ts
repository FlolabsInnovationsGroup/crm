import { useLayoutEffect, useState } from 'react';
import { isDefined } from 'twenty-shared/utils';

const FALLBACK_WIDTH_IN_PX = 480;

// Pass `widthRef` as the ref of the element to measure. A hidden element keeps its last width.
export const useAnalyticsChartWidth = () => {
  const [element, setElement] = useState<HTMLElement | null>(null);
  const [width, setWidth] = useState(FALLBACK_WIDTH_IN_PX);

  useLayoutEffect(() => {
    if (!isDefined(element)) {
      return;
    }

    const updateWidth = (nextWidth: number) => {
      if (nextWidth > 0) {
        setWidth(Math.round(nextWidth));
      }
    };

    updateWidth(element.getBoundingClientRect().width);

    const resizeObserver = new ResizeObserver((entries) => {
      updateWidth(entries[0]?.contentRect.width ?? 0);
    });

    resizeObserver.observe(element);

    return () => resizeObserver.disconnect();
  }, [element]);

  return { widthRef: setElement, width };
};
