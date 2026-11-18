import { styled } from '@linaria/react';
import { useMutation } from '@apollo/client/react';
import { useLingui } from '@lingui/react/macro';
import { isNonEmptyString } from '@sniptt/guards';
import { useState } from 'react';
import { useToast } from 'twenty-ui/components/feedback';
import { IconPlus } from 'twenty-ui/icon';
import { Button } from 'twenty-ui/primitives/input';
import { themeCssVariables } from 'twenty-ui/theme';

import { getToastOptionsFromError } from '@/error-handler/utils/getToastOptionsFromError';
import { useApolloCoreClient } from '@/object-metadata/hooks/useApolloCoreClient';
import { ADD_SENDING_DOMAIN } from '@/settings/sending-domains/graphql/mutations/addSendingDomain';
import { SettingsTextInput } from '@/ui/input/components/SettingsTextInput';

// An example host name, the same in every language.
// oxlint-disable-next-line lingui/no-unlocalized-strings
const DOMAIN_PLACEHOLDER = 'news.example.com';

const StyledContainer = styled.div`
  display: flex;
  gap: ${themeCssVariables.spacing[2]};
`;

const StyledInputContainer = styled.div`
  flex: 1;
`;

type SettingsSendingDomainAddFormProps = {
  onAdded: () => void;
};

export const SettingsSendingDomainAddForm = ({
  onAdded,
}: SettingsSendingDomainAddFormProps) => {
  const { t } = useLingui();
  const { enqueueToast } = useToast();
  const apolloCoreClient = useApolloCoreClient();
  const [domain, setDomain] = useState('');
  const [addSendingDomain, { loading }] = useMutation(ADD_SENDING_DOMAIN, {
    client: apolloCoreClient,
  });

  const handleAdd = async () => {
    if (!isNonEmptyString(domain.trim()) || loading) {
      return;
    }

    try {
      await addSendingDomain({ variables: { domain: domain.trim() } });
      setDomain('');
      enqueueToast({
        status: 'success',
        children: t`Domain added. Its DNS records appear in a few seconds.`,
      });
      onAdded();
    } catch (error) {
      enqueueToast(getToastOptionsFromError({ error }));
    }
  };

  return (
    <StyledContainer>
      <StyledInputContainer>
        <SettingsTextInput
          instanceId="settings-sending-domain-input"
          placeholder={DOMAIN_PLACEHOLDER}
          value={domain}
          onChange={setDomain}
          onInputEnter={handleAdd}
          fullWidth
        />
      </StyledInputContainer>
      <Button
        startIcon={<IconPlus />}
        onClick={handleAdd}
        loading={loading}
        disabled={loading || !isNonEmptyString(domain.trim())}
      >{t`Add domain`}</Button>
    </StyledContainer>
  );
};
