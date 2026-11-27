import { t } from '@lingui/core/macro';
import { useLocation } from 'react-router-dom';
import { IconSignature } from 'twenty-ui/icon';

import { AGREEMENTS_PATH } from '@/agreements/constants/AgreementsPath';
import { useAreAgreementsSetUp } from '@/agreements/hooks/useAreAgreementsSetUp';
import { NavigationDrawerItem } from '@/ui/navigation/navigation-drawer/components/NavigationDrawerItem';

export const NavigationDrawerAgreementsItem = () => {
  const location = useLocation();
  const isSetUp = useAreAgreementsSetUp();

  if (!isSetUp) {
    return null;
  }

  return (
    <NavigationDrawerItem
      label={t`Agreements`}
      Icon={IconSignature}
      to={AGREEMENTS_PATH}
      active={location.pathname.startsWith(AGREEMENTS_PATH)}
    />
  );
};
