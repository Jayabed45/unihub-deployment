import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import User from '../models/User';
import Role from '../models/Role'; // Explicitly import Role
import { sendMail } from '../utils/mailer';

const generateVerificationCode = (): string => {
  const code = Math.floor(100000 + Math.random() * 900000);
  return String(code);
};

export const login = async (req: Request, res: Response) => {
  const rawEmail = typeof req.body.email === 'string' ? req.body.email : '';
  const email = rawEmail.trim().toLowerCase();
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  const otp = typeof req.body.otp === 'string' ? req.body.otp.trim() : '';

  console.log('Login attempt received for email (normalized):', email);

  try {
    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }
        console.log('Step 1: Finding user...');
    const user = await User.findOne({ email }).populate({
      path: 'role',
      model: Role,
      select: 'name',
    });

        console.log('Step 2: User found:', !!user);
    if (!user) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

        console.log('Step 3: Comparing passwords...');
    const isMatch = await bcrypt.compare(password, user.passwordHash);

        console.log('Step 4: Passwords match:', isMatch);
    if (!isMatch) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

        console.log('Step 5: Checking user role...');
    if (!user.role || !(user.role as any).name) {
      return res.status(500).json({ message: 'User role is not defined' });
    }

    const roleName = (user.role as any).name as string;
    const requiresOtpForRole = roleName === 'Participant' || roleName === 'Project Leader';

    if (requiresOtpForRole && !user.emailVerified) {
      // If account is not yet verified, enforce one-time OTP verification
      const now = new Date();

      if (!otp) {
        // No OTP provided yet: (re)generate if missing/expired and send to email
        let code = user.emailVerificationCode;
        let expires = user.emailVerificationExpires;

        if (!code || !expires || expires.getTime() <= now.getTime()) {
          code = generateVerificationCode();
          expires = new Date(now.getTime() + 15 * 60 * 1000); // 15 minutes
          (user as any).emailVerificationCode = code;
          (user as any).emailVerificationExpires = expires;
          await user.save();
        }

        try {
          if (user.email) {
            await sendMail({
              to: user.email,
              subject: 'Your UniHub verification code',
              text: `Your UniHub verification code is ${code}. It will expire in 15 minutes. If you did not attempt to sign in, you can ignore this email.`,
            });
          }
        } catch (mailError) {
          console.error('Failed to send login verification code email', mailError);
        }

        return res.status(200).json({
          requiresVerification: true,
          message: 'We sent a verification code to your email. Please enter the code to continue.',
        });
      }

      // OTP was provided: validate against stored values
      if (!user.emailVerificationCode || !user.emailVerificationExpires) {
        return res.status(400).json({
          message: 'No verification code is currently active. Please sign in again to request a new code.',
        });
      }

      if (user.emailVerificationExpires.getTime() <= now.getTime()) {
        return res.status(400).json({
          message: 'Your verification code has expired. Please sign in again to request a new one.',
        });
      }

      if (otp !== user.emailVerificationCode) {
        return res.status(400).json({ message: 'Invalid verification code. Please try again.' });
      }

      // Mark email as verified and clear code
      (user as any).emailVerified = true;
      (user as any).emailVerificationCode = undefined;
      (user as any).emailVerificationExpires = undefined;
      await user.save();
    }

        console.log('Step 6: Creating JWT payload...');
    const payload = {
      user: {
        id: user.id,
        role: (user.role as any).name, // This should be 'Administrator'
        email: user.email,
      },
    };

        console.log('Step 7: Signing JWT...');
    jwt.sign(
      payload,
      process.env.JWT_SECRET || 'your_jwt_secret',
      { expiresIn: '1h' },
      (err, token) => {
        if (err) throw err;
        res.json({ token, user: payload.user });
      }
    );
  } catch (err: any) {
        console.error('CRITICAL ERROR in login controller:', err);
    res.status(500).send('Server error');
  }
};

export const getAllUsers = async (_req: Request, res: Response) => {
  try {
    const users = await User.find().populate('role', 'name').select('-passwordHash');
    res.json(users);
  } catch (err: any) {
    console.error('Error in getAllUsers controller:', err);
    res.status(500).send('Server error');
  }
};

