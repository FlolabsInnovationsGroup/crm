# Agreement templates and e-signature (plan item 8)

Agreements are written and kept in the CRM, as many as the team wants. Dropbox Sign allows 5 templates on its plan, and all 5 are used.

## Add or change a template

1. Open **Agreement templates** in the left menu (or search for it).
2. Press **New record** and fill in:
   - **Name:** for example "Full One-Time Payment".
   - **Document type:** Internship agreement, Academic integrity, Letter or Other.
   - **For payment plan:** the plan this version is for. Leave it empty if it fits every plan.
   - **Text:** the document itself. Write it, or paste it from Word or Google Docs.
   - **In use:** untick it to retire a template without deleting it.
   - **Notes:** who signs and in what order.
3. To make a variant, open a template, copy its text into a new one and change what differs.

## Placeholders

Write these in the text, with the double braces. The CRM fills them from the person when the agreement is prepared:

| Placeholder | Filled with |
| --- | --- |
| `{{fullName}}`, `{{firstName}}`, `{{lastName}}` | The person's name |
| `{{email}}` | Their main email |
| `{{address}}` | City, state and country; if empty, the location from their application |
| `{{city}}`, `{{country}}` | As on the person |
| `{{paymentPlan}}` | Their payment plan, in words |
| `{{agreedAmount}}` | Their agreed amount, for example $1,200.00 |
| `{{date}}` | Today's date, for example 27 November 2026 |

Anything else, for example `{{startDate}}`, stays as written and is listed as missing, so the sender fills it in by hand.

## Check a template for one person

A template can be checked in Settings > APIs & Webhooks > Playground, GraphQL, Core:

```graphql
query { previewAgreement(templateId: "<template id>", personId: "<person id>") { templateName text missingPlaceholders } }
```

Both ids are at the end of the record's address in the browser.

## The 5 Dropbox Sign templates

- Full One-Time Payment
- Scholarship Tuition Fee / Paying only the monthly fee
- Full Scholarship
- Letter of Collaboration Flomad Labs R&D
- The Fundamental Values of Academic Integrity

Their text sits in PDFs inside Dropbox Sign. Copy each one into a new template, putting placeholders where the blanks are (date, name, address).

## Send for signature (Documenso)

The server side is ready; the button on a person comes next. Until then, run it from Settings > APIs & Webhooks > Playground, GraphQL, Core:

```graphql
mutation { sendAgreement(personId: "<person id>", templateIds: ["<template id>"]) { agreementRequestId emailSent emailError } }
```

What happens:

1. Each template is filled for the person and turned into a PDF, with a last page for the signatures. Sending stops if any placeholder is still empty; fill it on the person first. Up to 5 templates go together and are signed in one go.
2. Documenso gets the PDFs, with the intern signing first and the FloLabs signer second. Documenso sends no emails.
3. The CRM emails the intern their signing link from hr@. An **Agreement request** record appears on the person, status *Waiting for the intern*.
4. When the intern signs, the CRM emails the FloLabs signer their link. Status: *Waiting for FloLabs*.
5. When both have signed, the signed PDFs and Documenso's signing certificate are attached to the person, the intern gets a copy by email, and the status becomes *Signed*.

If an email went missing, `resendAgreementEmail(agreementRequestId: "<id>")` sends the current link again: to the intern while they have not signed, otherwise to the FloLabs signer. If a status looks stuck, `syncAgreementRequest(agreementRequestId: "<id>")` reads it again from Documenso. An agreement deleted in Documenso becomes *Cancelled*.

Who can send: anyone whose role may create Agreement requests and read the person and the templates.

## Setup (once, by an admin)

1. **Create the objects** (Agreement templates and Agreement requests):
   ```
   TWENTY_URL=https://crm.flolabsinnovations.com TWENTY_TOKEN_FILE=<file with an admin API key> node packages/twenty-utils/flolabs/setup-agreement-templates.mjs
   ```
   Run it again after an update; it only adds what is missing. Run it before deploying the server version that sends agreements.
2. **Documenso** must run first: see [documenso.md](documenso.md).
3. **The FloLabs signer needs a Documenso account** with the exact email set in `FLOLABS_AGREEMENT_COUNTERSIGNER_EMAIL`, created while sign-up is still open (only @flolabsinnovations.com addresses can sign up). Their link only opens once they are signed in, because it also sits in hr@'s synced mail.
4. **In Documenso** (signed in as hr@):
   - Settings > API tokens: create a token with no expiry.
   - Settings > Webhooks: add `https://crm.flolabsinnovations.com/webhooks/flolabs-documenso` with the events *Document recipient completed*, *Document completed*, *Document rejected* and *Document cancelled*, and a long random secret.
5. **Add the settings on the server** in the CRM's env (never in chat or a screenshot), then restart the server:
   - `FLOLABS_DOCUMENSO_API_TOKEN` = the Documenso token
   - `FLOLABS_DOCUMENSO_WEBHOOK_SECRET` = the webhook secret
   - `FLOLABS_AGREEMENT_COUNTERSIGNER_EMAIL` = the email of whoever signs for FloLabs
   - `FLOLABS_AGREEMENT_COUNTERSIGNER_NAME` = their name as printed by Documenso
   - Optional: `FLOLABS_AGREEMENT_SENDER` (default `hr@flolabsinnovations.com`, must be connected to the CRM), `FLOLABS_DOCUMENSO_API_URL` (default `http://documenso:3000`, inside Docker), `FLOLABS_DOCUMENSO_PUBLIC_URL` (default `https://sign.flolabsinnovations.com`).
   - `FLOLABS_WORKSPACE_ID` (or `FLOLABS_PAYMENTS_WORKSPACE_ID`) is already set for the meeting tracker.
6. **Roles:** Settings > Roles, decide who may create Agreement requests.

## Test before going live

Send to a test person whose email is `mohamedrad2022+crmtest@gmail.com`, with `FLOLABS_AGREEMENT_COUNTERSIGNER_EMAIL` set to another address you can read. Sign as the intern, then as FloLabs, and check that the person gets three things: both signed files and the certificate.

## Limits

- The PDF font covers Latin letters, including accented ones. Text in other scripts prints as blanks.
- Formatting kept from the editor: headings, paragraphs, bullet and numbered lists, bold. Tables and images are not.
