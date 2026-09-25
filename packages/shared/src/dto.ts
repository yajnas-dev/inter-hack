import type { ApplicationStatus, EmploymentType, ErrorCode, JobStatus, MatchEngine, MatchVerdict, Role } from './enums';

/**
 * Response shapes exactly as the API sends them: ids are strings, dates are ISO-8601 strings.
 *
 * Every JSON response is wrapped in an envelope:
 *   success -> { success: true,  data, meta?, message? }
 *   failure -> { success: false, error: { code, message, details?, requestId? } }
 * Collections put paging information in `meta`.
 */

// ---- envelope ---------------------------------------------------------------------------------

export interface PageMeta {
  /** Present for page-number paging (absent when a cursor was used). */
  page?: number;
  limit: number;
  /** Total matching records; omitted on cursor pages where counting would cost a query. */
  total?: number;
  totalPages?: number;
  hasNextPage: boolean;
  /** Opaque keyset cursor for the next page, or null at the end (only on endpoints that support cursors). */
  nextCursor?: string | null;
}

export interface ApiSuccess<T, M = undefined> {
  success: true;
  data: T;
  meta?: M;
  message?: string;
}

export interface ErrorDetail {
  /** Where the bad value was: body, query, params, file. */
  location?: 'body' | 'query' | 'params' | 'file' | 'header';
  /** Dotted path of the field, e.g. "education.0.startYear". */
  field?: string;
  message: string;
}

export interface ApiFailure {
  success: false;
  error: {
    code: ErrorCode;
    message: string;
    details?: ErrorDetail[];
    /** Correlates with the server logs and the X-Request-Id response header. */
    requestId?: string;
  };
}

// ---- users & auth -------------------------------------------------------------------------------

export interface UserDTO {
  id: string;
  name: string;
  email: string;
  role: Role;
  isActive: boolean;
  createdAt: string;
  lastLoginAt?: string;
}

export interface AuthSessionDTO {
  accessToken: string;
  tokenType: 'Bearer';
  /** Access-token lifetime in seconds. */
  expiresIn: number;
  user: UserDTO;
  /** Only for clients that asked for body transport (X-Token-Transport: body); browsers get an httpOnly cookie. */
  refreshToken?: string;
}

// ---- companies ----------------------------------------------------------------------------------

export interface CompanyDTO {
  id: string;
  name: string;
  description?: string;
  website?: string;
  industry?: string;
  location?: string;
  logoUrl?: string;
  createdAt?: string;
}

export interface AdminCompanyDTO extends CompanyDTO {
  createdBy: string;
  openJobs: number;
}

// ---- jobs ---------------------------------------------------------------------------------------

export interface JobListItemDTO {
  id: string;
  title: string;
  company: { id: string; name?: string; logoUrl?: string };
  location: string;
  salaryMin: number;
  salaryMax: number;
  requiredSkills: string[];
  experienceRequired: number;
  employmentType: EmploymentType;
  status: JobStatus;
  vacancies?: number;
  createdAt: string;
  updatedAt?: string;
}

/** Recruiter and admin views add how many applications each job received. */
export interface ManagedJobDTO extends JobListItemDTO {
  applicantCount: number;
  postedBy?: { id: string; name?: string; email?: string };
}

export interface JobDetailDTO extends Omit<JobListItemDTO, 'company'> {
  description: string;
  company: CompanyDTO;
}

export interface JobFacetsDTO {
  locations: Array<{ name: string; count: number }>;
  skills: Array<{ name: string; count: number }>;
  employmentTypes: Array<{ name: EmploymentType; count: number }>;
  totalOpen: number;
}

// ---- resumes & profiles -------------------------------------------------------------------------

export interface ResumeDTO {
  id: string;
  originalName: string;
  mimeType: string;
  size: number;
  createdAt: string;
  /** True for the resume new applications will use. */
  isCurrent?: boolean;
}

export interface EducationDTO {
  degree?: string;
  institution?: string;
  fieldOfStudy?: string;
  startYear?: number | null;
  endYear?: number | null;
  grade?: string;
}

export interface ExperienceDTO {
  title?: string;
  company?: string;
  startDate?: string | null;
  endDate?: string | null;
  isCurrent?: boolean;
  description?: string;
}

