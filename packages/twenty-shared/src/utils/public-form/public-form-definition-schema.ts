import { z } from 'zod';

export const PUBLIC_FORM_DEFINITION_VERSION = 1;

export const PUBLIC_FORM_FIELD_TYPES = [
  'shortText',
  'longText',
  'email',
  'phone',
  'number',
  'url',
  'date',
  'select',
  'multiSelect',
  'checkbox',
  'file',
  'hidden',
  'heading',
  'paragraph',
] as const;

export const PUBLIC_FORM_FIELD_WIDTHS = ['full', 'half'] as const;
export const PUBLIC_FORM_DIRECTIONS = ['ltr', 'rtl'] as const;
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
] as const;

const hexColorSchema = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, 'Colors must be #RRGGBB');

export const publicFormConditionSchema = z.object({
  fieldId: z.string().min(1),
  operator: z.enum(PUBLIC_FORM_CONDITION_OPERATORS),
  value: z.string().optional(),
});

export const publicFormFieldOptionSchema = z.object({
  value: z.string().min(1),
  label: z.string().min(1),
});

// `mapTo` is a dotted path on the target record, e.g. `name.firstName`,
// `emails.primaryEmail` or a custom field name such as `country`.
export const publicFormFieldSchema = z.object({
  id: z
    .string()
    .regex(/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/, 'Field ids must be simple slugs'),
  type: z.enum(PUBLIC_FORM_FIELD_TYPES),
  label: z.string(),
  description: z.string().optional(),
  placeholder: z.string().optional(),
  required: z.boolean().default(false),
  options: z.array(publicFormFieldOptionSchema).optional(),
  mapTo: z.string().optional(),
  visibleWhen: z.array(publicFormConditionSchema).optional(),
  maxFileSizeMb: z.number().positive().max(25).optional(),
  acceptedFileExtensions: z.array(z.string()).optional(),
  width: z.enum(PUBLIC_FORM_FIELD_WIDTHS).default('full'),
  defaultValue: z.string().optional(),
  // Lets an embedding site pass e.g. `?utm_source=linkedin` into a field.
  prefillQueryParam: z.string().optional(),
});

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
  customCss: z.string().max(20000).optional(),
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
  })
  .superRefine((definition, context) => {
    const seenFieldIds = new Set<string>();

    definition.fields.forEach((field, fieldIndex) => {
      if (seenFieldIds.has(field.id)) {
        context.addIssue({
          code: 'custom',
          path: ['fields', fieldIndex, 'id'],
          message: `Duplicate field id "${field.id}"`,
        });
      }

      (field.visibleWhen ?? []).forEach((condition, conditionIndex) => {
        if (!seenFieldIds.has(condition.fieldId)) {
          context.addIssue({
            code: 'custom',
            path: ['fields', fieldIndex, 'visibleWhen', conditionIndex],
            message: 'A condition can only depend on an earlier field',
          });
        }
      });

      seenFieldIds.add(field.id);
    });
  });

export type PublicFormFieldType = (typeof PUBLIC_FORM_FIELD_TYPES)[number];
export type PublicFormConditionOperator =
  (typeof PUBLIC_FORM_CONDITION_OPERATORS)[number];
export type PublicFormCondition = z.infer<typeof publicFormConditionSchema>;
export type PublicFormField = z.infer<typeof publicFormFieldSchema>;
export type PublicFormTheme = z.infer<typeof publicFormThemeSchema>;
export type PublicFormSettings = z.infer<typeof publicFormSettingsSchema>;
export type PublicFormDefinition = z.infer<typeof publicFormDefinitionSchema>;
export type PublicFormDefinitionInput = z.input<
  typeof publicFormDefinitionSchema
>;

// Answers keyed by field id. Multi-select answers are arrays; files are
// handled outside the answer map.
export type PublicFormAnswers = Record<string, string | string[] | boolean>;
