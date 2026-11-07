import { type UserVarsService } from 'src/engine/core-modules/user/user-vars/services/user-vars.service';
import { CRM_ANALYTICS_CONFIG } from 'src/modules/analytics/constants/crm-analytics-config.constant';
import { CrmAnalyticsSettingsService } from 'src/modules/analytics/services/crm-analytics-settings.service';

const WORKSPACE_ID = '20202020-a000-4000-8000-000000000001';

const buildService = (values: Record<string, unknown>) => {
  const get = jest.fn(async ({ key }: { key: string }) => values[key]);
  const service = new CrmAnalyticsSettingsService({
    get,
  } as unknown as UserVarsService<never>);

  return { service, get };
};

describe('CrmAnalyticsSettingsService', () => {
  describe('isDisabled', () => {
    it('reads the workspace-level off switch from contract section 5', async () => {
      const { service, get } = buildService({ CRM_ANALYTICS_DISABLED: true });

      await expect(service.isDisabled(WORKSPACE_ID)).resolves.toBe(true);
      expect(get).toHaveBeenCalledWith({
        workspaceId: WORKSPACE_ID,
        key: 'CRM_ANALYTICS_DISABLED',
      });
    });

    it.each([[undefined], [false], ['true'], [1]])(
      'stays on for %j, because only the documented value switches it off',
      async (value) => {
        const { service } = buildService({ CRM_ANALYTICS_DISABLED: value });

        await expect(service.isDisabled(WORKSPACE_ID)).resolves.toBe(false);
      },
    );
  });

  describe('getTrackingStart', () => {
    it('uses the constant when no override is set', async () => {
      const { service } = buildService({});

      await expect(service.getTrackingStart(WORKSPACE_ID)).resolves.toBe(
        CRM_ANALYTICS_CONFIG.trackingStartAt,
      );
    });

    it('turns an override into an ISO timestamp', async () => {
      const { service, get } = buildService({
        CRM_ANALYTICS_TRACKING_START_AT: '2026-08-01',
      });

      await expect(service.getTrackingStart(WORKSPACE_ID)).resolves.toBe(
        '2026-08-01T00:00:00.000Z',
      );
      expect(get).toHaveBeenCalledWith({
        workspaceId: WORKSPACE_ID,
        key: 'CRM_ANALYTICS_TRACKING_START_AT',
      });
    });

    it.each([['not a date'], [''], [20260801]])(
      'throws on %j rather than silently changing the numbers',
      async (value) => {
        const { service } = buildService({
          CRM_ANALYTICS_TRACKING_START_AT: value,
        });

        await expect(service.getTrackingStart(WORKSPACE_ID)).rejects.toThrow(
          'CRM_ANALYTICS_TRACKING_START_AT',
        );
      },
    );
  });
});
