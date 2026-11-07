export const meta = {
  name: 'analytics-report-pdf',
  description: 'Build the downloadable PDF report with all its graphs, then review it for numbers, looks and safety, then fix',
  whenToUse: 'The user asked for reports to download as PDFs that hold all the visual graphs',
  phases: [
    { title: 'Build', detail: 'frozen trend history in reports, and the PDF document', model: 'opus' },
    { title: 'Review', detail: 'numbers, rendered pages, CRM safety', model: 'opus' },
    { title: 'Fix', detail: 'one fix pass, then look at the pages again', model: 'opus' },
  ],
}

const WT = 'D:/Coding/Flolabs/crm/.claude/worktrees/analytics_tool'
const WORK = 'D:/Coding/Flolabs/crm/.claude/worktrees/analytics-work'
const FRONT_MODULE = `${WT}/packages/twenty-front/src/modules/crm-analytics`
const SERVER_MODULE = `${WT}/packages/twenty-server/src/modules/analytics`
const PDF = `${FRONT_MODULE}/report-pdf`
const SAMPLES = `${WORK}/e2e/pdf-samples`
const DATAVIZ = 'C:/Users/Ahsan/AppData/Local/Temp/claude/bundled-skills/2.1.317/a67a8087992ce5308233718bb6e25574/dataviz'

const RENDER_HOW = `To look at a PDF, turn each page into an image and read it with the Read tool:
python -X utf8 -c "import pymupdf,sys,glob; [ [p.get_pixmap(dpi=90).save(f[:-4]+f'-p{i+1}.png') for i,p in enumerate(pymupdf.open(f))] for f in glob.glob(r'${SAMPLES}/*.pdf') ]"`

const COMMON = `You are working on the CRM Analytics tool inside FloLabs CRM, a fork of Twenty. This is the company's live CRM. The user asked for this in their words: "the report should be in pdf format downloadable and it should have all the visual graphs as well". They will present it to the team.

Working copy: ${WT} (branch analytics_tool). Use absolute paths, and cd there in Bash. Never touch D:/Coding/Flolabs/crm/packages, a different checkout.

Read first: ${WT}/docs/analytics/dashboard-redesign.md, especially the Reports section, which says exactly what the PDF holds. Then, as needed, ${WORK}/contract.md sections 6 and 7 and its last sections "Decisions from testing" and "Dashboard redesign". Metric definitions there still hold.

Other agents are rebuilding the page tabs right now under ${FRONT_MODULE}/components/ and the chart kit under ${FRONT_MODULE}/charts/. Do not edit their files.

Rules:
- Never edit an existing CRM file.
- Do not run git add, commit, stash, checkout, merge or push, nor yarn install, nx, tsgo, lint, lingui, docker or any build. You may run one test at a time: cd ${WT} && npx jest <file> --config=packages/<twenty-front or twenty-server>/jest.config.mjs. Keep memory use low: this laptop is short of memory.
- CLAUDE.md conventions apply: types not interfaces, no any, named exports, functional components, no abbreviations, existing helpers such as isDefined, short comments only for a non-obvious why.
- No new npm packages.
- Never print 0% for something unknown. Build what the design says, nothing more.

Your final text must be at most 150 words: what you built, tests with results, deviations from the design, anything not verified.`

