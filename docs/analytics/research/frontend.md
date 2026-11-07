# Frontend scout report: new page in twenty-front

All paths are relative to WT (`.claude/worktrees/analytics_tool`). Read-only; nothing was run. "Not verified" marks anything I did not open.

## 1. Route and nav

Team inbox and Notifications are wired in four places. A new page needs the same four edits.

1. `packages/twenty-shared/src/types/AppPath.ts:33-34` (a TS `enum`, in twenty-shared, not twenty-front):
   `TeamInbox = '/team-inbox',` / `Notifications = '/notifications',`. Smallest edit: one line, `Analytics = '/analytics',`. Because this is twenty-shared, `npx nx build twenty-shared --skip-nx-cache` is needed before front typechecks (CLAUDE.md gotcha).
2. `packages/twenty-front/src/modules/app/routing/utils/createWorkspaceRouteObjects.tsx`
   - lazy import, lines 42-46: `const TeamInboxPage = lazy(() => import('~/pages/team-inbox/TeamInboxPage').then((module) => ({ default: module.TeamInboxPage })));`
   - route object, lines 141-148: `{ path: AppPath.TeamInbox, element: (<LazyRoute><TeamInboxPage /></LazyRoute>) }`
   - Smallest edit: one lazy const plus one route object. No `handle` is set for either FloLabs page. Routes without `handle` are main-surface only (`isWorkspaceLocationAvailableOnSurface.ts:17`: `?? surface === 'main'`). `workspaceSurfaces: MAIN_AND_SIDE_PANEL` (lines 112-115, 168-171) is only for pages that can open in the side panel. Do not add it.
3. `packages/twenty-front/src/modules/navigation/components/MainNavigationDrawerScrollableItems.tsx`: imports at lines 2-3, items at lines 37-39 (`<NavigationDrawerNotificationsItem /> <NavigationDrawerTeamInboxItem /> <NavigationDrawerFormsItem />`). Smallest edit: one import and one JSX line.
4. Sidebar item component (new file), pattern from `modules/team-inbox/components/NavigationDrawerTeamInboxItem.tsx:9-23`:
   `<NavigationDrawerItem label={t\`Team inbox\`} Icon={IconMail} to={AppPath.TeamInbox} active={location.pathname.startsWith(AppPath.TeamInbox)} />` (import from `@/ui/navigation/navigation-drawer/components/NavigationDrawerItem`).

Where files live: page file `packages/twenty-front/src/pages/analytics/AnalyticsPage.tsx` (as `pages/team-inbox/TeamInboxPage.tsx`); everything else in `packages/twenty-front/src/modules/analytics/{components,hooks,graphql,types,utils,constants}/`. Icon: icon-dictionary.md lists "Dashboard" as `IconLayoutDashboard` ("dashboard, analytics page"), exported from `twenty-ui/icon` (index.ts:316). Use that. Nothing else in the front references `AppPath.TeamInbox` besides the route and the nav item, so no other redirect or path list needs an edit (grep, one search timed out, so treat as nearly complete).

## 2. Page shell

`TeamInboxPage.tsx:10-33` is the template:
`<PageTitle title={t\`Team inbox\`} /> <PageCardLayout header={<PageCardHeader icon={<IconMail size={theme.icon.size.md} stroke={theme.icon.stroke.sm} />} title={t\`Team inbox\`} />}><TeamInboxContent /></PageCardLayout>`
- Imports: `@/ui/layout/page/components/PageCardLayout` (props `header`, `secondaryBar?`, `children`, `showInformationBanner?`; PageCardLayout.tsx:6-11), `@/ui/layout/page/components/PageCardHeader` (props `icon`, `title`, `tag`, `actionButton`, `links`, `breadcrumb`; PageCardHeader.tsx:13-22), `@/ui/utilities/page-title/components/PageTitle`.
- `PageContainer` still exists but is only `styled.div` (flex column, width 100%; PageContainer.tsx). `PageCardLayout` is the current shell. "Last synced" fits in `actionButton` or `tag`.
- The card is `overflow: hidden` and the body is a flex column with `min-height: 0`, so the page body must own its scroll (`flex:1; min-height:0; overflow-y:auto`, as `StyledList` in TeamInboxContent.tsx:85-90).

