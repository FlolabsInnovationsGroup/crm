# FloLabs CRM: Plan for the Operations Meeting Requests

26 Nov 2026. Approved by Mohamed on 26 Nov 2026. The living copy is the Claude Doc "FloLabs CRM: Plan for the Operations Meeting Requests"; this file is the snapshot kept with the code.

This plan turns the CRM requests from the Operations meeting of 25 Nov 2026 into 11 pieces of work in 3 phases. Each piece ships as its own pull request that a person merges.

## The plan at a glance

Phase 1 fixes what hurts applicants today and should finish within a week of approval. Phase 2 saves the team time. Phase 3 holds the bigger features, each started only when its inputs are ready.

| # | Item | Phase | Effort (working days) | Blocked until |
| --- | --- | --- | --- | --- |
| 1 | John can log in to the CRM | 1 | Under 1 | John's login email and the error he sees |
| 2 | Find and fix applicant replies the automation misses | 1 | 1 to 2 | The 2 examples John forwarded to Nago |
| 3 | Earlier messages quoted under every reply sent from the CRM | 1 | 2 | Nothing |
| 4 | Manual Review history and CSV export | 2 | 2 | Nothing |
| 5 | Payment tracker on each person, filled from Stripe | 2 | 3 to 4 | A read-only Stripe key, entered by Mohamed |
| 5b | Stripe disputes on the payment tracker | 2 | 1 | Nothing (dispute events already on the live webhook) |
| 6 | Time from application to meeting, per person and per month | 2 | 2 + 1.5 (Calendly) | Calendly tokens for hr.team@ and people@ |
| 7 | Applicant summary before the booking email | 2 | 1 (CRM) + n8n work | Mani for the n8n side |
| 8 | E-signature inside the CRM with Documenso, replacing Dropbox Sign | 3 | 1 (trial) + 8 to 10 | The agreement template from John |
| 9 | AI drafts replies to multi-question emails | 3 | 5 or more | John's list of about 20 questions and answers |
| 10 | Remove Brevo | 3 | 2 to 3 | Bounce and reply mailboxes, Brevo contact export |
| 11 | Ash's requests: AI-personalised campaign emails, follow-ups in the CRM, lead search | 3 | 3 to 5 | A decision on a lead data source |

Effort counts building, the second-agent review and fixes. It does not count waiting for inputs, merges or deploys.

## Phase 1: what hurts applicants today

### 1. John can log in

- **Why:** John cannot open the CRM, so he cannot see Needs Review for himself.
- **How:** check his user and workspace membership, then the sign-in method he uses (password or Google). Reset the password or resend the invite as needed. No code change is expected.
- **Done when:** John signs in and opens Team inbox > Needs review.

### 2. Applicant replies the automation misses

- **Why:** applicants replied 4 to 6 days ago, yet the automation sent them a reminder as if they had not, and nobody answered them.
- **How:** trace the 2 cases John forwarded, step by step: did the reply reach hr@, was it imported into the CRM, was it linked to the right person and thread, and did n8n read it? Fix the step that failed. Then add a standing rule: right before any reminder goes out, the workflow checks the latest state of the conversation in the CRM (has the applicant replied since the reminder was scheduled, has their Stage changed) and skips the reminder if so. Mani builds the check in n8n; the CRM answers it. Finally, check the last 30 days for other people who replied but still got a reminder, and list them so the team can answer them.
- **Done when:** both cases are explained, the fix and the check-before-reminder rule are live, a test applicant who replies gets no reminder afterwards, and the list of other affected applicants is handed to Nago. Target: 0 reminders sent after a confirmed reply.

### 3. Earlier messages quoted under every reply

- **Why:** in the CRM a conversation looks complete, but the email the applicant receives shows only the newest message. John has seen this in Outlook since the move from HubSpot, which quoted the history.
- **What the code shows:** every email the CRM sends (Team inbox replies, n8n through `send_email`, workflows) goes through one service, and none of them adds the earlier messages under the reply. Threading in the mail client also needs the `inReplyTo` value of the message being answered.
- **How:** when an email is a reply, add the earlier messages below it, newest first, as "On \<date\>, \<name\> wrote:", the way Gmail and Outlook do. Mani checks that n8n passes `inReplyTo` on every reply.
- **Done when:** Nago's test applications receive replies with the full history underneath, in Gmail and in Outlook, and Outlook groups them as one conversation.

## Phase 2: saving the team's time

### 4. Manual Review history and CSV export

