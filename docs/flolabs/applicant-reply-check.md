# Check before a reminder (plan item 2)

Applicants who had already replied were still sent reminders. The CRM can now answer two questions from the emails it has synced.

## For n8n: right before each reminder

Call the CRM with the n8n API key:

```
POST https://crm.flolabsinnovations.com/graphql
Authorization: Bearer <the n8n API key>
Content-Type: application/json

{
  "query": "query Check($email: String!, $since: DateTime) { getApplicantReplyState(email: $email, since: $since) { personId stage isAwaitingOurReply hasRepliedSince lastApplicantMessageAt lastSentToApplicantAt } }",
  "variables": { "email": "applicant@example.com", "since": "2026-11-20T10:00:00Z" }
}
```

- `since` is when the reminder was scheduled, usually when our last email went out. It is optional.
- **Skip the reminder** when any of these hold:
  - `isAwaitingOurReply` is true: the applicant wrote last, so they need an answer, not a reminder.
  - `hasRepliedSince` is true: they wrote after `since`.
  - `stage` is no longer the stage the reminder was scheduled for.
- The answer has times and the stage only, never email text.
- The API key's role needs the **Workflows** permission. The n8n key is an Admin key, so it has it.
- It counts only emails the CRM has synced from our connected mailboxes, sent To, Cc or Bcc. Drafts and campaign emails are ignored.
- If the call fails, do not send the reminder. Leave it for the next run.

**Limits:**
- A reply that has not synced yet (sync runs every few minutes) is not seen.
- An out-of-office auto-reply counts as a reply.
- Emails sent from an archived mailbox, or from a send-as address not listed on the connected account, do not count as ours.

## For the team: who was reminded after replying

In Settings > APIs & Webhooks > Playground, GraphQL, Core:

```graphql
query { findApplicantsRemindedAfterReply(days: 30) { name email currentStage reminderStage remindedAt applicantMessageAt lastSentBeforeReminderAt } }
```

- It lists every move to a reminder stage in the period where an email from us went out within 10 minutes of the move (the reminder) and, before it, the applicant's email was newer than ours. Stage changes with no email next to them, such as the import on 6 Nov, are left out.
- The reminder time is when the person's Stage changed. That is the only record of a reminder the CRM keeps.
- Up to 90 days back. Admins only.
- The CRM merges updates made by the same automation within 10 minutes, so the reminder time can be a few minutes early, and a reminder stage replaced within 10 minutes may not show.
