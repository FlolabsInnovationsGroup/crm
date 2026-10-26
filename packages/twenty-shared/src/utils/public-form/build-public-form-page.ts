import { escapePublicFormHtml as escapeHtml } from './escape-public-form-html';
import {
  PUBLIC_FORM_HONEYPOT_FIELD,
  PUBLIC_FORM_MAX_FILE_SIZE_MB,
} from './public-form-constants';
import {
  PUBLIC_FORM_GOOGLE_FONTS,
  type PublicFormDefinition,
  type PublicFormField,
} from './public-form-definition-schema';
import {
  PUBLIC_FORM_PAGE_MESSAGES,
  type PublicFormPageMessages,
} from './public-form-page-messages';
import { PUBLIC_FORM_PAGE_SCRIPT } from './public-form-page-script';

const RADIO_OPTION_LIMIT = 6;

// JSON inside <script> must not be able to close the tag.
const toScriptJson = (value: unknown) =>
  JSON.stringify(value).replace(/</g, '\\u003c');

const sanitizeFontFamily = (fontFamily: string) =>
  fontFamily.replace(/[^a-zA-Z0-9 ,'"-]/g, '') || 'system-ui, sans-serif';

// A stray "</style>" in custom CSS would otherwise end the style element.
const sanitizeCustomCss = (css: string) => css.replace(/</g, '\\3c ');

const getGoogleFontName = (fontFamily: string) => {
  const firstFamily = fontFamily.split(',')[0]?.trim().replace(/['"]/g, '');

  return PUBLIC_FORM_GOOGLE_FONTS.find((font) => font === firstFamily);
};

const isSafeImageUrl = (url: string | undefined): url is string =>
  typeof url === 'string' && /^https:\/\//i.test(url);

const PIPED_TOKEN_PATTERN = /\{\{\s*[a-zA-Z][a-zA-Z0-9_-]*\s*\}\}/g;

// Texts with `{{fieldId}}` are re-rendered by the page script as answers change.
const renderText = (text: string) =>
  text.includes('{{')
    ? `<span data-template="${escapeHtml(text)}">${escapeHtml(text.replace(PIPED_TOKEN_PATTERN, ''))}</span>`
    : escapeHtml(text);

const hasConditions = (
  groups: PublicFormField['requiredWhenGroups'],
): boolean => (groups ?? []).some((group) => group.conditions.length > 0);

const renderRequiredMark = (field: PublicFormField) => {
  if (field.required) {
    return '<span class="ff-required" aria-hidden="true"> *</span>';
  }

  return hasConditions(field.requiredWhenGroups)
    ? '<span class="ff-required" aria-hidden="true" data-required-when hidden> *</span>'
    : '';
};

const renderLabel = (field: PublicFormField, inputId: string) =>
  `<label class="ff-label" for="${inputId}">${renderText(field.label)}${renderRequiredMark(field)}</label>`;

const renderDescription = (field: PublicFormField) =>
  field.description
    ? `<p class="ff-description" id="${field.id}-description">${renderText(field.description)}</p>`
    : '';

const describedBy = (field: PublicFormField) =>
  field.description
    ? ` aria-describedby="${field.id}-description ${field.id}-error"`
    : ` aria-describedby="${field.id}-error"`;

const INPUT_TYPE_BY_FIELD_TYPE: Partial<
  Record<PublicFormField['type'], string>
> = {
  shortText: 'text',
  email: 'email',
  phone: 'tel',
  url: 'url',
  number: 'number',
  date: 'date',
};

const AUTOCOMPLETE_BY_MAP_TO: Record<string, string> = {
  'name.firstName': 'given-name',
  'name.lastName': 'family-name',
  'emails.primaryEmail': 'email',
  'phones.primaryPhoneNumber': 'tel',
};

const renderControl = (
  field: PublicFormField,
  inputId: string,
  messages: PublicFormPageMessages,
): string => {
  const name = escapeHtml(field.id);
  const placeholder = field.placeholder
    ? ` placeholder="${escapeHtml(field.placeholder)}"`
    : '';
  const required = field.required ? ' aria-required="true"' : '';
  const options = field.options ?? [];

  switch (field.type) {
    case 'longText':
      return `<textarea class="ff-input ff-textarea" id="${inputId}" name="${name}" rows="4"${placeholder}${required}${describedBy(field)}></textarea>`;
    case 'select':
      if (options.length > RADIO_OPTION_LIMIT) {
        return `<select class="ff-input ff-select" id="${inputId}" name="${name}"${required}${describedBy(field)}><option value="">${escapeHtml(field.placeholder ?? messages.selectPlaceholder)}</option>${options
          .map(
            (option) =>
              `<option value="${escapeHtml(option.value)}">${escapeHtml(option.label)}</option>`,
          )
          .join('')}</select>`;
      }

      return `<div class="ff-choices" role="radiogroup" id="${inputId}"${describedBy(field)}>${options
        .map(
          (option, index) =>
            `<label class="ff-choice"><input type="radio" name="${name}" value="${escapeHtml(option.value)}" id="${inputId}-${index}" /><span>${escapeHtml(option.label)}</span></label>`,
        )
        .join('')}</div>`;
    case 'multiSelect':
      return `<div class="ff-choices" role="group" id="${inputId}"${describedBy(field)}>${options
        .map(
          (option, index) =>
            `<label class="ff-choice"><input type="checkbox" name="${name}" value="${escapeHtml(option.value)}" id="${inputId}-${index}" /><span>${escapeHtml(option.label)}</span></label>`,
        )
        .join('')}</div>`;
    case 'file': {
      const accept = (field.acceptedFileExtensions ?? [])
        .map((extension) => `.${extension.replace(/^\./, '')}`)
        .join(',');

      // A styled label replaces the native button so its text follows the
      // form's language instead of the browser's.
      return `<div class="ff-file-picker"><input class="ff-file-input" type="file" id="${inputId}" name="${name}"${
        accept ? ` accept="${escapeHtml(accept)}"` : ''
      }${required}${describedBy(field)} /><label class="ff-file-button" for="${inputId}">${escapeHtml(messages.chooseFile)}</label><span class="ff-file-name" data-empty="${escapeHtml(messages.noFileChosen)}">${escapeHtml(messages.noFileChosen)}</span></div>`;
    }
    default: {
      const inputType = INPUT_TYPE_BY_FIELD_TYPE[field.type] ?? 'text';
      const autocomplete = AUTOCOMPLETE_BY_MAP_TO[field.mapTo ?? ''];

      return `<input class="ff-input" type="${inputType}" id="${inputId}" name="${name}"${placeholder}${required}${
        autocomplete ? ` autocomplete="${autocomplete}"` : ''
      }${field.type === 'number' ? ' inputmode="decimal" step="any"' : ''}${describedBy(field)} />`;
    }
  }
};

const renderField = (
  field: PublicFormField,
  messages: PublicFormPageMessages,
) => {
  const inputId = `ff-${escapeHtml(field.id)}`;
  const fieldAttributes = `data-field-id="${escapeHtml(field.id)}"`;
  const widthClass = field.width === 'half' ? 'ff-half' : 'ff-full';

  switch (field.type) {
    case 'hidden':
      return `<div class="ff-field" ${fieldAttributes} hidden><input type="hidden" name="${escapeHtml(field.id)}" /></div>`;
    case 'heading':
      return `<div class="ff-field ff-full" ${fieldAttributes}><h2 class="ff-heading">${renderText(field.label)}</h2>${
        field.description
          ? `<p class="ff-paragraph">${renderText(field.description)}</p>`
          : ''
      }</div>`;
    case 'pageBreak':
      return `<div class="ff-field ff-full ff-step-header" ${fieldAttributes}>${
        field.label
          ? `<h2 class="ff-heading">${renderText(field.label)}</h2>`
          : ''
      }${
        field.description
          ? `<p class="ff-paragraph">${renderText(field.description)}</p>`
          : ''
      }</div>`;
    case 'paragraph':
      return `<div class="ff-field ff-full" ${fieldAttributes}><p class="ff-paragraph">${renderText(field.description ?? field.label)}</p></div>`;
    case 'checkbox':
      return `<div class="ff-field ${widthClass}" ${fieldAttributes}><label class="ff-choice ff-consent"><input type="checkbox" id="${inputId}" name="${escapeHtml(field.id)}" value="true"${
        field.required ? ' aria-required="true"' : ''
      }${describedBy(field)} /><span>${renderText(field.label)}${renderRequiredMark(field)}</span></label>${renderDescription(field)}<p class="ff-error" id="${escapeHtml(field.id)}-error" aria-live="polite"></p></div>`;
    default:
      return `<div class="ff-field ${widthClass}" ${fieldAttributes}>${renderLabel(field, inputId)}${renderDescription(field)}${renderControl(field, inputId, messages)}<p class="ff-error" id="${escapeHtml(field.id)}-error" aria-live="polite"></p></div>`;
  }
};

// Page breaks split the form into steps; the first step holds the fields
// before the first page break.
const renderSteps = (
  fields: PublicFormField[],
  messages: PublicFormPageMessages,
) => {
  const steps: { pageBreakId: string; fields: PublicFormField[] }[] = [
    { pageBreakId: '', fields: [] },
  ];

  for (const field of fields) {
    if (field.type === 'pageBreak') {
      steps.push({ pageBreakId: field.id, fields: [] });
    }

    steps[steps.length - 1]?.fields.push(field);
  }

  return steps
    .map(
      (step, index) =>
        `<div class="ff-step" data-step-field-id="${escapeHtml(step.pageBreakId)}"${
          index === 0 ? '' : ' hidden'
        }><div class="ff-grid">${step.fields
          .map((field) => renderField(field, messages))
          .join('\n')}</div></div>`,
    )
    .join('\n');
};

const buildStyle = (definition: PublicFormDefinition, isEmbedded: boolean) => {
  const { theme } = definition;

  return `:root{--ff-primary:${theme.primaryColor};--ff-background:${theme.backgroundColor};--ff-text:${theme.textColor};--ff-button-text:${theme.buttonTextColor};--ff-input-background:${theme.inputBackgroundColor};--ff-border:${theme.borderColor};--ff-radius:${theme.borderRadiusPx}px;--ff-font:${sanitizeFontFamily(theme.fontFamily)};--ff-danger:#c62828}
*{box-sizing:border-box}
html,body{margin:0}
body{background:${isEmbedded ? 'transparent' : 'var(--ff-background)'};color:var(--ff-text);font-family:var(--ff-font);font-size:16px;line-height:1.5;-webkit-font-smoothing:antialiased}
.ff-page{max-width:680px;margin:0 auto;padding:${isEmbedded ? '8px 4px' : '48px 16px'}}
.ff-card{background:var(--ff-background);${isEmbedded ? '' : 'border:1px solid color-mix(in srgb,var(--ff-text) 10%,transparent);box-shadow:0 1px 2px rgba(0,0,0,.04),0 8px 24px rgba(0,0,0,.04);'}border-radius:calc(var(--ff-radius) * 2);padding:${isEmbedded ? '24px' : '40px'}}
.ff-logo{display:block;max-height:56px;max-width:200px;margin-bottom:24px}
.ff-title{font-size:28px;line-height:1.2;font-weight:700;margin:0 0 8px;letter-spacing:-.01em}
.ff-intro{margin:0 0 28px;color:color-mix(in srgb,var(--ff-text) 70%,transparent);white-space:pre-line}
.ff-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px 16px}
.ff-full{grid-column:1/-1}
.ff-field[hidden]{display:none}
.ff-label{display:block;font-weight:600;font-size:15px;margin-bottom:6px}
.ff-required{color:var(--ff-danger)}
.ff-description{margin:-2px 0 8px;font-size:14px;color:color-mix(in srgb,var(--ff-text) 65%,transparent);white-space:pre-line}
.ff-input{display:block;width:100%;min-height:46px;padding:10px 14px;font:inherit;color:inherit;background:var(--ff-input-background);border:1px solid var(--ff-border);border-radius:var(--ff-radius);transition:border-color .15s,box-shadow .15s;-webkit-appearance:none;appearance:none}
.ff-input::placeholder{color:color-mix(in srgb,var(--ff-text) 40%,transparent)}
.ff-textarea{min-height:110px;resize:vertical}
.ff-select{background-image:linear-gradient(45deg,transparent 50%,currentColor 50%),linear-gradient(135deg,currentColor 50%,transparent 50%);background-position:calc(100% - 20px) 50%,calc(100% - 15px) 50%;background-size:5px 5px;background-repeat:no-repeat;padding-inline-end:40px}
[dir=rtl] .ff-select{background-position:20px 50%,15px 50%}
.ff-file-picker{position:relative;display:flex;align-items:center;gap:12px;min-height:46px;padding:6px;background:var(--ff-input-background);border:1px dashed var(--ff-border);border-radius:var(--ff-radius)}
.ff-file-input{position:absolute;inset:0;width:100%;height:100%;opacity:0;cursor:pointer}
.ff-file-button{flex:none;padding:7px 14px;border-radius:calc(var(--ff-radius) * .75);background:color-mix(in srgb,var(--ff-primary) 10%,transparent);color:var(--ff-primary);font-weight:600;font-size:14px;pointer-events:none}
.ff-file-name{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:14px;color:color-mix(in srgb,var(--ff-text) 65%,transparent)}
.ff-file-picker:focus-within{border-color:var(--ff-primary);box-shadow:0 0 0 3px color-mix(in srgb,var(--ff-primary) 22%,transparent)}
.ff-invalid .ff-file-picker{border-color:var(--ff-danger)}
.ff-input:focus,.ff-choice:focus-within{outline:none;border-color:var(--ff-primary);box-shadow:0 0 0 3px color-mix(in srgb,var(--ff-primary) 22%,transparent)}
.ff-choices{display:grid;gap:8px}
.ff-choice{display:flex;align-items:flex-start;gap:10px;padding:11px 14px;border:1px solid var(--ff-border);border-radius:var(--ff-radius);background:var(--ff-input-background);cursor:pointer;transition:border-color .15s,background .15s}
.ff-choice:hover{border-color:color-mix(in srgb,var(--ff-primary) 50%,var(--ff-border))}
.ff-choice:has(input:checked){border-color:var(--ff-primary);background:color-mix(in srgb,var(--ff-primary) 6%,var(--ff-input-background))}
.ff-choice input{accent-color:var(--ff-primary);width:18px;height:18px;margin:3px 0 0;flex:none}
.ff-consent{border:0;padding:0;background:transparent}
.ff-consent:has(input:checked){background:transparent}
.ff-heading{font-size:19px;font-weight:700;margin:12px 0 0}
.ff-paragraph{margin:4px 0 0;color:color-mix(in srgb,var(--ff-text) 75%,transparent);white-space:pre-line}
.ff-error{margin:6px 0 0;font-size:13px;color:var(--ff-danger);min-height:0}
.ff-error:empty{display:none}
.ff-invalid .ff-input,.ff-invalid .ff-choice{border-color:var(--ff-danger)}
.ff-actions{margin-top:28px;display:flex;flex-direction:column;align-items:flex-start;gap:12px}
.ff-buttons{display:flex;flex-wrap:wrap;gap:12px;align-items:center}
.ff-back{min-height:48px;padding:12px 22px;font:inherit;font-weight:600;color:var(--ff-text);background:transparent;border:1px solid var(--ff-border);border-radius:var(--ff-radius);cursor:pointer}
.ff-back:hover{border-color:var(--ff-text)}
.ff-progress{margin:0 0 20px;font-size:13px;font-weight:600;letter-spacing:.02em;color:color-mix(in srgb,var(--ff-text) 60%,transparent)}
.ff-step[hidden],.ff-back[hidden],.ff-submit[hidden]{display:none}
.ff-submit{min-width:180px;min-height:48px;padding:12px 28px;font:inherit;font-weight:600;color:var(--ff-button-text);background:var(--ff-primary);border:0;border-radius:var(--ff-radius);cursor:pointer;transition:opacity .15s,transform .05s}
.ff-submit:hover{opacity:.92}
.ff-submit:active{transform:translateY(1px)}
.ff-submit:disabled{opacity:.6;cursor:progress}
.ff-submit:focus-visible{outline:3px solid color-mix(in srgb,var(--ff-primary) 35%,transparent);outline-offset:2px}
.ff-form-error{margin:0;color:var(--ff-danger);font-size:14px}
.ff-success{text-align:center;padding:32px 8px;outline:none}
.ff-success-icon{width:56px;height:56px;border-radius:50%;margin:0 auto 16px;display:grid;place-items:center;background:color-mix(in srgb,var(--ff-primary) 12%,transparent);color:var(--ff-primary)}
.ff-success p{margin:0;font-size:18px;white-space:pre-line}
.ff-honeypot{position:absolute;left:-10000px;top:auto;width:1px;height:1px;overflow:hidden}
@media (max-width:560px){.ff-grid{grid-template-columns:1fr}.ff-card{padding:${isEmbedded ? '16px' : '24px 18px'}}.ff-page{padding:${isEmbedded ? '4px 0' : '20px 12px'}}.ff-title{font-size:24px}.ff-buttons{width:100%}.ff-back,.ff-submit{flex:1 1 auto}}
${theme.customCss ? sanitizeCustomCss(theme.customCss) : ''}`;
};

export const buildPublicFormPage = ({
  formId,
  definition,
  submitUrl,
  isEmbedded,
  nonce,
  isPreview = false,
}: {
  formId: string;
  definition: PublicFormDefinition;
  submitUrl: string;
  isEmbedded: boolean;
  nonce: string;
  // Builder preview: validates and shows the success state without sending.
  isPreview?: boolean;
}): string => {
  const { theme, settings } = definition;
  const messages = PUBLIC_FORM_PAGE_MESSAGES[settings.language];
  const googleFont = getGoogleFontName(theme.fontFamily);
  const fontLinks = googleFont
    ? `<link rel="preconnect" href="https://fonts.googleapis.com" /><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin /><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=${encodeURIComponent(googleFont)}:wght@400;500;600;700&display=swap" />`
    : '';

  const config = {
    formId,
    submitUrl,
    isPreview,
    submitLabel: theme.submitButtonLabel,
    honeypotField: PUBLIC_FORM_HONEYPOT_FIELD,
    maxFileSizeMb: PUBLIC_FORM_MAX_FILE_SIZE_MB,
    messages,
    englishMessages: PUBLIC_FORM_PAGE_MESSAGES.en,
  };

  return `<!doctype html>
<html lang="${settings.language}" dir="${theme.direction}">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex" />
<title>${escapeHtml(definition.title)}</title>
${fontLinks}
<style>${buildStyle(definition, isEmbedded)}</style>
</head>
<body>
<main class="ff-page">
<div class="ff-card">
${isSafeImageUrl(theme.logoUrl) ? `<img class="ff-logo" src="${escapeHtml(theme.logoUrl)}" alt="" />` : ''}
<h1 class="ff-title">${escapeHtml(definition.title)}</h1>
${definition.description ? `<p class="ff-intro">${escapeHtml(definition.description)}</p>` : ''}
<form id="ff-form" novalidate>
<p class="ff-progress" id="ff-progress" hidden></p>
${renderSteps(definition.fields, messages)}
<div class="ff-honeypot" aria-hidden="true"><label>Leave this empty<input type="text" name="${PUBLIC_FORM_HONEYPOT_FIELD}" tabindex="-1" autocomplete="off" /></label></div>
<div class="ff-actions">
<div class="ff-buttons">
<button class="ff-back" id="ff-back" type="button" hidden>${escapeHtml(messages.back)}</button>
<button class="ff-submit" id="ff-next" type="button" hidden>${escapeHtml(messages.next)}</button>
<button class="ff-submit" id="ff-submit" type="submit">${escapeHtml(theme.submitButtonLabel)}</button>
</div>
<p class="ff-form-error" id="ff-form-error" role="alert" hidden></p>
</div>
</form>
<div class="ff-success" id="ff-success" tabindex="-1" role="status" hidden>
<div class="ff-success-icon" aria-hidden="true"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5L20 7"/></svg></div>
<p id="ff-success-message">${escapeHtml(settings.successMessage)}</p>
</div>
</div>
</main>
<script type="application/json" id="ff-definition">${toScriptJson(definition)}</script>
<script type="application/json" id="ff-config">${toScriptJson(config)}</script>
<script nonce="${nonce}">${PUBLIC_FORM_PAGE_SCRIPT}</script>
</body>
</html>`;
};

export const buildPublicFormContentSecurityPolicy = (nonce: string) =>
  [
    "default-src 'none'",
    `script-src 'nonce-${nonce}'`,
    "style-src 'unsafe-inline' https://fonts.googleapis.com",
    'font-src https://fonts.gstatic.com data:',
    'img-src https: data:',
    "connect-src 'self'",
    "form-action 'self'",
    "base-uri 'none'",
    'frame-ancestors *',
  ].join('; ');
