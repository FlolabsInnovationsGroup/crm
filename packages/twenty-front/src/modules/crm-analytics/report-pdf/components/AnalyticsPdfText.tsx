import { Text, type Styles } from '@react-pdf/renderer';
import { isString } from '@sniptt/guards';
import { type ReactNode } from 'react';

import { toAnalyticsPdfPrintableText } from '@/crm-analytics/report-pdf/utils/toAnalyticsPdfPrintableText';

const keepWordsWhole = (word: string) => [word];

type AnalyticsPdfTextProps = {
  style?: Styles[string] | Styles[string][];
  children: ReactNode;
};

// react-pdf hyphenates English by default, which splits stage and track names at line ends.
export const AnalyticsPdfText = ({
  style,
  children,
}: AnalyticsPdfTextProps) => (
  <Text style={style} hyphenationCallback={keepWordsWhole}>
    {isString(children) ? toAnalyticsPdfPrintableText(children) : children}
  </Text>
);
