# FloLabs campaigns mail stack

Free, self-hosted email campaigns: Listmonk (campaigns UI) and Postfix with rspamd (DKIM signing), on `flolabs-crm-01` next to the CRM. Listmonk and Postfix run from their official images, unmodified; nothing of their code is in this repo.

| Service | Image | Role |
|---|---|---|
| `app` | `listmonk/listmonk:v6.2.0` | Campaigns UI at https://campaigns.flolabsinnovations.com/admin, via the CRM's Caddy |
| `db` | `postgres:17-alpine` | Listmonk's database, reached as `listmonk-db` (`db` is the CRM's on the shared network) |
| `postfix` | `boky/postfix:v5.2.1` | Sends on port 25 and signs with rspamd |
| `dkim-manager` | `boky/postfix:v5.2.1` | Runs `dkim-manager.sh`: a key per sending domain and rspamd's signing maps |

## Sending domains

Fixed domains are `SENDING_DOMAINS` in `.env`. Others are added in the CRM, **Settings > Sending domains**: the CRM writes the name into `domains/domains.txt`, and `dkim-manager` creates the key and the public record (`domains/<domain>.dkim`). The person then adds the three TXT records at the DNS provider and presses Check. `add-sending-domain.sh` does the same from the command line.

Private keys stay in `dkim-keys/`, which only `postfix` and `dkim-manager` mount. Back up `dkim-keys/`, `.env` and `docker exec flolabs-mail-db-1 pg_dump -U listmonk listmonk`.

## Install on the server

```bash
mkdir -p /opt/flolabs-mail && cd /opt/flolabs-mail
# copy docker-compose.yml, dkim-manager.sh, add-sending-domain.sh here; .env from .env.example
docker compose up -d
```

The CRM server container needs `/opt/flolabs-mail/domains` mounted and `FLOLABS_SENDING_DOMAINS_DIR` pointing at it, for example in `/opt/flolabs-crm/docker-compose.override.yml`:

```yaml
services:
  server:
    environment:
      FLOLABS_SENDING_DOMAINS_DIR: /flolabs-mail/domains
      # Only this workspace sees the page: the mail server is shared by the whole instance.
      FLOLABS_SENDING_DOMAINS_WORKSPACE_ID: <workspace id>
    volumes:
      - /opt/flolabs-mail/domains:/flolabs-mail/domains
```

Upgrades are manual: back up, change the image tag, `docker compose up -d`. Listmonk's own `--upgrade` on start was removed on purpose.
