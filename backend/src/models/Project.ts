import mongoose, { Schema, Document } from 'mongoose';

export interface IProjectActivitySchedule {
  activityId: number;
  startAt?: Date;
  endAt?: Date;
  location?: string;
}

export interface IProjectExtensionActivity {
  topic: string;
  hours?: number;
  resourcePerson?: string;
}

export interface IProject extends Document {
  name: string;
  description: string;
  projectLeader: mongoose.Types.ObjectId;
  activities: mongoose.Types.ObjectId[];
  proposalData?: any;
  summary?: any;
  evaluation?: any;
  status: 'Pending' | 'Approved' | 'Rejected';
  activitySchedule?: IProjectActivitySchedule[];
  extensionActivities?: IProjectExtensionActivity[];
}

const ProjectSchema: Schema = new Schema({
  name: { type: String, required: true },
  description: { type: String, required: true },
  projectLeader: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  activities: [{ type: Schema.Types.ObjectId, ref: 'Activity' }],
  proposalData: { type: Schema.Types.Mixed, required: false },
  summary: { type: Schema.Types.Mixed, required: false },
  evaluation: { type: Schema.Types.Mixed, required: false },
  extensionActivities: [
    {
      topic: { type: String, required: true },
      hours: { type: Number, required: false },
      resourcePerson: { type: String, required: false },
    },
  ],
  activitySchedule: [
    {
      activityId: { type: Number, required: true },
      startAt: { type: Date, required: false },
      endAt: { type: Date, required: false },
      location: { type: String, required: false },
    },
  ],
  status: {
    type: String,
    enum: ['Pending', 'Approved', 'Rejected'],
    default: 'Pending',
    required: true,
  },
}, { timestamps: true });

export default mongoose.model<IProject>('Project', ProjectSchema);
