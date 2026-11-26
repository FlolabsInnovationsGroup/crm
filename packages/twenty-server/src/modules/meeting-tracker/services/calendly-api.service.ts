import { Injectable, Logger } from '@nestjs/common';

import { isDefined } from 'twenty-shared/utils';

import {
  type CalendlyCollection,
  type CalendlyInvitee,
  type CalendlyScheduledEvent,
} from 'src/modules/meeting-tracker/types/calendly-api.type';
import { type RecordedCalendlyBooking } from 'src/modules/meeting-tracker/types/calendly-booking.type';
import { getCalendlyConfig } from 'src/modules/meeting-tracker/utils/get-calendly-config.util';
import { toRecordedCalendlyBooking } from 'src/modules/meeting-tracker/utils/to-recorded-calendly-booking.util';

const API_ORIGIN = 'https://api.calendly.com';
const INVITEE_URI_REGEX =
  /^https:\/\/api\.calendly\.com\/scheduled_events\/[A-Za-z0-9-]+\/invitees\/[A-Za-z0-9-]+$/;
const EVENT_URI_REGEX =
  /^https:\/\/api\.calendly\.com\/scheduled_events\/[A-Za-z0-9-]+$/;
const REQUEST_TIMEOUT_MS = 15_000;
const MAX_RATE_LIMIT_RETRIES = 3;
const MAX_RATE_LIMIT_WAIT_SECONDS = 60;

type CalendlyResponse<TBody> =
  | { ok: true; body: TBody }
  | { ok: false; status: number };

const sleep = (milliseconds: number) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

export const isCalendlyInviteeUri = (uri: unknown): uri is string =>
  typeof uri === 'string' && INVITEE_URI_REGEX.test(uri);

@Injectable()
export class CalendlyApiService {
  private readonly logger = new Logger(CalendlyApiService.name);

  // The invitee belongs to one of the configured accounts; the others answer
  // 403 or 404, so each token is tried until one can read it.
  async getBooking(
    inviteeUri: string,
  ): Promise<RecordedCalendlyBooking | null> {
    if (!isCalendlyInviteeUri(inviteeUri)) {
      return null;
    }

    for (const token of this.getTokens()) {
      const invitee = await this.get<{ resource: CalendlyInvitee }>(
        token,
        inviteeUri,
      );

      if (!invitee.ok) {
        if ([401, 403, 404].includes(invitee.status)) {
          continue;
        }

        throw new Error(`Calendly answered ${invitee.status} for an invitee`);
      }

      const eventUri = invitee.body.resource.event;

      if (!isDefined(eventUri) || !EVENT_URI_REGEX.test(eventUri)) {
        return null;
      }

      const event = await this.get<{ resource: CalendlyScheduledEvent }>(
        token,
        eventUri,
      );

      if (!event.ok) {
        throw new Error(`Calendly answered ${event.status} for an event`);
      }

      return toRecordedCalendlyBooking(
        invitee.body.resource,
        event.body.resource,
      );
    }

    return null;
  }

  // Meetings starting on or after `since`, in every configured account.
  async *listBookingsSince(
    since: Date,
  ): AsyncGenerator<RecordedCalendlyBooking> {
    for (const token of this.getTokens()) {
      const me = await this.get<{ resource: { uri: string } }>(
        token,
        `${API_ORIGIN}/users/me`,
      );

      if (!me.ok) {
        throw new Error(
          `Calendly answered ${me.status} for one of the tokens; check it is valid`,
        );
      }

      const firstEventsPage = `${API_ORIGIN}/scheduled_events?${new URLSearchParams(
        {
          user: me.body.resource.uri,
          min_start_time: since.toISOString(),
          count: '100',
          sort: 'start_time:asc',
        },
      )}`;

      for await (const event of this.listPages<CalendlyScheduledEvent>(
        token,
        firstEventsPage,
      )) {
        if (!EVENT_URI_REGEX.test(event.uri)) {
          continue;
        }

        for await (const invitee of this.listPages<CalendlyInvitee>(
          token,
          `${event.uri}/invitees?count=100`,
        )) {
          const booking = toRecordedCalendlyBooking(invitee, event);

          if (isDefined(booking)) {
            yield booking;
          }
        }
      }
    }
  }

  private getTokens(): string[] {
    return getCalendlyConfig()?.accessTokens ?? [];
  }

  private async *listPages<TItem>(
    token: string,
    firstPage: string,
  ): AsyncGenerator<TItem> {
    let page: string | null = firstPage;

    while (isDefined(page)) {
      const response: CalendlyResponse<CalendlyCollection<TItem>> =
        await this.get<CalendlyCollection<TItem>>(token, page);

      if (!response.ok) {
        throw new Error(`Calendly answered ${response.status} for a list`);
      }

      yield* response.body.collection;

      const nextPage: string | null =
        response.body.pagination?.next_page ?? null;

      // The token must only ever be sent to Calendly's own API.
      page = nextPage?.startsWith(`${API_ORIGIN}/`) ? nextPage : null;
    }
  }

  private async get<TBody>(
    token: string,
    url: string,
  ): Promise<CalendlyResponse<TBody>> {
    for (let attempt = 0; ; attempt++) {
      const response = await fetch(url, {
        headers: { authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      if (response.status === 429 && attempt < MAX_RATE_LIMIT_RETRIES) {
        const resetSeconds = Number(
          response.headers.get('x-ratelimit-reset') ?? '',
        );
        const waitSeconds =
          Number.isFinite(resetSeconds) && resetSeconds > 0
            ? Math.min(resetSeconds, MAX_RATE_LIMIT_WAIT_SECONDS)
            : MAX_RATE_LIMIT_WAIT_SECONDS;

        this.logger.log(`Calendly rate limit reached, waiting ${waitSeconds}s`);
        await sleep(waitSeconds * 1000);
        continue;
      }

      if (!response.ok) {
        return { ok: false, status: response.status };
      }

      return { ok: true, body: (await response.json()) as TBody };
    }
  }
}
