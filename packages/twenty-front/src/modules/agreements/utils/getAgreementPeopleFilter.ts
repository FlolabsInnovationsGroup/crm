// Matches a name or an email anywhere, as the search box suggests.
export const getAgreementPeopleFilter = (searchTerm: string) => {
  const pattern = `%${searchTerm.trim().replace(/[\\%_]/g, '\\$&')}%`;

  return {
    or: [
      { name: { firstName: { ilike: pattern } } },
      { name: { lastName: { ilike: pattern } } },
      { emails: { primaryEmail: { ilike: pattern } } },
    ],
  };
};
