/**
 * @jest-environment node
 */
import { renderToBuffer } from '@react-pdf/renderer';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { inflateSync } from 'node:zlib';

import {
  buildEmptyReportFixture,
  buildLongLabelReportFixture,
  buildMonthlyReportFixture,
  buildNoRatesReportFixture,
  buildOversizedReportFixture,
  buildWeeklyReportFixture,
} from '@/crm-analytics/report-pdf/__tests__/analyticsPdfFixtures';
import { AnalyticsReportPdfDocument } from '@/crm-analytics/report-pdf/components/AnalyticsReportPdfDocument';
import { type AnalyticsReport } from '@/crm-analytics/types/AnalyticsApi';

// The library ships ES modules only and the shared Jest config does not transform node_modules,
// so the test bundles it to CommonJS once. React stays external, so both sides share one copy.
jest.mock('@react-pdf/renderer', () => {
  const { buildSync } = jest.requireActual<typeof import('esbuild')>('esbuild');
  const { outputFiles } = buildSync({
    stdin: {
      contents: `export * from '@react-pdf/renderer';`,
      resolveDir: process.cwd(),
    },
    bundle: true,
    write: false,
    platform: 'node',
    format: 'cjs',
    external: ['react'],
    logLevel: 'silent',
  });
  const bundledModule = { exports: {} };

  // oxlint-disable-next-line no-new-func
  new Function('module', 'exports', 'require', outputFiles[0].text)(
    bundledModule,
    bundledModule.exports,
    require,
  );

  return bundledModule.exports;
});

const SAMPLES_DIRECTORY = process.env.ANALYTICS_PDF_SAMPLES_DIRECTORY;

const renderSample = async (name: string, report: AnalyticsReport) => {
  const buffer = await renderToBuffer(
    <AnalyticsReportPdfDocument report={report} />,
  );

  if (SAMPLES_DIRECTORY !== undefined) {
    mkdirSync(SAMPLES_DIRECTORY, { recursive: true });
    writeFileSync(join(SAMPLES_DIRECTORY, `${name}.pdf`), buffer);
  }

  return buffer;
};

const countPages = (buffer: Buffer) =>
  buffer.toString('latin1').match(/\/Type \/Page\b/g)?.length ?? 0;

// Pulls every string the content streams draw, so the tests read what a reader would read.
const extractPdfText = (buffer: Buffer) => {
  const source = buffer.toString('latin1');
  const chunks: string[] = [];
  const streamPattern = /stream\n([\s\S]*?)\nendstream/g;

  for (const match of source.matchAll(streamPattern)) {
    let content: string;

    try {
      content = inflateSync(Buffer.from(match[1], 'latin1')).toString('latin1');
    } catch {
      continue;
    }

    for (const textArray of content.matchAll(/\[([^\]]*)\]\s*TJ/g)) {
      const text = Array.from(textArray[1].matchAll(/<([0-9a-fA-F]*)>/g))
        .map(([, hexadecimal]) =>
          Buffer.from(hexadecimal, 'hex').toString('latin1'),
        )
        .join('');

      chunks.push(text);
    }
  }

  return chunks;
};

// Wrapped lines end in a space of their own, so sentences need collapsing to be searched.
const joinPdfText = (text: string[]) => text.join(' ').replace(/\s+/g, ' ');

const expectValidPdf = (buffer: Buffer) => {
  expect(buffer.subarray(0, 5).toString()).toBe('%PDF-');
  expect(buffer.length).toBeGreaterThan(1000);
};