phase('Build')
const [serverWork, pdfDocument] = await parallel([
  () => agent(`${COMMON}

YOUR JOB: frozen history in each report. Edit only under ${SERVER_MODULE}/, plus the front copy of the types at ${FRONT_MODULE}/types/AnalyticsApi.ts and the section 7 block in both ${WORK}/contract.md and ${WT}/docs/analytics/contract.md, keeping the type files byte-identical.

Add the optional field trendSeries?: AnalyticsSeries[]; to AnalyticsReport. AnalyticsSeries already exists in the types from the getCrmAnalyticsSeries work, so read that first, and read how crm-analytics-report.service.ts builds a report and how the metrics service computes series.

In buildReport, store series for NEW_APPLICATIONS, TOTAL_CONTACTS, OVERALL_CONVERSION, DROP_OFF and MEDIAN_DAYS at the report's own period type, up to and including the report's period and never past it, with the default bucket count. A report built later, as a backfill does, must hold the same buckets it would have held at the time; state plainly anything that cannot be reproduced exactly, such as a rate that uses today's stages. A series that fails or is unavailable must not lose the report: store it with its unavailableReason or leave it out. Stay inside the existing job connection and limits. Existing rows are not rewritten except by the provisional rebuild rule already there. Update specs and run those you affect one at a time.`, { label: 'pdf-server', phase: 'Build', model: 'opus', effort: 'high' }),

  () => agent(`${COMMON}

YOUR JOB: the PDF itself. You own only the new folder ${PDF}/, with tests in ${PDF}/__tests__/. The report view's button, written by another agent, will call exactly this through a dynamic import:
  const { downloadAnalyticsReportPdf } = await import('@/crm-analytics/report-pdf/downloadAnalyticsReportPdf');
  await downloadAnalyticsReportPdf(report);
report is AnalyticsReport from ${FRONT_MODULE}/types/AnalyticsApi.ts. Its optional trendSeries field is being added now by another agent, so read it defensively. A report with no trendSeries still produces a good PDF, with a plain line where those charts would be.

Use @react-pdf/renderer and file-saver, which the CRM already has. packages/twenty-front/src/modules/command-menu-item/record/single-record/utils/exportBlockNoteEditorToPdf.ts is the existing example of pdf(...).toBlob() and saveAs. File name: FloLabs-analytics-weekly-<period start>.pdf or -monthly-. Nothing else may import this folder statically, so the PDF library never loads with the page.

Read for chart quality: ${DATAVIZ}/SKILL.md, references/choosing-a-form.md, marks-and-anatomy.md, anti-patterns.md, palette.md. Print always uses light colors. Choose hex values matching the CRM's light theme from packages/twenty-ui and the chart kit in ${FRONT_MODULE}/charts/ if it is there yet, and validate them: node ${DATAVIZ}/scripts/validate_palette.js "<hex,hex,...>" --mode light. Keep one accent, gray for context, one sequential hue for heatmaps. Hex values live in constants here because react-pdf cannot read CSS variables, one const per file. All user-facing strings go through t from @lingui/core/macro, not hooks, since react-pdf has its own renderer. Do not run lingui extract or compile. Reuse existing formatters and takeaway builders in ${FRONT_MODULE}/utils/ where they fit, and keep the plain words from the design: "Stalled", "Still in progress", "Left".

Build the charts as react-pdf Svg primitives (Svg, Rect, Path, Line, Circle, G, Text), as small focused functions taking plain data: horizontal bars, stacked 100% bars, columns with one highlighted, a centered funnel with connectors and step percents, diverging bars, a heatmap with a value in each cell, line with a gray previous series and gaps on null. react-pdf cannot measure text, so choose fixed label columns and truncate long labels safely with a helper. Long track names such as "Business Management, Growth & Entrepreneurship" must not overlap anything.

Layout: A4 portrait. A fixed header with the report title and a fixed footer with "Page x of y" on every page. Each chart block uses wrap={false} so a chart is never split across pages. Sections and contents exactly as the design lists. Weekly and monthly differ as it says. Every chart states its unit and date basis in one small line. Unknown prints as a dash, small samples print lighter with their count, an empty section prints one plain line. Key figures and answers on page one must name real stages and numbers from the payload.

Prove it: write a test that builds the document from realistic fixtures and gets real PDF bytes, for: a weekly report, a monthly report with many programs, an empty report, and a report with long labels and null rates. Use renderToBuffer or whatever works under jest; a @jest-environment node docblock may help, and if jest cannot load the library, use a small script run with npx tsx and say so. Write the sample PDFs into ${SAMPLES}/ (create it; it is outside git), only when an environment variable you choose is set, so normal test runs write nothing.
${RENDER_HOW}
Look at every page of every sample, and fix what you see: overlaps, clipped text, charts too small, bad page breaks, empty-looking pages. Repeat until a designer would not retouch it.`, { label: 'pdf-document', phase: 'Build', model: 'opus', effort: 'xhigh' }),
])
log(`Build: server ${serverWork ? 'ok' : 'FAILED'}, document ${pdfDocument ? 'ok' : 'FAILED'}`)

