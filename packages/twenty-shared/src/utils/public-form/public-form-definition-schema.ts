import { z } from 'zod';

import { createPublicFormEngine } from './public-form-engine';

export const PUBLIC_FORM_DEFINITION_VERSION = 1;

export const PUBLIC_FORM_FIELD_TYPES = [
  'shortText',
  'longText',
  'email',
  'phone',
  'number',
  'url',
  'date',
  'time',
  'select',
  'multiSelect',
  'yesNo',
  'rating',
  'scale',
  'slider',
  'matrix',
  'checkbox',
  'consent',
  'address',
  'file',
  'signature',
  'hidden',
  'heading',
  'paragraph',
  'image',
  'pageBreak',
] as const;

export const PUBLIC_FORM_CHOICE_DISPLAYS = [
  'auto',
  'buttons',
  'dropdown',
] as const;

// Address answers are a fixed-length list in this order.
export const PUBLIC_FORM_ADDRESS_PARTS = [
  'street',
  'city',
  'region',
  'postcode',
  'country',
] as const;

export const PUBLIC_FORM_CONDITION_MATCHES = ['all', 'any'] as const;
export const PUBLIC_FORM_FIELD_WIDTHS = ['full', 'half'] as const;
export const PUBLIC_FORM_DIRECTIONS = ['ltr', 'rtl'] as const;
// conversational shows one question per screen, like Typeform.
export const PUBLIC_FORM_LAYOUTS = ['card', 'plain', 'conversational'] as const;
export const PUBLIC_FORM_ALIGNMENTS = ['start', 'center', 'stretch'] as const;
export const PUBLIC_FORM_COLOR_SCHEMES = ['light', 'auto'] as const;
export const PUBLIC_FORM_LANGUAGES = ['en', 'ar'] as const;

// Loaded from Google Fonts when picked; anything else must be a system font.
export const PUBLIC_FORM_GOOGLE_FONTS = [
  'Inter',
  'Cairo',
  'Tajawal',
  'IBM Plex Sans Arabic',
  'Almarai',
  'Poppins',
  'Montserrat',
  'DM Sans',
  'Roboto',
  'Open Sans',
  'Lato',
  'Nunito',
] as const;

export const PUBLIC_FORM_CONDITION_OPERATORS = [
  'equals',
  'notEquals',
  'contains',
  'notContains',
  'isEmpty',
  'isNotEmpty',
  'greaterThan',
  'lessThan',
  'greaterOrEqual',
  'lessOrEqual',
  'startsWith',
  'endsWith',
  'isAnyOf',
] as const;

export const PUBLIC_FORM_ACTION_TYPES = [
  'setPersonValues',
  'createTask',
  'notifyTeam',
  'autoReply',
] as const;

const SLUG_PATTERN = /^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/;

const hexColorSchema = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, 'Colors must be #RRGGBB');

export const publicFormConditionSchema = z.object({
  fieldId: z.string().min(1),
  operator: z.enum(PUBLIC_FORM_CONDITION_OPERATORS),
  value: z.string().optional(),
});

export const publicFormConditionGroupSchema = z.object({
  match: z.enum(PUBLIC_FORM_CONDITION_MATCHES).default('all'),
  conditions: z.array(publicFormConditionSchema),
});

export const publicFormValidationRulesSchema = z.object({
  // Characters for text, picked options for multiple choice.
  minLength: z.number().int().min(0).optional(),
  maxLength: z.number().int().min(0).optional(),
  // Numbers or YYYY-MM-DD dates.
  minValue: z.string().optional(),
  maxValue: z.string().optional(),
  pattern: z.string().max(500).optional(),
  patternMessage: z.string().max(300).optional(),
});

export const publicFormFieldOptionSchema = z.object({
  value: z.string().min(1),
  label: z.string().min(1),
});

