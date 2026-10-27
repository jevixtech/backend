import mongoose from "mongoose";

const noteSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 180 },
    description: { type: String, default: "", maxlength: 3000 },
    category: { type: String, default: "Computer Science", trim: true },
    subject: { type: String, default: "", trim: true },
    price: { type: Number, required: true, min: 1 },
    oldPrice: { type: Number, default: null, min: 1 },
    pages: { type: Number, default: null },

    // ---------- PDF ----------
    pdfUrl: { type: String, required: true },
    cloudinaryPublicId: { type: String, required: true },

    // ---------- Thumbnail (NEW) ----------
    thumbnail: { type: String, default: "" },
    thumbnailPublicId: { type: String, default: "" },

    // ---------- Meta ----------
    published: { type: Boolean, default: true },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true }
);

/* Fast search */
noteSchema.index({ title: "text", description: "text", subject: "text" });

export default mongoose.model("Note", noteSchema);