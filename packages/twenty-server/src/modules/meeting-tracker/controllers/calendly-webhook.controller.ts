import {
  Controller,
  Headers,
  Logger,
  Post,
  type RawBodyRequest,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';

import { isString } from '@sniptt/guards';
import { type Request, type Response } from 'express';
import { ApiPath } from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';

import { NoPermissionGuard } from 'src/engine/guards/no-permission.guard';
import { PublicEndpointGuard } from 'src/engine/guards/public-endpoint.guard';
import {
  CalendlyApiService,
  isCalendlyInviteeUri,
} from 'src/modules/meeting-tracker/services/calendly-api.service';
import { CalendlyBookingService } from 'src/modules/meeting-tracker/services/calendly-booking.service';
import { getCalendlyConfig } from 'src/modules/meeting-tracker/utils/get-calendly-config.util';
import { isValidCalendlySignature } from 'src/modules/meeting-tracker/utils/verify-calendly-signature.util';

const BOOKING_EVENTS = ['invitee.created', 'invitee.canceled'];

// Calendly signs every call, so this endpoint is public. The event only names
// the invitee; the booking is read back from Calendly before anything is saved.
@Controller(`${ApiPath.Webhooks}/flolabs-calendly`)
@UseGuards(PublicEndpointGuard, NoPermissionGuard)
export class CalendlyWebhookController {
  private readonly logger = new Logger(CalendlyWebhookController.name);

  constructor(
    private readonly calendlyApiService: CalendlyApiService,
    private readonly calendlyBookingService: CalendlyBookingService,
  ) {}

  @Post()
  async handleCalendlyEvent(
    @Headers('calendly-webhook-signature') signature: string | undefined,
    @Req() request: RawBodyRequest<Request>,
    @Res() response: Response,
  ) {
    const config = getCalendlyConfig();

    if (!isDefined(config) || !isDefined(config.webhookSigningKey)) {
      response.status(503).send('Calendly is not configured');

      return;
    }

    if (
      !isDefined(request.rawBody) ||
      !isString(signature) ||
      !isValidCalendlySignature({
        header: signature,
        rawBody: request.rawBody,
        signingKey: config.webhookSigningKey,
      })
    ) {
      response.status(400).send('Invalid signature');

      return;
    }

    let body: { event?: unknown; payload?: { uri?: unknown } | null };

    try {
      body = JSON.parse(request.rawBody.toString('utf8'));
    } catch {
      response.status(400).send('Invalid body');

      return;
    }

    const inviteeUri = body?.payload?.uri;

    if (
      !isString(body?.event) ||
      !BOOKING_EVENTS.includes(body.event) ||
      !isCalendlyInviteeUri(inviteeUri)
    ) {
      response.status(200).send({ ignored: true });

      return;
    }

    try {
      const booking = await this.calendlyApiService.getBooking(inviteeUri);

      if (isDefined(booking)) {
        await this.calendlyBookingService.recordBooking(
          config.workspaceId,
          booking,
        );
      }

      response.status(200).send({ received: true });
    } catch (error) {
      // A 5xx lets Calendly retry; syncCalendlyBookings recovers anything missed.
      this.logger.error(`Could not record Calendly ${body.event}: ${error}`);
      response.status(500).send('Could not record the booking');
    }
  }
}
