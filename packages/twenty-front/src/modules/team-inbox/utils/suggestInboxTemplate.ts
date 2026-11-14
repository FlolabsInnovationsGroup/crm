import { isDefined } from 'twenty-shared/utils';

import { TEAM_INBOX_NOT_INTERESTED_TEMPLATE_NAME } from '@/team-inbox/constants/TeamInboxNotInterestedTemplateName';
import { TEAM_INBOX_TEMPLATE_SUGGESTIONS } from '@/team-inbox/constants/TeamInboxTemplateSuggestions';

type NamedTemplate = { id: string; name: string | null };

const findByName = <TTemplate extends NamedTemplate>(
  templates: TTemplate[],
  templateName: string,
) =>
  templates.find(
    (template) =>
      template.name?.trim().toLowerCase() === templateName.toLowerCase(),
  );

// A starting point for the reply, not a decision: the person still reads it.
export const suggestInboxTemplate = <TTemplate extends NamedTemplate>({
  reason,
  replyText,
  templates,
}: {
  reason: string;
  replyText: string;
  templates: TTemplate[];
}): TTemplate | null => {
  for (const suggestion of TEAM_INBOX_TEMPLATE_SUGGESTIONS) {
    if (!suggestion.pattern.test(replyText)) {
      continue;
    }

    const template = findByName(templates, suggestion.templateName);

    if (isDefined(template)) {
      return template;
    }
  }

  if (reason === 'not interested') {
    return (
      findByName(templates, TEAM_INBOX_NOT_INTERESTED_TEMPLATE_NAME) ?? null
    );
  }

  return null;
};
