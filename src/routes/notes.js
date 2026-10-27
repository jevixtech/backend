import { Router } from "express";
import multer from "multer";
import cloudinary from "../config/cloudinary.js";
import Note from "../models/Note.js";
import Purchase from "../models/Purchase.js";
import { protect, adminOnly } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const router = Router();

const maxMb = Math.max(1, Number(process.env.MAX_PDF_MB || 25));

/* ============================================
   MULTER — 2 files: pdf + thumbnail
   ============================================ */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: maxMb * 1024 * 1024,
    files: 2,                         // ✅ 2 files allowed
  },
  fileFilter: (_req, file, cb) => {
    if (file.fieldname === "pdf") {
      const valid =
        file.mimetype === "application/pdf" ||
        file.originalname.toLowerCase().endsWith(".pdf");
      return cb(valid ? null : new Error("Only PDF files are accepted."), valid);
    }
    if (file.fieldname === "thumbnail") {
      const valid = file.mimetype.startsWith("image/");
      return cb(valid ? null : new Error("Thumbnail must be an image."), valid);
    }
    cb(new Error(`Unexpected file field: ${file.fieldname}`), false);
  },
});

/* ============================================
   GET /notes  — list published notes
   ============================================ */
router.get(
  "/",
  asyncHandler(async (_req, res) => {
    const notes = await Note.find({ published: true })
      .select("-pdfUrl -cloudinaryPublicId -thumbnailPublicId -createdBy")
      .sort({ createdAt: -1 });
    res.json({ notes });
  })
);

/* ============================================
   POST /notes  — create note (pdf + optional thumbnail)
   ============================================ */
router.post(
  "/",
  protect,
  adminOnly,
  upload.fields([
    { name: "pdf", maxCount: 1 },
    { name: "thumbnail", maxCount: 1 },
  ]),
  asyncHandler(async (req, res) => {
    const {
      title,
      description = "",
      category = "Computer Science",
      subject = "",
      price,
      oldPrice,
      pages,
    } = req.body;

    const pdfFile = req.files?.pdf?.[0];
    const thumbFile = req.files?.thumbnail?.[0];

    const parsedPrice = Number(price);
    if (!title?.trim() || !Number.isFinite(parsedPrice) || parsedPrice < 1) {
      return res
        .status(400)
        .json({ message: "Title and a valid price are required." });
    }
    if (!pdfFile) {
      return res.status(400).json({ message: "Please upload a PDF file." });
    }
    if (
      !process.env.CLOUDINARY_CLOUD_NAME ||
      !process.env.CLOUDINARY_API_KEY ||
      !process.env.CLOUDINARY_API_SECRET
    ) {
      return res.status(503).json({
        message: "Cloudinary is not configured. Add credentials to backend/.env.",
      });
    }

    /* ---------- Upload PDF ---------- */
    const uploaded = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          resource_type: "raw",
          folder: "orbitstech/notes",
          format: "pdf",
          use_filename: true,
          unique_filename: true,
        },
        (error, result) => (error ? reject(error) : resolve(result))
      );
      stream.end(pdfFile.buffer);
    });

    /* ---------- Upload thumbnail (optional) ---------- */
    let thumbUploaded = null;
    if (thumbFile) {
      thumbUploaded = await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          {
            resource_type: "image",
            folder: "orbitstech/thumbnails",
            transformation: [
              { width: 800, height: 600, crop: "fill", quality: "auto" },
            ],
          },
          (error, result) => (error ? reject(error) : resolve(result))
        );
        stream.end(thumbFile.buffer);
      });
    }

    /* ---------- Save to DB ---------- */
    const note = await Note.create({
      title: title.trim(),
      description,
      category,
      subject,
      price: parsedPrice,
      oldPrice: oldPrice ? Number(oldPrice) : null,
      pages: pages ? Number(pages) : null,

      // PDF
      pdfUrl: uploaded.secure_url,
      cloudinaryPublicId: uploaded.public_id,

      // Thumbnail
      thumbnail: thumbUploaded?.secure_url || "",
      thumbnailPublicId: thumbUploaded?.public_id || "",

      createdBy: req.user._id,
    });

    res.status(201).json({
      note: {
        ...note.toObject(),
        pdfUrl: undefined,
        cloudinaryPublicId: undefined,
        thumbnailPublicId: undefined,
      },
    });
  })
);

/* ============================================
   DELETE /notes/:id — soft-delete if purchased
   ============================================ */
router.delete(
  "/:id",
  protect,
  adminOnly,
  asyncHandler(async (req, res) => {
    const note = await Note.findById(req.params.id);
    if (!note) {
      return res.status(404).json({ message: "Note not found." });
    }

    const paid = await Purchase.exists({ note: note._id, status: "paid" });
    if (paid) {
      return res.status(409).json({
        message: "This note has purchases. Unpublish it instead of deleting it.",
      });
    }

    // Destroy Cloudinary resources
    await cloudinary.uploader
      .destroy(note.cloudinaryPublicId, { resource_type: "raw" })
      .catch(() => {});
    if (note.thumbnailPublicId) {
      await cloudinary.uploader
        .destroy(note.thumbnailPublicId, { resource_type: "image" })
        .catch(() => {});
    }

    await note.deleteOne();
    res.json({ message: "Note deleted." });
  })
);

export default router;