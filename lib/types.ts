export const LEAD_STATUSES = [
  "new",
  "contacted",
  "qualified",
  "won",
  "lost",
] as const;

export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const LEAD_SOURCES = [
  "website",
  "google-ads",
  "facebook-ads",
  "linkedin",
  "referral",
  "webinar",
] as const;

export type LeadSource = (typeof LEAD_SOURCES)[number];

export type Lead = {
  id: string;
  workspaceId: string;
  firstName: string;
  lastName: string;
  fullName: string;
  email: string;
  phone: string;
  company: string;
  jobTitle: string;
  website: string;
  city: string;
  country: string;
  source: LeadSource;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  budget: number | null;
  message: string;
  status: LeadStatus;
  score: number;
  assignedTo: string | null;
  tags: string[];
  consentMarketing: boolean;
  ipAddress: string;
  userAgent: string;
  rawPayload: Record<string, unknown>;
  internalNotes: string;
  createdAt: string;
  updatedAt: string;
};

export type NewLead = Omit<
  Lead,
  | "id"
  | "fullName"
  | "status"
  | "score"
  | "assignedTo"
  | "tags"
  | "internalNotes"
  | "createdAt"
  | "updatedAt"
>;

export type User = {
  id: string;
  name: string;
  email: string;
  role: "owner" | "manager";
  workspaceSlug: string;
};

export type Workspace = {
  id: string;
  slug: string;
  name: string;
  plan: "starter" | "growth";
  timezone: string;
};

export type LeadStats = {
  total: number;
  byStatus: Record<LeadStatus, number>;
  last7Days: number;
  conversionRate: number;
  averageBudget: number;
};

export type SourceCount = {
  source: LeadSource;
  count: number;
};

export type AuditEntry = {
  action: string;
  entityId: string;
  at: string;
};

export const QUOTE_STATUSES = ["queued", "ready", "failed"] as const;

export type QuoteStatus = (typeof QUOTE_STATUSES)[number];

export type QuoteRequest = {
  id: string;
  company: string;
  email: string;
  taskDescription: string;
  budget: number | null;
  status: QuoteStatus;
  idempotencyKey: string;
  correlationId: string;
  documentUrl: string | null;
  errorCode: string | null;
  createdAt: string;
  updatedAt: string;
};

export type NewQuoteRequest = {
  company: string;
  email: string;
  taskDescription: string;
  budget: number | null;
  idempotencyKey: string;
  correlationId: string;
};
