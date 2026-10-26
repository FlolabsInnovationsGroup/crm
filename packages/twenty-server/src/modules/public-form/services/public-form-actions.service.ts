import { Injectable, Logger } from '@nestjs/common';

import { isNonEmptyString } from '@sniptt/guards';
import {
  escapePublicFormHtml,
  isDefined,
  isValidPublicFormMapTo,
  PUBLIC_FORM_ENGINE,
  type PublicFormAction,
  type PublicFormDefinition,
  type PublicFormEvaluation,
} from 'twenty-shared/utils';

import { transformRichTextValue } from 'src/engine/core-modules/record-transformer/utils/transform-rich-text.util';
import { SendEmailTool } from 'src/engine/core-modules/tool/tools/email-tool/send-email-tool';
import { TwentyConfigService } from 'src/engine/core-modules/twenty-config/twenty-config.service';
import { WorkspaceOrmManager } from 'src/engine/twenty-orm/workspace-orm.manager';
import { type PublicFormCreatedBy } from 'src/modules/public-form/types/public-form-created-by.type';

type ActionContext = {
  workspaceId: string;
  formName: string;
  definition: PublicFormDefinition;
  evaluation: PublicFormEvaluation;
  personId: string | null;
  submitterEmail: string;
  createdBy: PublicFormCreatedBy;
};

const DAY_IN_MS = 24 * 60 * 60 * 1000;
const NO_ANSWER_TYPES = [
  'heading',
  'paragraph',
  'image',
  'pageBreak',
  'file',
];

const toHtml = (text: string) =>
  escapePublicFormHtml(text).replace(/\r?\n/g, '<br />');

// Runs the "after submit" steps of a form. Each step is independent: one
// failing (e.g. no mailbox connected) is logged and never loses the lead.
@Injectable()
export class PublicFormActionsService {
  private readonly logger = new Logger(PublicFormActionsService.name);

  constructor(
    private readonly workspaceOrmManager: WorkspaceOrmManager,
    private readonly sendEmailTool: SendEmailTool,
    private readonly twentyConfigService: TwentyConfigService,
  ) {}

  async runActions(context: ActionContext): Promise<void> {
    for (const action of context.definition.actions ?? []) {
      if (
        !PUBLIC_FORM_ENGINE.areGroupsMet(
          action.when,
          action.whenMatch,
          context.evaluation,
        )
      ) {
        continue;
      }

      try {
        await this.runAction(action, context);
      } catch (error) {
        this.logger.error(
          `Form "${context.formName}": action ${action.id} (${action.type}) failed`,
          error,
        );
      }
    }
  }

  private async runAction(action: PublicFormAction, context: ActionContext) {
    switch (action.type) {
      case 'setPersonValues':
        return this.setPersonValues(action.values, context);
      case 'createTask':
        return this.createTask(action, context);
      case 'notifyTeam':
        return this.sendEmail({
          context,
          to: this.interpolate(action.to, context),
          subject: this.interpolate(action.subject, context),
          html: this.buildTeamNotificationHtml(action.message, context),
          connectedAccountId: action.connectedAccountId,
        });
      case 'autoReply': {
        const to = isNonEmptyString(action.emailFieldId)
          ? this.interpolate(`{{${action.emailFieldId}}}`, context)
          : context.submitterEmail;

        return this.sendEmail({
          context,
          to,
          subject: this.interpolate(action.subject, context),
          html: toHtml(this.interpolate(action.body, context)),
          connectedAccountId: action.connectedAccountId,
        });
      }
    }
  }

  private interpolate(text: string, context: ActionContext) {
    return PUBLIC_FORM_ENGINE.interpolate(
      text,
      context.definition,
      context.evaluation,
    ).trim();
  }

  private async setPersonValues(
    values: { mapTo: string; value: string }[],
    context: ActionContext,
  ) {
    if (!isDefined(context.personId)) {
      return;
    }

    const personRepository = this.workspaceOrmManager.getRepository('person', {
      shouldBypassPermissionChecks: true,
    });
    const existing = await personRepository.findOne({
      where: { id: context.personId },
    });

    if (!isDefined(existing)) {
      return;
    }

    const update: Record<string, unknown> = {};

    for (const { mapTo, value } of values) {
      if (!isValidPublicFormMapTo(mapTo) || mapTo.startsWith('emails.')) {
        continue;
      }

      const [fieldName = '', subFieldName] = mapTo.split('.');
      const resolvedValue = this.interpolate(value, context);

      if (subFieldName === undefined) {
        update[fieldName] = resolvedValue;
        continue;
      }

      const current = update[fieldName] ?? existing[fieldName];

      update[fieldName] = {
        ...(typeof current === 'object' && current !== null ? current : {}),
        [subFieldName]: resolvedValue,
      };
    }

    if (Object.keys(update).length > 0) {
      await personRepository.update(context.personId, update);
    }
  }

