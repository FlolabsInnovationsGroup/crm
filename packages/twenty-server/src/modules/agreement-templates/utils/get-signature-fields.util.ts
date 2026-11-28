import {
  AGREEMENT_PAGE_HEIGHT,
  AGREEMENT_PAGE_WIDTH,
  type AgreementSignatureBox,
  type AgreementSignerLayout,
} from 'src/modules/agreement-templates/constants/agreement-signing.constants';
import { type DocumensoSignatureField } from 'src/modules/agreement-templates/types/documenso-envelope.type';

const round = (value: number) => Math.round(value * 100) / 100;

const toField = (
  type: DocumensoSignatureField['type'],
  box: AgreementSignatureBox,
  identifier: number,
  page: number,
): DocumensoSignatureField => ({
  type,
  identifier,
  page,
  positionX: round((box.left / AGREEMENT_PAGE_WIDTH) * 100),
  positionY: round((box.top / AGREEMENT_PAGE_HEIGHT) * 100),
  width: round((box.width / AGREEMENT_PAGE_WIDTH) * 100),
  height: round((box.height / AGREEMENT_PAGE_HEIGHT) * 100),
});

// Documenso places fields in percent of the page; identifier is the index of
// the uploaded file.
export const getSignatureFields = ({
  layout,
  documents,
}: {
  layout: AgreementSignerLayout;
  documents: { signaturePage: number }[];
}): DocumensoSignatureField[] =>
  documents.flatMap(({ signaturePage }, identifier) => [
    toField('SIGNATURE', layout.signature, identifier, signaturePage),
    toField('NAME', layout.name, identifier, signaturePage),
    toField('DATE', layout.date, identifier, signaturePage),
  ]);
