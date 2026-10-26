import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { isNonEmptyString } from '@sniptt/guards';
import { STANDARD_OBJECTS } from 'twenty-shared/metadata';
import {
  buildPublicFormRecordValues,
  getPublicFormVisibleFieldIds,
  isDefined,
  PUBLIC_FORM_MAX_FILE_SIZE_MB,
  PUBLIC_FORM_OBJECT_NAME,
  PUBLIC_FORM_PUBLISHED_STATUS,
  PUBLIC_FORM_SUBMISSION_OBJECT_NAME,
  publicFormDefinitionSchema,
  validatePublicFormAnswers,
  type PublicFormAnswers,
  type PublicFormDefinition,
  type PublicFormField,
} from 'twenty-shared/utils';
import { Repository } from 'typeorm';

import { transformPhonesValue } from 'src/engine/core-modules/record-transformer/utils/transform-phones-value.util';
import { FilesFieldService } from 'src/engine/core-modules/file/files-field/services/files-field.service';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { buildSystemAuthContext } from 'src/engine/twenty-orm/utils/build-system-auth-context.util';
import { WorkspaceOrmManager } from 'src/engine/twenty-orm/workspace-orm.manager';

export type PublicFormUploadedFile = {
  fieldName: string;
  originalName: string;
  buffer: Buffer;
  size: number;
};

type PublishedForm = {
  id: string;
  name: string;
  definition: PublicFormDefinition;
};

type PersonRecord = Record<string, unknown> & { id: string };

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const getFileFieldId = (multipartFieldName: string) =>
  multipartFieldName.startsWith('file:')
    ? multipartFieldName.slice('file:'.length)
    : multipartFieldName;

const getExtension = (fileName: string) => {
  const lastDot = fileName.lastIndexOf('.');

  return lastDot === -1 ? '' : fileName.slice(lastDot + 1).toLowerCase();
};

// Composite fields (name, emails, phones…) are merged with the stored value
// so a partial answer never blanks out the sub-fields the form did not ask.
const mergeWithExistingRecord = (
  existing: PersonRecord,
  values: Record<string, unknown>,
) =>
  Object.fromEntries(
    Object.entries(values).map(([fieldName, value]) => {
      const current = existing[fieldName];
      const isComposite =
        typeof value === 'object' &&
        value !== null &&
        !Array.isArray(value) &&
        typeof current === 'object' &&
        current !== null;

      return [
        fieldName,
        isComposite ? { ...(current as object), ...(value as object) } : value,
      ];
    }),
  );

@Injectable()
export class PublicFormService {
  private readonly logger = new Logger(PublicFormService.name);

  constructor(
    private readonly workspaceOrmManager: WorkspaceOrmManager,
    private readonly filesFieldService: FilesFieldService,
    @InjectRepository(WorkspaceEntity)
    private readonly workspaceRepository: Repository<WorkspaceEntity>,
  ) {}

  async getPublishedForm({
    workspaceId,
    formId,
  }: {
    workspaceId: string;
    formId: string;
  }): Promise<PublishedForm> {
    if (!UUID_PATTERN.test(workspaceId) || !UUID_PATTERN.test(formId)) {
      throw new NotFoundException('Form not found');
    }

    const workspaceExists = await this.workspaceRepository.existsBy({
      id: workspaceId,
    });

    if (!workspaceExists) {
      throw new NotFoundException('Form not found');
    }

    const form = await this.workspaceOrmManager.executeInWorkspaceContext(
      async () => {
        const formRepository = this.workspaceOrmManager.getRepository(
          PUBLIC_FORM_OBJECT_NAME,
          { shouldBypassPermissionChecks: true },
        );

        return formRepository.findOne({ where: { id: formId } });
      },
      buildSystemAuthContext(workspaceId),
    );

    if (!isDefined(form) || form.status !== PUBLIC_FORM_PUBLISHED_STATUS) {
      throw new NotFoundException('Form not found');
    }

    const parsedDefinition = publicFormDefinitionSchema.safeParse(
      form.definition,
    );

    if (!parsedDefinition.success) {
      this.logger.warn(
        `Published form ${formId} in workspace ${workspaceId} has an invalid definition`,
      );
      throw new NotFoundException('Form not found');
    }

    return {
      id: form.id as string,
      name: (form.name as string | null) ?? parsedDefinition.data.title,
      definition: parsedDefinition.data,
    };
  }

