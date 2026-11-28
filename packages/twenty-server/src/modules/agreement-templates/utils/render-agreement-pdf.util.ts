import { createElement, type ReactElement } from 'react';

import {
  Document,
  type DocumentProps,
  Font,
  Page,
  renderToBuffer,
  StyleSheet,
  Text,
  View,
} from '@react-pdf/renderer';

import {
  LIBERATION_SANS_BOLD_BASE64,
  LIBERATION_SANS_REGULAR_BASE64,
} from 'src/engine/core-modules/dpa/pdf/fonts/liberation-sans.fonts';
import {
  AGREEMENT_SIGNER_LAYOUTS,
  type AgreementSignatureBox,
  type AgreementSignerLayout,
} from 'src/modules/agreement-templates/constants/agreement-signing.constants';
import { countPdfPages } from 'src/modules/agreement-templates/utils/count-pdf-pages.util';
import {
  type AgreementBlock,
  type AgreementTextRun,
  parseAgreementMarkdown,
} from 'src/modules/agreement-templates/utils/parse-agreement-markdown.util';

// Same embedded font and createElement reasons as the DPA PDF
// (src/engine/core-modules/dpa/pdf/dpa-pdf-document.ts).
const FONT_FAMILY = 'Liberation Sans';

let fontsRegistered = false;

const registerFontsOnce = () => {
  if (fontsRegistered) {
    return;
  }

  Font.register({
    family: FONT_FAMILY,
    fonts: [
      {
        src: `data:font/ttf;base64,${LIBERATION_SANS_REGULAR_BASE64}`,
        fontWeight: 'normal',
      },
      {
        src: `data:font/ttf;base64,${LIBERATION_SANS_BOLD_BASE64}`,
        fontWeight: 'bold',
      },
    ],
  });
  fontsRegistered = true;
};

const styles = StyleSheet.create({
  page: {
    paddingTop: 56,
    paddingBottom: 64,
    paddingHorizontal: 56,
    fontSize: 10,
    fontFamily: FONT_FAMILY,
    lineHeight: 1.5,
    color: '#1a1a1a',
  },
  title: { fontSize: 16, fontWeight: 'bold', marginBottom: 16 },
  heading: { fontWeight: 'bold', marginTop: 12, marginBottom: 4 },
  paragraph: { marginBottom: 8, textAlign: 'justify' },
  listItem: { flexDirection: 'row', marginBottom: 4 },
  listMarker: { width: 18 },
  listText: { flex: 1 },
  signatureHeading: {
    position: 'absolute',
    left: 56,
    fontSize: 12,
    fontWeight: 'bold',
  },
  box: {
    position: 'absolute',
    borderBottomWidth: 1,
    borderBottomColor: '#555555',
    borderBottomStyle: 'solid',
  },
  boxLabel: { position: 'absolute', fontSize: 8, color: '#666666' },
  footer: {
    position: 'absolute',
    bottom: 28,
    left: 56,
    right: 56,
    fontSize: 7,
    color: '#888888',
  },
});

const HEADING_FONT_SIZES = [16, 14, 12, 11, 10, 10];

const renderRuns = (runs: AgreementTextRun[]) =>
  runs.map((run, index) =>
    run.bold
      ? createElement(
          Text,
          { key: index, style: { fontWeight: 'bold' } },
          run.text,
        )
      : run.text,
  );

const renderBlock = (block: AgreementBlock, index: number): ReactElement => {
  if (block.kind === 'heading') {
    return createElement(
      Text,
      {
        key: index,
        style: [
          styles.heading,
          { fontSize: HEADING_FONT_SIZES[block.level - 1] },
        ],
      },
      ...renderRuns(block.runs),
    );
  }

  if (block.kind === 'listItem') {
    return createElement(
      View,
      { key: index, style: styles.listItem, wrap: false },
      createElement(Text, { style: styles.listMarker }, block.marker),
      createElement(
        Text,
        { style: styles.listText },
        ...renderRuns(block.runs),
      ),
    );
  }

  return createElement(
    Text,
    { key: index, style: styles.paragraph },
    ...renderRuns(block.runs),
  );
};

const renderBox = (
  box: AgreementSignatureBox,
  label: string,
  key: string,
): ReactElement[] => [
  createElement(View, {
    key: `${key}-box`,
    style: [
      styles.box,
      { left: box.left, top: box.top, width: box.width, height: box.height },
    ],
  }),
  createElement(
    Text,
    {
      key: `${key}-label`,
      style: [
        styles.boxLabel,
        { left: box.left, top: box.top + box.height + 3 },
      ],
    },
    label,
  ),
];

const renderSigner = (
  layout: AgreementSignerLayout,
  key: string,
): ReactElement[] => [
  createElement(
    Text,
    {
      key: `${key}-heading`,
      style: [styles.signatureHeading, { top: layout.signature.top - 30 }],
    },
    layout.heading,
  ),
  ...renderBox(layout.signature, 'Signature', `${key}-signature`),
  ...renderBox(layout.name, 'Name', `${key}-name`),
  ...renderBox(layout.date, 'Date', `${key}-date`),
];

export const buildAgreementPdfElement = ({
  title,
  markdown,
  reference,
}: {
  title: string;
  markdown: string;
  reference: string;
}): ReactElement<DocumentProps> => {
  registerFontsOnce();

  const footer = (key: string) =>
    createElement(
      Text,
      { key, style: styles.footer, fixed: true },
      `${title} · ${reference}`,
    );

  return createElement(
    Document,
    // countPdfPages reads the raw PDF, so metadata carries no PDF syntax.
    {
      title: title.replace(/[<>/]/g, ' '),
      author: 'FloLabs Innovations Group',
    },
    createElement(
      Page,
      { size: 'A4', style: styles.page, wrap: true },
      createElement(Text, { style: styles.title }, title),
      ...parseAgreementMarkdown(markdown).map(renderBlock),
      footer('text-footer'),
    ),
    createElement(
      Page,
      { size: 'A4', style: styles.page },
      createElement(Text, { style: styles.title }, 'Signatures'),
      ...renderSigner(AGREEMENT_SIGNER_LAYOUTS.applicant, 'applicant'),
      ...renderSigner(AGREEMENT_SIGNER_LAYOUTS.countersigner, 'countersigner'),
      footer('signature-footer'),
    ),
  ) as ReactElement<DocumentProps>;
};

// The signature page is always the last one.
export const renderAgreementPdf = async (input: {
  title: string;
  markdown: string;
  reference: string;
}): Promise<{ pdf: Buffer; signaturePage: number }> => {
  const pdf = await renderToBuffer(buildAgreementPdfElement(input));

  return { pdf, signaturePage: countPdfPages(pdf) };
};
