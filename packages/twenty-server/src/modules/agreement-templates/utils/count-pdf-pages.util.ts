// pdfkit, under @react-pdf/renderer, writes one uncompressed page tree:
// << /Type /Pages /Count n /Kids [...] >>.
export const countPdfPages = (pdf: Buffer): number => {
  const pageTrees = [
    ...pdf.toString('latin1').matchAll(/<<([^<>]*\/Type\s*\/Pages\b[^<>]*)>>/g),
  ];
  const counts = pageTrees.flatMap(([, dictionary]) => {
    const count = /\/Count\s+(\d+)/.exec(dictionary);

    return count ? [Number(count[1])] : [];
  });

  if (counts.length === 0) {
    throw new Error('Could not read the page count of the agreement PDF');
  }

  return Math.max(...counts);
};
