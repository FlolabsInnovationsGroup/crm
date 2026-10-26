import { msg } from '@lingui/core/macro';
import { type MessageDescriptor } from '@lingui/core';
import { type PublicFormActionType } from 'twenty-shared/utils';

export const FORM_BUILDER_ACTION_LABELS: Record<
  PublicFormActionType,
  MessageDescriptor
> = {
  setPersonValues: msg`Update the person`,
  createTask: msg`Create a task`,
  notifyTeam: msg`Email the team`,
  autoReply: msg`Auto-reply to the person`,
};
