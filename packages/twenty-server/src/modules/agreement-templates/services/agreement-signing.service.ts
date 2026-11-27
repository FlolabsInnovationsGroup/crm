import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { isNonEmptyString } from '@sniptt/guards';
import { STANDARD_OBJECTS } from 'twenty-shared/metadata';
import { type ActorMetadata, FieldActorSource } from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';
import { In, IsNull, Repository } from 'typeorm';
import { v4 } from 'uuid';

import { buildActorMetadataFromAuthContext } from 'src/engine/core-modules/actor/utils/build-actor-metadata-from-auth-context.util';
import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { FilesFieldService } from 'src/engine/core-modules/file/files-field/services/files-field.service';
import { SendEmailTool } from 'src/engine/core-modules/tool/tools/email-tool/send-email-tool';
import { TwentyConfigService } from 'src/engine/core-modules/twenty-config/twenty-config.service';
import { ConnectedAccountEntity } from 'src/engine/metadata-modules/connected-account/entities/connected-account.entity';
import { buildSystemAuthContext } from 'src/engine/twenty-orm/utils/build-system-auth-context.util';
import { WorkspaceOrmManager } from 'src/engine/twenty-orm/workspace-orm.manager';
import {
  AGREEMENT_DOCUMENT_MAX_COUNT,
  AGREEMENT_SIGNER_LAYOUTS,
} from 'src/modules/agreement-templates/constants/agreement-signing.constants';
import { DocumensoApiService } from 'src/modules/agreement-templates/services/documenso-api.service';
import {
  type AgreementAttachmentRecord,
  type AgreementRequestRecord,
  type AgreementRequestStatus,
} from 'src/modules/agreement-templates/types/agreement-request-record.type';
import {
  type AgreementPersonRecord,
  type AgreementTemplateRecord,
} from 'src/modules/agreement-templates/types/agreement-template-record.type';
import {
  type DocumensoEnvelope,
  type DocumensoRecipient,
} from 'src/modules/agreement-templates/types/documenso-envelope.type';
import {
  buildApplicantAgreementEmail,
  buildApplicantSignedCopyEmail,
  buildCountersignerAgreementEmail,
} from 'src/modules/agreement-templates/utils/build-agreement-emails.util';
import { fillAgreementTemplate } from 'src/modules/agreement-templates/utils/fill-agreement-template.util';
import {
  type AgreementSigningConfig,
  getAgreementSigningConfig,
} from 'src/modules/agreement-templates/utils/get-agreement-signing-config.util';
import { getAgreementFullName } from 'src/modules/agreement-templates/utils/get-agreement-full-name.util';
import { getAgreementValues } from 'src/modules/agreement-templates/utils/get-agreement-values.util';
import { getSignatureFields } from 'src/modules/agreement-templates/utils/get-signature-fields.util';
import { renderAgreementPdf } from 'src/modules/agreement-templates/utils/render-agreement-pdf.util';

const DOCUMENSO_ACTOR: ActorMetadata = {
  source: FieldActorSource.SYSTEM,
  workspaceMemberId: null,
  name: 'Documenso',
  context: {},
};

// A message the team can act on; anything else is a server error.
export class AgreementSigningError extends Error {}

export type SendAgreementResult = {
  agreementRequestId: string;
  emailSent: boolean;
  emailError: string | null;
};

type SignedFile = { fileId: string; name: string; size: number };

const toPdfFilename = (title: string) =>
  `${title.replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'Agreement'}.pdf`;

// A crashed run leaves its claim; another run may take it over after this.
const SIGNED_FILES_CLAIM_TIMEOUT_MS = 10 * 60 * 1000;

@Injectable()
export class AgreementSigningService {
  private readonly logger = new Logger(AgreementSigningService.name);

  constructor(
    private readonly workspaceOrmManager: WorkspaceOrmManager,
    private readonly documensoApiService: DocumensoApiService,
    private readonly sendEmailTool: SendEmailTool,
    private readonly filesFieldService: FilesFieldService,
    private readonly twentyConfigService: TwentyConfigService,
    @InjectRepository(ConnectedAccountEntity)
    private readonly connectedAccountRepository: Repository<ConnectedAccountEntity>,
  ) {}

