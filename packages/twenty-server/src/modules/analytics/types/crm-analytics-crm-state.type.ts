export type CrmAnalyticsFieldStatus = 'OK' | 'MISSING' | 'WRONG_TYPE';

export type CrmAnalyticsFieldOption = { value: string; label: string };

export type CrmAnalyticsCrmState = {
  workspaceId: string;
  stage: {
    status: CrmAnalyticsFieldStatus;
    isAuditLogged: boolean;
    options: CrmAnalyticsFieldOption[];
  };
  positionsAppliedFor: {
    status: CrmAnalyticsFieldStatus;
    options: CrmAnalyticsFieldOption[];
  };
  applicantSource: {
    status: CrmAnalyticsFieldStatus;
    options: CrmAnalyticsFieldOption[];
  };
  // Both objects exist, with formSubmission.submittedAt, .form, .person and crmForm.name.
  hasFormSubmissionObject: boolean;
  hasApplicationObject: boolean;
};

// Cast DATE columns to ::text in shared SQL: the page pool returns them as
// strings, the job connection as Date objects.
export type CrmAnalyticsSqlRunner = (
  sql: string,
  parameters: unknown[],
) => Promise<Record<string, unknown>[]>;
