import { msg } from '@lingui/core/macro';
import { type MessageDescriptor } from '@lingui/core';
import { type PublicFormConditionOperator } from 'twenty-shared/utils';

export const FORM_BUILDER_CONDITION_OPERATOR_LABELS: Record<
  PublicFormConditionOperator,
  MessageDescriptor
> = {
  equals: msg`is`,
  notEquals: msg`is not`,
  contains: msg`contains`,
  notContains: msg`does not contain`,
  isEmpty: msg`is empty`,
  isNotEmpty: msg`is not empty`,
};