  // Reads and creates with the caller's own permissions: whoever may create
  // Agreement requests may send agreements.
  async sendAgreement({
    authContext,
    workspaceId,
    personId,
    templateIds,
    today = new Date(),
  }: {
    authContext: WorkspaceAuthContext;
    workspaceId: string;
    personId: string;
    templateIds: string[];
    today?: Date;
  }): Promise<SendAgreementResult> {
    const config = this.getConfigOrThrow(workspaceId);
    const uniqueTemplateIds = [...new Set(templateIds)];

    if (
      uniqueTemplateIds.length === 0 ||
      uniqueTemplateIds.length > AGREEMENT_DOCUMENT_MAX_COUNT
    ) {
      throw new AgreementSigningError(
        `Choose between 1 and ${AGREEMENT_DOCUMENT_MAX_COUNT} templates.`,
      );
    }

    const senderAccountId = await this.getSenderAccountId(config);

    return this.workspaceOrmManager.executeInWorkspaceContext(async () => {
      const [templates, person] = await Promise.all([
        this.workspaceOrmManager
          .getRepositoryWithContextPermissions<AgreementTemplateRecord>(
            'agreementTemplate',
          )
          .find({ where: { id: In(uniqueTemplateIds) } }),
        this.workspaceOrmManager
          .getRepositoryWithContextPermissions<AgreementPersonRecord>('person')
          .findOne({ where: { id: personId } }),
      ]);

      if (!isDefined(person)) {
        throw new AgreementSigningError('This person was not found.');
      }

      const email = person.emails?.primaryEmail?.trim();

      if (!isNonEmptyString(email)) {
        throw new AgreementSigningError('This person has no email address.');
      }

      if (email.toLowerCase() === config.countersignerEmail) {
        throw new AgreementSigningError(
          'The intern and the FloLabs signer cannot be the same address.',
        );
      }

      const documents = this.fillDocuments({
        templates: uniqueTemplateIds.map((id) =>
          templates.find((template) => template.id === id),
        ),
        person,
        today,
      });

      const requestId = v4();
      const applicantName = getAgreementFullName(person.name) ?? email;
      const rendered = await Promise.all(
        documents.map(async (document) => ({
          title: document.title,
          ...(await renderAgreementPdf({
            title: document.title,
            markdown: document.text,
            reference: `Ref. ${requestId}`,
          })),
        })),
      );
      const documentTitles = rendered.map(({ title }) => title);

      await this.workspaceOrmManager
        .getRepositoryWithContextPermissions<AgreementRequestRecord>(
          'agreementRequest',
        )
        .insert({
          id: requestId,
          name: `${documentTitles.join(', ')}: ${applicantName}`.slice(0, 250),
          personId,
          status: 'SENT',
          documents: documentTitles.join('\n'),
          createdBy: buildActorMetadataFromAuthContext(authContext),
        });

      let envelopeId: string | null = null;
      let signingUrl: string;

      try {
        envelopeId = await this.documensoApiService.createEnvelope(config, {
          title: `${documentTitles.join(', ')}: ${applicantName}`,
          externalId: requestId,
          files: rendered.map(({ title, pdf }) => ({
            filename: toPdfFilename(title),
            pdf,
          })),
          recipients: [
            {
              email,
              name: applicantName,
              role: 'SIGNER',
              signingOrder: 1,
              fields: getSignatureFields({
                layout: AGREEMENT_SIGNER_LAYOUTS.applicant,
                documents: rendered,
              }),
            },
            {
              email: config.countersignerEmail,
              name: config.countersignerName,
              // The link also sits in hr@'s synced mail; only a signed-in
              // Documenso account can use it.
              accessAuth: ['ACCOUNT'],
              role: 'SIGNER',
              signingOrder: 2,
              fields: getSignatureFields({
                layout: AGREEMENT_SIGNER_LAYOUTS.countersigner,
                documents: rendered,
              }),
            },
          ],
        });

        const recipients = await this.documensoApiService.distribute(
          config,
          envelopeId,
        );
        const applicant = recipients.find(
          (recipient) => recipient.email.toLowerCase() === email.toLowerCase(),
        );

        if (!isDefined(applicant)) {
          throw new Error('Documenso returned no signing link for the intern');
        }

        signingUrl = this.getSigningUrl(config, applicant);

        await this.getSystemRequestRepository().update(requestId, {
          documensoEnvelopeId: envelopeId,
          sentAt: new Date().toISOString(),
        });
      } catch (error) {
        await this.undoSend({ config, requestId, envelopeId });
        throw error;
      }

      const sent = await this.trySendEmail({
        workspaceId,
        connectedAccountId: senderAccountId,
        to: email,
        ...buildApplicantAgreementEmail({
          firstName: person.name?.firstName?.trim() || null,
          documentTitles,
          signingUrl,
        }),
      });

      return {
        agreementRequestId: requestId,
        emailSent: sent.success,
        emailError: sent.error,
      };
    }, authContext);
  }

