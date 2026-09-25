import { type Types, Schema, model } from 'mongoose';

export const NOTIFICATION_TYPES = ['APPLICATION_SUBMITTED', 'APPLICATION_STATUS'] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export interface NotificationAttrs {
  _id: Types.ObjectId;
  user: Types.ObjectId;
  type: NotificationType;
  title: string;
  body: string;
  /** In-app route the notification opens. */
  link: string;
  readAt?: Date;
  createdAt: Date;
}

const notificationSchema = new Schema<NotificationAttrs>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: NOTIFICATION_TYPES, required: true },
    title: { type: String, required: true },
    body: { type: String, required: true },
    link: { type: String, required: true },
    readAt: Date
  },
  { timestamps: { createdAt: true, updatedAt: false }, autoIndex: false }
);

notificationSchema.index({ user: 1, createdAt: -1 });
notificationSchema.index({ user: 1, readAt: 1 });
// Old notifications clean themselves up after 90 days.
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 86_400 });

export const Notification = model<NotificationAttrs>('Notification', notificationSchema);
