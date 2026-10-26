import { type I18n } from '@lingui/core';
import { MainText } from 'src/components/MainText';
import { SubTitle } from 'src/components/SubTitle';

type WhatIsTwentyProps = {
  i18n: I18n;
};

export const WhatIsTwenty = ({ i18n }: WhatIsTwentyProps) => {
  return (
    <>
      <SubTitle value={i18n._('What is FloLabs CRM?')} />
      <MainText>
        {i18n._(
          "It's the CRM FloLabs Innovations Group uses to manage applicants, contacts and email.",
        )}
      </MainText>
    </>
  );
};
