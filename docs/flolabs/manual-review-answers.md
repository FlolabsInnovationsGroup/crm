# Needs review: replies, grouping and the answers database

Requested on 27 Nov 2026 after the team saw cards stay open for applicants they had already answered, and the same applicant on two cards.

## What changed

- **A reply sent from a card closes it.**
  - Press **Reply** or **Reply with template** on a card, then send. The card's applicant emails are marked done.
  - A notice above the reply box says so.
  - An approval in the same card stays open, because it still needs its own button.
  - Replies sent another way (from Outlook, or by opening the conversation directly) still need **Done**.
- **One card per applicant.**
  - Replies, stuck notices and approvals for the same email show as one card.
  - Each approval keeps its button, and the card counts under every filter its items match.
  - Done closes everything on the card, except an approval on a card that also has a reply: that approval stays until its own button is used and Done is pressed again.
  - Automation issues name a teammate, not an applicant, so they stay as separate cards.
- **Manual review answers** is a new list in the CRM, opened from the link under the Needs review title. It gets one row per card with an applicant question:
  - the question;
  - our answer;
  - the category;
  - the template used;
  - the applicant and their person;
  - who answered, and when.

  It fills itself in two ways:
  - **Reply from a card:** the text that was sent.
  - **Done by hand:** the last email our mailboxes sent the applicant before Done, the same rule as the history export. When no such email is found, the row keeps the question with an empty answer. An answer already saved from the card is kept.

  The list has the usual views, filters and CSV export. It is the raw material for new templates and for the AI drafts in plan item 9.

## Setup (once, by an admin)

1. Create the object **before deploying** the server version that writes it:
   ```
   TWENTY_URL=https://crm.flolabsinnovations.com TWENTY_TOKEN_FILE=<file with an admin API key> node packages/twenty-utils/flolabs/setup-manual-review-answers.mjs
   ```
   Without it, replies and Done still work, and the CRM shows a warning that the answer was not saved.
2. Deploy.

## Limits

- Cards marked done before this change have no row.
- Deleting a row keeps it deleted. Pressing Done again does not bring it back.
