import { type TimelineActivityTypeSnapshot } from 'twenty-shared/timeline';

// Not a registered type: the timeline falls back to the snapshot stored on
// each row, so submissions show up without a metadata migration.
export const PUBLIC_FORM_TIMELINE_ACTIVITY_TYPE: TimelineActivityTypeSnapshot =
  {
    id: 'f1ab5f0e-0000-4000-8000-000000000001',
    universalIdentifier: 'f1ab5f0e-0000-4000-8000-000000000001',
    name: 'formSubmitted',
    label: 'received the form',
    action: 'linked',
    icon: 'IconForms',
    objectUniversalIdentifier: null,
    frontComponentUniversalIdentifier: null,
  };
