# Documenso: the signing engine (plan item 8)

Documenso (open source, AGPL-3.0) signs agreements for the CRM. It runs on the CRM server at https://sign.flolabsinnovations.com, from the official image, unmodified. The team works in the CRM: Agreement templates, then Send agreement on a person. Documenso only holds the documents while they are being signed.

## Install (once)

1. **DNS:** at the DNS provider (Dynadot), add an A record `sign` pointing to the CRM server's IP, and no AAAA record. Wait until `getent hosts sign.flolabsinnovations.com` on the server shows that IP.
2. **Remove the trial** if it still runs: `sudo bash documenso-trial-remove.sh`. Both together do not fit in memory.
3. **Copy the script to the server** from a checkout of this repo:
   ```
   scp packages/twenty-utils/flolabs/setup-documenso.sh root@<server ip>:/opt/setup-documenso.sh
   ```
4. **On the server:**
   ```
   sudo bash /opt/setup-documenso.sh
   ```
   It:
   - writes `/opt/flolabs-sign` with new secrets and a signing certificate;
   - starts Documenso and its own Postgres, plus a mail catcher;
   - waits until Documenso reports its database and certificate are OK;
   - adds the site to the CRM's Caddy, with a backup of the Caddyfile and an automatic roll back if Caddy refuses;
   - checks the site over HTTPS.

   The CRM itself is not restarted.
5. **Back up `/opt/flolabs-sign/.env`** somewhere safe. It holds the encryption keys; without them the stored documents cannot be read.
6. **Admin account:** open https://sign.flolabsinnovations.com/signup and sign up with hr@. Only @flolabsinnovations.com addresses can sign up.
   - The confirmation email does not leave the server. Open it through the tunnel the script prints, at http://localhost:8026, and click only the email sent seconds after your own sign-up.
7. **Close sign-up:** `sudo bash /opt/setup-documenso.sh --lock`. It lists every account first; delete any you do not recognise.
8. **API token for the CRM:** in Documenso, Settings > API tokens > create one with no expiry. It goes into the CRM's settings with the Send agreement feature, not into chat.

## What to know

- **Emails:** Documenso sends nothing to applicants. The CRM asks for signing links and emails them from hr@. Documenso's own emails (account checks) stay in the mail catcher.
- **Signing certificate:** self-signed, valid for 10 years. Signatures are valid, but Adobe shows the certificate as "not trusted". To fix that, replace `/opt/flolabs-sign/cert.p12` with one from a certificate authority and restart.
- **Backups:** `/opt/flolabs-sign/.env`, `cert.p12`, and `docker exec flolabs-sign-database-1 pg_dump -U documenso documenso`. The documents are stored in that database.
- **Upgrades:** take a backup, change the image tag in `setup-documenso.sh`, then run it again.
- **Memory:** the limits add up to about 2.2 GB; the script refuses to start with less free.
- **Network:** Documenso joins the CRM's Docker network so Caddy can reach it, as Listmonk does. That also lets it reach the CRM's Postgres and Redis.
- **Removing it:** run `docker compose down` in `/opt/flolabs-sign`, then delete the `sign.flolabsinnovations.com` block from the Caddyfile and reload Caddy.
