import { AGREEMENT_SIGNER_LAYOUTS } from 'src/modules/agreement-templates/constants/agreement-signing.constants';
import { getSignatureFields } from 'src/modules/agreement-templates/utils/get-signature-fields.util';

describe('getSignatureFields', () => {
  it('puts a signature, name and date on the last page of every document', () => {
    const fields = getSignatureFields({
      layout: AGREEMENT_SIGNER_LAYOUTS.applicant,
      documents: [{ signaturePage: 3 }, { signaturePage: 2 }],
    });

    expect(
      fields.map(({ type, identifier, page }) => [type, identifier, page]),
    ).toEqual([
      ['SIGNATURE', 0, 3],
      ['NAME', 0, 3],
      ['DATE', 0, 3],
      ['SIGNATURE', 1, 2],
      ['NAME', 1, 2],
      ['DATE', 1, 2],
    ]);
  });

  it('gives positions in percent of an A4 page', () => {
    const [signature] = getSignatureFields({
      layout: AGREEMENT_SIGNER_LAYOUTS.applicant,
      documents: [{ signaturePage: 1 }],
    });

    expect(signature).toMatchObject({
      positionX: 9.41,
      positionY: 22.57,
      width: 40.32,
      height: 8.31,
    });
  });
});
