import { Queue, Worker, Job } from 'bullmq';
import { redis } from './redis';

export const QUEUE_NAMES = {
  IDLE_TRACKER: 'idle-tracker',
  BURNOUT_TRACKER: 'burnout-tracker',
  NOTIFICATIONS: 'notifications',
  REPORTS: 'reports',
  EMAILS: 'emails',
  SCHEDULED_REPORTS: 'scheduled-reports',
} as const;

const createQueue = (name: string) => new Queue(name, { connection: redis });

export const queues = {
  idleTracker: createQueue(QUEUE_NAMES.IDLE_TRACKER),
  burnoutTracker: createQueue(QUEUE_NAMES.BURNOUT_TRACKER),
  notifications: createQueue(QUEUE_NAMES.NOTIFICATIONS),
  reports: createQueue(QUEUE_NAMES.REPORTS),
  emails: createQueue(QUEUE_NAMES.EMAILS),
  scheduledReports: createQueue(QUEUE_NAMES.SCHEDULED_REPORTS),
};

export type JobHandler = (job: Job) => Promise<void>;

export const createWorker = (queueName: string, handler: JobHandler) => {
  return new Worker(queueName, handler, { connection: redis });
};

export const closeQueues = async (): Promise<void> => {
  await Promise.all(Object.values(queues).map((q) => q.close()));
};
