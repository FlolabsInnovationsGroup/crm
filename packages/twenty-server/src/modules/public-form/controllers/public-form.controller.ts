import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Req,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { AnyFilesInterceptor } from '@nestjs/platform-express';

import { isNonEmptyString } from '@sniptt/guards';
import { type Request } from 'express';
import { ApiPath } from 'twenty-shared/types';
import { isPlainObject, type PublicFormAnswers } from 'twenty-shared/utils';

import { NoPermissionGuard } from 'src/engine/guards/no-permission.guard';
import { PublicEndpointGuard } from 'src/engine/guards/public-endpoint.guard';
import { ThrottlerException } from 'src/engine/core-modules/throttler/throttler.exception';
import { ThrottlerService } from 'src/engine/core-modules/throttler/throttler.service';
import { throttlerToRestApiExceptionHandler } from 'src/engine/core-modules/throttler/utils/throttler-to-rest-api-exception-handler.util';
import {
  PUBLIC_FORM_HONEYPOT_FIELD,
  PUBLIC_FORM_MAX_FILES,
  PUBLIC_FORM_MAX_FILE_SIZE_MB,
  PUBLIC_FORM_RATE_LIMIT,
} from 'src/modules/public-form/constants/public-form.constants';
import { PublicFormService } from 'src/modules/public-form/services/public-form.service';

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

const safeJsonParse = (value: string): unknown => {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

@Controller(`${ApiPath.Webhooks}/forms`)
@UseGuards(PublicEndpointGuard, NoPermissionGuard)
export class PublicFormController {
  constructor(
    private readonly publicFormService: PublicFormService,
    private readonly throttlerService: ThrottlerService,
  ) {}

  @Get(':workspaceId/:formId')
  async getForm(
    @Param('workspaceId') workspaceId: string,
    @Param('formId') formId: string,
  ) {
    const form = await this.publicFormService.getPublishedForm({
      workspaceId,
      formId,
    });

    return { id: form.id, definition: form.definition };
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
