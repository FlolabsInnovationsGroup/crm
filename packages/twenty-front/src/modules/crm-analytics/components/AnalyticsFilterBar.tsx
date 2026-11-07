import { styled } from '@linaria/react';
import { t } from '@lingui/core/macro';
import { type ReactNode, useState } from 'react';
import { isDefined } from 'twenty-shared/utils';
import { Tooltip } from 'twenty-ui/primitives/surfaces';
import { themeCssVariables } from 'twenty-ui/theme';
import { Temporal } from 'temporal-polyfill';
import { useDebouncedCallback } from 'use-debounce';

import { AnalyticsFilterChips } from '@/crm-analytics/components/AnalyticsFilterChips';
import {
  type AnalyticsFilter,
  type AnalyticsMeta,
  type AnalyticsStatusFilter,
} from '@/crm-analytics/types/AnalyticsApi';
import {
  type AnalyticsDatePresetKey,
  findAnalyticsDatePreset,
  getAnalyticsDatePresetRange,
} from '@/crm-analytics/utils/getAnalyticsDatePreset';
import { getAnalyticsFilterChips } from '@/crm-analytics/utils/getAnalyticsFilterChips';
import {
  getAnalyticsProgramFilterLabel,
  getAnalyticsSourceFilterLabel,
  getAnalyticsStatusFilterLabel,
  getAnalyticsTrackFilterLabel,
} from '@/crm-analytics/utils/getAnalyticsFilterLabels';
import { Select } from '@/ui/input/components/Select';
import { GenericDropdownContentWidth } from '@/ui/layout/dropdown/constants/GenericDropdownContentWidth';

type AnalyticsDatePreset = AnalyticsDatePresetKey | 'ALL' | 'CUSTOM';

const STATUS_OPTIONS: AnalyticsStatusFilter[] = [
  'ALL',
  'ACTIVE',
  'SUCCESS',
  'EXITED',
  'UNMAPPED',
  'NO_STAGE',
];

const COMPLETE_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// The server refuses anything later, which would turn every tab into an error panel.
const LATEST_ALLOWED_DATE = '2100-12-31';

const DATE_IDLE_COMMIT_DELAY_IN_MS = 600;

const StyledBar = styled.div`
  border-bottom: 1px solid ${themeCssVariables.border.color.light};
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[2]};
  padding: ${themeCssVariables.spacing[2]} ${themeCssVariables.spacing[4]};
`;

const StyledControls = styled.div`
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  font-size: ${themeCssVariables.font.size.sm};
  gap: ${themeCssVariables.spacing[2]};
`;

const StyledControl = styled.div`
  border-radius: ${themeCssVariables.border.radius.md};
  flex: 0 1 144px;
  min-width: 112px;

  &:focus-visible {
    outline: 2px solid ${themeCssVariables.color.blue};
    outline-offset: 1px;
  }
`;

const StyledDateInput = styled.input`
  background: ${themeCssVariables.background.transparent.lighter};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.md};
  box-sizing: border-box;
  color: ${themeCssVariables.font.color.primary};
  font-family: inherit;
  font-size: inherit;
  font-variant-numeric: tabular-nums;
  height: ${themeCssVariables.spacing[6]};
  padding: 0 ${themeCssVariables.spacing[1]};

  &:focus-visible {
    border-color: ${themeCssVariables.color.blue};
    outline: none;
  }
`;

type AnalyticsFilterControlProps = {
  label: string;
  disabledReason: string | null;
  children: ReactNode;
};

// A disabled Select cannot take focus, so the wrapper carries the reason for keyboard and pointer.
const AnalyticsFilterControl = ({
  label,
  disabledReason,
  children,
}: AnalyticsFilterControlProps) => {
  if (!isDefined(disabledReason)) {
    return (
      <StyledControl role="group" aria-label={label}>
        {children}
      </StyledControl>
    );
  }

  return (
    <Tooltip content={disabledReason}>
      <StyledControl
        role="group"
        tabIndex={0}
        aria-disabled="true"
        aria-label={t`${label}: ${disabledReason}`}
      >
        {children}
      </StyledControl>
    </Tooltip>
  );
};

// A click on a chart can pick a value the options do not list, and Select would then read as the All option.
const withSelectedOption = (
  options: { value: string | null; label: string }[],
  selectedKey: string | null,
  getLabel: (key: string) => string,
) =>
  isDefined(selectedKey) && !options.some(({ value }) => value === selectedKey)
    ? [...options, { value: selectedKey, label: getLabel(selectedKey) }]
    : options;

const getSelectedDatePreset = ({
  filter,
  timeZone,
  isCustomRange,
}: {
  filter: AnalyticsFilter;
  timeZone: string;
  isCustomRange: boolean;
}): AnalyticsDatePreset => {
  if (!isDefined(filter.dateFrom) && !isDefined(filter.dateTo)) {
    return 'ALL';
  }

  if (isCustomRange) {
    return 'CUSTOM';
  }

  return findAnalyticsDatePreset(filter, timeZone) ?? 'CUSTOM';
};

