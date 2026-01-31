import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';
import http from 'http';
import authRoutes from './routes/auth';
import projectRoutes from './routes/project';
import notificationRoutes from './routes/notification';
import { initSocket } from './socket';
import metricsRoutes from './routes/metrics';

dotenv.config();

const app = express();
const port = process.env.PORT;
if (!port) {
  console.error('PORT is not defined in the environment variables');
  process.exit(1);
}

app.use(cors({ origin: 'http://localhost:3000' }));
// Allow larger JSON bodies so full proposal HTML snapshots can be saved
app.use(express.json({ limit: '5mb' }));

app.use('/api/auth', authRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/metrics', metricsRoutes);

const uri = process.env.MONGO_URI;

if (!uri) {
  console.error('MONGO_URI is not defined in the environment variables');
  process.exit(1);
}

mongoose.connect(uri, {
  serverSelectionTimeoutMS: 10000,
  socketTimeoutMS: 45000,
  connectTimeoutMS: 10000,
  retryWrites: true,
  w: 'majority',
  autoIndex: true,
  maxPoolSize: 10
}).then(() => {
  console.log('MongoDB database connection established successfully');
}).catch(err => {
  console.error('MongoDB connection error:', err);
  process.exit(1);
});

const server = http.createServer(app);

// Initialize Socket.IO
initSocket(server);

server.listen(port, () => {
  console.log(`Server is running on port: ${port}`);
});