export interface SeekerProfileDTO {
  id: string;
  user: string;
  role: 'JOB_SEEKER';
  headline?: string;
  phone?: string;
  address?: string;
  dateOfBirth?: string | null;
  totalExperienceYears?: number | null;
  education: EducationDTO[];
  experience: ExperienceDTO[];
  skills: string[];
  resume: ResumeDTO | null;
  updatedAt?: string;
}

export interface RecruiterProfileDTO {
  id: string;
  user: string;
  role: 'RECRUITER';
  designation?: string;
  phone?: string;
  company: CompanyDTO | null;
}

export interface AdminProfileDTO {
  user: string;
  role: 'ADMIN';
}

export type ProfileDTO = SeekerProfileDTO | RecruiterProfileDTO | AdminProfileDTO;

/** A recruiter's view of an applicant's profile. */
export interface ApplicantProfileDTO {
  name?: string;
  email?: string;
  headline?: string;
  phone?: string;
  address?: string;
  totalExperienceYears?: number | null;
  skills: string[];
  education: EducationDTO[];
  experience: ExperienceDTO[];
}

// ---- applications -------------------------------------------------------------------------------

export interface StatusHistoryDTO {
  status: ApplicationStatus;
  changedAt: string;
  changedBy?: string;
}

export interface ApplicationDTO {
  id: string;
  status: ApplicationStatus;
  appliedAt: string;
  updatedAt?: string;
  coverNote?: string;
  job: { id: string; title?: string; location?: string; company: { id?: string; name?: string } };
  applicant: { id: string; name?: string; email?: string };
  /** The resume sent with this application (immutable once applied). */
  resume?: Pick<ResumeDTO, 'id' | 'originalName' | 'mimeType' | 'size'>;
  /** Present on single-application reads. */
  statusHistory?: StatusHistoryDTO[];
  /** Statuses this application may move to next (recruiter/admin views). */
  allowedNextStatuses?: ApplicationStatus[];
  /** Recruiter views of a job's applicants: how many of the job's required skills the applicant lists. */
  matchCount?: number;
  matchTotal?: number;
  /** When the application last changed stage (or was submitted). */
  stageSince?: string;
}

export interface NoteDTO {
  id: string;
  text: string;
  createdAt: string;
}

export interface RecruiterDashboardDTO {
  jobs: { open: number; closed: number };
  applicantsByStatus: Record<ApplicationStatus, number>;
  totalApplicants: number;
  newThisWeek: number;
  recent: ApplicationDTO[];
  /** Applications still APPLIED after three days, oldest first (at most five), and how many there are in total. */
  stale: ApplicationDTO[];
  staleCount: number;
}

// ---- AI match analysis --------------------------------------------------------------------------

export interface MatchAnalysisDTO {
  jobId: string;
  /** "ai" when the model produced it; "heuristic" when the deterministic fallback did. */
  engine: MatchEngine;
  model?: string;
  /** 0-100. */
  score: number;
  verdict: MatchVerdict;
  summary: string;
  matchedSkills: string[];
  missingSkills: string[];
  strengths: string[];
  gaps: string[];
  /** Concrete resume improvements for this job (seeker-facing). */
  suggestions: string[];
  experience: { requiredYears: number; candidateYears: number | null };
  /** Why the result may be weaker than usual (e.g. AI unavailable, resume text not readable). */
  warnings: string[];
  generatedAt: string;
  cached: boolean;
}

// ---- notifications ------------------------------------------------------------------------------

export interface NotificationDTO {
  id: string;
  type: 'APPLICATION_SUBMITTED' | 'APPLICATION_STATUS';
  title: string;
  body: string;
  link: string;
  read: boolean;
  createdAt: string;
}

// ---- reports (admin) ----------------------------------------------------------------------------

export interface ReportSummaryDTO {
  totalUsers: number;
  totalSeekers: number;
  totalRecruiters: number;
  totalAdmins: number;
  activeUsers: number;
  totalCompanies: number;
  totalJobs: number;
  totalJobsOpen: number;
  totalJobsClosed: number;
  totalApplications: number;
  applicationsByStatus: Record<ApplicationStatus, number>;
}

export interface TimeSeriesPointDTO {
  date: string;
  count: number;
}

export interface TopJobDTO {
  jobId: string;
  title: string;
  company: string;
  applicantCount: number;
}

export interface TopCompanyDTO {
  companyId: string;
  name: string;
  applicantCount: number;
}
