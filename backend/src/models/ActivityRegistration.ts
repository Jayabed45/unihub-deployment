import mongoose, { Schema, Document } from 'mongoose';

export interface IActivityRegistration extends Document {
  project: mongoose.Types.ObjectId;
  activityId: number;
  participantEmail: string;
  status: 'registered' | 'present' | 'absent';
  createdAt: Date;
  updatedAt: Date;
}

const ActivityRegistrationSchema: Schema = new Schema(
  {
    project: { type: Schema.Types.ObjectId, ref: 'Project', required: true },
    activityId: { type: Number, required: true },
    participantEmail: { type: String, required: true, trim: true },
    status: {
      type: String,
      enum: ['registered', 'present', 'absent'],
      default: 'registered',
      required: true,
    },
  },
  {
    timestamps: true,
  },
);

ActivityRegistrationSchema.index({ project: 1, activityId: 1, participantEmail: 1 }, { unique: true });

export default mongoose.model<IActivityRegistration>('ActivityRegistration', ActivityRegistrationSchema);
