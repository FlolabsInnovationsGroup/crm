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
- It counts only emails the CRM has synced from our connected mailboxes. Drafts and campaign emails are ignored.
- If the call fails, do not send the reminder. Leave it for the next run.

## For the team: who was reminded after replying

In Settings > APIs & Webhooks > Playground, GraphQL, Core:

```graphql
query { findApplicantsRemindedAfterReply(days: 30) { name email currentStage reminderStage remindedAt applicantMessageAt lastSentBeforeReminderAt } }
```

- It lists every move to a reminder stage in the period where, 10 minutes before the move, the applicant's email was newer than ours.
- The reminder time is when the person's Stage changed. That is the only record of a reminder the CRM keeps.
- Up to 90 days back.
