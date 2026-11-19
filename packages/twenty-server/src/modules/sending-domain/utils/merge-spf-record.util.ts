// Adds mechanisms to an existing SPF record before its final "all", keeping everything else.
export const mergeSpfRecord = (
  existingValue: string,
  mechanisms: string[],
): string => {
  const terms = existingValue.trim().split(/\s+/);
  const missingMechanisms = mechanisms.filter(
    (mechanism) => !terms.includes(mechanism),
  );
  const allIndex = terms.findIndex((term) => /^[-~?+]?all$/.test(term));

  return allIndex === -1
    ? [...terms, ...missingMechanisms].join(' ')
    : [
        ...terms.slice(0, allIndex),
        ...missingMechanisms,
        ...terms.slice(allIndex),
      ].join(' ');
};
