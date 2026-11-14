// oxlint-disable lingui/no-unlocalized-strings -- Template names in the CRM data, not text.
// First match wins. Names are the HR team's templates in Email Templates;
// a rule whose template is missing or renamed is skipped.
export const TEAM_INBOX_TEMPLATE_SUGGESTIONS: {
  pattern: RegExp;
  templateName: string;
}[] = [
  {
    pattern:
      /another (offer|internship|position|job)|found (a|another|something)|accepted (an|another)/i,
    templateName: 'When they found something else work or internship',
  },
  {
    pattern: /\b(paid|unpaid|stipend|salary|compensat)/i,
    templateName: 'Paid or Unpaid',
  },
  {
    pattern: /\b(fees?|cost|tuition|scholarship|pay for)\b/i,
    templateName:
      'Template mentioning the fees (amount), scholarship and research position',
  },
  {
    pattern: /\b(remote|online|on-?site|in person|relocat)/i,
    templateName: 'is it remote',
  },
  {
    pattern: /\bcamera\b/i,
    templateName: 'No Camera for Group Meeting',
  },
  {
    pattern: /orientation|saturday|meeting|session/i,
    templateName: 'What is the orientation meeting about',
  },
  {
    pattern: /\b(how long|duration|hours|per week|weekly|months?)\b/i,
    templateName: 'DURATION OF INTERNSHIP AND WEEKLY COMMITMENT',
  },
  {
    pattern: /certificate/i,
    templateName: 'CERTIFICATE',
  },
  {
    pattern: /\b(reviews?|scam|legit|glassdoor|reddit)\b/i,
    templateName: 'Saw reviews about FloLabs online',
  },
];