// `mapTo` is a dotted path on the target record, e.g. `name.firstName`,
// `emails.primaryEmail` or a custom field name such as `country`.
export const publicFormFieldSchema = z.object({
  id: z.string().regex(SLUG_PATTERN, 'Field ids must be simple slugs'),
  type: z.enum(PUBLIC_FORM_FIELD_TYPES),
  label: z.string(),
  description: z.string().optional(),
  placeholder: z.string().optional(),
  required: z.boolean().default(false),
  // Choices, or the rows of a matrix.
  options: z.array(publicFormFieldOptionSchema).optional(),
  // The columns of a matrix.
  columns: z.array(publicFormFieldOptionSchema).optional(),
  choiceDisplay: z.enum(PUBLIC_FORM_CHOICE_DISPLAYS).default('auto'),
  // Bounds of rating (max only), scale and slider fields.
  scaleMin: z.number().int().min(-1000000).max(1000000).optional(),
  scaleMax: z.number().int().min(-1000000).max(1000000).optional(),
  scaleStep: z.number().positive().max(1000000).optional(),
  minLabel: z.string().max(100).optional(),
  maxLabel: z.string().max(100).optional(),
  mapTo: z.string().optional(),
  // Image blocks only; https so the page's CSP can load it.
  imageUrl: z
    .string()
    .max(2000)
    .regex(/^https:\/\//i, 'Images must use an https:// link')
    .optional(),
  visibleWhen: z.array(publicFormConditionSchema).optional(),
  visibleWhenMatch: z.enum(PUBLIC_FORM_CONDITION_MATCHES).default('all'),
  // Supersedes visibleWhen when set; groups combine with visibleWhenGroupsMatch.
  visibleWhenGroups: z.array(publicFormConditionGroupSchema).optional(),
  visibleWhenGroupsMatch: z.enum(PUBLIC_FORM_CONDITION_MATCHES).default('any'),
  requiredWhenGroups: z.array(publicFormConditionGroupSchema).optional(),
  requiredWhenGroupsMatch: z.enum(PUBLIC_FORM_CONDITION_MATCHES).default('any'),
  validation: publicFormValidationRulesSchema.optional(),
  maxFileSizeMb: z.number().positive().max(25).optional(),
  acceptedFileExtensions: z.array(z.string()).optional(),
  width: z.enum(PUBLIC_FORM_FIELD_WIDTHS).default('full'),
  defaultValue: z.string().optional(),
  // Lets an embedding site pass e.g. `?utm_source=linkedin` into a field.
  prefillQueryParam: z.string().optional(),
});

export const publicFormVariableSchema = z.object({
  id: z.string().regex(SLUG_PATTERN, 'Variable ids must be simple slugs'),
  label: z.string(),
  formula: z.string().max(2000),
});

const whenSchema = {
  when: z.array(publicFormConditionGroupSchema).optional(),
  whenMatch: z.enum(PUBLIC_FORM_CONDITION_MATCHES).default('any'),
};

export const publicFormEndingSchema = z.object({
  id: z.string().regex(SLUG_PATTERN),
  label: z.string(),
  ...whenSchema,
  message: z.string().optional(),
  redirectUrl: z.string().url().optional(),
});

const actionBaseSchema = {
  id: z.string().regex(SLUG_PATTERN),
  ...whenSchema,
};

// Texts accept `{{fieldId}}` and `{{variableId}}`.
export const publicFormActionSchema = z.discriminatedUnion('type', [
  z.object({
    ...actionBaseSchema,
    type: z.literal('setPersonValues'),
    values: z.array(z.object({ mapTo: z.string(), value: z.string() })),
  }),
  z.object({
    ...actionBaseSchema,
    type: z.literal('createTask'),
    title: z.string().min(1),
    body: z.string().optional(),
    assigneeId: z.string().uuid().optional(),
    dueInDays: z.number().int().min(0).max(365).optional(),
  }),
  z.object({
    ...actionBaseSchema,
    type: z.literal('notifyTeam'),
    to: z.string().min(3),
    subject: z.string().min(1),
    message: z.string().optional(),
    connectedAccountId: z.string().uuid().optional(),
  }),
  z.object({
    ...actionBaseSchema,
    type: z.literal('autoReply'),
    emailFieldId: z.string().optional(),
    subject: z.string().min(1),
    body: z.string().min(1),
    connectedAccountId: z.string().uuid().optional(),
  }),
]);

export const publicFormThemeSchema = z.object({
  primaryColor: hexColorSchema.default('#111111'),
  backgroundColor: hexColorSchema.default('#ffffff'),
  textColor: hexColorSchema.default('#1f1f1f'),
  buttonTextColor: hexColorSchema.default('#ffffff'),
  inputBackgroundColor: hexColorSchema.default('#ffffff'),
  borderColor: hexColorSchema.default('#d6d6d6'),
  fontFamily: z.string().default('Inter, system-ui, sans-serif'),
  borderRadiusPx: z.number().min(0).max(32).default(8),
  logoUrl: z.string().url().optional(),
  submitButtonLabel: z.string().default('Submit'),
  direction: z.enum(PUBLIC_FORM_DIRECTIONS).default('ltr'),
  customCss: z.string().max(50000).optional(),
  layout: z.enum(PUBLIC_FORM_LAYOUTS).default('card'),
  // auto follows the visitor's device setting.
  colorScheme: z.enum(PUBLIC_FORM_COLOR_SCHEMES).default('light'),
  pageBackgroundColor: hexColorSchema.optional(),
  backgroundImageUrl: z.string().url().optional(),
  coverImageUrl: z.string().url().optional(),
  logoAlign: z.enum(PUBLIC_FORM_ALIGNMENTS).default('start'),
  buttonAlign: z.enum(PUBLIC_FORM_ALIGNMENTS).default('start'),
  showTitle: z.boolean().default(true),
  showProgressBar: z.boolean().default(true),
  maxWidthPx: z.number().int().min(360).max(1400).default(680),
});

// Hand-written markup replaces the generated fields; inputs are matched to
// fields by their name attribute.
export const publicFormCodeSchema = z.object({
  html: z.string().max(200000).optional(),
  js: z.string().max(100000).optional(),
});

export const publicFormSettingsSchema = z.object({
  successMessage: z.string().default('Thank you! Your answers were sent.'),
  redirectUrl: z.string().url().optional(),
  // Language of the built-in texts (errors, "Sending…"), not of the questions.
  language: z.enum(PUBLIC_FORM_LANGUAGES).default('en'),
  // Country assumed for phone numbers typed without a "+" prefix, e.g. "EG".
  defaultPhoneCountryCode: z
    .string()
    .regex(/^[A-Z]{2}$/)
    .optional(),
  // Lists every answer for a last check before sending.
  showReviewStep: z.boolean().default(false),
  // Label of the first page's button, e.g. "Get Started".
  startButtonLabel: z.string().max(60).optional(),
});

export const publicFormDefinitionSchema = z
  .object({
    version: z.literal(PUBLIC_FORM_DEFINITION_VERSION),
    title: z.string(),
    description: z.string().optional(),
    fields: z.array(publicFormFieldSchema),
    theme: publicFormThemeSchema.default(publicFormThemeSchema.parse({})),
    settings: publicFormSettingsSchema.default(
      publicFormSettingsSchema.parse({}),
    ),
    variables: z.array(publicFormVariableSchema).optional(),
    endings: z.array(publicFormEndingSchema).optional(),
    actions: z.array(publicFormActionSchema).optional(),
    code: publicFormCodeSchema.optional(),
  })
  .superRefine((definition, context) => {
    const engine = createPublicFormEngine();
    const fieldIds = new Set(definition.fields.map((field) => field.id));
    const variableIds = new Set<string>();
    const seenFieldIds = new Set<string>();

    const checkGroups = (
      groups: z.infer<typeof publicFormConditionGroupSchema>[] | undefined,
      path: (string | number)[],
      isKnownId: (id: string) => boolean,
    ) => {
      (groups ?? []).forEach((group, groupIndex) =>
        group.conditions.forEach((condition, conditionIndex) => {
          if (!isKnownId(condition.fieldId)) {
            context.addIssue({
              code: 'custom',
              path: [...path, groupIndex, 'conditions', conditionIndex],
              message: `Unknown or later field "${condition.fieldId}"`,
            });
          }
        }),
      );
    };

    (definition.variables ?? []).forEach((variable, variableIndex) => {
      const path = ['variables', variableIndex];

      if (fieldIds.has(variable.id) || variableIds.has(variable.id)) {
        context.addIssue({
          code: 'custom',
          path: [...path, 'id'],
          message: `Duplicate id "${variable.id}"`,
        });
      }

      const formulaError = engine.parseFormula(variable.formula);

      if (formulaError !== null) {
        context.addIssue({
          code: 'custom',
          path: [...path, 'formula'],
          message: formulaError,
        });
      }

      engine.getFormulaReferences(variable.formula).forEach((reference) => {
        if (!fieldIds.has(reference) && !variableIds.has(reference)) {
          context.addIssue({
            code: 'custom',
            path: [...path, 'formula'],
            message: `Unknown or later reference "{${reference}}"`,
          });
        }
      });

      variableIds.add(variable.id);
    });

    definition.fields.forEach((field, fieldIndex) => {
      if (seenFieldIds.has(field.id)) {
        context.addIssue({
          code: 'custom',
          path: ['fields', fieldIndex, 'id'],
          message: `Duplicate field id "${field.id}"`,
        });
      }

      // Conditions may only look back, so a page never depends on a later one.
      const isEarlierOrVariable = (id: string) =>
        seenFieldIds.has(id) || variableIds.has(id);

      checkGroups(
        field.visibleWhen === undefined
          ? undefined
          : [{ match: field.visibleWhenMatch, conditions: field.visibleWhen }],
        ['fields', fieldIndex, 'visibleWhen'],
        isEarlierOrVariable,
      );
      checkGroups(
        field.visibleWhenGroups,
        ['fields', fieldIndex, 'visibleWhenGroups'],
        isEarlierOrVariable,
      );
      checkGroups(
        field.requiredWhenGroups,
        ['fields', fieldIndex, 'requiredWhenGroups'],
        (id) => fieldIds.has(id) || variableIds.has(id),
      );

      if (field.validation?.pattern !== undefined) {
        try {
          new RegExp(field.validation.pattern);
        } catch {
          context.addIssue({
            code: 'custom',
            path: ['fields', fieldIndex, 'validation', 'pattern'],
            message: 'Invalid regular expression',
          });
        }
      }

      seenFieldIds.add(field.id);
    });

    const isAnyKnownId = (id: string) =>
      fieldIds.has(id) || variableIds.has(id);

    (definition.endings ?? []).forEach((ending, endingIndex) =>
      checkGroups(ending.when, ['endings', endingIndex, 'when'], isAnyKnownId),
    );
    (definition.actions ?? []).forEach((action, actionIndex) =>
      checkGroups(action.when, ['actions', actionIndex, 'when'], isAnyKnownId),
    );
  });

export type PublicFormFieldType = (typeof PUBLIC_FORM_FIELD_TYPES)[number];
export type PublicFormConditionOperator =
  (typeof PUBLIC_FORM_CONDITION_OPERATORS)[number];
export type PublicFormCondition = z.infer<typeof publicFormConditionSchema>;
export type PublicFormConditionGroup = z.infer<
  typeof publicFormConditionGroupSchema
>;
export type PublicFormValidationRules = z.infer<
  typeof publicFormValidationRulesSchema
>;
export type PublicFormVariable = z.infer<typeof publicFormVariableSchema>;
export type PublicFormEnding = z.infer<typeof publicFormEndingSchema>;
export type PublicFormAction = z.infer<typeof publicFormActionSchema>;
export type PublicFormActionType = (typeof PUBLIC_FORM_ACTION_TYPES)[number];
export type PublicFormConditionMatch =
  (typeof PUBLIC_FORM_CONDITION_MATCHES)[number];
export type PublicFormField = z.infer<typeof publicFormFieldSchema>;
export type PublicFormTheme = z.infer<typeof publicFormThemeSchema>;
export type PublicFormCode = z.infer<typeof publicFormCodeSchema>;
export type PublicFormSettings = z.infer<typeof publicFormSettingsSchema>;
export type PublicFormDefinition = z.infer<typeof publicFormDefinitionSchema>;
export type PublicFormDefinitionInput = z.input<
  typeof publicFormDefinitionSchema
>;

// Answers keyed by field id. Multi-select answers are arrays; files are
// handled outside the answer map.
export type PublicFormAnswers = Record<string, string | string[] | boolean>;
