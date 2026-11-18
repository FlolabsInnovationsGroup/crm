import { Injectable } from '@nestjs/common';

import { randomUUID } from 'node:crypto';
import { Resolver } from 'node:dns/promises';
import { readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { msg } from '@lingui/core/macro';
import { isNonEmptyString } from '@sniptt/guards';
import { isDefined } from 'twenty-shared/utils';

import { UserInputError } from 'src/engine/core-modules/graphql/utils/graphql-errors.util';
import { SENDING_DOMAIN_FILES } from 'src/modules/sending-domain/constants/sending-domain-files.constant';
import { type SendingDomainListDTO } from 'src/modules/sending-domain/dtos/sending-domain-list.dto';
import { type SendingDomainDTO } from 'src/modules/sending-domain/dtos/sending-domain.dto';
import { type SendingDomainServerConfig } from 'src/modules/sending-domain/types/sending-domain-server-config.type';
import {
  buildSendingDomainRecords,
  type SendingDomainPublishedTxtRecords,
} from 'src/modules/sending-domain/utils/build-sending-domain-records.util';
import { isFlolabsMailWorkspace } from 'src/modules/sending-domain/utils/is-flolabs-mail-workspace.util';
import { normalizeSendingDomain } from 'src/modules/sending-domain/utils/normalize-sending-domain.util';
import { parseRequestedDomains } from 'src/modules/sending-domain/utils/parse-requested-domains.util';
import { parseSendingDomainServerConfig } from 'src/modules/sending-domain/utils/parse-sending-domain-server-config.util';

type SendingDomainSetup = {
  directory: string;
  serverConfig: SendingDomainServerConfig;
};

const buildNotSetUpError = () =>
  new UserInputError('Sending domains are not set up on this server', {
    userFriendlyMessage: msg`Sending domains are not set up on this server.`,
  });

// Public resolvers: the host's own resolver has timed out on this server before.
const DNS_SERVERS = ['1.1.1.1', '8.8.8.8'];

@Injectable()
export class SendingDomainService {
  private readonly dnsResolver = this.createDnsResolver();

  // Serializes read-modify-write of domains.txt within this process.
  private pendingWrite: Promise<unknown> = Promise.resolve();

  async listSendingDomains(workspaceId: string): Promise<SendingDomainListDTO> {
    const setup = await this.readSetup(workspaceId);

    if (!isDefined(setup)) {
      return { isConfigured: false, domains: [] };
    }

    const requestedDomains = await this.readRequestedDomains(setup.directory);
    const domains = [
      ...new Set([...setup.serverConfig.fixedDomains, ...requestedDomains]),
    ].sort();

    return {
      isConfigured: true,
      domains: await Promise.all(
        domains.map((domain) => this.describeDomain(domain, setup)),
      ),
    };
  }

  async addSendingDomain(
    workspaceId: string,
    input: string,
  ): Promise<SendingDomainDTO> {
    const setup = await this.readSetupOrThrow(workspaceId);
    const domain = normalizeSendingDomain(input);

    if (!isDefined(domain)) {
      throw new UserInputError(`"${input}" is not a valid domain name`, {
        userFriendlyMessage: msg`"${input}" is not a valid domain name.`,
      });
    }

    if (!setup.serverConfig.fixedDomains.includes(domain)) {
      await this.updateRequestedDomains(setup.directory, (requestedDomains) =>
        requestedDomains.includes(domain)
          ? requestedDomains
          : [...requestedDomains, domain],
      );
    }

    return this.describeDomain(domain, setup);
  }

  async removeSendingDomain(
    workspaceId: string,
    input: string,
  ): Promise<boolean> {
    const setup = await this.readSetupOrThrow(workspaceId);
    const domain = normalizeSendingDomain(input) ?? input;

    if (setup.serverConfig.fixedDomains.includes(domain)) {
      throw new UserInputError(
        `${domain} is set on the mail server and cannot be removed here`,
        {
          userFriendlyMessage: msg`${domain} is set on the mail server and cannot be removed here.`,
        },
      );
    }

    let isRemoved = false;

    await this.updateRequestedDomains(setup.directory, (requestedDomains) => {
      isRemoved = requestedDomains.includes(domain);

      return requestedDomains.filter(
        (requestedDomain) => requestedDomain !== domain,
      );
    });

    return isRemoved;
  }

  private async describeDomain(
    domain: string,
    { directory, serverConfig }: SendingDomainSetup,
  ): Promise<SendingDomainDTO> {
    const isFixed = serverConfig.fixedDomains.includes(domain);
    const dkimValue = await this.readDirectoryFile(
      directory,
      `${domain}${SENDING_DOMAIN_FILES.dkimRecordSuffix}`,
    );

    if (!isNonEmptyString(dkimValue?.trim())) {
      return { domain, status: 'preparing', isFixed, records: [] };
    }

    const records = buildSendingDomainRecords({
      domain,
      dkimValue: dkimValue.trim(),
      serverConfig,
      published: await this.lookUpPublishedRecords(domain, serverConfig),
    });

    return {
      domain,
      status: records.every((record) => record.status === 'ok')
        ? 'verified'
        : 'pending',
      isFixed,
      records,
    };
  }

  private async lookUpPublishedRecords(
    domain: string,
    serverConfig: SendingDomainServerConfig,
  ): Promise<SendingDomainPublishedTxtRecords> {
    const [root, dkim, dmarc] = await Promise.all([
      this.resolveTxt(domain),
      this.resolveTxt(`${serverConfig.selector}._domainkey.${domain}`),
      this.resolveTxt(`_dmarc.${domain}`),
    ]);

    return { root, dkim, dmarc };
  }

  private async resolveTxt(hostname: string): Promise<string[]> {
    try {
      const records = await this.dnsResolver.resolveTxt(hostname);

      return records.map((chunks) => chunks.join(''));
    } catch {
      // Not found, no data and timeouts all mean the record cannot be seen yet.
      return [];
    }
  }

  private async readSetupOrThrow(
    workspaceId: string,
  ): Promise<SendingDomainSetup> {
    const setup = await this.readSetup(workspaceId);

    if (!isDefined(setup)) {
      throw buildNotSetUpError();
    }

    return setup;
  }

  private async readSetup(
    workspaceId: string,
  ): Promise<SendingDomainSetup | null> {
    const directory = process.env.FLOLABS_SENDING_DOMAINS_DIR;

    if (!isNonEmptyString(directory) || !isFlolabsMailWorkspace(workspaceId)) {
      return null;
    }

    const content = await this.readDirectoryFile(
      directory,
      SENDING_DOMAIN_FILES.serverConfig,
    );
    const serverConfig = isDefined(content)
      ? parseSendingDomainServerConfig(content)
      : null;

    return isDefined(serverConfig) ? { directory, serverConfig } : null;
  }

  private async readRequestedDomains(directory: string): Promise<string[]> {
    const content = await this.readDirectoryFile(
      directory,
      SENDING_DOMAIN_FILES.requestedDomains,
    );

    return parseRequestedDomains(content ?? '');
  }

  private async updateRequestedDomains(
    directory: string,
    update: (requestedDomains: string[]) => string[],
  ): Promise<void> {
    const write = this.pendingWrite.then(async () => {
      const domains = update(await this.readRequestedDomains(directory));
      const target = join(directory, SENDING_DOMAIN_FILES.requestedDomains);
      const temporary = `${target}.${randomUUID()}.tmp`;

      // dkim-manager may read at any moment; a rename never shows it a half-written list.
      try {
        await writeFile(
          temporary,
          domains.map((domain) => `${domain}\n`).join(''),
        );
        await rename(temporary, target);
      } catch (error) {
        await rm(temporary, { force: true });
        throw error;
      }
    });

    this.pendingWrite = write.catch(() => undefined);

    return write;
  }

  private async readDirectoryFile(
    directory: string,
    fileName: string,
  ): Promise<string | null> {
    try {
      return await readFile(join(directory, fileName), 'utf8');
    } catch {
      return null;
    }
  }

  private createDnsResolver(): Resolver {
    const resolver = new Resolver({ timeout: 3000, tries: 2 });

    resolver.setServers(DNS_SERVERS);

    return resolver;
  }
}