export const getUserById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ message: 'User id is required' });
    }

    const user = await User.findById(id).populate('role', 'name').select('-passwordHash');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    return res.json(user);
  } catch (err: any) {
    console.error('Error in getUserById controller:', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

export const updateUserBasic = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ message: 'User id is required' });
    }

    const { username, email } = req.body as { username?: string; email?: string };

    if (!username && !email) {
      return res.status(400).json({ message: 'Nothing to update' });
    }

    const updates: { username?: string; email?: string } = {};
    if (typeof username === 'string' && username.trim()) {
      updates.username = username.trim();
    }
    if (typeof email === 'string' && email.trim()) {
      updates.email = email.trim().toLowerCase();
    }

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Check for unique email/username conflicts
    const conflictQuery: any[] = [];
    if (updates.email && updates.email !== user.email) {
      conflictQuery.push({ email: updates.email });
    }
    if (updates.username && updates.username !== user.username) {
      conflictQuery.push({ username: updates.username });
    }

    if (conflictQuery.length > 0) {
      const conflict = await User.findOne({ $or: conflictQuery, _id: { $ne: user._id } });
      if (conflict) {
        return res
          .status(400)
          .json({ message: 'Another user already exists with the same email or username' });
      }
    }

    if (updates.username) {
      user.username = updates.username;
    }
    if (updates.email) {
      user.email = updates.email;
    }

    await user.save();

    const sanitized = await User.findById(user._id).populate('role', 'name').select('-passwordHash');
    return res.json(sanitized);
  } catch (err: any) {
    console.error('Error in updateUserBasic controller:', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

export const deleteUser = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ message: 'User id is required' });
    }

    const deleted = await User.findByIdAndDelete(id);
    if (!deleted) {
      return res.status(404).json({ message: 'User not found' });
    }

    return res.json({ success: true });
  } catch (err: any) {
    console.error('Error in deleteUser controller:', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

export const changePassword = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ message: 'User id is required' });
    }

    const currentPassword = typeof req.body.currentPassword === 'string' ? req.body.currentPassword : '';
    const newPassword = typeof req.body.newPassword === 'string' ? req.body.newPassword : '';

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: 'Current password and new password are required' });
    }

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const isMatch = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isMatch) {
      return res.status(400).json({ message: 'Current password is incorrect' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ message: 'New password must be at least 6 characters long' });
    }

    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(newPassword, salt);
    (user as any).passwordHash = hash;
    await user.save();

    return res.json({ success: true });
  } catch (err: any) {
    console.error('Error in changePassword controller:', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

export const register = async (req: Request, res: Response) => {
  const { username, email, password, role } = req.body as {
    username?: string;
    email?: string;
    password?: string;
    role?: string;
  };

  const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
  const normalizedRole = typeof role === 'string' ? role.trim() : '';

  try {
    if (!username || !normalizedEmail || !password || !normalizedRole) {
      return res.status(400).json({ message: 'Username, email, password, and role are required' });
    }

    const existingUser = await User.findOne({ $or: [{ email: normalizedEmail }, { username }] });
    if (existingUser) {
      return res.status(400).json({ message: 'A user with this email or username already exists' });
    }

    let roleDoc = await Role.findOne({ name: normalizedRole });

    if (!roleDoc) {
      // If the role does not exist yet (e.g., Participant), create it on demand
      roleDoc = new Role({ name: normalizedRole });
      await roleDoc.save();
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const user = new User({
      username,
      email: normalizedEmail,
      passwordHash,
      role: roleDoc._id,
      emailVerified: false,
    } as any);

    // Generate an initial email verification code for non-admin roles
    const roleName = roleDoc.name as string;
    const requiresOtpForRole = roleName === 'Participant' || roleName === 'Project Leader';

    if (requiresOtpForRole) {
      const code = generateVerificationCode();
      const expires = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes
      (user as any).emailVerificationCode = code;
      (user as any).emailVerificationExpires = expires;

      try {
        await sendMail({
          to: normalizedEmail,
          subject: 'Verify your UniHub email',
          text: `Welcome to UniHub! Your verification code is ${code}. It will expire in 15 minutes. Use this code the first time you sign in.`,
        });
      } catch (mailError) {
        console.error('Failed to send registration verification email', mailError);
      }
    }

    await user.save();

    return res.status(201).json({
      message:
        requiresOtpForRole
          ? 'Registration successful. We sent a verification code to your email. Use it the first time you log in.'
          : 'Registration successful. You can now log in.',
    });
  } catch (err: any) {
    console.error('Error in register controller:', err);
    return res.status(500).json({ message: 'Server error during registration' });
  }
};
