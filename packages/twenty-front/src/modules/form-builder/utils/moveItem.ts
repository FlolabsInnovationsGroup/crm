export const moveItem = <TItem>(
  items: TItem[],
  index: number,
  direction: -1 | 1,
): TItem[] => {
  const targetIndex = index + direction;

  if (targetIndex < 0 || targetIndex >= items.length) {
    return items;
  }

  const reordered = [...items];

  [reordered[index], reordered[targetIndex]] = [
    reordered[targetIndex],
    reordered[index],
  ];

  return reordered;
};