const getTrackingStartDate = ({
  trackingStartedAt,
  reportingTimeZone,
}: AnalyticsMeta) =>
  Temporal.Instant.from(trackingStartedAt)
    .toZonedDateTimeISO(reportingTimeZone)
    .toPlainDate();

type AnalyticsDateInputProps = {
  label: string;
  appliedDate: string | null;
  earliestDate?: string | null;
  latestDate?: string | null;
  isDateAllowed: (date: string) => boolean;
  onCommit: (date: string) => void;
};

// Typing a year passes through complete dates such as 0202-10-15, so nothing applies on the keystroke.
// A pick from the native calendar keeps focus and never blurs, so a pause applies it as well.
const AnalyticsDateInput = ({
  label,
  appliedDate,
  earliestDate,
  latestDate,
  isDateAllowed,
  onCommit,
}: AnalyticsDateInputProps) => {
  const [draftDate, setDraftDate] = useState<string | null>(null);

  const commitAfterIdle = useDebouncedCallback((date: string) => {
    if (date !== appliedDate && isDateAllowed(date)) {
      onCommit(date);
      setDraftDate(null);
    }
  }, DATE_IDLE_COMMIT_DELAY_IN_MS);

  const commitDraft = () => {
    commitAfterIdle.cancel();

    if (
      isDefined(draftDate) &&
      draftDate !== appliedDate &&
      isDateAllowed(draftDate)
    ) {
      onCommit(draftDate);
    }

    setDraftDate(null);
  };

  return (
    <StyledDateInput
      type="date"
      aria-label={label}
      value={draftDate ?? appliedDate ?? ''}
      min={earliestDate ?? undefined}
      max={latestDate ?? undefined}
      onChange={(event) => {
        setDraftDate(event.target.value);
        commitAfterIdle(event.target.value);
      }}
      onBlur={commitDraft}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          commitDraft();
        }
      }}
    />
  );
};

type AnalyticsFilterBarProps = {
  filter: AnalyticsFilter;
  meta: AnalyticsMeta;
  // False where the numbers ignore the status, so a value picked elsewhere is hidden and has no chip.
  isStatusEnabled?: boolean;
  onChange: (filter: AnalyticsFilter) => void;
  onReset: () => void;
};