  // The fallback when a webhook was missed. Reads the request with the
  // caller's permissions, then brings it up to date from Documenso.
  async syncAgreementRequest({
    authContext,
    workspaceId,
    agreementRequestId,
  }: {
    authContext: WorkspaceAuthContext;
    workspaceId: string;
    agreementRequestId: string;
  }): Promise<AgreementRequestStatus | null> {
    const config = this.getConfigOrThrow(workspaceId);
    const request = await this.workspaceOrmManager.executeInWorkspaceContext(
      () =>
        this.workspaceOrmManager
          .getRepositoryWithContextPermissions<AgreementRequestRecord>(
            'agreementRequest',
          )
          .findOne({ where: { id: agreementRequestId } }),
      authContext,
    );

    if (!isDefined(request)) {
      throw new AgreementSigningError('This agreement request was not found.');
    }

    return this.syncRequest(config, request);
  }

  // Sends the current link again: to the intern while it waits for them, to
  // the FloLabs signer once the intern has signed.
  async resendAgreementEmail({
    authContext,
    workspaceId,
    agreementRequestId,
  }: {
    authContext: WorkspaceAuthContext;
    workspaceId: string;
    agreementRequestId: string;
  }): Promise<string> {
    const config = this.getConfigOrThrow(workspaceId);
    const request = await this.workspaceOrmManager.executeInWorkspaceContext(
      () =>
        this.workspaceOrmManager
          .getRepositoryWithContextPermissions<AgreementRequestRecord>(
            'agreementRequest',
          )
          .findOne({ where: { id: agreementRequestId } }),
      authContext,
    );

    if (!isDefined(request) || !isNonEmptyString(request.documensoEnvelopeId)) {
      throw new AgreementSigningError('This agreement request was not found.');
    }

    const envelope = await this.documensoApiService.getEnvelope(
      config,
      request.documensoEnvelopeId,
    );

    if (!isDefined(envelope)) {
      throw new AgreementSigningError(
        'This agreement was deleted in Documenso.',
      );
    }

    const { applicant, countersigner } = this.getSigners(envelope);

    if (envelope.status !== 'PENDING' || !isDefined(applicant)) {
      throw new AgreementSigningError(
        'This agreement is no longer waiting for a signature.',
      );
    }

    const senderAccountId = await this.getSenderAccountId(config);
    const person = await this.getPerson(config, request.personId);
    const documentTitles = this.getDocumentTitles(request);

    const recipient =
      applicant.signingStatus === 'SIGNED' ? countersigner : applicant;

    if (!isDefined(recipient)) {
      throw new AgreementSigningError('Documenso has no FloLabs signer.');
    }

    const message =
      recipient === applicant
        ? buildApplicantAgreementEmail({
            firstName: person?.name?.firstName?.trim() || null,
            documentTitles,
            signingUrl: this.getSigningUrl(config, applicant),
          })
        : buildCountersignerAgreementEmail({
            applicantName:
              getAgreementFullName(person?.name) ?? applicant.email,
            documentTitles,
            signingUrl: this.getSigningUrl(config, recipient),
            personUrl: this.getPersonUrl(request.personId),
          });

    const sent = await this.trySendEmail({
      workspaceId,
      connectedAccountId: senderAccountId,
      to: recipient.email,
      ...message,
    });

    if (!sent.success) {
      throw new AgreementSigningError(`The email failed: ${sent.error}`);
    }

    if (recipient === countersigner) {
      await this.workspaceOrmManager.executeInWorkspaceContext(
        () =>
          this.getSystemRequestRepository().update(request.id, {
            status: 'APPLICANT_SIGNED',
            applicantSignedAt: applicant.signedAt ?? new Date().toISOString(),
            countersignerEmailedAt: new Date().toISOString(),
          }),
        buildSystemAuthContext(config.workspaceId),
      );
    }

    return recipient.email;
  }

