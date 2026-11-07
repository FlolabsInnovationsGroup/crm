'use strict';
// Real payloads from Postgres, handed to the front half, so one test can follow a value
// from a CRM row to the text on the screen.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { seedDistinct } = require('./seed.cjs');
const { toDate } = require('./taps.cjs');

// A source the field no longer lists, for the Unmapped row.
const readCategoriesWithUnknownSource = async ({ context, workspace }) => {
  const field = workspace.flatMaps.flatFieldMetadataMaps.byUniversalIdentifier['person-applicantSource-uid'];
  const { options } = field;

  field.options = options.filter(({ value }) => value !== 'LINKEDIN');

  try {
    return await context.page.categories(workspace, 'SOURCE');
  } finally {
    field.options = options;
  }
};

const writeRealPayloads = async ({ context, isAvailable, runner }) => {
  if (!isAvailable) return undefined;

  const outputFile = await runner.fixture('real payloads for the front half', async () => {
    const workspace = await seedDistinct(context);
    const { daysAgo, page } = context;

    await context.runSync(workspace);
    await context.runDaily(workspace);

    const reports = await page.reports(workspace);
    // The one the Reports tab opens first.
    const [newest] = reports.toSorted((first, second) => second.periodEnd.localeCompare(first.periodEnd));
    const file = path.join(os.tmpdir(), `dataflow-real-payloads-${process.pid}.json`);

    fs.writeFileSync(
      file,
      JSON.stringify({
        meta: await page.meta(workspace),
        overview: await page.overview(workspace),
        funnel: await page.funnel(workspace),
        categories: await page.categories(workspace, 'TRACK_PROGRAM'),
        categoriesWithUnknownSource: await readCategoriesWithUnknownSource({ context, workspace }),
        dropOff: await page.trends(workspace, 'DROP_OFF'),
        // Tracking started 120 days ago, in the middle of this range.
        volumeAroundStart: await page.trends(workspace, 'NEW_APPLICATIONS', {
          filter: { dateFrom: toDate(daysAgo(140)), dateTo: toDate(daysAgo(100)) },
        }),
        reports,
        report: await page.report(workspace, newest.periodType, newest.periodStart),
      }),
    );

    return file;
  });

  return outputFile ?? undefined;
};

module.exports = { writeRealPayloads };