  private async createTask(
    action: Extract<PublicFormAction, { type: 'createTask' }>,
    context: ActionContext,
  ) {
    const taskRepository = this.workspaceOrmManager.getRepository('task', {
      shouldBypassPermissionChecks: true,
    });
    const markdown = [
      isNonEmptyString(action.body)
        ? this.interpolate(action.body, context)
        : '',
      this.buildAnswerLines(context)
        .map(({ label, value }) => `- **${label}:** ${value}`)
        .join('\n'),
    ]
      .filter(isNonEmptyString)
      .join('\n\n');

    const insertResult = await taskRepository.insert({
      title: this.interpolate(action.title, context).slice(0, 255),
      bodyV2: await transformRichTextValue({ markdown }),
      status: 'TODO',
      assigneeId: action.assigneeId ?? null,
      dueAt: isDefined(action.dueInDays)
        ? new Date(Date.now() + action.dueInDays * DAY_IN_MS).toISOString()
        : null,
      createdBy: context.createdBy,
      updatedBy: context.createdBy,
    });
    const taskId = insertResult.identifiers[0]?.id as string | undefined;

    if (isDefined(taskId) && isDefined(context.personId)) {
      await this.workspaceOrmManager
        .getRepository('taskTarget', { shouldBypassPermissionChecks: true })
        .insert({ taskId, targetPersonId: context.personId });
    }
  }

  private buildAnswerLines(context: ActionContext) {
    const { definition, evaluation } = context;
    const answerLines = definition.fields
      .filter(
        (field) =>
          !NO_ANSWER_TYPES.includes(field.type) &&
          evaluation.visible[field.id] === true,
      )
      .map((field) => ({
        label: this.interpolate(field.label, context) || field.id,
        value: this.interpolate(`{{${field.id}}}`, context),
      }));
    const variableLines = (definition.variables ?? []).map((variable) => ({
      label: variable.label || variable.id,
      value: this.interpolate(`{{${variable.id}}}`, context),
    }));

    return [...answerLines, ...variableLines].filter(({ value }) =>
      isNonEmptyString(value),
    );
  }

  private buildTeamNotificationHtml(
    message: string | undefined,
    context: ActionContext,
  ) {
    const rows = this.buildAnswerLines(context)
      .map(
        ({ label, value }) =>
          `<tr><td style="padding:6px 12px 6px 0;color:#666;vertical-align:top">${escapePublicFormHtml(label)}</td><td style="padding:6px 0">${toHtml(value)}</td></tr>`,
      )
      .join('');
    const personUrl = isDefined(context.personId)
      ? `${this.twentyConfigService.get('SERVER_URL')}/object/person/${context.personId}`
      : null;

    return [
      isNonEmptyString(message)
        ? `<p>${toHtml(this.interpolate(message, context))}</p>`
        : `<p>New submission of <b>${escapePublicFormHtml(context.formName)}</b>.</p>`,
      `<table style="border-collapse:collapse">${rows}</table>`,
      personUrl === null
        ? ''
        : `<p><a href="${escapePublicFormHtml(personUrl)}">Open in the CRM</a></p>`,
    ].join('');
  }

  private async sendEmail({
    context,
    to,
    subject,
    html,
    connectedAccountId,
  }: {
    context: ActionContext;
    to: string;
    subject: string;
    html: string;
    connectedAccountId: string | undefined;
  }) {
    if (!isNonEmptyString(to)) {
      return;
    }

    const result = await this.sendEmailTool.execute(
      {
        recipients: { to, cc: '', bcc: '' },
        subject,
        body: html,
        connectedAccountId,
        files: [],
      },
      { workspaceId: context.workspaceId },
    );

    if (!result.success) {
      throw new Error(result.message);
    }
  }
}