export const AnalyticsFilterBar = ({
  filter,
  meta,
  isStatusEnabled = true,
  onChange,
  onReset,
}: AnalyticsFilterBarProps) => {
  const [isCustomRange, setIsCustomRange] = useState(false);

  const timeZone = meta.reportingTimeZone;

  const selectedDatePreset = getSelectedDatePreset({
    filter,
    timeZone,
    isCustomRange,
  });

  const positionsDisabledReason =
    meta.fields.positionsAppliedFor === 'OK'
      ? null
      : t`The positions field on People is missing or has the wrong type.`;

  const sourceDisabledReason =
    meta.fields.applicantSource === 'OK'
      ? null
      : t`The source field on People is missing or has the wrong type.`;

  const chips = getAnalyticsFilterChips({
    filter,
    meta,
    isStatusApplied: isStatusEnabled,
  });

  const programs = isDefined(filter.trackKey)
    ? meta.programs.filter((program) => program.trackKey === filter.trackKey)
    : meta.programs;

  const earliestAllowedDate = getTrackingStartDate(meta)
    .with({ month: 1, day: 1 })
    .toString();

  const isCompleteDateInReach = (date: string) =>
    COMPLETE_DATE_PATTERN.test(date) &&
    date >= earliestAllowedDate &&
    date <= LATEST_ALLOWED_DATE;

  // A date past the other end carries it along, so the entry is kept and the range never reverses.
  const handleFromDateCommit = (dateFrom: string) =>
    onChange({
      ...filter,
      dateFrom,
      dateTo:
        isDefined(filter.dateTo) && filter.dateTo < dateFrom
          ? dateFrom
          : filter.dateTo,
    });

  const handleToDateCommit = (dateTo: string) =>
    onChange({
      ...filter,
      dateFrom:
        isDefined(filter.dateFrom) && filter.dateFrom > dateTo
          ? dateTo
          : filter.dateFrom,
      dateTo,
    });

  const handleDatePresetChange = (preset: AnalyticsDatePreset) => {
    // Select also fires for the option already chosen, which would wipe a typed range.
    if (preset === selectedDatePreset) {
      return;
    }

    setIsCustomRange(preset === 'CUSTOM');

    if (preset === 'ALL') {
      onChange({ ...filter, dateFrom: null, dateTo: null });

      return;
    }

    if (preset === 'CUSTOM') {
      const today = Temporal.Now.plainDateISO(timeZone);
      const trackingStartDate = getTrackingStartDate(meta);

      onChange({
        ...filter,
        // Tracking can be set to start in the future, and the server refuses a reversed range.
        dateFrom: (Temporal.PlainDate.compare(trackingStartDate, today) > 0
          ? today
          : trackingStartDate
        ).toString(),
        dateTo: today.toString(),
      });

      return;
    }

    onChange({
      ...filter,
      ...getAnalyticsDatePresetRange(preset, timeZone),
    });
  };

  const handleTrackChange = (trackKey: string | null) => {
    const isProgramStillListed = meta.programs.some(
      (program) =>
        program.key === filter.programKey &&
        (!isDefined(trackKey) || program.trackKey === trackKey),
    );

    onChange({
      ...filter,
      trackKey,
      programKey: isProgramStillListed ? filter.programKey : null,
    });
  };

  return (
    <StyledBar>
      <StyledControls role="group" aria-label={t`Filters`}>
        <AnalyticsFilterControl label={t`Dates`} disabledReason={null}>
          <Select<AnalyticsDatePreset>
            dropdownId="crm-analytics-filter-dates"
            selectSizeVariant="small"
            fullWidth
            value={selectedDatePreset}
            options={[
              { value: 'ALL', label: t`All dates` },
              { value: 'LAST_7', label: t`Last 7 days` },
              { value: 'LAST_30', label: t`Last 30 days` },
              { value: 'LAST_90', label: t`Last 90 days` },
              { value: 'CUSTOM', label: t`Custom dates` },
            ]}
            onChange={handleDatePresetChange}
          />
        </AnalyticsFilterControl>
        {selectedDatePreset === 'CUSTOM' && (
          <>
            <AnalyticsDateInput
              label={t`From date`}
              appliedDate={filter.dateFrom}
              earliestDate={earliestAllowedDate}
              latestDate={LATEST_ALLOWED_DATE}
              isDateAllowed={isCompleteDateInReach}
              onCommit={handleFromDateCommit}
            />
            <AnalyticsDateInput
              label={t`To date`}
              appliedDate={filter.dateTo}
              earliestDate={earliestAllowedDate}
              latestDate={LATEST_ALLOWED_DATE}
              isDateAllowed={isCompleteDateInReach}
              onCommit={handleToDateCommit}
            />
          </>
        )}
        <AnalyticsFilterControl
          label={t`Track`}
          disabledReason={positionsDisabledReason}
        >
          <Select<string | null>
            dropdownId="crm-analytics-filter-track"
            selectSizeVariant="small"
            fullWidth
            dropdownWidth={GenericDropdownContentWidth.ExtraLarge}
            disabled={isDefined(positionsDisabledReason)}
            value={filter.trackKey}
            options={withSelectedOption(
              [
                { value: null, label: t`All tracks` },
                ...meta.tracks.map((track) => ({
                  value: track.key,
                  label: track.label,
                })),
              ],
              filter.trackKey,
              (trackKey) => getAnalyticsTrackFilterLabel(trackKey, meta),
            )}
            onChange={handleTrackChange}
          />
        </AnalyticsFilterControl>
        <AnalyticsFilterControl
          label={t`Program`}
          disabledReason={positionsDisabledReason}
        >
          <Select<string | null>
            dropdownId="crm-analytics-filter-program"
            selectSizeVariant="small"
            fullWidth
            withSearchInput
            dropdownWidth={GenericDropdownContentWidth.ExtraLarge}
            disabled={isDefined(positionsDisabledReason)}
            value={filter.programKey}
            options={withSelectedOption(
              [
                { value: null, label: t`All programs` },
                ...programs.map((program) => ({
                  value: program.key,
                  label: program.label,
                })),
              ],
              filter.programKey,
              (programKey) => getAnalyticsProgramFilterLabel(programKey, meta),
            )}
            onChange={(programKey) => onChange({ ...filter, programKey })}
          />
        </AnalyticsFilterControl>
        <AnalyticsFilterControl
          label={t`Source`}
          disabledReason={sourceDisabledReason}
        >
          <Select<string | null>
            dropdownId="crm-analytics-filter-source"
            selectSizeVariant="small"
            fullWidth
            withSearchInput
            dropdownWidth={GenericDropdownContentWidth.ExtraLarge}
            disabled={isDefined(sourceDisabledReason)}
            value={filter.sourceKey}
            options={withSelectedOption(
              [
                { value: null, label: t`All sources` },
                ...meta.sources.map((source) => ({
                  value: source.key,
                  label: source.label,
                })),
              ],
              filter.sourceKey,
              (sourceKey) => getAnalyticsSourceFilterLabel(sourceKey, meta),
            )}
            onChange={(sourceKey) => onChange({ ...filter, sourceKey })}
          />
        </AnalyticsFilterControl>
        {isStatusEnabled && (
          <AnalyticsFilterControl label={t`Status`} disabledReason={null}>
            <Select<AnalyticsStatusFilter>
              dropdownId="crm-analytics-filter-status"
              selectSizeVariant="small"
              fullWidth
              value={filter.status}
              options={STATUS_OPTIONS.map((status) => ({
                value: status,
                label: getAnalyticsStatusFilterLabel(status, meta),
              }))}
              onChange={(status) => onChange({ ...filter, status })}
            />
          </AnalyticsFilterControl>
        )}
      </StyledControls>
      {chips.length > 0 && (
        <AnalyticsFilterChips
          chips={chips}
          onChange={onChange}
          onClearAll={onReset}
        />
      )}
    </StyledBar>
  );
};
