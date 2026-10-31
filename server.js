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
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({ origin: process.env.FRONTEND_URL?.split(',').map(s => s.trim()) || 'https://shop.orbitstech.in' }));
app.use(express.json({ limit: '1mb' }));
app.use(rateLimit({ windowMs: 15 * 60 * 1000, limit: 300, standardHeaders: true, legacyHeaders: false }));
app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'OrbitsTech Notes API' }));
app.use('/api/auth', authRoutes);
app.use('/api/notes', noteRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/purchases', purchaseRoutes);
app.use('/api', purchaseRoutes);

app.use((err, _req, res, _next) => {
  console.error(err);
  const status = err.status || (err.name === 'MulterError' ? 400 : 500);
  res.status(status).json({ message: status >= 500 && process.env.NODE_ENV === 'production' ? 'Server error. Please try again.' : err.message || 'Unexpected server error.' });
});

const port = Number(process.env.PORT || 5000);
await connectDB();
if (process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD) {
  const email = process.env.ADMIN_EMAIL.toLowerCase().trim();
  const existing = await User.findOne({ email });
  if (!existing) {
    await User.create({
      name: process.env.ADMIN_NAME || 'OrbitsTech Admin',
      email,
      passwordHash: await bcrypt.hash(process.env.ADMIN_PASSWORD, 12),
      role: 'admin'
    });
    console.log(`Created admin account: ${email}`);
  } else if (existing.role !== 'admin') {
    console.warn('ADMIN_EMAIL already belongs to a non-admin user; change ADMIN_EMAIL in .env.');
  }
}
app.listen(port, () => console.log(`API listening on http://localhost:${port}`));
