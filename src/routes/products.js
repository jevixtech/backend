import { Router } from "express";
import multer from "multer";
import Product from "../models/Product.js";
import { requireAdmin } from "../middleware/auth.js";
import cloudinary, { cloudinaryReady } from "../utils/cloudinary.js";

const router = Router();

const NOTE_CATEGORIES = [
  "Computer Science", "Data Science", "Programming", "Exam Prep",
  "Mathematics", "Physics", "Chemistry",
];

/* ========== MULTER — 2 files allowed ========== */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 25 * 1024 * 1024,   // 25 MB
    files: 2,                      // ✅ 2 files total
  },
  fileFilter: (_req, file, cb) => {
    if (file.fieldname === "pdf") {
      const ok =
        file.mimetype === "application/pdf" ||
        file.originalname.toLowerCase().endsWith(".pdf");
      return ok ? cb(null, true) : cb(new Error("PDF must be a PDF file."));
    }
    if (file.fieldname === "thumbnail") {
      return file.mimetype.startsWith("image/")
        ? cb(null, true)
        : cb(new Error("Thumbnail must be an image."));
    }
    cb(new Error(`Unexpected field: ${file.fieldname}`));
  },
});

/* ========== GET /notes ========== */
router.get("/", async (req, res, next) => {
  try {
    const filter = { active: true, type: "note" };
    if (req.query.category && req.query.category !== "All") {
      filter.category = req.query.category;
    }
    if (req.query.q) {
      const q = String(req.query.q).slice(0, 80);
      filter.$or = ["title", "description", "subject", "category"].map(
        (k) => ({ [k]: { $regex: q, $options: "i" } })
      );
    }
    const notes = await Product.find(filter)
      .select("-cloudinaryPublicId -thumbnailPublicId")
      .sort({ createdAt: -1 })
      .lean();
    res.json({ notes, products: notes });
  } catch (e) {
    next(e);
  }
});

/* ========== POST /notes — accepts pdf + thumbnail ========== */
router.post(
  "/",
  requireAdmin,
  upload.fields([
    { name: "pdf", maxCount: 1 },
    { name: "thumbnail", maxCount: 1 },
  ]),
  async (req, res, next) => {
    try {
      console.log("📥 Received files:", Object.keys(req.files || {}));
      console.log("📥 pdf:", req.files?.pdf?.[0]?.originalname);
      console.log("📥 thumbnail:", req.files?.thumbnail?.[0]?.originalname);

      const pdfFile = req.files?.pdf?.[0];
      const thumbFile = req.files?.thumbnail?.[0];

      if (!pdfFile) {
        return res.status(400).json({ message: "Select a PDF file." });
      }
      if (!cloudinaryReady()) {
        return res.status(503).json({ message: "Cloudinary not configured." });
      }

      const title = String(req.body.title || "").trim();
      const price = Number(req.body.price);
      if (
        !title ||
        !Number.isFinite(price) ||
        price < 1 ||
        !NOTE_CATEGORIES.includes(req.body.category)
      ) {
        return res
          .status(400)
          .json({ message: "Enter a title, valid price and category." });
      }

      // PDF upload
      const pdfUploaded = await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          {
            resource_type: "raw",
            folder: "orbitstech/paid-notes",
            public_id: `${Date.now()}-${title
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, "-")
              .slice(0, 50)}.pdf`,
            access_mode: "authenticated",
            type: "authenticated",
          },
          (err, result) => (err ? reject(err) : resolve(result))
        );
        stream.end(pdfFile.buffer);
      });

      // Thumbnail upload (optional)
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
            (err, result) => (err ? reject(err) : resolve(result))
          );
          stream.end(thumbFile.buffer);
        });
      }

      const note = await Product.create({
        type: "note",
        title,
        description: String(req.body.description || ""),
        category: req.body.category,
        subject: String(req.body.subject || ""),
        price,
        oldPrice: req.body.oldPrice ? Number(req.body.oldPrice) : null,
        pages: req.body.pages ? Number(req.body.pages) : null,
        cloudinaryPublicId: pdfUploaded.public_id,
        cloudinaryResourceType: "raw",
        thumbnail: thumbUploaded?.secure_url || "",
        thumbnailPublicId: thumbUploaded?.public_id || "",
      });

      res.status(201).json({
        note: {
          ...note.toObject(),
          cloudinaryPublicId: undefined,
          thumbnailPublicId: undefined,
        },
      });
    } catch (e) {
      next(e);
    }
  }
);

/* ========== DELETE /notes/:id ========== */
router.delete("/:id", requireAdmin, async (req, res, next) => {
  try {
    const p = await Product.findByIdAndUpdate(
      req.params.id,
      { active: false },
      { new: true }
    );
    if (!p) return res.status(404).json({ message: "Note not found." });
    res.json({ message: "Note removed." });
  } catch (e) {
    next(e);
  }
});

export default router;