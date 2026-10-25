// Custom objects created per workspace by the FloLabs setup script; the
// feature stays inert in workspaces that do not have them.
export const PUBLIC_FORM_OBJECT_NAME = 'crmForm';
export const PUBLIC_FORM_SUBMISSION_OBJECT_NAME = 'formSubmission';
export const PUBLIC_FORM_PUBLISHED_STATUS = 'PUBLISHED';

export const PUBLIC_FORM_RATE_LIMIT = { maxRequests: 20, windowMs: 60_000 };
export const PUBLIC_FORM_MAX_FILE_SIZE_MB = 10;
export const PUBLIC_FORM_MAX_FILES = 5;

// Bots fill every input; humans never see this one.
export const PUBLIC_FORM_HONEYPOT_FIELD = 'website_url_confirm';
