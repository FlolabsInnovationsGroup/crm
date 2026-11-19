import { CampaignService } from 'src/modules/campaign/services/campaign.service';
import { type ListmonkClientService } from 'src/modules/campaign/services/listmonk-client.service';
import { type SendingDomainService } from 'src/modules/sending-domain/services/sending-domain.service';

const WORKSPACE_ID = 'workspace-id';

const LISTMONK_CAMPAIGN = {
  body: '# Hello',
  content_type: 'markdown',
  messenger: 'email',
  template_id: 1,
  id: 7,
  name: 'November update',
  subject: 'News',
  from_email: '"Hephaestus" <news@news.hephaestus.international>',
  status: 'draft',
  lists: [{ id: 3, name: 'Hephaestus - Internal test' }],
  to_send: 1,
  sent: 0,
  views: 0,
  clicks: 0,
  bounces: 0,
  created_at: '2026-11-18T09:00:00Z',
  started_at: null,
};

const CREATE_INPUT = {
  name: 'November update',
  subject: 'News',
  fromName: 'Hephaestus',
  fromLocalPart: 'news',
  fromDomain: 'news.hephaestus.international',
  audienceIds: [3],
  body: '# Hello',
};

describe('CampaignService', () => {
  let request: jest.Mock;
  let service: CampaignService;

  beforeEach(() => {
    process.env.FLOLABS_SENDING_DOMAINS_WORKSPACE_ID = WORKSPACE_ID;
    request = jest.fn();
    service = new CampaignService(
      { isConfigured: () => true, request } as unknown as ListmonkClientService,
      {
        listSendingDomains: async () => ({
          isConfigured: true,
          domains: [
            { domain: 'news.hephaestus.international', status: 'verified' },
            { domain: 'news.flobrain.ai', status: 'pending' },
          ],
        }),
      } as unknown as SendingDomainService,
    );
  });

  afterEach(() => {
    delete process.env.FLOLABS_SENDING_DOMAINS_WORKSPACE_ID;
  });

  it('offers only verified domains and maps campaigns', async () => {
    request
      .mockResolvedValueOnce({ results: [LISTMONK_CAMPAIGN] })
      .mockResolvedValueOnce({
        results: [{ id: 3, name: 'Internal', subscriber_count: 1 }],
      });

    const overview = await service.getOverview(WORKSPACE_ID);

    expect(overview.fromDomains).toEqual(['news.hephaestus.international']);
    expect(overview.audiences).toEqual([
      { id: 3, name: 'Internal', subscriberCount: 1 },
    ]);
    expect(overview.campaigns[0]).toMatchObject({
      id: 7,
      status: 'draft',
      listNames: ['Hephaestus - Internal test'],
    });
  });

  it('is not configured for another workspace', async () => {
    await expect(service.getOverview('other')).resolves.toMatchObject({
      isConfigured: false,
    });
    expect(request).not.toHaveBeenCalled();
  });

  it('creates a markdown campaign from a verified domain', async () => {
    request.mockResolvedValueOnce(LISTMONK_CAMPAIGN);

    await service.createCampaign(WORKSPACE_ID, CREATE_INPUT);

    expect(request).toHaveBeenCalledWith({
      method: 'POST',
      path: '/api/campaigns',
      body: expect.objectContaining({
        from_email: '"Hephaestus" <news@news.hephaestus.international>',
        lists: [3],
        content_type: 'markdown',
        body: '# Hello',
      }),
    });
  });

  it('sends the reply-to as a header and refuses one that is not an email', async () => {
    request.mockResolvedValueOnce(LISTMONK_CAMPAIGN);

    await service.createCampaign(WORKSPACE_ID, {
      ...CREATE_INPUT,
      replyTo: ' replies@flolabsinnovations.com ',
    });

    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        path: '/api/campaigns',
        body: expect.objectContaining({
          headers: [{ 'Reply-To': 'replies@flolabsinnovations.com' }],
        }),
      }),
    );

    await expect(
      service.createCampaign(WORKSPACE_ID, {
        ...CREATE_INPUT,
        replyTo: 'x@y.com\r\nBcc: z@w.com',
      }),
    ).rejects.toThrow('Invalid reply-to address');
  });

  it('refuses a domain that is not verified yet', async () => {
    await expect(
      service.createCampaign(WORKSPACE_ID, {
        ...CREATE_INPUT,
        fromDomain: 'news.flobrain.ai',
      }),
    ).rejects.toThrow('is not verified');
    expect(request).not.toHaveBeenCalled();
  });

  it('deletes only drafts', async () => {
    request.mockResolvedValueOnce({ ...LISTMONK_CAMPAIGN, status: 'running' });

    await expect(service.deleteDraft(WORKSPACE_ID, 7)).rejects.toThrow(
      'Only drafts can be deleted',
    );
  });

  it('sends a test to the signed-in person with list ids', async () => {
    request.mockResolvedValue(LISTMONK_CAMPAIGN);

    await service.sendTest({
      workspaceId: WORKSPACE_ID,
      campaignId: 7,
      user: { email: 'me@flolabs.com', firstName: 'Me', lastName: '' },
    });

    expect(request).toHaveBeenLastCalledWith({
      method: 'POST',
      path: '/api/campaigns/7/test',
      body: expect.objectContaining({
        lists: [3],
        subscribers: ['me@flolabs.com'],
        body: '# Hello',
      }),
    });
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        path: '/api/subscribers',
        ignoredErrorStatuses: [409],
      }),
    );
  });

  it('refuses a test address that is not an email', async () => {
    await expect(
      service.sendTest({
        workspaceId: WORKSPACE_ID,
        campaignId: 7,
        requestedEmail: 'not-an-email',
        user: { email: 'me@flolabs.com', firstName: 'Me', lastName: '' },
      }),
    ).rejects.toThrow('Invalid test email address');
    expect(request).not.toHaveBeenCalled();
  });

  it('sends a test to another address without the signed-in name', async () => {
    request.mockResolvedValue(LISTMONK_CAMPAIGN);

    await service.sendTest({
      workspaceId: WORKSPACE_ID,
      campaignId: 7,
      requestedEmail: ' someone+test@gmail.com ',
      user: { email: 'me@flolabs.com', firstName: 'Me', lastName: '' },
    });

    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        path: '/api/subscribers',
        body: expect.objectContaining({
          email: 'someone+test@gmail.com',
          name: '',
        }),
      }),
    );
    expect(request).toHaveBeenLastCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({
          subscribers: ['someone+test@gmail.com'],
        }),
      }),
    );
  });
});
