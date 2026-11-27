// pdfkit, under @react-pdf/renderer, writes one page tree whose /Count is
// the total, uncompressed.
export const countPdfPages = (pdf: Buffer): number => {
  const counts = [...pdf.toString('latin1').matchAll(/\/Count\s+(\d+)/g)].map(
    (match) => Number(match[1]),
  );

  if (counts.length === 0) {
    throw new Error('Could not read the page count of the agreement PDF');
  }

  return Math.max(...counts);
};
