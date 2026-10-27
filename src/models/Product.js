import mongoose from "mongoose";

const CATEGORIES = [
  // Notes categories
  "Computer Science", "Data Science", "Programming", "Exam Prep",
  "Mathematics", "Physics", "Chemistry",
  // Book categories
  "Fiction", "Non-Fiction", "Academic", "Biography",
  "Self-Help", "Business", "Technology",
];

const productSchema = new mongoose.Schema(
  {
    // ----- Type -----
    type: {
      type: String,
      enum: ["note", "book"],
      default: "note",
      required: true,
      index: true,
    },

    // ----- Common -----
    title: { type: String, required: true, trim: true, maxlength: 180 },
    description: { type: String, default: "", maxlength: 3000 },
    category: { type: String, required: true, enum: CATEGORIES },
    subject: { type: String, default: "" },
    price: { type: Number, required: true, min: 1, max: 100000 },
    oldPrice: { type: Number, min: 0, default: null },
    pages: { type: Number, default: null },

    // ----- Images -----
    thumbnail: { type: String, default: "" },          // public URL
    thumbnailPublicId: { type: String, default: "" },  // cloudinary id

    // ----- Files (notes) -----
    cloudinaryPublicId: { type: String, default: "" },
    cloudinaryResourceType: { type: String, default: "raw" },

    // ----- Book-specific -----
    author: { type: String, default: "" },
    isbn: { type: String, default: "" },
    publisher: { type: String, default: "" },
    language: { type: String, default: "English" },
    format: {
      type: String,
      enum: ["paperback", "hardcover", "ebook", "audiobook", ""],
      default: "",
    },

    // ----- Meta -----
    active: { type: Boolean, default: true, index: true },
    stock: { type: Number, default: null, min: 0 },
  },
  { timestamps: true }
);

// Text index for fast search
productSchema.index({ title: "text", description: "text", subject: "text" });

export const PRODUCT_CATEGORIES = CATEGORIES;
export default mongoose.model("Product", productSchema);