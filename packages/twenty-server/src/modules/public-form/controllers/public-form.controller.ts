import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Logger,
  Param,
  Post,
  Query,
  Req,
  Res,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { AnyFilesInterceptor } from '@nestjs/platform-express';

import { isNonEmptyString } from '@sniptt/guards';
import { randomBytes } from 'crypto';
import { type Request, type Response } from 'express';
import { ApiPath } from 'twenty-shared/types';
import {
  buildPublicFormContentSecurityPolicy,
  buildPublicFormPage,
  isPlainObject,
  PUBLIC_FORM_HONEYPOT_FIELD,
  PUBLIC_FORM_MAX_FILES,
  PUBLIC_FORM_MAX_FILE_SIZE_MB,
  PUBLIC_FORM_PAGE_MESSAGES,
  type PublicFormAnswers,
} from 'twenty-shared/utils';

import { buildUnsubscribeResultPage } from 'src/engine/core-modules/emailing-domain/utils/build-unsubscribe-result-page.util';
import { ThrottlerException } from 'src/engine/core-modules/throttler/throttler.exception';
import { ThrottlerService } from 'src/engine/core-modules/throttler/throttler.service';
import { throttlerToRestApiExceptionHandler } from 'src/engine/core-modules/throttler/utils/throttler-to-rest-api-exception-handler.util';
import { TwentyConfigService } from 'src/engine/core-modules/twenty-config/twenty-config.service';
import { NoPermissionGuard } from 'src/engine/guards/no-permission.guard';
import { PublicEndpointGuard } from 'src/engine/guards/public-endpoint.guard';
import { PUBLIC_FORM_RATE_LIMIT } from 'src/modules/public-form/constants/public-form.constants';
import { PublicFormService } from 'src/modules/public-form/services/public-form.service';
import { buildPublicFormEmbedScript } from 'src/modules/public-form/utils/build-public-form-embed-script.util';

type MulterFile = {
  fieldname: string;
  originalname: string;
  buffer: Buffer;
  size: number;
};

type SubmissionBody = Record<string, unknown> & {
  answers?: unknown;
  sourceUrl?: unknown;
};

const safeJsonParse = (value: string): unknown => {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

const parseAnswers = (rawAnswers: unknown): PublicFormAnswers => {
  const answers =
    typeof rawAnswers === 'string' ? safeJsonParse(rawAnswers) : rawAnswers;

  if (!isPlainObject(answers)) {
    throw new BadRequestException('answers must be an object');
  }

  return Object.fromEntries(
    Object.entries(answers).filter(
      ([, value]) =>
        typeof value === 'string' ||
        typeof value === 'boolean' ||
        (Array.isArray(value) &&
          value.every((item) => typeof item === 'string')),
    ),
  ) as PublicFormAnswers;
};

@Controller(ApiPath.Forms)
@UseGuards(PublicEndpointGuard, NoPermissionGuard)
export class PublicFormController {
  private readonly logger = new Logger(PublicFormController.name);

  constructor(
    private readonly publicFormService: PublicFormService,
    private readonly throttlerService: ThrottlerService,
    private readonly twentyConfigService: TwentyConfigService,
  ) {}

  @Get(':workspaceId/:formId')
  async getPage(
    @Param('workspaceId') workspaceId: string,
    @Param('formId') formId: string,
    @Query('embed') embed: string | undefined,
    @Res() response: Response,
  ) {
    const nonce = randomBytes(16).toString('base64');

    response.setHeader(
      'Content-Security-Policy',
      buildPublicFormContentSecurityPolicy(nonce),
    );
    response.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Cache-Control', 'no-store');

    try {
      const form = await this.publicFormService.getPublishedForm({
        workspaceId,
        formId,
      });

      response.type('html').send(
        buildPublicFormPage({
          formId: form.id,
          definition: form.definition,
          submitUrl: `/${ApiPath.Forms}/${workspaceId}/${formId}`,
          isEmbedded: embed === '1',
          nonce,
        }),
      );
    } catch (error) {
      const status =
        error instanceof HttpException
          ? error.getStatus()
          : HttpStatus.INTERNAL_SERVER_ERROR;

      if (status !== HttpStatus.NOT_FOUND) {
        this.logger.error(`Unable to render form ${formId}`, error);
      }

      response
        .status(status)
        .type('html')
        .send(
          buildUnsubscribeResultPage(
            PUBLIC_FORM_PAGE_MESSAGES.en.notFoundTitle,
            PUBLIC_FORM_PAGE_MESSAGES.en.notFoundMessage,
          ),
        );
    }
  }

  @Get(':workspaceId/:formId/definition')
  async getDefinition(
    @Param('workspaceId') workspaceId: string,
    @Param('formId') formId: string,
  ) {
    const form = await this.publicFormService.getPublishedForm({
      workspaceId,
      formId,
    });

    return { id: form.id, definition: form.definition };
  }

  @Get(':workspaceId/:formId/embed.js')
  async getEmbedScript(
    @Param('workspaceId') workspaceId: string,
    @Param('formId') formId: string,
    @Res() response: Response,
  ) {
    const form = await this.publicFormService.getPublishedForm({
      workspaceId,
      formId,
    });
    const serverUrl = this.twentyConfigService
      .get('SERVER_URL')
      .replace(/\/$/, '');

    response.setHeader('Cache-Control', 'public, max-age=300');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.type('application/javascript').send(
      buildPublicFormEmbedScript({
        formId: form.id,
        pageUrl: `${serverUrl}/${ApiPath.Forms}/${workspaceId}/${formId}`,
        title: form.definition.title,
      }),
    );
  }

  @Post(':workspaceId/:formId')
  @HttpCode(200)
  @UseInterceptors(
    AnyFilesInterceptor({
      limits: {
        files: PUBLIC_FORM_MAX_FILES,
        fileSize: PUBLIC_FORM_MAX_FILE_SIZE_MB * 1024 * 1024,
      },
    }),
  )
  async submit(
    @Param('workspaceId') workspaceId: string,
    @Param('formId') formId: string,
    @Body() body: SubmissionBody,
    @UploadedFiles() uploadedFiles: MulterFile[] | undefined,
    @Req() request: Request,
  ) {
    await this.throttleOrThrow(`public-form:${formId}:${request.ip ?? ''}`);

    if (isNonEmptyString(body[PUBLIC_FORM_HONEYPOT_FIELD])) {
      return { success: true };
    }

    const { submissionId } = await this.publicFormService.submit({
      workspaceId,
      formId,
      answers: parseAnswers(body.answers),
      files: (uploadedFiles ?? []).map((file) => ({
        fieldName: file.fieldname,
        originalName: file.originalname,
        buffer: file.buffer,
        size: file.size,
      })),
      sourceUrl: isNonEmptyString(body.sourceUrl) ? body.sourceUrl : undefined,
    });

    return { success: true, submissionId };
  }

  private async throttleOrThrow(bucketKey: string): Promise<void> {
    try {
      await this.throttlerService.tokenBucketThrottleOrThrow(
        bucketKey,
        1,
        PUBLIC_FORM_RATE_LIMIT.maxRequests,
        PUBLIC_FORM_RATE_LIMIT.windowMs,
      );
    } catch (error) {
      if (error instanceof ThrottlerException) {
        throttlerToRestApiExceptionHandler(error);
      }

      throw error;
    }
  }
}
