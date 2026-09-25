import { EventEmitter } from 'node:events';

/**
 * In-process domain events. Services announce what happened; side effects (notifications, cache
 * invalidation) subscribe, so the services that change state stay unaware of them.
 */
export interface DomainEvents {
  'jobs.changed': { jobId?: string };
  'job.created': { jobId: string; recruiterId: string };
  'application.submitted': { applicationId: string; jobId: string; applicantId: string };
  'application.statusChanged': { applicationId: string; from: string; to: string; changedBy: string };
  /** Access tokens issued before now are no longer valid for this user (deactivation, deletion, password change). */
  'user.sessionsRevoked': { userId: string };
  'company.changed': { companyId: string; recruiterId?: string };
}

class TypedBus {
  private readonly emitter = new EventEmitter();

  on<K extends keyof DomainEvents>(event: K, listener: (payload: DomainEvents[K]) => void): void {
    this.emitter.on(event, listener);
  }

  emit<K extends keyof DomainEvents>(event: K, payload: DomainEvents[K]): void {
    this.emitter.emit(event, payload);
  }
}

export const events = new TypedBus();
