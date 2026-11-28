// Without storage the choice lasts until the page reloads.
export const writeTeamInboxPreference = (storageKey: string, value: string) => {
  try {
    window.localStorage.setItem(storageKey, value);
  } catch {
    return;
  }
};
