# Connecting Google calendars to the CRM

Status on 26 Nov 2026: **not set up yet.** Needed for plan item 6 (time from application to meeting), which reads Calendly bookings from the interviewers' calendars.

## What went wrong

- Ceren tried Settings > Accounts > New > "Connect via IMAP/SMTP" and put her email address in **CalDAV Server**. That field expects a server host name, so the CRM answered "The server address you entered is not allowed. Please use a public server address."
- Even with a correct host this route cannot work: Google Calendar does not accept password (CalDAV) connections. It needs a **Connect with Google** sign-in.
- That button is missing because the Google connection is not switched on in our CRM. Settings > Accounts > New offers only "Connect via IMAP/SMTP".
- The team has been told not to retry until the button is there.

## What is needed

### Decisions

1. **Decided on 26 Nov:** the interviewers' calendars are **ordinary Google accounts** (Google accounts made with their own email, not Google Workspace). The "super admin" Ceren mentioned is the CRM's admin account, not Google's. So the OAuth app is **External**:
   - **Publish it "In production" and do not submit it for verification.**
   - In "Testing" status, Google expires every connection after 7 days, so calendar sync would stop each week.
   - "In production" but unverified, each person sees Google's "unverified app" warning once (Advanced > Go to FloLabs CRM).
   - Google allows up to 100 people in total to connect in this state, which is plenty for the interviewers.
   - Source: Google Cloud Help, "Manage App Audience".
2. **Open:** which Google account owns the Google Cloud project. It should be a company account that stays when people change, not someone's personal account.

### Problem found in the code (fix before switching on)

The CRM always asks Google for Gmail read and send access together with the calendar (`packages/twenty-server/src/engine/core-modules/auth/utils/get-google-apis-oauth-scopes.ts`), even when only the calendar is needed.

- **Privacy:** interviewers would grant the CRM access to their whole mailbox.
- **Google review:** these Gmail permissions are "restricted" scopes. For an External app they need Google's verification and a security assessment, so this change is required for our External app.

**Proposed change:** when Gmail syncing is off (`MESSAGING_PROVIDER_GMAIL_ENABLED=false`), ask only for `email`, `profile` and `calendar.events`. It is one small file, written by one agent and reviewed by a second, with a test.

## Steps, once the decisions are made

1. **Google Cloud** (by the project owner):
   - Create a project, for example "FloLabs CRM".
   - Enable the **Google Calendar API**.
   - Set up the OAuth consent screen: **External**, then set the publishing status to **In production**. Don't submit it for verification.
   - Create credentials: OAuth client ID, type **Web application**.
     - Authorised redirect URI: `https://crm.flolabsinnovations.com/auth/google-apis/get-access-token`
   - Copy the client ID and the client secret. Never paste them in chat or in a screenshot.
2. **CRM code:** merge the scope change above and deploy it.
3. **Server settings**, with a script like the Stripe one (asks for the secret without showing it, backs up, restarts, checks health, rolls back on failure):
   - `AUTH_GOOGLE_CLIENT_ID`, `AUTH_GOOGLE_CLIENT_SECRET`
   - `AUTH_GOOGLE_APIS_CALLBACK_URL=https://crm.flolabsinnovations.com/auth/google-apis/get-access-token`
   - `CALENDAR_PROVIDER_GOOGLE_ENABLED=true`
   - `MESSAGING_PROVIDER_GMAIL_ENABLED=false`
   - `AUTH_GOOGLE_ENABLED` stays false. That setting is "sign in with Google" for the CRM itself, which is not needed here.
4. **Check:**
   - Settings > Accounts > New shows **Connect with Google**.
   - Connect one test account first. Google's screen asks only for the calendar.
   - Its events appear under Calendars.
5. **Interviewers:** each connects the Google account that Calendly writes bookings to.
   - Turn email sync off if asked.
   - Set calendar visibility to the most private option.

## Message already drafted for Ceren and Nago

> Thanks Ceren, that error is on our side, not yours. Google Calendar can't be connected with a password (the IMAP/CalDAV option), it needs a "Connect with Google" button that we haven't switched on yet in the CRM. Please don't try again for now; I'll let you know as soon as the button is there, and then it's a 1-minute step.
