import { type ObjectRecord } from '@/object-record/types/ObjectRecord';

export type FormBuilderRecord = ObjectRecord & {
  name: string | null;
  status: string | null;
  definition: unknown;
};
