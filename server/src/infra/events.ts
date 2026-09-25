import { EventEmitter } from 'node:events';

/** Domain events: the extension point for notifications, analytics and the later AI layer. */
export interface DomainEvents {
  'jobs.changed': { jobId?: string };
  'job.created': { jobId: string; recruiterId: string };
  'application.submitted': { applicationId: string; jobId: string; applicantId: string };
  'application.statusChanged': { applicationId: string; from: string; to: string; changedBy: string };
  'user.deactivated': { userId: string };
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