  async submit({
    workspaceId,
    formId,
    answers,
    files,
    sourceUrl,
  }: {
    workspaceId: string;
    formId: string;
    answers: PublicFormAnswers;
    files: PublicFormUploadedFile[];
    sourceUrl?: string;
  }): Promise<{ submissionId: string }> {
    const form = await this.getPublishedForm({ workspaceId, formId });
    const { definition } = form;

    const validationErrors = validatePublicFormAnswers(definition, answers);
    const fileFields = this.getVisibleFileFields(definition, answers);
    const fileErrors = this.validateFiles(fileFields, files);
    const allErrors = [...validationErrors, ...fileErrors];

    if (allErrors.length > 0) {
      throw new BadRequestException({ errors: allErrors });
    }

    const recordValues = this.normalizePhones(
      buildPublicFormRecordValues(definition, answers),
      definition.settings.defaultPhoneCountryCode,
    );
    const email = (recordValues.emails as { primaryEmail?: string } | undefined)
      ?.primaryEmail;

    if (!isNonEmptyString(email)) {
      throw new BadRequestException({
        errors: [
          {
            fieldId: '',
            message: 'This form has no email field mapped to the person',
          },
        ],
      });
    }

    return this.workspaceOrmManager.executeInWorkspaceContext(async () => {
      const person = await this.upsertPersonKeepingTheLead(
        email,
        recordValues,
        formId,
      );

      const submissionRepository = this.workspaceOrmManager.getRepository(
        PUBLIC_FORM_SUBMISSION_OBJECT_NAME,
        { shouldBypassPermissionChecks: true },
      );

      const insertResult = await submissionRepository.insert({
        name: `${form.name} · ${email}`,
        formId: form.id,
        personId: person?.id ?? null,
        answers,
        submittedAt: new Date().toISOString(),
        sourceUrl: sourceUrl?.slice(0, 2000) ?? null,
      });

      const submissionId = insertResult.identifiers[0]?.id as string;

      if (isDefined(person)) {
        await this.attachFiles({
          workspaceId,
          personId: person.id,
          fileFields,
          files,
        });
      }

      return { submissionId };
    }, buildSystemAuthContext(workspaceId));
  }

  // Repositories skip the API's input transformers, so phones are split into
  // calling code and national number here; unparsable numbers stay as typed.
  private normalizePhones(
    recordValues: Record<string, unknown>,
    defaultCountryCode: string | undefined,
  ): Record<string, unknown> {
    const phones = recordValues.phones as
      | { primaryPhoneNumber?: string }
      | undefined;
    const phoneNumber = phones?.primaryPhoneNumber;

    if (!isNonEmptyString(phoneNumber)) {
      return recordValues;
    }

    try {
      const normalizedPhones = transformPhonesValue({
        input: {
          primaryPhoneNumber: phoneNumber,
          primaryPhoneCountryCode: phoneNumber.startsWith('+')
            ? undefined
            : defaultCountryCode,
        },
      });

      return {
        ...recordValues,
        phones: {
          primaryPhoneNumber: normalizedPhones?.primaryPhoneNumber,
          primaryPhoneCountryCode: normalizedPhones?.primaryPhoneCountryCode,
          primaryPhoneCallingCode: normalizedPhones?.primaryPhoneCallingCode,
        },
      };
    } catch {
      return recordValues;
    }
  }

