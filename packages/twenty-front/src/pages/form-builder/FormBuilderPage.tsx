import { t } from '@lingui/core/macro';
import {
  PUBLIC_FORM_OBJECT_NAME,
  PUBLIC_FORM_SUBMISSION_OBJECT_NAME,
} from 'twenty-shared/utils';
import { IconForms } from 'twenty-ui/icon';
import { useTheme } from 'twenty-ui/theme';

import { FormBuilderContent } from '@/form-builder/components/FormBuilderContent';
import { FormBuilderSetupRequired } from '@/form-builder/components/FormBuilderSetupRequired';
import { useObjectMetadataItems } from '@/object-metadata/hooks/useObjectMetadataItems';
import { PageCardHeader } from '@/ui/layout/page/components/PageCardHeader';
import { PageCardLayout } from '@/ui/layout/page/components/PageCardLayout';
import { PageTitle } from '@/ui/utilities/page-title/components/PageTitle';

const REQUIRED_OBJECT_NAMES = [
  PUBLIC_FORM_OBJECT_NAME,
  PUBLIC_FORM_SUBMISSION_OBJECT_NAME,
];

export const FormBuilderPage = () => {
  const theme = useTheme();
  const { objectMetadataItems } = useObjectMetadataItems();

  const hasFormObjects = REQUIRED_OBJECT_NAMES.every((objectName) =>
    objectMetadataItems.some(
      (objectMetadataItem) =>
        objectMetadataItem.nameSingular === objectName &&
        objectMetadataItem.isActive,
    ),
  );

  return (
    <>
      <PageTitle title={t`Forms`} />
      <PageCardLayout
        header={
          <PageCardHeader
            icon={
              <IconForms
                size={theme.icon.size.md}
                stroke={theme.icon.stroke.sm}
              />
            }
            title={t`Forms`}
          />
        }
      >
        {hasFormObjects ? <FormBuilderContent /> : <FormBuilderSetupRequired />}
      </PageCardLayout>
    </>
  );
};