phase('Review')
const REVIEW = {
  type: 'object',
  properties: {
    defects: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          file: { type: 'string' },
          severity: { type: 'string', enum: ['blocker', 'major', 'minor'] },
          problem: { type: 'string' },
          evidence: { type: 'string' },
          fix: { type: 'string' },
        },
        required: ['file', 'severity', 'problem', 'evidence', 'fix'],
      },
    },
    summary: { type: 'string' },
  },
  required: ['defects', 'summary'],
}
const reviewCommon = `You are an independent senior reviewer of a new PDF report feature in the CRM Analytics tool of FloLabs CRM, a fork of Twenty. You did not write this code, so assume there are mistakes. Working copy: ${WT} (branch analytics_tool). The PDF code is in ${PDF}/ and the server side is the trendSeries work in ${SERVER_MODULE}/services/crm-analytics-report.service.ts and the type files. Read ${WT}/docs/analytics/dashboard-redesign.md (Reports section) and contract sections 6 and 7. Other agents are editing the page tabs; those are not your concern. Do not edit anything. Do not run git add, commit, stash, checkout, merge or push, nor yarn install, nx, tsgo, lint or docker. Report real defects with file and line evidence and a concrete fix. An empty list is fine if it is right. summary is at most 80 words.`
const reviews = await parallel([
  () => agent(`${reviewCommon}

Your lens: THE NUMBERS. Trace every number and label in the PDF back to the payload field and the definition in contract section 6. Does each title say what the number really is? Are rates fractions printed correctly? Is unknown ever printed as 0%? Is any share summed when positions overlap? Is the funnel's step percent the right one between the right two stages? Do trend charts handle null as a gap? Is the frozen history truly limited to the report's own period? Is the frozen report's comparison the right direction?`, { label: 'pdf-review-numbers', phase: 'Review', model: 'opus', effort: 'high', schema: REVIEW }),
  () => agent(`${reviewCommon}

Your lens: HOW IT LOOKS. Regenerate the samples the way ${PDF}/__tests__/ describes, then read every page image, as a designer and as a recruiter handed this PDF.
${RENDER_HOW}
Report overlaps, clipped or truncated text that loses meaning, charts split across pages, pages mostly empty, weak hierarchy, unreadable small text, color that cannot be told apart in print, missing legends, missing units. Is any graph from the design missing? Would you present this to a team?`, { label: 'pdf-review-looks', phase: 'Review', model: 'opus', effort: 'high', schema: REVIEW }),
  () => agent(`${reviewCommon}

Your lens: SAFETY. Is ${PDF}/ imported statically from anywhere, which would load the PDF library on every page? Does the download fail cleanly with a visible error, and not freeze the browser tab on a large report? Is any person's name or email able to reach the PDF? On the server, could the new series stop a report being built, exceed the job limits, block the queue, or write anything outside analytics.*? Are the two type files byte-identical? Would any import fail at compile time? Conventions: Lingui on visible strings, named exports, one const per constants file, no any, no ../ imports.`, { label: 'pdf-review-safety', phase: 'Review', model: 'opus', effort: 'high', schema: REVIEW }),
])
const findings = reviews.filter(Boolean).flatMap((review) => review.defects)
log(`Review: ${findings.length} findings, ${findings.filter((defect) => defect.severity !== 'minor').length} serious`)

phase('Fix')
const fixes = findings.length === 0 ? null : await agent(`${COMMON}

YOUR JOB: one fix pass on these review findings. Only edit files under ${PDF}/ and ${SERVER_MODULE}/, and both API type files together if types must change. Confirm each finding first, since a reviewer can be wrong. Fix the real ones, and say why you reject any others. Regenerate the samples and look at every page again.
${RENDER_HOW}
Findings:
${JSON.stringify(findings, null, 1)}`, { label: 'pdf-fix', phase: 'Fix', model: 'opus', effort: 'high' })

return { serverWork, pdfDocument, reviews, fixes }
