# Meeting tracker

Plan item 6. Shows how many days pass between an application and the first meeting, per person and per month, and who is still waiting. Meetings come from Calendly bookings, read straight from Calendly. Calendar events synced to the CRM count too, if any calendar is ever connected.

## What people see

On each person, filled by the CRM:

| Field | Meaning |
| --- | --- |
| First meeting | Start of the first meeting on or after the Application Date |
| Meeting booked at | When that meeting was booked in Calendly (or created in the calendar) |
| Days to meeting | Whole days from the Application Date to the First meeting, in UTC |
| First meeting event ID | Technical link to the booking or calendar event; set by the CRM, do not edit |

Each person also has a **Calendly bookings** list, one row per booking with its status, event type and the Calendly account it was booked in.

**How a meeting is found:**
- A Calendly booking whose invitee email matches one of the person's emails.
  - A booking that matches nobody stays unlinked. Link it to the right person by hand, and the fields update.
- A calendar event where the person is a guest who did not decline. Organisers, team members and all-day events don't count.
- Meetings before the Application Date belong to an earlier application and are ignored.
- A cancelled or rescheduled booking no longer counts. The new time of a rescheduled booking does.

**When the fields update:**
- When Calendly sends a booking or a cancellation.
- When someone links a booking to a person, or deletes it.
- When a calendar event changes or is deleted, or a person's Application Date changes.

## Setup (once, by an admin)

1. **Create the fields and the Calendly bookings object before deploying the server version that writes them:**
   ```
   TWENTY_URL=https://crm.flolabsinnovations.com TWENTY_TOKEN_FILE=<file with an admin API key> node packages/twenty-utils/flolabs/setup-meeting-tracker.mjs
   ```
   Without them, the recalculation fails and the meeting fields stay empty until they exist.
2. **Make a personal access token in each Calendly account that receives bookings** (`hr.team@` and `people@` on 27 Nov 2026):
   - Calendly > Integrations & apps > API and webhooks > Personal access tokens > Get a token now.
   - Tick only these scopes: `users:read`, `scheduled_events:read`, `webhooks:read` and `webhooks:write`.
   - The token is shown once. Paste it straight into the script in step 3, never in chat.
3. **On the server, after the deploy**, run `packages/twenty-utils/flolabs/setup-calendly-server.sh` as root. It:
   - asks for the tokens without showing them;
   - saves them with a new webhook signing key;
   - restarts the CRM, and rolls back if it does not come up healthy;
   - registers the booking webhook in each Calendly account;
   - checks that the webhook answers.
4. **Bring in past bookings:** run once as an admin, in Settings > APIs & Webhooks > Playground, GraphQL, Core:
   ```graphql
   mutation { syncCalendlyBookings(since: "2026-01-01T00:00:00Z") { bookingsRead bookingsAdded bookingsWithoutPerson } }
   ```
   - It looks at meetings starting on or after `since`, up to 400 days back.
   - It can be run again safely; it only updates what changed.
   - Calendly allows 50 requests a minute per account, so a long period takes a few minutes. If it stops on a timeout, run it again with a later `since`.
   - Each person who gets a meeting is one person update, so the n8n webhooks see one event per person. Tell the n8n owner before the first run.
5. **Repair everything at once (optional):** `mutation { recalculateMeetingTimes { peopleChecked peopleWithMeeting } }` recalculates everyone with a booking, a calendar meeting or a stored first meeting.

## Reports

These are saved views; no code is needed:

- **Days to meeting this month:** People, filter First meeting = this month. The table footer shows the average of Days to meeting.
- **Monthly averages:** a dashboard chart of the average Days to meeting, grouped by First meeting by month.
- **Waiting for a meeting:**
  - People, filter First meeting is empty and Stage at the interview step, sorted by Application Date (oldest first).
  - Anyone with an Application Date more than 9 days ago is over the target.
  - Views cannot filter "older than 9 days" relative to today, so the sort puts them at the top.
- **Bookings nobody matched:** Calendly bookings, filter Person is empty.

## Limits

- Only Calendly accounts with a token on the server are seen.
- An applicant who books with a different email from the one they applied with is not matched until someone links the booking.
- Days are counted in UTC, so a meeting late in the evening in the Americas can count as the next day.
