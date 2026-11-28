// Storage can throw when the browser blocks site data.
export const readTeamInboxPreference = <TValue extends string>(
  storageKey: string,
  allowedValues: TValue[],
  fallback: TValue,
): TValue => {
  try {
    const storedValue = window.localStorage.getItem(storageKey);

    return allowedValues.find((value) => value === storedValue) ?? fallback;
  } catch {
    return fallback;
  }
};
