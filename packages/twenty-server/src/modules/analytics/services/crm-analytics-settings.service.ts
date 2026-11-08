import { Injectable } from '@nestjs/common';

import { isNonEmptyString } from '@sniptt/guards';
import { Temporal } from 'temporal-polyfill';
import { isDefined } from 'twenty-shared/utils';

import { UserVarsService } from 'src/engine/core-modules/user/user-vars/services/user-vars.service';
import { CRM_ANALYTICS_CONFIG } from 'src/modules/analytics/constants/crm-analytics-config.constant';

const DISABLED_KEY = 'CRM_ANALYTICS_DISABLED';
const TRACKING_START_KEY = 'CRM_ANALYTICS_TRACKING_START_AT';
const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

type CrmAnalyticsSettings = {
  [DISABLED_KEY]: boolean;
  [TRACKING_START_KEY]: string;
};

@Injectable()
export class CrmAnalyticsSettingsService {
  constructor(
    private readonly userVarsService: UserVarsService<CrmAnalyticsSettings>,
  ) {}

  async isDisabled(workspaceId: string): Promise<boolean> {
    const disabledValue = await this.userVarsService.get({
      workspaceId,
      key: DISABLED_KEY,
    });

    return disabledValue === true;
  }

  // Returns an ISO timestamp. A bad override throws rather than falling back, so a
  // mistyped value fails the job visibly instead of silently changing the numbers.
  async getTrackingStart(workspaceId: string): Promise<string> {
    const trackingStartOverride = await this.userVarsService.get({
      workspaceId,
      key: TRACKING_START_KEY,
    });

    if (!isDefined(trackingStartOverride)) {
      return CRM_ANALYTICS_CONFIG.trackingStartAt;
    }

    try {
      if (!isNonEmptyString(trackingStartOverride)) {
        throw new Error('Not a string');
      }

      // Strict parsing, because new Date() reads '2026' or 'Oct 27' as real dates.
      const instant = DATE_ONLY_PATTERN.test(trackingStartOverride)
        ? Temporal.PlainDate.from(trackingStartOverride)
            .toZonedDateTime('UTC')
            .toInstant()
        : Temporal.Instant.from(trackingStartOverride);

      return new Date(instant.epochMilliseconds).toISOString();
    } catch {
      throw new Error(
        `Invalid ${TRACKING_START_KEY} value for workspace ${workspaceId}`,
      );
    }
  }
}
