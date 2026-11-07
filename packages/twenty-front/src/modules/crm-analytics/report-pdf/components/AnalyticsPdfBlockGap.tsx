import { View } from '@react-pdf/renderer';

const BLOCK_GAP = 14;
const SMALL_BLOCK_GAP = 8;

type AnalyticsPdfBlockGapProps = {
  isSmall?: boolean;
};

// A gap of its own instead of a margin. A margin moves to the next page with its block and pushes
// the block down there, and a margin after the last block can spill over into a blank page.
export const AnalyticsPdfBlockGap = ({
  isSmall = false,
}: AnalyticsPdfBlockGapProps) => (
  <View style={{ height: isSmall ? SMALL_BLOCK_GAP : BLOCK_GAP }} />
);
