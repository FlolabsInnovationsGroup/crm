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

import { isNonEmptyString, isString } from '@sniptt/guards';
import { type Request, type Response } from 'express';
import { ApiPath } from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';

import { NoPermissionGuard } from 'src/engine/guards/no-permission.guard';
import { PublicEndpointGuard } from 'src/engine/guards/public-endpoint.guard';
import { AgreementSigningService } from 'src/modules/agreement-templates/services/agreement-signing.service';
import { getAgreementSigningConfig } from 'src/modules/agreement-templates/utils/get-agreement-signing-config.util';
import { isValidDocumensoSecret } from 'src/modules/agreement-templates/utils/is-valid-documenso-secret.util';

const ENVELOPE_EVENTS = [
  'DOCUMENT_RECIPIENT_COMPLETED',
  'DOCUMENT_COMPLETED',
  'DOCUMENT_REJECTED',
  'DOCUMENT_CANCELLED',
];

// Public, checked by the shared secret. The event only names the envelope;
// its state is read back from Documenso before anything is saved.
@Controller(`${ApiPath.Webhooks}/flolabs-documenso`)
@UseGuards(PublicEndpointGuard, NoPermissionGuard)
export class DocumensoWebhookController {
  private readonly logger = new Logger(DocumensoWebhookController.name);

  constructor(
    private readonly agreementSigningService: AgreementSigningService,
  ) {}

  @Post()
  async handleDocumensoEvent(
    @Headers('x-documenso-secret') secret: string | undefined,
    @Req() request: RawBodyRequest<Request>,
    @Res() response: Response,
  ) {
    const config = getAgreementSigningConfig();

    if (!isDefined(config) || !isDefined(config.webhookSecret)) {
      response.status(503).send('Documenso is not configured');

      return;
    }

    if (
      !isString(secret) ||
      !isValidDocumensoSecret(secret, config.webhookSecret)
    ) {
      response.status(401).send('Invalid secret');

      return;
    }

    let body: { event?: unknown; payload?: { envelopeId?: unknown } | null };

    try {
      body = JSON.parse(request.rawBody?.toString('utf8') ?? '');
    } catch {
      response.status(400).send('Invalid body');

      return;
    }

    const envelopeId = body?.payload?.envelopeId;

    if (
      !isString(body?.event) ||
      !ENVELOPE_EVENTS.includes(body.event) ||
      !isNonEmptyString(envelopeId)
    ) {
      response.status(200).send({ ignored: true });

      return;
    }

    try {
      await this.agreementSigningService.syncEnvelope(envelopeId);
      response.status(200).send({ received: true });
    } catch (error) {
      // A 5xx lets Documenso retry; syncAgreementRequest recovers the rest.
      this.logger.error(`Could not sync Documenso ${body.event}: ${error}`);
      response.status(500).send('Could not sync the agreement');
    }
  }
}
