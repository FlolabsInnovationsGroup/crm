import { isDefined } from 'twenty-shared/utils';

import { type SendingDomainDnsProviderDTO } from 'src/modules/sending-domain/dtos/sending-domain-dns-provider.dto';

const KNOWN_DNS_PROVIDERS: {
  nameServerSuffix: string;
  name: string;
  url: string;
}[] = [
  {
    nameServerSuffix: 'dyna-ns.net',
    name: 'Dynadot',
    url: 'https://www.dynadot.com/account/domain/name/list.html',
  },
  {
    nameServerSuffix: 'ns.cloudflare.com',
    name: 'Cloudflare',
    url: 'https://dash.cloudflare.com',
  },
  {
    nameServerSuffix: 'domaincontrol.com',
    name: 'GoDaddy',
    url: 'https://dcc.godaddy.com/control/portfolio',
  },
  {
    nameServerSuffix: 'registrar-servers.com',
    name: 'Namecheap',
    url: 'https://ap.www.namecheap.com/domains/list',
  },
  {
    nameServerSuffix: 'hetzner.com',
    name: 'Hetzner DNS',
    url: 'https://dns.hetzner.com',
  },
];

export const detectDnsProvider = (
  nameServers: string[],
): SendingDomainDnsProviderDTO | null => {
  const normalizedNameServers = nameServers.map((nameServer) =>
    nameServer.toLowerCase().replace(/\.$/, ''),
  );

  if (normalizedNameServers.length === 0) {
    return null;
  }

  const knownProvider = KNOWN_DNS_PROVIDERS.find((provider) =>
    normalizedNameServers.some(
      (nameServer) =>
        nameServer === provider.nameServerSuffix ||
        nameServer.endsWith(`.${provider.nameServerSuffix}`),
    ),
  );

  return isDefined(knownProvider)
    ? { name: knownProvider.name, url: knownProvider.url }
    : { name: normalizedNameServers.sort()[0], url: null };
};
