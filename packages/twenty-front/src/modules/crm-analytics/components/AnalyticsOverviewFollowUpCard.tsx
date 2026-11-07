import { t } from '@lingui/core/macro';
import { useState } from 'react';
import { Button } from 'twenty-ui/primitives/input';

import { AnalyticsChartCard } from '@/crm-analytics/charts/AnalyticsChartCard';
import { AnalyticsStuckTable } from '@/crm-analytics/components/AnalyticsStuckTable';
import { type AnalyticsOverview } from '@/crm-analytics/types/AnalyticsApi';

const FOLLOW_UP_PREVIEW_ROW_COUNT = 10;

type AnalyticsOverviewFollowUpCardProps = {
  stuck: AnalyticsOverview['stuck'];
};

export const AnalyticsOverviewFollowUpCard = ({
  stuck,
}: AnalyticsOverviewFollowUpCardProps) => {
  const [isShowingAll, setIsShowingAll] = useState(false);

  const hasMoreRows = stuck.rows.length > FOLLOW_UP_PREVIEW_ROW_COUNT;

  return (
    <AnalyticsChartCard
      title={t`People to follow up`}
      note={t`Active people past their stage limit. Inactive imported people are counted, not listed.`}
      action={
        hasMoreRows ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsShowingAll(!isShowingAll)}
          >
            {isShowingAll ? t`Show fewer` : t`Show all`}
          </Button>
        ) : undefined
      }
      isFullWidth
    >
      <AnalyticsStuckTable
        stuck={
          isShowingAll
            ? stuck
            : {
                ...stuck,
                rows: stuck.rows.slice(0, FOLLOW_UP_PREVIEW_ROW_COUNT),
              }
        }
      />
    </AnalyticsChartCard>
  );
};
