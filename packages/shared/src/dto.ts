import type { ApplicationStatus, EmploymentType, JobStatus, Role } from './enums';

/** Response shapes exactly as the API sends them (ids are strings, dates are ISO strings). */

export interface UserDTO {
  id: string;
  name: string;
  email: string;
  role: Role;
  isActive: boolean;
  createdAt: string;
}

export interface CompanyDTO {
  id: string;
  name: string;
  description?: string;
  website?: string;
  industry?: string;
  location?: string;
  logoUrl?: string;
  createdBy?: string;
}

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
  /** Recruiter views only: applications received. */
  applicantCount?: number;
}

export interface JobDetailDTO extends Omit<JobListItemDTO, 'company'> {
  description: string;
  company: CompanyDTO;
}

export interface JobListDTO {
  jobs: JobListItemDTO[];
  /** Present on the first page of a search (not on cursor pages). */
  total?: number;
  page?: number;
  limit: number;
  nextCursor: string | null;
}

export interface ResumeDTO {
  fileName?: string;
  originalName: string;
  mimeType: string;
  size: number;
  uploadedAt?: string;
}

export interface SeekerProfileDTO {
  id: string;
  user: string;
  headline?: string;
  phone?: string;
  address?: string;
  dateOfBirth?: string;
  education: Array<Record<string, unknown>>;
  experience: Array<Record<string, unknown>>;
  skills: string[];
  resume: ResumeDTO | null;
}

export interface StatusHistoryDTO {
  status: ApplicationStatus;
  changedAt: string;
  changedBy?: string;
}

export interface ApplicationDTO {
  id: string;
  status: ApplicationStatus;
  appliedAt: string;
  coverNote?: string;
  job: { id: string; title?: string; location?: string; company: { id?: string; name?: string } };
  applicant: { id: string; name?: string; email?: string };
  resumeSnapshot?: Omit<ResumeDTO, 'fileName' | 'uploadedAt'>;
  statusHistory?: StatusHistoryDTO[];
}

export interface AdminSummaryDTO {
  totalUsers: number;
  totalSeekers: number;
  totalRecruiters: number;
  totalJobs: number;
  totalJobsOpen: number;
  totalJobsClosed: number;
  totalApplications: number;
}

export interface JobFacetsDTO {
  locations: Array<{ name: string; count: number }>;
  skills: Array<{ name: string; count: number }>;
  employmentTypes: Array<{ name: EmploymentType; count: number }>;
  totalOpen: number;
}

export interface NotificationDTO {
  id: string;
  type: 'APPLICATION_SUBMITTED' | 'APPLICATION_STATUS';
  title: string;
  body: string;
  link: string;
  read: boolean;
  createdAt: string;
}

export interface NotificationsDTO {
  items: NotificationDTO[];
  unread: number;
}

/** A recruiter's view of an applicant's profile (FR-06). */
export interface ApplicantProfileDTO {
  name?: string;
  email?: string;
  headline?: string;
  phone?: string;
  address?: string;
  skills: string[];
  education: Array<Record<string, unknown>>;
  experience: Array<Record<string, unknown>>;
}

export interface RecruiterOverviewDTO {
  jobs: { open: number; closed: number };
  applicantsByStatus: Record<ApplicationStatus, number>;
  totalApplicants: number;
  newThisWeek: number;
  recent: ApplicationDTO[];
}
