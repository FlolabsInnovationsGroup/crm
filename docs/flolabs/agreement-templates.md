# Agreement templates (plan item 8, first part)

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

Until the Send agreement button exists, a template can be checked in Settings > APIs & Webhooks > Playground, GraphQL, Core:

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

## Setup (once, by an admin)

```
TWENTY_URL=https://crm.flolabsinnovations.com TWENTY_TOKEN_FILE=<file with an admin API key> node packages/twenty-utils/flolabs/setup-agreement-templates.mjs
```

Run it before deploying the server version with the preview.

## Next

Sending for signature through Documenso (signing link, John's countersignature, the signed PDF saved on the person) comes once Documenso runs at sign.flolabsinnovations.com.