- **Why:** John wants every manually answered email (question and answer) in a spreadsheet to find what can be automated. Today a card disappears once someone presses Done, so Nago would have to take screenshots by hand.
- **How:** a History view in Needs review listing every card marked Done, with the applicant, their question, our reply, who answered and when, filtered by date. An Export CSV button downloads it. The CRM already records when each card was marked Done, so the history from the last update onwards can be shown.
- **Done when:** John can export the last 2 weeks to a spreadsheet without anyone taking screenshots.

### 5. Payment tracker

- **Why:** John asks how many onboarded interns paid in a month and nobody can answer from the CRM.
- **How:** fields on each person: Payment status (Paid, Not paid, Scholarship), plan, amount, date of first payment, Stripe customer. A Stripe webhook updates them when a payment succeeds or fails. Payments are matched to people by email; a payment that matches nobody appears in a short list for a person to link by hand. A monthly report shows onboarded, paid, scholarship and conversion rate. Only admins see payment fields.
- **Done when:** a test payment in Stripe's test mode marks the right person Paid, and the report shows last month's numbers.

### 5b. Stripe disputes

- **Why:** disputes happen. When a payer disputes a charge, Stripe takes the money back, but the CRM keeps showing the person as paid. Today the lost amount has to be typed into the payment's Refunded field by hand.
- **How:** the payment tracker also handles `charge.dispute.created`, `charge.dispute.closed` and `charge.dispute.funds_reinstated`, which are already turned on for the live webhook. An open dispute is flagged on the payment so the team sees it early. A lost dispute is subtracted from the person's Paid so far, and a won dispute leaves the total as it was. New code in the payment tracker module only, reviewed by a second agent, merged by a person.
- **Done when:** the tests cover open, lost and won disputes, and the next real dispute shows on its payment and, if lost, lowers the person's Paid so far.

### 6. Time from application to meeting

- **Why:** the goal is 3 weeks from application to onboarding, with the meeting booked within 7 to 9 days. Today nobody can measure it.
- **How:** the application date is already on each person. The meeting date comes from the calendars the CRM already syncs: when interviewers connect their calendars, Calendly bookings appear as events with the applicant as a guest, and the CRM links them to the person. A report shows days from application to meeting per person and the monthly average, and lists people waiting longer than 9 days. This avoids Calendly webhooks, which may need a paid Calendly plan.
- **Done when:** the report shows real numbers for the last month and the people currently waiting too long.
- **Blocked on 26 Nov:** Google calendars cannot be connected yet; see `docs/flolabs/google-calendar-connection.md` for the cause, the open decisions and the steps.

### 7. Applicant summary before the booking email

- **Why:** John wants to see who the person is, what they applied for and where they live before the booking email goes out, and to send the calendar of the two right interviewers.
- **How:** the n8n approval card for the booking email (in Needs review) shows the applicant's name, positions, country and time zone, with a choice of interviewer pair. Mani builds the n8n part; the CRM shows the details on the card. Giving each interviewer pair enough free slots in the next 7 to 9 days is a Calendly setting (a shared or round-robin event), not CRM work.
- **Done when:** Nago approves a booking from a card that shows these details, and the applicant receives the right pair's calendar.

## Phase 3: bigger features

### 8. E-signature inside the CRM

- **Why:** agreements go out through Dropbox Sign today, outside the CRM, on its Essentials plan at US$20 a month (about US$240 a year).
- **What Dropbox Sign does for us today (checked in the account on 26 Nov):**
  - 837 documents sent since September 2024, all from one seat. Each new intern gets two documents: the "Internship FloLabs Subject Matter Expert Accelerator Program Agreement" and "The Fundamental Values of Academic Integrity".
  - Two signers on each: John and the intern. The agreement has blanks for the date and the participant's name and address.
  - 5 templates, which is the plan's limit: Full One-Time Payment; Scholarship Tuition Fee / Paying only the monthly fee; Full Scholarship; Letter of Collaboration Flomad Labs R&D; The Fundamental Values of Academic Integrity. The first three look like the agreement in three payment versions (to confirm with John).
  - Sending is done by hand on the website. An "n8n API" key exists but was last used in May 2026, the plan does not include production API access, and no callback URL is set, so nothing flows back to n8n or the CRM.
  - Several documents are still waiting for one signature, and nobody sees that outside Dropbox Sign.
