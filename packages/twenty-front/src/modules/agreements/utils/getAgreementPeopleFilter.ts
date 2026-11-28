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
