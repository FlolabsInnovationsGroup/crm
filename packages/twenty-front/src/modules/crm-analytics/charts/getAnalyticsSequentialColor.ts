import { themeCssVariables } from 'twenty-ui/theme';

const SEQUENTIAL_STEPS = [
  themeCssVariables.color.blue3,
  themeCssVariables.color.blue4,
  themeCssVariables.color.blue5,
  themeCssVariables.color.blue6,
  themeCssVariables.color.blue7,
  themeCssVariables.color.blue8,
  themeCssVariables.color.blue9,
];

const SOLID_STEP_INDEX = SEQUENTIAL_STEPS.length - 1;
const IN_PROGRESS_STEPS_LIGHTER = 2;

type AnalyticsSequentialColorArgs = {
  ratio: number;
  isLighter?: boolean;
};

// Only the solid last step needs white text: the earlier steps flip with the theme, as primary text does.
export const getAnalyticsSequentialColor = ({
  ratio,
  isLighter = false,
}: AnalyticsSequentialColorArgs) => {
  const clampedRatio = Math.min(Math.max(ratio, 0), 1);
  const stepIndex = Math.min(
    Math.floor(clampedRatio * SEQUENTIAL_STEPS.length),
    SOLID_STEP_INDEX,
  );
  const shownIndex = isLighter
    ? Math.max(stepIndex - IN_PROGRESS_STEPS_LIGHTER, 0)
    : stepIndex;

  return {
    fill: SEQUENTIAL_STEPS[shownIndex],
    text:
      shownIndex === SOLID_STEP_INDEX
        ? themeCssVariables.font.color.onAccent
        : themeCssVariables.font.color.primary,
  };
};
