import mongoose, { Schema, Document } from 'mongoose';

export interface IActivity extends Document {
  name: string;
  description: string;
  project: mongoose.Types.ObjectId;
  beneficiaries: mongoose.Types.ObjectId[];
  attendance: Map<string, boolean>;
}

const ActivitySchema: Schema = new Schema({
  name: { type: String, required: true },
  description: { type: String, required: true },
  project: { type: Schema.Types.ObjectId, ref: 'Project', required: true },
  beneficiaries: [{ type: Schema.Types.ObjectId, ref: 'User' }],
  attendance: { type: Map, of: Boolean, default: {} },
});

export default mongoose.model<IActivity>('Activity', ActivitySchema);
