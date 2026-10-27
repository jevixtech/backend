import { Router } from 'express';
import crypto from 'node:crypto';
import Razorpay from 'razorpay';
import Note from '../models/Note.js';
import Purchase from '../models/Purchase.js';
import { protect } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();
function razorpayClient() {
  if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET ||
      process.env.RAZORPAY_KEY_ID.includes('replace')) {
    const error = new Error('Razorpay is not configured. Add test keys to backend/.env.');
    error.status = 503; throw error;
  }
  return new Razorpay({ key_id: process.env.RAZORPAY_KEY_ID, key_secret: process.env.RAZORPAY_KEY_SECRET });
}

router.post('/create-order', protect, asyncHandler(async (req, res) => {
  const note = await Note.findOne({ _id: req.body.noteId, published: true });
  if (!note) return res.status(404).json({ message: 'Note not found.' });
  const alreadyOwned = await Purchase.exists({ user: req.user._id, note: note._id, status: 'paid' });
  if (alreadyOwned) return res.status(409).json({ message: 'You already own this note. Open My Notes.' });
  const amountPaise = Math.round(note.price * 100);
  const client = razorpayClient();
  const order = await client.orders.create({
    amount: amountPaise, currency: 'INR',
    receipt: `note_${note._id.toString().slice(-12)}_${Date.now().toString().slice(-8)}`,
    notes: { userId: req.user._id.toString(), noteId: note._id.toString() }
  });
  await Purchase.create({ user: req.user._id, note: note._id, noteTitle: note.title, amountPaise, razorpayOrderId: order.id, status: 'created' });
  res.status(201).json({ orderId: order.id, amount: order.amount, currency: order.currency, keyId: process.env.RAZORPAY_KEY_ID, note: { id: note._id, title: note.title, price: note.price } });
}));

router.post('/verify', protect, asyncHandler(async (req, res) => {
  const { razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: signature } = req.body;
  if (!orderId || !paymentId || !signature) return res.status(400).json({ message: 'Payment response is incomplete.' });
  const purchase = await Purchase.findOne({ razorpayOrderId: orderId, user: req.user._id });
  if (!purchase) return res.status(404).json({ message: 'Order not found for this account.' });
  if (purchase.status === 'paid') return res.json({ message: 'Payment already verified.', purchaseId: purchase._id });
  const expected = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET).update(`${orderId}|${paymentId}`).digest('hex');
  const a = Buffer.from(expected, 'hex'), b = Buffer.from(signature, 'hex');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return res.status(400).json({ message: 'Payment signature verification failed.' });
  purchase.razorpayPaymentId = paymentId;
  purchase.status = 'paid';
  purchase.paidAt = new Date();
  await purchase.save();
  res.json({ message: 'Payment verified successfully.', purchaseId: purchase._id });
}));

router.get('/key', protect, (_req, res) => {
  if (!process.env.RAZORPAY_KEY_ID || process.env.RAZORPAY_KEY_ID.includes('replace')) return res.status(503).json({ message: 'Razorpay is not configured.' });
  res.json({ keyId: process.env.RAZORPAY_KEY_ID });
});

export default router;