  // Called by the Documenso webhook, which is trusted only to name an
  // envelope. Its state, and the request it belongs to, come from Documenso,
  // since members can edit the envelope id stored on a request.
  async syncEnvelope(envelopeId: string): Promise<void> {
    const config = getAgreementSigningConfig();

    if (!isDefined(config)) {
      return;
    }

    const envelope = await this.documensoApiService.getEnvelope(
      config,
      envelopeId,
    );

    await this.workspaceOrmManager.executeInWorkspaceContext(async () => {
      const repository = this.getSystemRequestRepository();

      if (!isDefined(envelope)) {
        await repository.update(
          {
            documensoEnvelopeId: envelopeId,
            status: In(['SENT', 'APPLICANT_SIGNED']),
          },
          { status: 'CANCELLED', updatedBy: DOCUMENSO_ACTOR },
        );

        return;
      }

      const request = isNonEmptyString(envelope.externalId)
        ? await repository.findOne({ where: { id: envelope.externalId } })
        : null;

      if (!isDefined(request) || request.documensoEnvelopeId !== envelope.id) {
        this.logger.log(
          `No agreement request for Documenso envelope ${envelopeId}`,
        );

        return;
      }

      await this.applyEnvelope(config, request, envelope);
    }, buildSystemAuthContext(config.workspaceId));
  }

  private async syncRequest(
    config: AgreementSigningConfig,
    request: AgreementRequestRecord,
  ): Promise<AgreementRequestStatus | null> {
    if (!isNonEmptyString(request.documensoEnvelopeId)) {
      return request.status;
    }

    const envelope = await this.documensoApiService.getEnvelope(
      config,
      request.documensoEnvelopeId,
    );

    if (isDefined(envelope) && envelope.externalId !== request.id) {
      throw new AgreementSigningError(
        'The Documenso envelope on this request belongs to another request.',
      );
    }

    return this.workspaceOrmManager.executeInWorkspaceContext(async () => {
      if (!isDefined(envelope)) {
        if (request.status === 'COMPLETED') {
          return request.status;
        }

        await this.getSystemRequestRepository().update(request.id, {
          status: 'CANCELLED',
          updatedBy: DOCUMENSO_ACTOR,
        });

        return 'CANCELLED';
      }

      return this.applyEnvelope(config, request, envelope);
    }, buildSystemAuthContext(config.workspaceId));
  }

  // Must run inside the workspace context.
  private async applyEnvelope(
    config: AgreementSigningConfig,
    request: AgreementRequestRecord,
    envelope: DocumensoEnvelope,
  ): Promise<AgreementRequestStatus | null> {
    const repository = this.getSystemRequestRepository();
    const { applicant, countersigner } = this.getSigners(envelope);

    if (envelope.status === 'REJECTED' || envelope.status === 'CANCELLED') {
      const status = envelope.status === 'REJECTED' ? 'REJECTED' : 'CANCELLED';

      await repository.update(request.id, {
        status,
        updatedBy: DOCUMENSO_ACTOR,
      });

      return status;
    }

    if (
      applicant?.signingStatus === 'SIGNED' &&
      !isDefined(request.countersignerEmailedAt) &&
      envelope.status === 'PENDING'
    ) {
      await this.emailCountersigner({
        config,
        request,
        applicant,
        countersigner,
      });
    }

    if (envelope.status === 'COMPLETED' && request.status !== 'COMPLETED') {
      await this.saveSignedFiles({ config, request, envelope });
    }

    const latest = await repository.findOne({ where: { id: request.id } });

    return latest?.status ?? request.status;
  }

