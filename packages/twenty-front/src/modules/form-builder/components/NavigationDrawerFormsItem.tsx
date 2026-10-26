import { t } from '@lingui/core/macro';
import { useLocation } from 'react-router-dom';
import { AppPath } from 'twenty-shared/types';
import { getAppPath } from 'twenty-shared/utils';
import { IconForms } from 'twenty-ui/icon';

import { NavigationDrawerItem } from '@/ui/navigation/navigation-drawer/components/NavigationDrawerItem';

const FORM_BUILDER_ROOT_PATH = getAppPath(AppPath.FormBuilder, {
  formId: null,
});

export const NavigationDrawerFormsItem = () => {
  const location = useLocation();

  return (
    <NavigationDrawerItem
      label={t`Forms`}
      Icon={IconForms}
      to={FORM_BUILDER_ROOT_PATH}
      active={location.pathname.startsWith(FORM_BUILDER_ROOT_PATH)}
    />
  );
};
