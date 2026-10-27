import { Router } from 'express';
import Purchase from '../models/Purchase.js';
import { protect, adminOnly } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();

router.get('/my', protect, asyncHandler(async (req, res) => {
  const purchases = await Purchase.find({ user: req.user._id, status: 'paid' })
    .populate({ path: 'note', select: 'title description category subject price pages pdfUrl published' })
    .sort({ paidAt: -1 });
  res.json({ purchases: purchases.filter(p => p.note && p.note.published) });
}));

router.get('/admin/orders', protect, adminOnly, asyncHandler(async (_req, res) => {
  const purchases = await Purchase.find().populate('user', 'name email').populate('note', 'title').sort({ createdAt: -1 }).limit(500);
  res.json({ purchases });
}));

export default router;
