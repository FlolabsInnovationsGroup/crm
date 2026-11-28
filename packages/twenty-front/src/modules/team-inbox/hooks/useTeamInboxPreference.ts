import { useState } from 'react';

import { readTeamInboxPreference } from '@/team-inbox/utils/readTeamInboxPreference';
import { writeTeamInboxPreference } from '@/team-inbox/utils/writeTeamInboxPreference';

// Per viewer and browser, so each teammate keeps their own choice.
export const useTeamInboxPreference = <TValue extends string>(
  storageKey: string,
  allowedValues: TValue[],
  fallback: TValue,
) => {
  const [value, setValue] = useState<TValue>(() =>
    readTeamInboxPreference(storageKey, allowedValues, fallback),
  );

  const updateValue = (nextValue: TValue) => {
    setValue(nextValue);
    writeTeamInboxPreference(storageKey, nextValue);
  };

  return [value, updateValue] as const;
};
