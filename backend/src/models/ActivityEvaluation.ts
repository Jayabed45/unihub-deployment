import mongoose, { Schema, Document } from 'mongoose';

export interface IActivityEvaluation extends Document {
  project: mongoose.Types.ObjectId;
  activityId: number;
  participantEmail: string;
  collegeDept?: string;
  ratings: Record<string, number>;
  comments?: string;
  suggestions?: string;
  createdAt: Date;
  updatedAt: Date;
}

const ActivityEvaluationSchema: Schema = new Schema(
  {
    project: { type: Schema.Types.ObjectId, ref: 'Project', required: true },
    activityId: { type: Number, required: true },
    participantEmail: { type: String, required: true, trim: true },
    collegeDept: { type: String, required: false, trim: true },
    ratings: {
      type: Map,
      of: Number,
      required: true,
      default: {},
    },
    comments: { type: String, required: false, trim: true },
    suggestions: { type: String, required: false, trim: true },
  },
  {
    timestamps: true,
  },
);

ActivityEvaluationSchema.index({ project: 1, activityId: 1, participantEmail: 1 }, { unique: true });

export default mongoose.model<IActivityEvaluation>('ActivityEvaluation', ActivityEvaluationSchema);
