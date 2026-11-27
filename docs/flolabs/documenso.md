# Documenso: the signing engine (plan item 8)

Documenso (open source, AGPL-3.0) signs agreements for the CRM. It runs on the CRM server at https://sign.flolabsinnovations.com, from the official image, unmodified. The team works in the CRM: Agreement templates, then Send agreement on a person. Documenso only holds the documents while they are being signed.

## Install (once)

1. **DNS:** at the DNS provider (Dynadot), add an A record `sign` pointing to the CRM server's IP. Wait until `getent hosts sign.flolabsinnovations.com` on the server shows that IP.
2. **On the server**, as root:
   ```
   bash packages/twenty-utils/flolabs/setup-documenso.sh
   ```
   It:
   - writes `/opt/flolabs-sign` with new secrets and a signing certificate;
   - starts Documenso and its own Postgres, plus a mail catcher;
   - adds the site to the CRM's Caddy, with a backup of the Caddyfile and an automatic roll back if Caddy refuses;
   - checks the site over HTTPS.

   The CRM itself is not restarted.
3. **Admin account:** open https://sign.flolabsinnovations.com/signup and sign up with hr@.
   - The confirmation email does not leave the server. Open it through the tunnel the script prints, at http://localhost:8026.
4. **Close sign-up:** `bash setup-documenso.sh --lock`.
5. **API token for the CRM:** in Documenso, Settings > API tokens > create one with no expiry. It goes into the CRM's settings with the Send agreement feature, not into chat.

## What to know

- **Emails:** Documenso sends nothing to applicants. The CRM asks for signing links and emails them from hr@. Documenso's own emails (account checks) stay in the mail catcher.
- **Signing certificate:** self-signed, valid for 10 years. Signatures are valid, but Adobe shows the certificate as "not trusted". To fix that, replace `/opt/flolabs-sign/cert.p12` with one from a certificate authority and restart.
- **Backups:** `/opt/flolabs-sign/.env`, `cert.p12`, and `docker exec flolabs-sign-database-1 pg_dump -U documenso documenso`. The documents are stored in that database.
- **Upgrades:** take a backup, change the image tag in `setup-documenso.sh`, then run it again.
- **Memory:** about 1.5 GB at most. The trial on 26 Nov ran beside the CRM without trouble.
- **Removing it:** run `docker compose down` in `/opt/flolabs-sign`, then delete the `sign.flolabsinnovations.com` block from the Caddyfile and reload Caddy.
