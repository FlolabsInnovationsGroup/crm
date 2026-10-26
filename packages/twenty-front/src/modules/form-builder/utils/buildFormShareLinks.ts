import { ApiPath } from 'twenty-shared/types';

export type FormShareLinks = {
  pageUrl: string;
  embedScript: string;
  iframe: string;
};

export const buildFormShareLinks = ({
  serverBaseUrl,
  workspaceId,
  formId,
  title,
}: {
  serverBaseUrl: string;
  workspaceId: string;
  formId: string;
  title: string;
}): FormShareLinks => {
  const pageUrl = `${serverBaseUrl.replace(/\/$/, '')}/${ApiPath.Forms}/${workspaceId}/${formId}`;
  const safeTitle = title.replace(/"/g, '&quot;');

  return {
    pageUrl,
    embedScript: `<script src="${pageUrl}/embed.js" async></script>`,
    iframe: `<iframe src="${pageUrl}?embed=1" title="${safeTitle}" style="width:100%;min-height:720px;border:0" loading="lazy"></iframe>`,
  };
};
