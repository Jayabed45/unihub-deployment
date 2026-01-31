import mongoose, { Schema, Document } from 'mongoose';

export interface IProjectBeneficiary extends Document {
  project: mongoose.Types.ObjectId;
  email: string;
  status: 'active' | 'removed';
  createdAt: Date;
  updatedAt: Date;
}

const ProjectBeneficiarySchema: Schema = new Schema(
  {
    project: { type: Schema.Types.ObjectId, ref: 'Project', required: true },
    email: { type: String, required: true, trim: true },
    status: {
      type: String,
      enum: ['active', 'removed'],
      default: 'active',
      required: true,
    },
  },
  {
    timestamps: true,
  },
);

ProjectBeneficiarySchema.index({ project: 1, email: 1 }, { unique: true });

export default mongoose.model<IProjectBeneficiary>('ProjectBeneficiary', ProjectBeneficiarySchema);
