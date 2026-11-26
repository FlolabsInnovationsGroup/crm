# Payment tracker (Stripe)

Plan item 5. Shows on each person whether they paid, how much, and what is left, filled automatically from Stripe.

## What people see

**On each person** (admins only, see step 5):

| Field | Filled by |
| --- | --- |
| Payment plan: Full one-time payment, Scholarship + monthly fee, Full scholarship, Custom plan | The team |
| Agreed amount | The team (needed for Custom plans and installments) |
| Payment agreement notes | The team, for the terms of a Custom plan |
| Payment status: Not paid, Paying in installments, Paid in full, Scholarship | The CRM |
| Paid so far, Remaining, Payments made, First payment, Last payment | The CRM |

**Payments** is a new list with one record per Stripe payment: amount, refunds, date, payer email, status and the person it belongs to. A payment whose email matches nobody has an empty Person; link it by hand and the person's totals update at once.

**Matching:** a payment is linked to the person whose email matches the payer's (the oldest one if several match; deleted people are skipped). A payment someone linked by hand keeps that person. If you clear a payment's Person on purpose, the next refund or sync for it links it by email again.

**Status rules:** Full scholarship is always "Scholarship". Otherwise "Not paid" until money arrives; then "Paid in full" once the agreed amount is reached (or after any payment on a Full one-time plan with no agreed amount), and "Paying in installments" before that. Refunds are subtracted. Payments in another currency than the agreed amount are listed but not added to the total. A person with payments but no plan shows "Paying in installments". Lost disputes are not subtracted; correct one by entering the lost amount in the payment's Refunded field, and the person's totals update.

**Privacy:** payment fields are part of a person, so any workflow or outgoing webhook that sends person updates also sends them.

## Setup (once, by an admin)

1. **Create the fields and the Payments object:**
   `TWENTY_URL=https://crm.flolabsinnovations.com TWENTY_TOKEN_FILE=<file holding an admin API key> node packages/twenty-utils/flolabs/setup-payments.mjs`
   Running it again is safe, but it does not change fields that already exist. If the Payments object was created before the Stripe payment ID became unique, turn on "Unique" for that field by hand in Settings > Data model.
2. **Create a restricted Stripe key** (Stripe > Developers > API keys > Create restricted key) with **Read** on Customers, Charges, PaymentIntents and nothing else.
3. **Create the webhook** (Stripe > Developers > Webhooks > Add endpoint):
   - URL: `https://crm.flolabsinnovations.com/webhooks/flolabs-payments`
   - Events: `payment_intent.succeeded` and `charge.refunded`
   - Copy its signing secret.
4. **Add the settings on the server** in the CRM's env (never in chat or a screenshot), then restart the server:
   - `FLOLABS_PAYMENTS_WORKSPACE_ID` = the FloLabs workspace id
   - `FLOLABS_STRIPE_API_KEY` = the restricted key
   - `FLOLABS_STRIPE_WEBHOOK_SECRET` = the webhook signing secret
5. **Limit who can see payments:** Settings > Roles: give only admins access to the Payments object and to the payment fields on People.
6. **Bring in past payments and repair totals:** run the `syncStripePayments(since: "2026-01-01")` mutation as an admin (for example from Settings > API & Webhooks > Playground). It reads at most the last 400 days, recalculates everyone it touched, and can be run again safely.

Leave the Stripe payment ID empty on payments entered by hand; it must be unique.

## Reports

Use saved views; no code is needed:

- **Paid this month:** Payments, filter Paid at = this month, Status = Paid; the table footer sums Amount.
- **New payers this month:** People, filter First payment = this month.
- **Who still owes:** People, filter Payment status = Paying in installments, sort by Remaining.
- **Unmatched payments:** Payments, filter Person is empty.
- **Scholarships:** People, group by Payment plan.

## Test before going live

Use Stripe's test mode first: a test key and a test webhook pointing at the same URL. A test payment from a `+crmtest` address of an existing test person should mark that person, and an unknown email should appear under Unmatched payments.
