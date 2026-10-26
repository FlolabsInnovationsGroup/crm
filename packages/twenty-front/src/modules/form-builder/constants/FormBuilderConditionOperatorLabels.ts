import { msg } from '@lingui/core/macro';
import { type MessageDescriptor } from '@lingui/core';
import { type PublicFormConditionOperator } from 'twenty-shared/utils';

export const FORM_BUILDER_CONDITION_OPERATOR_LABELS: Record<
  PublicFormConditionOperator,
  MessageDescriptor
> = {
  equals: msg`is`,
  notEquals: msg`is not`,
  isAnyOf: msg`is any of`,
  contains: msg`contains`,
  notContains: msg`does not contain`,
  startsWith: msg`starts with`,
  endsWith: msg`ends with`,
  isEmpty: msg`is empty`,
  isNotEmpty: msg`is not empty`,
  greaterThan: msg`is greater than`,
  greaterOrEqual: msg`is at least`,
  lessThan: msg`is less than`,
  lessOrEqual: msg`is at most`,
};
