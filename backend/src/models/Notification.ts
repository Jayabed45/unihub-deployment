import mongoose, { Schema, Document } from 'mongoose';

export interface INotification extends Document {
  title: string;
  message: string;
  project?: mongoose.Types.ObjectId;
  read: boolean;
  createdAt: Date;
  recipientEmail?: string;
}

const NotificationSchema: Schema = new Schema(
  {
    title: { type: String, required: true },
    message: { type: String, required: true },
    project: { type: Schema.Types.ObjectId, ref: 'Project', required: false },
    read: { type: Boolean, default: false, required: true },
    recipientEmail: { type: String, required: false },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  },
);

export default mongoose.model<INotification>('Notification', NotificationSchema);