  // A mapping the CRM rejects (e.g. a removed select option) must not lose
  // the lead: retry with the email only, and keep the raw answers anyway.
  private async upsertPersonKeepingTheLead(
    email: string,
    recordValues: Record<string, unknown>,
    formId: string,
  ): Promise<PersonRecord | null> {
    try {
      return await this.upsertPerson(email, recordValues);
    } catch (error) {
      this.logger.warn(
        `Form ${formId}: saving mapped answers failed, retrying with email only`,
        error,
      );
    }

    try {
      return await this.upsertPerson(email, {
        emails: recordValues.emails,
      });
    } catch (error) {
      this.logger.error(`Form ${formId}: could not save the person`, error);

      return null;
    }
  }

  private async upsertPerson(
    email: string,
    recordValues: Record<string, unknown>,
  ): Promise<PersonRecord> {
    const personRepository = this.workspaceOrmManager.getRepository('person', {
      shouldBypassPermissionChecks: true,
    });

    const normalizedEmail = email.trim().toLowerCase();
    const existing = (await personRepository.findOne({
      where: { emails: { primaryEmail: normalizedEmail } },
    })) as PersonRecord | null;

    if (isDefined(existing)) {
      await personRepository.update(
        existing.id,
        mergeWithExistingRecord(existing, recordValues),
      );

      return existing;
    }

    const insertResult = await personRepository.insert({
      ...recordValues,
      emails: {
        ...(recordValues.emails as object),
        primaryEmail: normalizedEmail,
      },
    });

    return { id: insertResult.identifiers[0]?.id as string };
  }

  private getVisibleFileFields(
    definition: PublicFormDefinition,
    answers: PublicFormAnswers,
  ): PublicFormField[] {
    const visibleFieldIds = getPublicFormVisibleFieldIds(definition, answers);

    return definition.fields.filter(
      (field) => field.type === 'file' && visibleFieldIds.has(field.id),
    );
  }

  private validateFiles(
    fileFields: PublicFormField[],
    files: PublicFormUploadedFile[],
  ) {
    return fileFields.flatMap((field) => {
      const fieldFiles = files.filter(
        (file) => getFileFieldId(file.fieldName) === field.id,
      );

      if (fieldFiles.length === 0) {
        return field.required
          ? [{ fieldId: field.id, message: 'Please attach a file' }]
          : [];
      }

      const maxBytes =
        Math.min(
          field.maxFileSizeMb ?? PUBLIC_FORM_MAX_FILE_SIZE_MB,
          PUBLIC_FORM_MAX_FILE_SIZE_MB,
        ) *
        1024 *
        1024;
      const acceptedExtensions = (field.acceptedFileExtensions ?? []).map(
        (extension) => extension.replace(/^\./, '').toLowerCase(),
      );

      return fieldFiles.flatMap((file) => {
        if (file.size > maxBytes) {
          return [{ fieldId: field.id, message: 'This file is too large' }];
        }

        if (
          acceptedExtensions.length > 0 &&
          !acceptedExtensions.includes(getExtension(file.originalName))
        ) {
          return [
            {
              fieldId: field.id,
              message: `Allowed file types: ${acceptedExtensions.join(', ')}`,
            },
          ];
        }

        return [];
      });
    });
  }

  private async attachFiles({
    workspaceId,
    personId,
    fileFields,
    files,
  }: {
    workspaceId: string;
    personId: string;
    fileFields: PublicFormField[];
    files: PublicFormUploadedFile[];
  }) {
    const attachmentRepository = this.workspaceOrmManager.getRepository(
      'attachment',
      { shouldBypassPermissionChecks: true },
    );

    for (const field of fileFields) {
      const fieldFiles = files.filter(
        (file) => getFileFieldId(file.fieldName) === field.id,
      );

      for (const file of fieldFiles) {
        const uploadedFile = await this.filesFieldService.uploadFile({
          file: file.buffer,
          filename: file.originalName,
          workspaceId,
          fieldMetadataUniversalIdentifier:
            STANDARD_OBJECTS.attachment.fields.file.universalIdentifier,
        });

        // Linking the file through the repository turns the temporary upload
        // into a permanent one (see FilesFieldSync).
        await attachmentRepository.insert({
          name: `${field.label}: ${file.originalName}`,
          targetPersonId: personId,
          file: [{ fileId: uploadedFile.id, label: file.originalName }],
        });
      }
    }
  }
}
