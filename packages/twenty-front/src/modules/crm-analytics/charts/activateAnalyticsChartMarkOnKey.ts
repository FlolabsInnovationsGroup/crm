import { type KeyboardEvent } from 'react';

// For a chart mark that acts as a button but cannot be a <button>, such as an SVG group or a subgrid row.
export const activateAnalyticsChartMarkOnKey =
  (onActivate: () => void) => (event: KeyboardEvent) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onActivate();
    }
  };
