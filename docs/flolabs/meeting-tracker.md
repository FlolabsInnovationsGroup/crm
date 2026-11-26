# Meeting tracker

Plan item 6. Shows how many days pass between an application and the first meeting, per person and per month, and who is still waiting. The meeting dates come from the interviewers' synced calendars, so no Calendly upgrade is needed.

## What people see

On each person, filled by the CRM:

| Field | Meaning |
| --- | --- |
| First meeting | Start of the first meeting on or after the Application Date |
| Meeting booked at | When that meeting was created in the calendar (the Calendly booking) |
| Days to meeting | Whole days from the Application Date to the First meeting, in UTC |

**How a meeting is found:**
- It is any calendar event, in a calendar synced to the CRM, where the person is a guest (not the organiser) and that is not cancelled.
- Meetings before the Application Date belong to an earlier application and are ignored.
- If the meeting is moved, the fields follow it. If it is cancelled, the next meeting is used, or the fields are cleared.

**When the fields update:**
- When calendar sync links a guest to a person.
- When an event's time or cancellation changes.
- When a person's Application Date changes.

## Setup (once, by an admin)

1. **Create the fields before deploying the server version that writes them:**
   ```
   TWENTY_URL=https://crm.flolabsinnovations.com TWENTY_TOKEN_FILE=<file with an admin API key> node packages/twenty-utils/flolabs/setup-meeting-tracker.mjs
   ```
   Without the fields, the recalculation fails and the meeting fields stay empty until they exist.
2. **No new server settings:** the module runs in the workspace named by `FLOLABS_PAYMENTS_WORKSPACE_ID`. `FLOLABS_WORKSPACE_ID` overrides it if set.
3. **Interviewers connect their calendars:** see `docs/flolabs/google-calendar-connection.md`.
4. **Fill in meetings already synced:** run the `recalculateMeetingTimes` mutation once as an admin, in Settings > APIs & Webhooks > Playground, GraphQL, Core:
   ```graphql
   mutation { recalculateMeetingTimes { peopleChecked peopleWithMeeting } }
   ```
   It can be run again safely.

## Reports

These are saved views; no code is needed:

- **Days to meeting this month:** People, filter First meeting = this month. The table footer shows the average of Days to meeting.
- **Monthly averages:** a dashboard chart of the average Days to meeting, grouped by First meeting by month.
- **Waiting for a meeting:**
  - People, filter First meeting is empty and Stage at the interview step, sorted by Application Date (oldest first).
  - Anyone with an Application Date more than 9 days ago is over the target.
  - Views cannot filter "older than 9 days" relative to today, so the sort puts them at the top.

## Limits

- Only calendars connected to the CRM are seen. A meeting booked into an unconnected calendar does not count.
- Days are counted in UTC, so a meeting late in the evening in the Americas can count as the next day.
