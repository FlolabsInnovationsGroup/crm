export const getUniqueLogicId = (prefix: string, takenIds: string[]) => {
  let index = 1;

  while (takenIds.includes(`${prefix}${index}`)) {
    index++;
  }

  return `${prefix}${index}`;
};
