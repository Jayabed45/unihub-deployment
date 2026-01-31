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
const port = process.env.PORT || 5000;

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

mongoose.connect(uri);

const connection = mongoose.connection;
connection.once('open', () => {
  console.log('MongoDB database connection established successfully');
});

const server = http.createServer(app);

// Initialize Socket.IO
initSocket(server);

server.listen(port, () => {
  console.log(`Server is running on port: ${port}`);
});
