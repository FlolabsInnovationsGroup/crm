import { useObjectMetadataItems } from '@/object-metadata/hooks/useObjectMetadataItems';

const AGREEMENT_OBJECT_NAMES = ['agreementTemplate', 'agreementRequest'];

// The objects come from setup-agreement-templates.mjs; queries on them fail
// in a workspace that never ran it.
export const useAreAgreementsSetUp = () => {
  const { objectMetadataItems } = useObjectMetadataItems();

  return AGREEMENT_OBJECT_NAMES.every((nameSingular) =>
    objectMetadataItems.some(
      (objectMetadataItem) =>
        objectMetadataItem.nameSingular === nameSingular &&
        objectMetadataItem.isActive,
    ),
  );
};