  // Must run inside the workspace context. The conditional update claims the
  // email, so two webhooks arriving together send it once.
  private async emailCountersigner({
    config,
    request,
    applicant,
    countersigner,
  }: {
    config: AgreementSigningConfig;
    request: AgreementRequestRecord;
    applicant: DocumensoRecipient;
    countersigner: DocumensoRecipient | undefined;
  }) {
    if (!isDefined(countersigner)) {
      throw new Error(
        `Documenso envelope for ${request.id} has no FloLabs signer`,
      );
    }

    const repository = this.getSystemRequestRepository();
    const claim = await repository.update(
      { id: request.id, countersignerEmailedAt: IsNull() },
      {
        status: 'APPLICANT_SIGNED',
        applicantSignedAt: applicant.signedAt ?? new Date().toISOString(),
        countersignerEmailedAt: new Date().toISOString(),
        updatedBy: DOCUMENSO_ACTOR,
      },
    );

    if (claim.affected !== 1) {
      return;
    }

    try {
      const person = await this.getPerson(config, request.personId);
      const sent = await this.trySendEmail({
        workspaceId: config.workspaceId,
        connectedAccountId: await this.getSenderAccountId(config),
        to: countersigner.email,
        ...buildCountersignerAgreementEmail({
          applicantName: getAgreementFullName(person?.name) ?? applicant.email,
          documentTitles: this.getDocumentTitles(request),
          signingUrl: this.getSigningUrl(config, countersigner),
          personUrl: this.getPersonUrl(request.personId),
        }),
      });

      if (!sent.success) {
        throw new Error(sent.error ?? 'The email failed');
      }
    } catch (error) {
      await repository.update(request.id, { countersignerEmailedAt: null });
      throw error;
    }
  }

  // Must run inside the workspace context. Claimed like the countersigner
  // email and released if anything fails, so the next webhook retries; files
  // already attached by an earlier try are not attached again.
  private async saveSignedFiles({
    config,
    request,
    envelope,
  }: {
    config: AgreementSigningConfig;
    request: AgreementRequestRecord;
    envelope: DocumensoEnvelope;
  }) {
    const repository = this.getSystemRequestRepository();
    const previousClaim = isDefined(request.signedFilesSavedAt)
      ? new Date(request.signedFilesSavedAt)
      : null;

    if (
      isDefined(previousClaim) &&
      Date.now() - previousClaim.getTime() < SIGNED_FILES_CLAIM_TIMEOUT_MS
    ) {
      return;
    }

    const claim = await repository.update(
      {
        id: request.id,
        signedFilesSavedAt: isDefined(previousClaim)
          ? previousClaim.toISOString()
          : IsNull(),
      },
      { signedFilesSavedAt: new Date().toISOString() },
    );

    if (claim.affected !== 1) {
      return;
    }

    const reference = request.id.slice(0, 8);
    let savedFiles: SignedFile[];

    try {
      const downloads = [
        ...(await Promise.all(
          [...envelope.envelopeItems]
            .sort((first, second) => first.order - second.order)
            .map(async (item) => ({
              name: `Signed - ${toPdfFilename(`${item.title.replace(/\.pdf$/i, '')} (${reference})`)}`,
              pdf: await this.documensoApiService.downloadSignedItem(
                config,
                item.id,
              ),
            })),
        )),
        {
          name: `Signing certificate (${reference}).pdf`,
          pdf: await this.documensoApiService.downloadCertificate(
            config,
            envelope.id,
          ),
        },
      ];

      savedFiles = await this.attachToPerson({
        workspaceId: config.workspaceId,
        personId: request.personId,
        files: downloads,
      });

      await repository.update(request.id, {
        status: 'COMPLETED',
        completedAt: envelope.completedAt ?? new Date().toISOString(),
        updatedBy: DOCUMENSO_ACTOR,
      });
    } catch (error) {
      await repository.update(request.id, { signedFilesSavedAt: null });
      throw error;
    }

    // The files are saved; a failed copy to the intern is logged, not retried.
    try {
      const { applicant } = this.getSigners(envelope);

      if (!isDefined(applicant)) {
        return;
      }

      const person = await this.getPerson(config, request.personId);
      const sent = await this.trySendEmail({
        workspaceId: config.workspaceId,
        connectedAccountId: await this.getSenderAccountId(config),
        to: applicant.email,
        files: savedFiles,
        ...buildApplicantSignedCopyEmail({
          firstName: person?.name?.firstName?.trim() || null,
          documentTitles: this.getDocumentTitles(request),
        }),
      });

      if (!sent.success) {
        throw new Error(sent.error ?? 'The email failed');
      }
    } catch (error) {
      this.logger.error(
        `Signed copy of agreement request ${request.id} not emailed: ${error}`,
      );
    }
  }

