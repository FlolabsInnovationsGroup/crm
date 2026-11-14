import { CoreObjectNameSingular } from 'twenty-shared/types';

import { AttachmentList } from '@/activities/files/components/AttachmentList';
import { useAttachments } from '@/activities/files/hooks/useAttachments';

type TeamInboxContactAttachmentsProps = {
  personId: string;
};

export const TeamInboxContactAttachments = ({
  personId,
}: TeamInboxContactAttachmentsProps) => {
  const targetableObject = {
    id: personId,
    targetObjectNameSingular: CoreObjectNameSingular.Person,
  };
  const { attachments } = useAttachments(targetableObject);

  if (attachments.length === 0) {
    return null;
  }

  return (
    <AttachmentList
      targetableObject={targetableObject}
      attachments={attachments}
    />
  );
};
