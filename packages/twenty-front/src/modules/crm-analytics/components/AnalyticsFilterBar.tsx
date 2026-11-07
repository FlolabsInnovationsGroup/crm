import { styled } from '@linaria/react';
import { t } from '@lingui/core/macro';
import { type ReactNode, useState } from 'react';
import { isDefined } from 'twenty-shared/utils';
import { Button } from 'twenty-ui/primitives/input';
import { Tooltip } from 'twenty-ui/primitives/surfaces';
import { themeCssVariables } from 'twenty-ui/theme';
import { Temporal } from 'temporal-polyfill';
import { useDebouncedCallback } from 'use-debounce';

import {
  type AnalyticsFilter,
  type AnalyticsMeta,
  type AnalyticsPeriod,
  type AnalyticsStatusFilter,
} from '@/crm-analytics/types/AnalyticsApi';
import { hasActiveAnalyticsFilter } from '@/crm-analytics/utils/hasActiveAnalyticsFilter';
import { Select } from '@/ui/input/components/Select';
import { GenericDropdownContentWidth } from '@/ui/layout/dropdown/constants/GenericDropdownContentWidth';

type AnalyticsDatePreset = 'ALL' | 'LAST_7' | 'LAST_30' | 'LAST_90' | 'CUSTOM';

const DAYS_BY_DATE_PRESET = { LAST_7: 7, LAST_30: 30, LAST_90: 90 } as const;

const COMPLETE_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const DATE_IDLE_COMMIT_DELAY_IN_MS = 600;

const StyledBar = styled.div`
  align-items: center;
  border-bottom: 1px solid ${themeCssVariables.border.color.light};
  display: flex;
  flex-wrap: wrap;
  font-size: ${themeCssVariables.font.size.sm};
  gap: ${themeCssVariables.spacing[2]};
  padding: ${themeCssVariables.spacing[2]} ${themeCssVariables.spacing[4]};
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

const getPresetRange = (days: number, timeZone: string) => {
  const today = Temporal.Now.plainDateISO(timeZone);

  return {
    dateFrom: today.subtract({ days: days - 1 }).toString(),
    dateTo: today.toString(),
  };
};

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

  const matchingPreset = (
    Object.keys(DAYS_BY_DATE_PRESET) as (keyof typeof DAYS_BY_DATE_PRESET)[]
  ).find((preset) => {
    const range = getPresetRange(DAYS_BY_DATE_PRESET[preset], timeZone);

    return range.dateFrom === filter.dateFrom && range.dateTo === filter.dateTo;
  });

  return matchingPreset ?? 'CUSTOM';
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
  isPeriodEnabled: boolean;
  isStatusEnabled?: boolean;
  onChange: (filter: AnalyticsFilter) => void;
  onReset: () => void;
};

export const AnalyticsFilterBar = ({
  filter,
  meta,
  isPeriodEnabled,
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

  const periodDisabledReason = isPeriodEnabled
    ? null
    : t`Only the Trends tab uses a period.`;

  const statusDisabledReason = isStatusEnabled
    ? null
    : t`Rates ignore the status filter, so the Funnel tab does not use it.`;

  const successStageLabel =
    meta.stages.find((stage) => stage.isSuccess)?.label ?? t`Success`;

  const programs = isDefined(filter.trackKey)
    ? meta.programs.filter((program) => program.trackKey === filter.trackKey)
    : meta.programs;

  const isCompleteDateInReach = (date: string) =>
    COMPLETE_DATE_PATTERN.test(date) &&
    Temporal.PlainDate.from(date).year >= getTrackingStartDate(meta).year;

  const isFromDateAllowed = (date: string) =>
    isCompleteDateInReach(date) &&
    (!isDefined(filter.dateTo) || date <= filter.dateTo);

  const isToDateAllowed = (date: string) =>
    isCompleteDateInReach(date) &&
    (!isDefined(filter.dateFrom) || date >= filter.dateFrom);

  const handleDatePresetChange = (preset: AnalyticsDatePreset) => {
    setIsCustomRange(preset === 'CUSTOM');

    if (preset === 'ALL') {
      onChange({ ...filter, dateFrom: null, dateTo: null });

      return;
    }

    if (preset === 'CUSTOM') {
      onChange({
        ...filter,
        dateFrom: getTrackingStartDate(meta).toString(),
        dateTo: Temporal.Now.plainDateISO(timeZone).toString(),
      });

      return;
    }

    onChange({
      ...filter,
      ...getPresetRange(DAYS_BY_DATE_PRESET[preset], timeZone),
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
    <StyledBar role="group" aria-label={t`Filters`}>
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
            latestDate={filter.dateTo}
            isDateAllowed={isFromDateAllowed}
            onCommit={(dateFrom) => onChange({ ...filter, dateFrom })}
          />
          <AnalyticsDateInput
            label={t`To date`}
            appliedDate={filter.dateTo}
            earliestDate={filter.dateFrom}
            isDateAllowed={isToDateAllowed}
            onCommit={(dateTo) => onChange({ ...filter, dateTo })}
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
          options={[
            { value: null, label: t`All tracks` },
            ...meta.tracks.map((track) => ({
              value: track.key,
              label: track.label,
            })),
          ]}
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
          options={[
            { value: null, label: t`All programs` },
            ...programs.map((program) => ({
              value: program.key,
              label: program.label,
            })),
          ]}
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
          options={[
            { value: null, label: t`All sources` },
            ...meta.sources.map((source) => ({
              value: source.key,
              label: source.label,
            })),
          ]}
          onChange={(sourceKey) => onChange({ ...filter, sourceKey })}
        />
      </AnalyticsFilterControl>
      <AnalyticsFilterControl
        label={t`Status`}
        disabledReason={statusDisabledReason}
      >
        <Select<AnalyticsStatusFilter>
          dropdownId="crm-analytics-filter-status"
          selectSizeVariant="small"
          fullWidth
          disabled={isDefined(statusDisabledReason)}
          value={filter.status}
          options={[
            { value: 'ALL', label: t`All statuses` },
            { value: 'ACTIVE', label: t`Active` },
            { value: 'SUCCESS', label: successStageLabel },
            { value: 'EXITED', label: t`Exited` },
            { value: 'UNMAPPED', label: t`Unmapped` },
            { value: 'NO_STAGE', label: t`No stage` },
          ]}
          onChange={(status) => onChange({ ...filter, status })}
        />
      </AnalyticsFilterControl>
      <AnalyticsFilterControl
        label={t`Period`}
        disabledReason={periodDisabledReason}
      >
        <Select<AnalyticsPeriod>
          dropdownId="crm-analytics-filter-period"
          selectSizeVariant="small"
          fullWidth
          disabled={isDefined(periodDisabledReason)}
          value={filter.period}
          options={[
            { value: 'DAY', label: t`By day` },
            { value: 'WEEK', label: t`By week` },
            { value: 'MONTH', label: t`By month` },
          ]}
          onChange={(period) => onChange({ ...filter, period })}
        />
      </AnalyticsFilterControl>
      {hasActiveAnalyticsFilter(filter) && (
        <Button variant="link" size="sm" onClick={() => onReset()}>
          {t`Reset filters`}
        </Button>
      )}
    </StyledBar>
  );
};