describe('AnalyticsReportPdfDocument', () => {
  it('renders a weekly report with every section and a page count on each page', async () => {
    const buffer = await renderSample('weekly', buildWeeklyReportFixture());

    expectValidPdf(buffer);

    const pageCount = countPages(buffer);
    const text = extractPdfText(buffer);
    const joinedText = text.join(' ');

    expect(pageCount).toBeGreaterThanOrEqual(5);

    for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
      expect(text).toContain(`Page ${pageNumber} of ${pageCount}`);
    }

    expect(joinedText).toContain('Weekly analytics report');
    expect(joinedText).toContain('Built on provisional definitions');
    expect(joinedText).toContain('Contacted to Before meeting');
    expect(joinedText).toContain('Agreement sent');
    expect(joinedText).toContain('Lowest step');
    expect(joinedText).toContain('Stalled');
    expect(joinedText).toContain('Still in progress');
    expect(joinedText).toContain('Left');
    expect(joinedText).toContain('Groups by application month');
    expect(joinedText).not.toContain('eligible');
  });

  it('adds programs and the cohort heatmap to a monthly report', async () => {
    const buffer = await renderSample('monthly', buildMonthlyReportFixture());

    expectValidPdf(buffer);

    const joinedText = extractPdfText(buffer).join(' ');

    expect(countPages(buffer)).toBeGreaterThanOrEqual(7);
    expect(joinedText).toContain('Monthly analytics report');
    expect(joinedText).not.toContain('Built on provisional definitions');
    expect(joinedText).toContain('Programs');
    expect(joinedText).toContain('Sport Science Intern');
    expect(joinedText).toContain('People who applied in');
    expect(joinedText).toContain('so far');
  });

  it('says so in plain lines when a report has no data, on one page', async () => {
    const buffer = await renderSample('empty', buildEmptyReportFixture());

    expectValidPdf(buffer);

    const text = extractPdfText(buffer);
    const joinedText = text.join(' ');

    expect(countPages(buffer)).toBe(1);
    expect(joinedText).toContain('No one has entered the funnel');
    expect(joinedText).toContain('No people in any track yet.');
    expect(joinedText).toContain('There is nothing to compare yet.');
    expect(text).not.toContain('0%');
  });

  it('prints unknown rates as a dash and never 0% when rates and labels misbehave', async () => {
    const buffer = await renderSample(
      'long-labels',
      buildLongLabelReportFixture(),
    );

    expectValidPdf(buffer);

    const text = extractPdfText(buffer);
    const joinedText = text.join(' ');

    // The only 0% allowed is the end of the color scale printed under each heatmap.
    expect(text.filter((line) => line === '0%')).toHaveLength(
      text.filter((line) => line.startsWith('Gray:')).length,
    );
    expect(text).toContain('\u0096');
    expect(joinedText).toContain('Trend lines are not stored in this report');
  });

  it('says why a trend line cannot be drawn instead of leaving it empty', async () => {
    const weekly = buildWeeklyReportFixture();
    const trendSeries = weekly.trendSeries?.map((series) =>
      series.metric === 'NEW_APPLICATIONS'
        ? {
            ...series,
            unavailableReason: 'NO_SUBMISSION_OBJECT' as const,
            points: [],
          }
        : series,
    );
    const buffer = await renderToBuffer(
      <AnalyticsReportPdfDocument report={{ ...weekly, trendSeries }} />,
    );
    const joinedText = extractPdfText(buffer).join(' ');

    expect(joinedText).toContain('Form submissions are not available');
    expect(joinedText).toContain('Overall conversion over time');
  });

  it('draws the drop-off line from the stage key the server stores, and names the stage', async () => {
    const buffer = await renderToBuffer(
      <AnalyticsReportPdfDocument report={buildWeeklyReportFixture()} />,
    );
    const joinedText = joinPdfText(extractPdfText(buffer));

    expect(joinedText).toContain('Drop-off from New over time');
    expect(joinedText).toContain('did not move on from New within 14 days');
    expect(joinedText).not.toContain('Not enough data to draw this line yet.');
  });

  it('labels the trend lines by what they draw, not as a report period', async () => {
    const buffer = await renderToBuffer(
      <AnalyticsReportPdfDocument report={buildWeeklyReportFixture()} />,
    );
    const text = extractPdfText(buffer);

    expect(text).toContain('Last 12 weeks');
    expect(text).toContain('The 12 weeks before');
    expect(text).toContain('Small group');
  });

  it('says so in a plain line when people exist but no rate is known yet', async () => {
    const buffer = await renderSample('no-rates', buildNoRatesReportFixture());
    const text = extractPdfText(buffer);
    const joinedText = joinPdfText(text);

    expect(joinedText).toContain(
      'Conversion appears once people have had 90 days.',
    );
    expect(joinedText).toContain(
      "Conversion appears once people have had a step's full window.",
    );
    expect(joinedText).toContain(
      'Time in stage appears once people have completed a stay.',
    );
    // The overall figure and the rate on each of the funnel's 7 steps, and no chart full of dashes.
    expect(text.filter((line) => line === '\u0096')).toHaveLength(8);
  });

  it('discloses the overlap wherever bars overlap', async () => {
    const buffer = await renderToBuffer(
      <AnalyticsReportPdfDocument report={buildMonthlyReportFixture()} />,
    );
    const joinedText = joinPdfText(extractPdfText(buffer));

    expect(joinedText).toContain('in several programs count once in each.');
    expect(joinedText).toContain(
      "An application counts once in each of the person's tracks",
    );
    expect(joinedText).toContain('Bars scaled to the highest rate');
  });

  it('leaves programs out of a weekly report', async () => {
    const weekly = buildWeeklyReportFixture();
    const programRow = {
      ...weekly.categories.rows[0],
      key: 'A_PROGRAM',
      parentKey: 'AI_SOFTWARE',
      label: 'A program only monthly reports show',
    };
    const buffer = await renderToBuffer(
      <AnalyticsReportPdfDocument
        report={{
          ...weekly,
          categories: {
            ...weekly.categories,
            rows: [...weekly.categories.rows, programRow],
          },
        }}
      />,
    );

    expect(extractPdfText(buffer).join(' ')).not.toContain('A program only');
  });

  it("breaks charts and tables far longer than today's across clean pages", async () => {
    const buffer = await renderSample(
      'oversized',
      buildOversizedReportFixture(),
    );

    expectValidPdf(buffer);

    const joinedText = extractPdfText(buffer).join(' ');

    expect(joinedText).toContain('Newer groups, continued');
    expect(joinedText).toContain('Conversion at every step, continued');
    expect(joinedText).not.toContain('?, continued');
    expect(joinedText).toContain('Entered Stage number 22');
    expect(joinedText).not.toContain('Sta\u0085');
  });

  it('never prints a person name field or the word n=', async () => {
    const buffer = await renderSample('weekly', buildWeeklyReportFixture());
    const joinedText = extractPdfText(buffer).join(' ');

    expect(joinedText).not.toContain('n=');
    expect(joinedText).not.toContain('displayName');
  });
});
