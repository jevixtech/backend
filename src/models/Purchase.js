import mongoose from 'mongoose';

const purchaseSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  note: { type: mongoose.Schema.Types.ObjectId, ref: 'Note', required: true },
  noteTitle: { type: String, required: true },
  amountPaise: { type: Number, required: true },
  currency: { type: String, default: 'INR' },
  razorpayOrderId: { type: String, required: true, unique: true },
  razorpayPaymentId: { type: String, default: '' },
  status: { type: String, enum: ['created', 'paid', 'failed'], default: 'created' },
  paidAt: { type: Date, default: null }
}, { timestamps: true });

purchaseSchema.index({ user: 1, note: 1, status: 1 });
export default mongoose.model('Purchase', purchaseSchema);
