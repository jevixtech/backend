import mongoose from 'mongoose';
const orderSchema = new mongoose.Schema({
  receipt: { type: String, required: true, unique: true },
  customer: { name: { type: String, required: true }, email: { type: String, required: true }, mobile: { type: String, required: true } },
  product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  productTitle: { type: String, required: true },
  amount: { type: Number, required: true },
  currency: { type: String, default: 'INR' },
  razorpayOrderId: { type: String, default: '' },
  razorpayPaymentId: { type: String, default: '' },
  status: { type: String, enum: ['created', 'paid', 'failed'], default: 'created' },
  paidAt: { type: Date, default: null }
}, { timestamps: true });
export default mongoose.model('Order', orderSchema);