Tabs. Two patterns exist:
- FloLabs pages hand-roll them: `StyledTabs role="tablist"` plus `StyledTab` buttons with `aria-selected`, state in `useState` (TeamInboxContent.tsx:44-67, 101, 146-159; FormBuilderEditor.tsx:149, 281-294).
- Upstream `TabList` (`@/ui/layout/tab-list/components/TabList`, wrapped in `TabListRoot`). Props (`TabListProps.ts`): `aria-label`, `tabs: SingleTabProps[]` (`{id,title,Icon?,hide?,disabled?,pill?}`), `componentInstanceId`, `behaveAsLinks` (default true), `defaultActiveTabId`, `onChangeTab`, `rightComponent`. State is Jotai `activeTabIdComponentState` keyed by instance id. With `behaveAsLinks` true, the active tab is held in the URL hash (`#overview`; TabList.tsx:93-96). Example: `LogConsole.tsx:605-613`. Better fit for Overview/Categories/Funnel/Trends because deep links work.

URL-held filters: no shared pattern. Only the hash used by `TabList`. `useSearchParams` from `react-router-dom` is used in three unrelated places (`RouteContextStoreProvider.tsx:79`, `ErrorMessageEffect.tsx:9`, `useDiscardCoreWorkflowDraft.ts:16`). If wanted, write a small `useAnalyticsFilters` over `useSearchParams` (new file). Keep `search` and `hash` intact: TabList preserves `location.search` (TabList.tsx, `navigate({ search: location.search, hash })`).

## 3. Calling the backend

