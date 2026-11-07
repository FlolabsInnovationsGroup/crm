import { CRM_ANALYTICS_DEFAULT_FILTER } from '@/crm-analytics/constants/CrmAnalyticsDefaultFilter';
import { getAnalyticsCategoryClickFilter } from '@/crm-analytics/utils/getAnalyticsCategoryClickFilter';

const PROGRAM_ROW = { key: 'SENSOR_INTERN', parentKey: 'ROBOTICS' };

describe('getAnalyticsCategoryClickFilter', () => {
  it('selects a program together with its track', () => {
    expect(
      getAnalyticsCategoryClickFilter(
        PROGRAM_ROW,
        'TRACK_PROGRAM',
        CRM_ANALYTICS_DEFAULT_FILTER,
      ),
    ).toEqual({
      ...CRM_ANALYTICS_DEFAULT_FILTER,
      trackKey: 'ROBOTICS',
      programKey: 'SENSOR_INTERN',
    });
  });

  it('clears a program without choosing a track nobody asked for', () => {
    expect(
      getAnalyticsCategoryClickFilter(PROGRAM_ROW, 'TRACK_PROGRAM', {
        ...CRM_ANALYTICS_DEFAULT_FILTER,
        programKey: 'SENSOR_INTERN',
      }),
    ).toEqual(CRM_ANALYTICS_DEFAULT_FILTER);
  });

  it('keeps the chosen track when a program is cleared', () => {
    const filter = {
      ...CRM_ANALYTICS_DEFAULT_FILTER,
      trackKey: 'ROBOTICS',
      programKey: 'SENSOR_INTERN',
    };

    expect(
      getAnalyticsCategoryClickFilter(PROGRAM_ROW, 'TRACK_PROGRAM', filter),
    ).toEqual({ ...filter, programKey: null });
  });

  it('toggles a track and clears its program', () => {
    expect(
      getAnalyticsCategoryClickFilter(
        { key: 'ROBOTICS', parentKey: null },
        'TRACK_PROGRAM',
        {
          ...CRM_ANALYTICS_DEFAULT_FILTER,
          trackKey: 'ROBOTICS',
          programKey: 'SENSOR_INTERN',
        },
      ),
    ).toEqual(CRM_ANALYTICS_DEFAULT_FILTER);
  });

  it('toggles only the source in the sources view', () => {
    expect(
      getAnalyticsCategoryClickFilter(
        { key: 'NONE', parentKey: null },
        'SOURCE',
        { ...CRM_ANALYTICS_DEFAULT_FILTER, sourceKey: 'NONE' },
      ),
    ).toEqual(CRM_ANALYTICS_DEFAULT_FILTER);
  });
});
