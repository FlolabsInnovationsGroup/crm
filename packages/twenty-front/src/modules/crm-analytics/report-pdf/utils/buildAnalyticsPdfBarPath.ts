const CORNER_RADIUS = 2;

type BuildAnalyticsPdfBarPathArgs = {
  x: number;
  y: number;
  width: number;
  height: number;
  dataEnd: 'RIGHT' | 'LEFT' | 'TOP';
};

// Only the data end is rounded, so every bar stays square on its baseline.
export const buildAnalyticsPdfBarPath = ({
  x,
  y,
  width,
  height,
  dataEnd,
}: BuildAnalyticsPdfBarPathArgs) => {
  const right = x + width;
  const bottom = y + height;

  if (dataEnd === 'TOP') {
    const radius = Math.min(CORNER_RADIUS, height, width / 2);

    return `M${x},${bottom}L${x},${y + radius}Q${x},${y} ${x + radius},${y}L${right - radius},${y}Q${right},${y} ${right},${y + radius}L${right},${bottom}Z`;
  }

  const radius = Math.min(CORNER_RADIUS, width, height / 2);

  if (dataEnd === 'RIGHT') {
    return `M${x},${y}L${right - radius},${y}Q${right},${y} ${right},${y + radius}L${right},${bottom - radius}Q${right},${bottom} ${right - radius},${bottom}L${x},${bottom}Z`;
  }

  return `M${right},${y}L${x + radius},${y}Q${x},${y} ${x},${y + radius}L${x},${bottom - radius}Q${x},${bottom} ${x + radius},${bottom}L${right},${bottom}Z`;
};