GraphQL (the fork's pattern, all hand-written):
- Query in `modules/team-inbox/graphql/getInboxMailboxes.ts`: `import { gql } from '@apollo/client'; export const GET_INBOX_MAILBOXES = gql\`query GetInboxMailboxes { getInboxMailboxes { id handle connectedAccountId } }\`;`
- Hook, `useTeamInboxThreads.ts:14-32`: `const apolloCoreClient = useApolloCoreClient(); const { data, loading, error, refetch } = useQuery<Result>(GET_INBOX_THREADS, { client: apolloCoreClient, variables, fetchPolicy: 'cache-and-network' });` Imports: `useQuery` from `@apollo/client/react` (Apollo v4), `useApolloCoreClient` from `@/object-metadata/hooks/useApolloCoreClient`.
- Result types are hand-written (`types/InboxMailbox.ts`); no codegen needed. `codegen.cjs` `documents` lists only workflow, object-core, activities/emails, calendar, command-menu and one ai file; team-inbox is not in it. Do not import types from `~/generated/graphql` for the new resolver (that would need `nx run twenty-front:graphql:generate`).
- The default Apollo client points at `/metadata` (`ApolloProvider.tsx:14`); the core client at `/graphql` (`useApolloFactory.ts:52`). Always pass `client: apolloCoreClient`. Do not copy the three call sites that omit it (e.g. `FormBuilderResponsesTab.tsx:161-170`).
- Errors: `<ToastOnQueryErrorEffect error={error} />` from `@/apollo/components/ToastOnQueryErrorEffect` (TeamInboxContent.tsx:144).
- Polling: `pollInterval` plus `skipPollAttempt: () => document.hidden` (`useNotificationFeed.ts:30-35`, 60_000 ms; `useTeamInboxReadState.ts:9, 16-22`). For an analytics page that is refreshed by a job once a minute, 60 s with the hidden-tab skip is the pattern.

REST: this version has no `getTokenPair`; I found none in `src`. Auth is cookie based: `ApolloFactory.ts:82-97` sets `credentials: 'include'`, `SSEClientEffect.tsx:62` and `createRecordExportConnection.ts:27` do the same. Base URL: `REACT_APP_SERVER_BASE_URL` (`src/config/index.ts:1-2`) and `REST_API_BASE_URL` (`modules/apollo/constants/RestApiBaseUrl.ts:3`, `/rest`). A REST page would be a plain `fetch(\`${REACT_APP_SERVER_BASE_URL}/analytics/...\`, { credentials: 'include' })` with its own loading, error and refetch code, losing Apollo caching and polling. No generated types either way. GraphQL via the core client is less new code on the front. (Server-side guards for either option are not covered here.)

## 4. Chart reuse

Directory: `modules/page-layout/widgets/graph/`. Tests only have a wrapper (`__tests__/GraphWidgetTestWrapper.tsx`); no jest test renders a chart (only stories).

Required context for bar, line and legend (GraphWidgetTestWrapper.tsx:23-36):
```
<PageLayoutEditModeProviderContext value={{ isInEditMode: false }}>
  <PageLayoutComponentInstanceContext.Provider value={{ instanceId }}>
    <WidgetComponentInstanceContext.Provider value={{ instanceId }}>
```
- `WidgetComponentInstanceContext` (`@/page-layout/widgets/states/contexts/`): tooltip, hover, hidden/highlighted legend state are `createAtomComponentState` keyed to it; `useAtomComponentStateValue` throws if absent.
- `PageLayoutComponentInstanceContext` (`@/page-layout/states/contexts/`): only the bar chart reads it (dragging/resizing ids, GraphWidgetBarChart.tsx:115-121).
- `PageLayoutEditModeProviderContext` (`@/page-layout/contexts/PageLayoutEditModeContext`, `createRequiredContext`, throws): read by `GraphWidgetLegend`. Needed only when `showLegend` renders.
- App-level Jotai store and `ThemeProvider`; `isSidePanelAnimatingState` is a plain global atom; `useNumberFormat` reads `workspaceMemberFormatPreferencesState`. All present on any real page.
- No router, record query, or metadata is needed, except the pie.

**GraphWidgetBarChart** (`graph-widget-bar-chart/components/GraphWidgetBarChart.tsx:37-58`). Props: `data: Record<string,string|number>[]`, `indexBy`, `keys`, `id`, `colorMode` (required; `'automaticPalette'|'explicitSingleColor'|'selectFieldOptionColors'`), `layout?` (`BarChartLayout.HORIZONTAL`, enum imported from `~/generated-metadata/graphql`), `groupMode?: 'grouped'|'stacked'`, `series?: {key,label,color?}[]`, `seriesLabels?`, `showLegend`, `showGrid`, `showValues`, `rangeMin/Max`, `xAxisLabel/yAxisLabel`, `displayType/axisDisplayType/tooltipDisplayType` (`percentage|number|shortNumber|currency|custom`), `decimals/prefix/suffix/customFormatter`, `onSliceClick(slice)`. Parent must give height (`height:100%`, sized by `NodeDimensionEffect`). Works with plain data. Drawn on `<canvas>` (BarChartBaseLayer.tsx:21). Floating tooltip built in. Colors are per key (series), not per row, so "highlight the biggest drop" is not possible with one key. Dark mode through `useTheme()` values on re-render. Reduced motion: not handled (no `prefers-reduced-motion` in the folder); data transitions are on unless the layout is animating.
```
<WidgetShell instanceId="analytics-stage-totals">   // 3 providers above, in analytics/components
  <div style={{ height: 320 }}>
    <GraphWidgetBarChart id="stage-totals" data={[{stage:'Interested',people:420}]}
      indexBy="stage" keys={['people']} layout={BarChartLayout.HORIZONTAL}
      colorMode="automaticPalette" showLegend={false} showValues />
```
**GraphWidgetLineChart** (`graph-widget-line-chart/components/GraphWidgetLineChart.tsx:52-71`). Props: `data: {key,label,color?,data:{x,y|null}[]}[]`, `id`, `colorMode`, `groupMode?: 'stacked'`, `enableArea`, `enablePointLabel`, `showLegend/showGrid`, `rangeMin/Max`, axis labels, same format props, `onSliceClick(point)`. Uses `@nivo/line` `ResponsiveLine` with a point scale (x is categorical, not a time axis; sort and label dates yourself). Stacked areas are supported (CustomStackedAreasLayer), so "stage mix over time" works. Same 2 component contexts (tooltip and crosshair state). `animate` is always on but the spring is near instant (`ChartMotionConfig.ts`). Previous-period gray line: `color: 'gray'` is allowed by `GraphColor`; whether the registry contains gray (`createGraphColorRegistry.ts`) is not verified.
```
<GraphWidgetLineChart id="trend" colorMode="automaticPalette" showLegend
  data={[{key:'now',label:'This period',color:'blue',data:[{x:'Mon',y:12}]},
         {key:'prev',label:'Previous',color:'gray',data:[{x:'Mon',y:9}]}]} />
```
**GraphWidgetPieChart**: cannot be used standalone. It requires `objectMetadataItemId` and a `PieChartConfiguration` and mounts `PieChartCenterMetric`, which runs its own aggregate query (`usePieChartCenterMetricData`, PieChartCenterMetricLayer.tsx:44-60). The brief says no pies anyway.

**GraphWidgetAggregateChart** (`graph-widget-aggregate-chart/components/GraphWidgetAggregateChart.tsx:8-13`): props `value`, `trendPercentage?`, `prefix?`, `suffix?`. Needs only the theme; works anywhere. It shows a single number with a trend icon; no sparkline.

Recommendation: reuse bar and line through one thin wrapper file in `modules/analytics/components` (provides the three contexts, fixed height, the only place importing from `page-layout/widgets/graph`). That localizes upgrade risk: these are internal paths with no public API, and the bar chart also depends on the generated GraphQL enum. Since this fork merges upstream manually, one wrapper means one file to fix. Weaknesses: canvas bars give no keyboard focus and no per-row color; the brief requires a table view for each chart, which you build yourself in either case. Simple custom components are cleaner for the main-number tiles (the stat tile pattern at `FormBuilderResponsesTab.tsx:29-55, 219-238`). Pie: skip.

## 5. Custom views

Build funnel rows, cohort grid and range view from plain DOM with Linaria, as `FormBuilderResponsesTab.tsx` already does for its funnel (lines 57-82, 240-259): `StyledFunnelRow` is `display:grid; grid-template-columns: 96px minmax(0,1fr) 56px`, `StyledBarTrack` (`background.tertiary`, 8px) holding `StyledBar` with an inline `style={{ width }}`. DOM rows give keyboard focus, `aria-label`, and a free table fallback.
- Tokens: `import { themeCssVariables } from 'twenty-ui/theme'`. Groups: `spacing[1..]`, `font.size.xs..xxl`, `font.weight.regular|medium|semiBold`, `font.color.primary|secondary|tertiary|light|extraLight`, `background.primary|secondary|tertiary|transparent.light|medium`, `border.color.light|medium`, `border.radius.sm|md`, `color.<name>` (25 names, e.g. `color.blue`), numbered scales `color.<name>1..12` (e.g. `color.blue8`), `color.transparent.<name>N`, `grayScale.gray1..12`. Shades of one color for the cohort grid: `color.blue2` to `color.blue9`.
- Dark mode: tokens are CSS variables (`var(--t-...)`) redefined in `theme-dark.css`, and `ThemeProvider` toggles the `.dark` class. Linaria styles using `themeCssVariables` adapt with no code. Only canvas and nivo code needs `useTheme()` concrete values.
- Linaria: `import { styled } from '@linaria/react'`; component names start with `Styled`; CSS properties sorted alphabetically (lint rule); dynamic props via function interpolation, as `StyledTab` (TeamInboxContent.tsx:49-67) or inline `style` for data-driven widths.
- No hard-coded colors anywhere: `no-hardcoded-colors` flags `rgba(` and `#abc` in any string or template.
- twenty-ui components use SCSS modules, the front uses Linaria; do not mix.

## 6. UI kit inventory

twenty-ui (subpath exports, `packages/twenty-ui/package.json`):
- `twenty-ui/primitives/input`: `Button`, `Input`, `Select` (primitive), `Checkbox`, `Switch`, `Autocomplete`, `Field`.
- `twenty-ui/components/input`: `SegmentedControl` (props `options`, `size`, `itemWidth`, `aria-label`), `SearchInput`, `IconButton`, `LightButton`.
- `twenty-ui/primitives/data-display`: `Tag` (`color`, `startIcon`), `Chip`, `Badge`, `Status`. `twenty-ui/components/data-display`: `MetricRow` (`value`, `progress`).
- `twenty-ui/primitives/feedback`: `Banner`, `Skeleton`, `ProgressBar`, `Loader`. `twenty-ui/components/feedback`: `InlineBanner`, `Callout`, `useToast`.
- `twenty-ui/primitives/surfaces`: `Tooltip`, `Card`, `Popover`. `twenty-ui/components/layout`: `Section` (`Section.Root`, `Section.Header`) for section titles. `twenty-ui/primitives/typography`: `Heading`, `Text`, `OverflowingTextWithTooltip`.

twenty-front:
- Single select: `@/ui/input/components/Select` (generic `TValue`, required `dropdownId`, `options`, `value`, `onChange`, `label`, `withSearchInput`, `fullWidth`; SelectProps.ts). Fork alternative: `@/form-builder/components/FormBuilderNativeSelect` (`value`, `options`, `onChange`, `ariaLabel`), used by Team inbox for the mailbox filter.
- Multi select: `@/ui/input/components/MultiSelectControl.tsx` exists; API not verified. A standalone filter-chip component does not exist (chips found are record or object-filter specific). Build a small chip row or use `Tag`.
- Date range: none. There is `@/ui/input/components/internal/date/components/DatePicker` (needs `instanceId`, `plainDateString`; DatePicker.tsx:73-97) but no range component. Use presets in `SegmentedControl` plus two native date inputs (no `type="date"` use found elsewhere; fork already uses native selects).
- Tables: `@/ui/layout/table/components/{Table,TableRow,TableCell,TableHeader}`; the fork's own tab uses a styled raw `<table>` (FormBuilderResponsesTab.tsx:103-140, row click opens `useOpenRecordInSidePanel` from `@/side-panel/hooks/useOpenRecordInSidePanel`; that is how "each row opens the person" works).
- Skeleton: `@/ui/feedback/skeleton/components/SkeletonLine`; `@/activities/components/SkeletonLoader`. Empty and error: `@/ui/feedback/empty-state/components/EmptyState` and `ErrorState`; the fork uses a styled `<p>` (TeamInboxContent.tsx:92-96).
- Numbers: `useNumberFormat()` from `@/localization/hooks/useNumberFormat` (returns `formatNumber(value,{decimals})`); `formatNumber` options include `abbreviate` (`@/localization/utils/formatNumber.ts`); `formatToShortNumber` from `twenty-shared/utils`. Dates: `useDateTimeFormat()` (time zone, date format), `beautifyPastDateRelativeToNow` from `~/utils/date-utils` (used for last synced). `~/utils/format/formatDuration` only does ms and seconds; not useful for days.

## 7. Closest existing screen

`modules/form-builder/components/FormBuilderResponsesTab.tsx` (339 lines): `StyledStats` grid of 4 stat tiles, funnel bar rows, hint text, header with Export button, sticky-header table, load-more. Structure to copy: tiles, funnel, table. Do not copy line 161 (missing core client). `TeamInboxContent.tsx` is the shell to copy: toolbar with tabs, select, search, count, then a scrolling body.

## 8. Rules

Lint (`packages/twenty-front/.oxlintrc.json`, custom plugin `packages/twenty-oxlint-rules/rules/`): `twenty/no-hardcoded-colors`, `sort-css-properties-alphabetically`, `styled-components-prefixed-with-styled`, `component-props-naming` (`<Name>Props`), `no-state-useref`, `effect-components`, `matching-state-variable`, `folder-structure` (kebab-case module folders, no files directly in `modules/`, files only in leaf folders such as `components`, `hooks`, `utils`, `types`, `graphql`, `constants`; `use*` in hooks; PascalCase in `types`), `max-consts-per-file` 1 in `constants/*.ts`, `no-restricted-imports` (no `../` imports, no `@tabler/icons-react`), `typescript/consistent-type-imports` (inline `type`), `typescript/strict-boolean-expressions`, `no-duplicate-imports`, `react/jsx-props-no-spreading`.
Lingui: every user-facing string via `t\`...\`` (`@lingui/core/macro`) or `useLingui`. A separate check, `lint:unlocalized-strings` (`.oxlintrc.i18n.json`, `eslint-plugin-lingui` `no-unlocalized-strings`), runs inside `lint` and ignores tokens such as `Icon*`, URLs, CSS lengths. Dev-only strings need `// oxlint-disable-next-line lingui/no-unlocalized-strings -- reason`. Do not commit `.po` files or `src/locales/generated/*` (CLAUDE.md); do not run `lingui extract` or `compile`.
Single front test (from WT root): `npx jest <file> --config=packages/twenty-front/jest.config.mjs`. Jest uses jsdom and `@swc/jest` with the lingui plugin.
Closest tests to copy: pure util `modules/notifications/utils/__tests__/buildNotificationItems.test.ts` (put metric math in `utils/` and test it); component `modules/ui/layout/page/components/__tests__/PageCardLayout.test.tsx`; chart story `page-layout/widgets/graph/components/__stories__/GraphWidgetBarChart.stories.tsx` (stories `Horizontal`, `Default` with `groupMode: 'stacked'`). In jest, `useApolloCoreClient` returns the default client under `NODE_ENV=test`, so hooks need only a normal Apollo `MockedProvider`.