- **How:** fork Documenso (open source, AGPL-3.0, written in TypeScript like the CRM) into FloLabs' GitHub and run it on the CRM's own server at sign.flolabsinnovations.com, branded FloLabs. It is the signing engine; the team works in the CRM.
  - **No limits, no fees:** the free self-hosted edition has no per-document fee, and its limits (documents, recipients, files per request) are set by us in its admin panel, so we set none. Templates are not capped.
  - **Templates live in the CRM, as many as we want:** a new Agreement templates page in Settings. Anyone allowed creates a new template or copies an existing one, writes the text in the CRM's editor and adds fields such as name, address, start date, plan and fee. The 5 Dropbox Sign templates are moved in first.
  - **Edit before sending:** on a person's page, Send agreement picks the template from the person's payment plan (item 5), fills in their details and shows a preview. The text can be changed for this person only (another start date, an extra clause) without touching the template. The CRM then makes the PDF, with the signature boxes in fixed places, and sends it with the Academic Integrity document in one signing request through Documenso's API.
  - **Signing and after:** the link goes out from hr@ and John countersigns with his saved signature. When everything is signed, the signed PDFs and the completion certificate are saved on the person and their Stage moves on.
  - **More than Dropbox Sign gives us today:** automatic reminders after a set number of days; a list of agreements still waiting, with a Resend button; send to a whole cohort at once; each signed agreement records which template version was used; signing status on the person and in reports.
  - **What would cost money, and why we do not need it:** Documenso's paid Enterprise licence covers SSO, two-factor before signing, custom sender domains and its embeddable editor. The editor is ours in the CRM and the emails go out from the CRM, so none of it is needed. Templates, multi-document requests, signing order, webhooks and the API are in the free edition.
- **Moving off Dropbox Sign:** keep paying until Documenso has handled a week of real agreements. Before cancelling, download the 837 signed documents with their audit trails and store them outside Dropbox Sign (the R2 archive or on each person in the CRM). Then cancel the plan.
- **Before building:** Notion records no final choice: the task "Research open-source DocuSign alternatives and legal validity" (Mohamed + Legal Buddy) is still Not Started, and the legal checklist (done in September) names DocuSeal, Documenso and OpenSign and recommends a simple e-signature for now. Decided on 26 Nov: Documenso, chosen for full control (same language as the CRM); DocuSeal is the fallback. A one-day trial on a test server checks four things in the free edition before any CRM work: webhooks when a document is signed; the audit log and completion certificate the legal checklist requires; signing in the order John wants; and that Documenso can skip its own emails and hand the signing links to the CRM. Anything missing is added in our fork or, if too large, we switch to DocuSeal.
- **Trial result (26 Nov, Documenso v2.21.0 on the CRM server, reachable only through an SSH tunnel, emails caught by a local test mailbox):** all four checks pass in the free edition.
  - **Webhooks:** document.signed, document.recipient.completed and document.completed fired for each step; Documenso retries a failed call by itself.
  - **Certificate and audit trail:** the completed PDF gets a signing certificate page with each signer's signature, signature ID, device, and sent, viewed and signed times, plus an activity log on the document. To fix for production: signer IP showed as Unknown behind the tunnel, so the proxy must pass the client IP; the certificate says "provided by Documenso" (check whether it can be removed); a real signing certificate replaces the self-signed one.
  - **Signing order:** with signing order on, the second signer's link showed "Waiting for your turn" until the first had signed.
  - **No Documenso emails:** distribution method None sent nothing and gave a signing link per recipient for the CRM to send.
  - **Also seen:** several documents in one request, a saved signature reused for countersigning, reminders, expiry, an External ID to tie a request to the CRM person, and an e-signature consent screen before signing.
  - The trial is started and removed with `packages/twenty-utils/flolabs/documenso-trial.sh` and `documenso-trial-remove.sh`.
- **Done when:** a new template is made in the CRM, edited for one test person, and sent with the Academic Integrity document to an internal `+crmtest` address; it is signed in one go, and the signed PDFs, the certificate and the new Stage appear on the person.

### 9. AI drafts replies to multi-question emails

- **Why:** most Manual Review emails ask several questions at once (paid or not, fees, start date, duration, offer letter), so no single template fits.
- **How:** a Questions and Answers list in the CRM, starting with John's 20 or so. For each Manual Review email, the AI splits it into questions, matches each to an answer, and drafts one reply in the applicant's order. Questions with no match are marked for a person. The draft appears on the card for Nago to edit and send. When Nago answers a new question by hand, the AI proposes it as a new entry, but it joins the list only after an approver (John or Nago) accepts it. Every change to an answer is kept as a version, and each sent reply records which versions it used. After 2 weeks of correct drafts, the team decides whether the simple cases may be sent automatically.
- **Done when:** for a week of real Manual Review emails, Nago sends most drafts with little or no editing, and these targets hold: every reply uses only approved answers; every question with no approved answer goes to a person; no Manual Review item waits more than 24 hours without an alert; and item 4's export shows the share of routine emails answered from approved answers, working towards John's 90%.

### 10. Remove Brevo

