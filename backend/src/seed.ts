import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import User from './models/User';
import Role from './models/Role';

dotenv.config();

const seed = async () => {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.error('MONGO_URI is not defined in the environment variables');
    process.exit(1);
  }

  try {
    await mongoose.connect(uri);
    console.log('MongoDB connected for seeding');

    // Clear existing data
    await User.deleteMany({});
    await Role.deleteMany({});
    console.log('Cleared existing users and roles');

    // Create roles
    const adminRole = new Role({ name: 'Administrator' });
    const projectLeaderRole = new Role({ name: 'Project Leader' });

    await Role.insertMany([adminRole, projectLeaderRole]);
    console.log('Roles created: Administrator, Project Leader');

    // Create admin user
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash('password', salt); // Default password is 'password'

    const adminUser = new User({
      username: 'admin',
      email: 'admin@unihub.com',
      passwordHash,
      role: adminRole._id,
    });

    await adminUser.save();
    console.log('Admin user created with email: admin@unihub.com and password: password');

    // Create project leader user
    const projectLeaderPassword = await bcrypt.hash('password', salt);

    const projectLeaderUser = new User({
      username: 'leader',
      email: 'leader@unihub.com',
      passwordHash: projectLeaderPassword,
      role: projectLeaderRole._id,
    });

    await projectLeaderUser.save();
    console.log('Project leader user created with email: leader@unihub.com and password: password');

  } catch (error) {
    console.error('Error seeding database:', error);
  } finally {
    mongoose.disconnect();
    console.log('MongoDB disconnected');
  }
};

seed();