  // Must run inside the workspace context.
  private async attachToPerson({
    workspaceId,
    personId,
    files,
  }: {
    workspaceId: string;
    personId: string | null;
    files: { name: string; pdf: Buffer }[];
  }): Promise<SignedFile[]> {
    if (!isDefined(personId)) {
      throw new Error('The agreement request has no person to attach files to');
    }

    const attachmentRepository =
      this.workspaceOrmManager.getRepository<AgreementAttachmentRecord>(
        'attachment',
        { shouldBypassPermissionChecks: true },
      );
    const existing = await attachmentRepository.find({
      where: {
        targetPersonId: personId,
        name: In(files.map(({ name }) => name)),
      },
    });
    const existingFileByName = new Map(
      existing.flatMap((attachment) => {
        const fileId = attachment.file?.[0]?.fileId;

        return isNonEmptyString(attachment.name) && isNonEmptyString(fileId)
          ? [[attachment.name, fileId] as const]
          : [];
      }),
    );
    const saved: SignedFile[] = [];

    for (const { name, pdf } of files) {
      const existingFileId = existingFileByName.get(name);

      if (isDefined(existingFileId)) {
        saved.push({ fileId: existingFileId, name, size: pdf.length });
        continue;
      }

      const uploadedFile = await this.filesFieldService.uploadFile({
        file: pdf,
        filename: name,
        workspaceId,
        fieldMetadataUniversalIdentifier:
          STANDARD_OBJECTS.attachment.fields.file.universalIdentifier,
      });

      // Linking the file through the repository makes the upload permanent.
      await attachmentRepository.insert({
        name,
        targetPersonId: personId,
        file: [{ fileId: uploadedFile.id, label: name }],
        createdBy: DOCUMENSO_ACTOR,
        updatedBy: DOCUMENSO_ACTOR,
      });

      saved.push({ fileId: uploadedFile.id, name, size: pdf.length });
    }

    return saved;
  }

  private fillDocuments({
    templates,
    person,
    today,
  }: {
    templates: (AgreementTemplateRecord | undefined)[];
    person: AgreementPersonRecord;
    today: Date;
  }): { title: string; text: string }[] {
    const values = getAgreementValues(person, today);
    const problems: string[] = [];
    const documents = templates.flatMap((template) => {
      if (!isDefined(template)) {
        problems.push('A chosen template was not found.');

        return [];
      }

      const title = template.name?.trim() || 'Agreement';

      if (template.isActive === false) {
        problems.push(`"${title}" is not in use.`);

        return [];
      }

      const { text, missingPlaceholders } = fillAgreementTemplate(
        template.body?.markdown ?? '',
        values,
      );

      if (!isNonEmptyString(text.trim())) {
        problems.push(`"${title}" has no text.`);
      } else if (missingPlaceholders.length > 0) {
        problems.push(
          `"${title}" needs ${missingPlaceholders.map((key) => `{{${key}}}`).join(', ')}; fill them in on the person first.`,
        );
      }

      return [{ title, text }];
    });

    if (problems.length > 0) {
      throw new AgreementSigningError(problems.join(' '));
    }

    return documents;
  }