- **Why:** John wants Brevo gone as soon as possible. The free campaign system in the CRM is already live and passed SPF, DKIM and DMARC on 19 Nov.
- **How, in order:** new bounce-mailbox password and mailbox switched on; a reply mailbox for campaigns; export the Brevo contacts with their unsubscribe and blocklist state and import them; unsubscribes and bounces flow back to the person in the CRM; one real campaign from the CRM; then close Brevo.
- **Done when:** one real campaign has gone out from the CRM, bounces and unsubscribes show on people, and Brevo is cancelled.

### 11. Ash's campaign requests

- **AI-personalised emails:** the campaign form gets a Personalise with AI option that writes the opening lines for each recipient from their CRM details; a person reviews a sample before sending.
- **Follow-ups visible in the CRM:** comes with item 10 (opens, clicks, replies and unsubscribes on each person).
- **Lead search inside the CRM:** needs a data source. The good ones (for example Apollo) are paid; free routes are slower (importing lists, scraping public pages within their terms). Needs a decision before any work.

## What is needed from whom

| Needed | From | For item |
| --- | --- | --- |
| The email John signs in with and the error he sees | John or Mohamed | 1 |
| The 2 applicant emails John forwarded to Nago | Nago | 2 |
| The check-before-reminder step in the n8n reminder workflows | Mani | 2 |
| Results of the test applications (company Gmail and Outlook test accounts) | Nago, Ceren | 2, 3 |
| Confirm n8n passes `inReplyTo` on every reply | Mani | 3 |
| A restricted, read-only Stripe key and a webhook secret, entered by Mohamed in the server settings (never in chat) | Mohamed | 5 |
| Which plans and fees exist, and how a scholarship is recorded | John | 5 |
| Interviewers connect their calendars in the CRM (Settings > Accounts) | Nago, Ceren, Kabulhan | 6 |
| The n8n change to the booking approval card | Mani | 7 |
| Confirm the agreement's 3 payment versions, who signs first, and whether "Letter of Collaboration" is still used | John | 8 |
| Go-ahead to download the 837 signed documents from Dropbox Sign before it is cancelled | Mohamed | 8 |
| The list of common questions and their answers | John, Nago | 9 |
| Bounce mailbox password, reply mailbox, Brevo export | Mohamed | 10 |
| Decision on a lead data source (free or paid) | John, Ash | 11 |

## How the work is done and checked

1. Each item is its own pull request, built in new files where possible, without changing CRM behaviour nobody asked to change.
2. A second agent reviews every pull request before it is offered for merge; its findings are fixed or explained in the pull request.
3. Only a person merges to main and approves the deploy. Each deploy backs up the database first and rolls back automatically if the CRM does not come up healthy.
4. Tests use internal `+crmtest` addresses only, never real applicants. Stripe work uses Stripe's test mode first.
5. After each deploy, the item's "Done when" check is run on the live CRM and the result reported in the pull request.
6. Data-model changes (new fields such as Payment status) are made with a database backup first and are listed in the pull request.
7. Keys and passwords are entered by Mohamed in the server settings or the Admin Panel, never pasted in chat or screenshots.

## Status

| Item | Status |
| --- | --- |
| 3 | Pull request #26 merged and deployed |
| 4 | Pull request #28 merged and deployed |
| 5 | Pull request #29 merged and deployed; payment fields created and limited to admins; live Stripe key and webhook being set up |
| 5b | Pull request #31 merged and deployed; 7 disputes found in the last year (3 lost, 2 open, 2 won) |
| 6 | Pull request #32 merged and deployed on 26 Nov; the four person fields exist. Reading bookings straight from Calendly is pull request #33, reviewed (see below) |
| 8 | Documenso trial passed all four checks on 26 Nov; CRM work waits for John's agreement template |

## Item 6: bookings read from Calendly (decided 27 Nov)

The Google calendar route is dropped. Calendly bookings land in two Calendly accounts, `hr.team@` and `people@` (Nago, 26 Nov), and Calendly opened its API and webhooks to the free plan on 6 Nov 2026. So the CRM reads bookings straight from Calendly: no Google Cloud app, no change to the CRM's Google sign-in code, and nothing needed from John.

Order once the pull request is reviewed:

1. Create the Calendly bookings object: `setup-meeting-tracker.mjs` (before the deploy).
2. Mohamed merges and approves the deploy.
3. In each Calendly account, Mohamed makes a personal access token with only `users:read`, `scheduled_events:read`, `webhooks:read` and `webhooks:write`, and pastes it straight into `setup-calendly-server.sh` on the server, never in chat.
4. Warn Mani about the n8n webhooks, then run `syncCalendlyBookings` once for past bookings.

Details: `docs/flolabs/meeting-tracker.md`. `docs/flolabs/google-calendar-connection.md` is kept only as the record of why Ceren's connection failed.
