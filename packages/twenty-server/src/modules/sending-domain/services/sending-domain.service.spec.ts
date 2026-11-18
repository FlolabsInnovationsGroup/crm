import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { SendingDomainService } from 'src/modules/sending-domain/services/sending-domain.service';

const WORKSPACE_ID = '20202020-1c25-4d02-bf25-6aeccf7ea419';

const SERVER_CONFIG = {
  selector: 'lm1',
  ipv4: '128.140.4.151',
  ipv6: '',
  fixedDomains: ['news.hephaestus.international'],
};

describe('SendingDomainService', () => {
  let directory: string;
  let service: SendingDomainService;
  let publishedTxtRecords: Record<string, string[][]>;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'sending-domains-'));
    process.env.FLOLABS_SENDING_DOMAINS_DIR = directory;
    process.env.FLOLABS_SENDING_DOMAINS_WORKSPACE_ID = WORKSPACE_ID;
    await writeFile(
      join(directory, 'server.json'),
      JSON.stringify(SERVER_CONFIG),
    );
    await writeFile(join(directory, 'domains.txt'), '');
    publishedTxtRecords = {};

    service = new SendingDomainService();
    jest
      .spyOn(
        (service as unknown as { dnsResolver: { resolveTxt: jest.Mock } })
          .dnsResolver,
        'resolveTxt',
      )
      .mockImplementation(async (hostname: string) => {
        const records = publishedTxtRecords[hostname];

        if (records === undefined) {
          throw Object.assign(new Error('not found'), { code: 'ENOTFOUND' });
        }

        return records;
      });
  });

  afterEach(async () => {
    delete process.env.FLOLABS_SENDING_DOMAINS_DIR;
    delete process.env.FLOLABS_SENDING_DOMAINS_WORKSPACE_ID;
    await rm(directory, { recursive: true, force: true });
  });

  it('reports the feature as not configured without the shared folder', async () => {
    delete process.env.FLOLABS_SENDING_DOMAINS_DIR;

    await expect(service.listSendingDomains(WORKSPACE_ID)).resolves.toEqual({
      isConfigured: false,
      domains: [],
    });
  });

  it('keeps every other workspace out', async () => {
    await expect(
      service.listSendingDomains('another-workspace'),
    ).resolves.toEqual({ isConfigured: false, domains: [] });
    await expect(
      service.addSendingDomain('another-workspace', 'news.flobrain.ai'),
    ).rejects.toThrow('not set up on this server');
  });

  it('keeps both domains when two are added at the same time', async () => {
    await Promise.all([
      service.addSendingDomain(WORKSPACE_ID, 'news.flobrain.ai'),
      service.addSendingDomain(WORKSPACE_ID, 'news.robocollective.ai'),
    ]);

    expect(await readFile(join(directory, 'domains.txt'), 'utf8')).toBe(
      'news.flobrain.ai\nnews.robocollective.ai\n',
    );
  });

  it('adds a domain once and shows it as preparing until its key exists', async () => {
    const added = await service.addSendingDomain(
      WORKSPACE_ID,
      ' News.FloBrain.ai ',
    );

    await service.addSendingDomain(WORKSPACE_ID, 'news.flobrain.ai');

    expect(added).toEqual({
      domain: 'news.flobrain.ai',
      status: 'preparing',
      isFixed: false,
      records: [],
    });
    expect(await readFile(join(directory, 'domains.txt'), 'utf8')).toBe(
      'news.flobrain.ai\n',
    );
  });

  it('marks a domain verified only when all three records are published', async () => {
    await writeFile(
      join(directory, 'news.hephaestus.international.dkim'),
      'v=DKIM1; k=rsa; p=KEY',
    );
    publishedTxtRecords['news.hephaestus.international'] = [
      ['v=spf1 ip4:128.140.4.151 -all'],
    ];
    publishedTxtRecords['lm1._domainkey.news.hephaestus.international'] = [
      ['v=DKIM1; k=rsa; ', 'p=KEY'],
    ];

    const pending = await service.listSendingDomains(WORKSPACE_ID);

    expect(pending.domains[0].status).toBe('pending');

    publishedTxtRecords['_dmarc.news.hephaestus.international'] = [
      ['v=DMARC1; p=none'],
    ];

    const verified = await service.listSendingDomains(WORKSPACE_ID);

    expect(verified.domains[0]).toMatchObject({
      domain: 'news.hephaestus.international',
      status: 'verified',
      isFixed: true,
    });
  });

  it('removes an added domain but refuses a fixed one', async () => {
    await service.addSendingDomain(WORKSPACE_ID, 'news.flobrain.ai');

    await expect(
      service.removeSendingDomain(WORKSPACE_ID, 'news.flobrain.ai'),
    ).resolves.toBe(true);
    expect(await readFile(join(directory, 'domains.txt'), 'utf8')).toBe('');
    await expect(
      service.removeSendingDomain(
        WORKSPACE_ID,
        'news.hephaestus.international',
      ),
    ).rejects.toThrow('cannot be removed here');
  });

  it('rejects an invalid domain', async () => {
    await expect(
      service.addSendingDomain(WORKSPACE_ID, 'not a domain'),
    ).rejects.toThrow('is not a valid domain name');
  });
});
