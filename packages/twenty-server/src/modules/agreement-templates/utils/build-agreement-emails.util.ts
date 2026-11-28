import { isNonEmptyString } from '@sniptt/guards';

import { escapeHtml } from 'src/engine/core-modules/emailing-domain/utils/escape-html.util';

const button = (url: string, label: string) =>
  `<p><a href="${escapeHtml(url)}" style="display:inline-block;padding:10px 18px;background:#1961ed;color:#ffffff;text-decoration:none;border-radius:6px">${escapeHtml(label)}</a></p>` +
  `<p style="color:#666666;font-size:12px">Or open this link: ${escapeHtml(url)}</p>`;

const list = (documentTitles: string[]) =>
  `<ul>${documentTitles.map((title) => `<li>${escapeHtml(title)}</li>`).join('')}</ul>`;

export const buildApplicantAgreementEmail = ({
  firstName,
  documentTitles,
  signingUrl,
}: {
  firstName: string | null;
  documentTitles: string[];
  signingUrl: string;
}): { subject: string; html: string } => ({
  subject:
    documentTitles.length === 1
      ? `Please sign: ${documentTitles[0]}`
      : 'Please sign your FloLabs documents',
  html: [
    `<p>${isNonEmptyString(firstName) ? `Hi ${escapeHtml(firstName)},` : 'Hello,'}</p>`,
    `<p>Please review and sign ${documentTitles.length === 1 ? 'this document' : 'these documents'}:</p>`,
    list(documentTitles),
    button(signingUrl, 'Review and sign'),
    '<p>Once you sign, FloLabs countersigns and you receive the signed copy.</p>',
    '<p>The link is personal; please do not forward it. If you have questions, just reply to this email.</p>',
    '<p>FloLabs Innovations Group</p>',
  ].join(''),
});

export const buildCountersignerAgreementEmail = ({
  applicantName,
  documentTitles,
  signingUrl,
  personUrl,
}: {
  applicantName: string;
  documentTitles: string[];
  signingUrl: string;
  personUrl: string;
}): { subject: string; html: string } => ({
  subject: `Countersign: ${applicantName} signed ${documentTitles.length === 1 ? documentTitles[0] : 'their documents'}`,
  html: [
    `<p>${escapeHtml(applicantName)} has signed:</p>`,
    list(documentTitles),
    button(signingUrl, 'Countersign'),
    `<p><a href="${escapeHtml(personUrl)}">Open ${escapeHtml(applicantName)} in the CRM</a></p>`,
  ].join(''),
});

export const buildApplicantSignedCopyEmail = ({
  firstName,
  documentTitles,
}: {
  firstName: string | null;
  documentTitles: string[];
}): { subject: string; html: string } => ({
  subject:
    documentTitles.length === 1
      ? `Signed copy: ${documentTitles[0]}`
      : 'Your signed FloLabs documents',
  html: [
    `<p>${isNonEmptyString(firstName) ? `Hi ${escapeHtml(firstName)},` : 'Hello,'}</p>`,
    '<p>Everyone has signed. Your copies are attached, with the signing certificate:</p>',
    list(documentTitles),
    '<p>FloLabs Innovations Group</p>',
  ].join(''),
});
