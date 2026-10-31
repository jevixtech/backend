
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcryptjs';

import { connectDB } from './src/config/db.js';
import User from './src/models/User.js';

import authRoutes from './src/routes/auth.js';
import noteRoutes from './src/routes/notes.js';
import paymentRoutes from './src/routes/payments.js';
import purchaseRoutes from './src/routes/purchases.js';

const app = express();

// Trust proxy for hosted platforms
app.set('trust proxy', 1);

// Security
app.use(
  helmet({
    crossOriginResourcePolicy: {
      policy: 'cross-origin'
    }
  })
);

// Allowed frontend domains
const allowedOrigins = [
  'http://localhost:5173',
  'https://shop.orbitstech.in',
  'https://www.shop.orbitstech.in',
  ...(process.env.FRONTEND_URL || '')
    .split(',')
    .map(origin => origin.trim().replace(/\/$/, ''))
    .filter(Boolean)
];

// CORS Configuration
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow server-to-server and local non-browser requests
      if (!origin) {
        return callback(null, true);
      }

      const normalizedOrigin = origin.replace(/\/$/, '');

      if (allowedOrigins.includes(normalizedOrigin)) {
        return callback(null, true);
      }

      console.error('Blocked CORS Origin:', origin);
      return callback(new Error('Origin not allowed by CORS'));
    },
    credentials: true,
    methods: [
      'GET',
      'POST',
      'PUT',
      'PATCH',
      'DELETE',
      'OPTIONS'
    ],
    allowedHeaders: [
      'Content-Type',
      'Authorization'
    ]
  })
);

// Body parser
app.use(express.json({ limit: '1mb' }));

// Rate limiter
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 300,
    standardHeaders: true,
    legacyHeaders: false
  })
);

// Health check
app.get('/api/health', (_req, res) => {
  res.status(200).json({
    ok: true,
    service: 'OrbitsTech Notes API',
    message: 'Backend is running successfully'
  });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/notes', noteRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/purchases', purchaseRoutes);

// Keep if purchases.js has routes intended for /api directly
app.use('/api', purchaseRoutes);

// Global error handler
app.use((err, _req, res, _next) => {
  console.error('Server Error:', err);

  const status =
    err.status ||
    (err.name === 'MulterError' ? 400 : 500);

  res.status(status).json({
    message:
      status >= 500 && process.env.NODE_ENV === 'production'
        ? 'Server error. Please try again.'
        : err.message || 'Unexpected server error.'
  });
});

// Server startup
const PORT = Number(process.env.PORT || 5000);

async function startServer() {
  try {
    await connectDB();

    // Create admin account if it does not exist
    if (process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD) {
      const email = process.env.ADMIN_EMAIL.toLowerCase().trim();

      const existing = await User.findOne({ email });

      if (!existing) {
        await User.create({
          name: process.env.ADMIN_NAME || 'OrbitsTech Admin',
          email,
          passwordHash: await bcrypt.hash(
            process.env.ADMIN_PASSWORD,
            12
          ),
          role: 'admin'
        });

        console.log(`Created admin account: ${email}`);
      } else if (existing.role !== 'admin') {
        console.warn(
          'ADMIN_EMAIL already belongs to a non-admin user. Please change ADMIN_EMAIL.'
        );
      }
    }

    app.listen(PORT, () => {
      console.log(`OrbitsTech API running on port ${PORT}`);
    });

  } catch (error) {
    console.error('Backend startup failed:', error);
    process.exit(1);
  }
}

startServer();