  private async undoSend({
    config,
    requestId,
    envelopeId,
  }: {
    config: AgreementSigningConfig;
    requestId: string;
    envelopeId: string | null;
  }) {
    if (isDefined(envelopeId)) {
      await this.documensoApiService
        .deleteEnvelope(config, envelopeId)
        .catch((error) =>
          this.logger.error(
            `Could not delete Documenso envelope ${envelopeId}: ${error}`,
          ),
        );
    }

    await this.getSystemRequestRepository()
      .delete(requestId)
      .catch((error) =>
        this.logger.error(
          `Could not remove agreement request ${requestId}: ${error}`,
        ),
      );
  }

  private getConfigOrThrow(workspaceId: string): AgreementSigningConfig {
    const config = getAgreementSigningConfig();

    if (!isDefined(config)) {
      throw new AgreementSigningError(
        'E-signature is not set up on this server yet (see docs/flolabs/documenso.md).',
      );
    }

    if (config.workspaceId !== workspaceId) {
      throw new AgreementSigningError(
        'E-signature is not available in this workspace.',
      );
    }

    return config;
  }

  private async getSenderAccountId(
    config: AgreementSigningConfig,
  ): Promise<string> {
    const account = await this.connectedAccountRepository.findOne({
      where: {
        workspaceId: config.workspaceId,
        handle: config.senderHandle,
        archivedAt: IsNull(),
      },
      select: { id: true },
    });

    if (!isDefined(account)) {
      throw new AgreementSigningError(
        `${config.senderHandle} is not connected to the CRM, so the agreement email cannot be sent.`,
      );
    }

    return account.id;
  }

  private getSigners(envelope: DocumensoEnvelope) {
    return {
      applicant: envelope.recipients.find(
        (recipient) => recipient.signingOrder === 1,
      ),
      countersigner: envelope.recipients.find(
        (recipient) => recipient.signingOrder === 2,
      ),
    };
  }

  private getSigningUrl(
    config: AgreementSigningConfig,
    recipient: Pick<DocumensoRecipient, 'token'>,
  ) {
    return `${config.documensoPublicUrl}/sign/${encodeURIComponent(recipient.token)}`;
  }

  private getPersonUrl(personId: string | null) {
    return `${this.twentyConfigService.get('SERVER_URL')}/object/person/${personId ?? ''}`;
  }

  private getDocumentTitles(request: AgreementRequestRecord) {
    return (request.documents ?? '').split('\n').filter(isNonEmptyString);
  }

  // Must run inside a workspace context.
  private getSystemRequestRepository() {
    return this.workspaceOrmManager.getRepository<AgreementRequestRecord>(
      'agreementRequest',
      { shouldBypassPermissionChecks: true },
    );
  }

  private async getPerson(
    config: AgreementSigningConfig,
    personId: string | null,
  ): Promise<Pick<AgreementPersonRecord, 'name'> | null> {
    if (!isDefined(personId)) {
      return null;
    }

    return this.workspaceOrmManager.executeInWorkspaceContext(
      () =>
        this.workspaceOrmManager
          .getRepository<AgreementPersonRecord>('person', {
            shouldBypassPermissionChecks: true,
          })
          .findOne({
            where: { id: personId },
            select: { id: true, name: true },
          }),
      buildSystemAuthContext(config.workspaceId),
    );
  }

  private async trySendEmail({
    workspaceId,
    connectedAccountId,
    to,
    subject,
    html,
    files = [],
  }: {
    workspaceId: string;
    connectedAccountId: string;
    to: string;
    subject: string;
    html: string;
    files?: SignedFile[];
  }): Promise<{ success: boolean; error: string | null }> {
    const result = await this.sendEmailTool.execute(
      {
        recipients: { to, cc: '', bcc: '' },
        subject,
        body: html,
        connectedAccountId,
        files: files.map((file) => ({
          id: file.fileId,
          name: file.name,
          size: file.size,
          type: 'application/pdf',
          createdAt: new Date().toISOString(),
        })),
      },
      { workspaceId },
    );

    return result.success
      ? { success: true, error: null }
      : {
          success: false,
          error: isNonEmptyString(result.error) ? result.error : result.message,
        };
  }
}
