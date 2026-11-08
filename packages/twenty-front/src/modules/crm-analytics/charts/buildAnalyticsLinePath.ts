import { isDefined } from 'twenty-shared/utils';

export type AnalyticsLinePoint = { x: number; y: number } | null;

const groupIntoRuns = (points: AnalyticsLinePoint[]) => {
  const runs: { x: number; y: number }[][] = [];
  let currentRun: { x: number; y: number }[] = [];

  points.forEach((point) => {
    if (isDefined(point)) {
      currentRun.push(point);

      return;
    }

    if (currentRun.length > 0) {
      runs.push(currentRun);
    }

    currentRun = [];
  });

  if (currentRun.length > 0) {
    runs.push(currentRun);
  }

  return runs;
};

const toLinePath = (run: { x: number; y: number }[]) =>
  run.map(({ x, y }, index) => `${index === 0 ? 'M' : 'L'}${x},${y}`).join('');

// An unknown value ends the line and the next known value starts a new one. It must never reach the baseline.
export const buildAnalyticsLinePath = (points: AnalyticsLinePoint[]) =>
  groupIntoRuns(points).map(toLinePath).join('');

// One path of solid segments and one of lighter ones, since one path cannot hold two opacities.
export const buildAnalyticsSplitLinePaths = (
  points: AnalyticsLinePoint[],
  isLighterAt: (index: number) => boolean,
) => {
  const paths = { solid: '', lighter: '' };
  const lastEndIndex = { solid: -1, lighter: -1 };

  points.forEach((point, index) => {
    const nextPoint = points[index + 1];

    if (!isDefined(point) || !isDefined(nextPoint)) {
      return;
    }

    const kind =
      isLighterAt(index) || isLighterAt(index + 1) ? 'lighter' : 'solid';
    const start = lastEndIndex[kind] === index ? '' : `M${point.x},${point.y}`;

    paths[kind] += `${start}L${nextPoint.x},${nextPoint.y}`;
    lastEndIndex[kind] = index + 1;
  });

  return paths;
};

export const buildAnalyticsAreaPath = (
  points: AnalyticsLinePoint[],
  baselineY: number,
) =>
  groupIntoRuns(points)
    .filter((run) => run.length > 1)
    .map((run) => {
      const firstX = run[0].x;
      const lastX = run[run.length - 1].x;

      return `M${firstX},${baselineY}${toLinePath(run).replace('M', 'L')}L${lastX},${baselineY}Z`;
    })
    .join('');

// A known value between two unknown ones draws no line, so it needs a dot to be seen at all.
export const getAnalyticsIsolatedPoints = (points: AnalyticsLinePoint[]) =>
  groupIntoRuns(points)
    .filter((run) => run.length === 1)
    .map((run) => run[0]);
