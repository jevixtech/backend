
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
   MULTER — PDF + Thumbnail
============================================ */

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: maxMb * 1024 * 1024,
    files: 2,
  },
  fileFilter: (_req, file, cb) => {
    if (file.fieldname === "pdf") {
      const valid =
        file.mimetype === "application/pdf" ||
        file.originalname.toLowerCase().endsWith(".pdf");

      return cb(
        valid ? null : new Error("Only PDF files are accepted."),
        valid
      );
    }

    if (file.fieldname === "thumbnail") {
      const valid = file.mimetype.startsWith("image/");

      return cb(
        valid ? null : new Error("Thumbnail must be an image."),
        valid
      );
    }

    cb(new Error(`Unexpected file field: ${file.fieldname}`), false);
  },
});

const uploadFields = upload.fields([
  { name: "pdf", maxCount: 1 },
  { name: "thumbnail", maxCount: 1 },
]);

/* ============================================
   CLOUDINARY HELPERS
============================================ */

function isCloudinaryConfigured() {
  return Boolean(
    process.env.CLOUDINARY_CLOUD_NAME &&
      process.env.CLOUDINARY_API_KEY &&
      process.env.CLOUDINARY_API_SECRET
  );
}

function uploadToCloudinary(buffer, options) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      options,
      (error, result) => {
        if (error) return reject(error);
        resolve(result);
      }
    );

    stream.end(buffer);
  });
}

async function deleteCloudinaryResource(publicId, resourceType) {
  if (!publicId) return;

  try {
    await cloudinary.uploader.destroy(publicId, {
      resource_type: resourceType,
    });
  } catch (error) {
    console.error("Cloudinary delete error:", error.message);
  }
}

function safeNote(note) {
  const data = note.toObject();

  delete data.pdfUrl;
  delete data.cloudinaryPublicId;
  delete data.thumbnailPublicId;

  return data;
}

/* ============================================
   GET /notes
   Public — Published Notes
============================================ */

router.get(
  "/",
  asyncHandler(async (_req, res) => {
    const notes = await Note.find({ published: true })
      .select(
        "-pdfUrl -cloudinaryPublicId -thumbnailPublicId -createdBy"
      )
      .sort({ createdAt: -1 });

    res.json({ notes });
  })
);

/* ============================================
   GET /notes/admin/all
   Admin — All Notes
============================================ */

router.get(
  "/admin/all",
  protect,
  adminOnly,
  asyncHandler(async (_req, res) => {
    const notes = await Note.find()
      .select("-pdfUrl -cloudinaryPublicId -thumbnailPublicId")
      .sort({ createdAt: -1 });

    res.json({ notes });
  })
);

/* ============================================
   GET /notes/admin/:id
   Admin — Single Note Details
============================================ */

router.get(
  "/admin/:id",
  protect,
  adminOnly,
  asyncHandler(async (req, res) => {
    const note = await Note.findById(req.params.id);

    if (!note) {
      return res.status(404).json({
        message: "Note not found.",
      });
    }

    res.json({
      note: safeNote(note),
    });
  })
);

/* ============================================
   POST /notes
   Admin — Create Note
   PDF + Optional Thumbnail
============================================ */

router.post(
  "/",
  protect,
  adminOnly,
  uploadFields,
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

    if (
      !title?.trim() ||
      !Number.isFinite(parsedPrice) ||
      parsedPrice < 1
    ) {
      return res.status(400).json({
        message: "Title and a valid price are required.",
      });
    }

    if (!pdfFile) {
      return res.status(400).json({
        message: "Please upload a PDF file.",
      });
    }

    const parsedOldPrice =
      oldPrice === undefined || oldPrice === ""
        ? null
        : Number(oldPrice);

    const parsedPages =
      pages === undefined || pages === ""
        ? null
        : Number(pages);

    if (
      parsedOldPrice !== null &&
      (!Number.isFinite(parsedOldPrice) || parsedOldPrice < 0)
    ) {
      return res.status(400).json({
        message: "Invalid old price.",
      });
    }

    if (
      parsedPages !== null &&
      (!Number.isInteger(parsedPages) || parsedPages < 1)
    ) {
      return res.status(400).json({
        message: "Invalid page count.",
      });
    }

    if (!isCloudinaryConfigured()) {
      return res.status(503).json({
        message: "Cloudinary is not configured. Add credentials to backend/.env.",
      });
    }

    let uploadedPdf = null;
    let uploadedThumbnail = null;

    try {
      // Upload PDF
      uploadedPdf = await uploadToCloudinary(pdfFile.buffer, {
        resource_type: "raw",
        folder: "orbitstech/notes",
        format: "pdf",
        use_filename: true,
        unique_filename: true,
      });

      // Upload thumbnail
      if (thumbFile) {
        uploadedThumbnail = await uploadToCloudinary(
          thumbFile.buffer,
          {
            resource_type: "image",
            folder: "orbitstech/thumbnails",
            transformation: [
              {
                width: 800,
                height: 600,
                crop: "fill",
                quality: "auto",
              },
            ],
          }
        );
      }

      // Save Note
      const note = await Note.create({
        title: title.trim(),
        description,
        category,
        subject,
        price: parsedPrice,
        oldPrice: parsedOldPrice,
        pages: parsedPages,

        pdfUrl: uploadedPdf.secure_url,
        cloudinaryPublicId: uploadedPdf.public_id,

        thumbnail: uploadedThumbnail?.secure_url || "",
        thumbnailPublicId: uploadedThumbnail?.public_id || "",

        createdBy: req.user._id,
      });

      res.status(201).json({
        message: "Note created successfully.",
        note: safeNote(note),
      });
    } catch (error) {
      // Cleanup uploaded files if database save fails
      await deleteCloudinaryResource(
        uploadedPdf?.public_id,
        "raw"
      );

      await deleteCloudinaryResource(
        uploadedThumbnail?.public_id,
        "image"
      );

      throw error;
    }
  })
);

/* ============================================
   PUT /notes/:id
   Admin — Edit Note
   PDF + Thumbnail Optional
============================================ */

router.put(
  "/:id",
  protect,
  adminOnly,
  uploadFields,
  asyncHandler(async (req, res) => {
    const note = await Note.findById(req.params.id);

    if (!note) {
      return res.status(404).json({
        message: "Note not found.",
      });
    }

    const {
      title,
      description,
      category,
      subject,
      price,
      oldPrice,
      pages,
      published,
    } = req.body;

    // Validate title
    if (title !== undefined) {
      if (typeof title !== "string" || !title.trim()) {
        return res.status(400).json({
          message: "Title cannot be empty.",
        });
      }

      note.title = title.trim();
    }

    // Validate price
    if (price !== undefined) {
      const parsedPrice = Number(price);

      if (!Number.isFinite(parsedPrice) || parsedPrice < 1) {
        return res.status(400).json({
          message: "Invalid price.",
        });
      }

      note.price = parsedPrice;
    }

    // Update text fields
    if (description !== undefined) {
      note.description = description;
    }

    if (category !== undefined) {
      note.category = category;
    }

    if (subject !== undefined) {
      note.subject = subject;
    }

    // Old price
    if (oldPrice !== undefined) {
      const parsedOldPrice =
        oldPrice === "" ? null : Number(oldPrice);

      if (
        parsedOldPrice !== null &&
        (!Number.isFinite(parsedOldPrice) || parsedOldPrice < 0)
      ) {
        return res.status(400).json({
          message: "Invalid old price.",
        });
      }

      note.oldPrice = parsedOldPrice;
    }

    // Pages
    if (pages !== undefined) {
      const parsedPages = pages === "" ? null : Number(pages);

      if (
        parsedPages !== null &&
        (!Number.isInteger(parsedPages) || parsedPages < 1)
      ) {
        return res.status(400).json({
          message: "Invalid page count.",
        });
      }

      note.pages = parsedPages;
    }

    // Published
    if (published !== undefined) {
      if (!["true", "false"].includes(String(published))) {
        return res.status(400).json({
          message: "Invalid published value.",
        });
      }

      note.published = String(published) === "true";
    }

    const pdfFile = req.files?.pdf?.[0];
    const thumbFile = req.files?.thumbnail?.[0];

    if ((pdfFile || thumbFile) && !isCloudinaryConfigured()) {
      return res.status(503).json({
        message: "Cloudinary is not configured.",
      });
    }

    const oldPdfId = note.cloudinaryPublicId;
    const oldThumbnailId = note.thumbnailPublicId;

    let uploadedPdf = null;
    let uploadedThumbnail = null;

    try {
      // Upload replacement PDF
      if (pdfFile) {
        uploadedPdf = await uploadToCloudinary(pdfFile.buffer, {
          resource_type: "raw",
          folder: "orbitstech/notes",
          format: "pdf",
          use_filename: true,
          unique_filename: true,
        });

        note.pdfUrl = uploadedPdf.secure_url;
        note.cloudinaryPublicId = uploadedPdf.public_id;
      }

      // Upload replacement thumbnail
      if (thumbFile) {
        uploadedThumbnail = await uploadToCloudinary(
          thumbFile.buffer,
          {
            resource_type: "image",
            folder: "orbitstech/thumbnails",
            transformation: [
              {
                width: 800,
                height: 600,
                crop: "fill",
                quality: "auto",
              },
            ],
          }
        );

        note.thumbnail = uploadedThumbnail.secure_url;
        note.thumbnailPublicId = uploadedThumbnail.public_id;
      }

      await note.save();
    } catch (error) {
      // Remove newly uploaded files if update fails
      await deleteCloudinaryResource(
        uploadedPdf?.public_id,
        "raw"
      );

      await deleteCloudinaryResource(
        uploadedThumbnail?.public_id,
        "image"
      );

      throw error;
    }

    // Delete old files only after successful DB update
    if (uploadedPdf && oldPdfId) {
      await deleteCloudinaryResource(oldPdfId, "raw");
    }

    if (uploadedThumbnail && oldThumbnailId) {
      await deleteCloudinaryResource(oldThumbnailId, "image");
    }

    res.json({
      message: "Note updated successfully.",
      note: safeNote(note),
    });
  })
);

/* ============================================
   PATCH /notes/:id/publish
   Admin — Toggle Published Status
============================================ */

router.patch(
  "/:id/publish",
  protect,
  adminOnly,
  asyncHandler(async (req, res) => {
    const note = await Note.findById(req.params.id);

    if (!note) {
      return res.status(404).json({
        message: "Note not found.",
      });
    }

    note.published = !note.published;

    await note.save();

    res.json({
      message: note.published
        ? "Note published successfully."
        : "Note unpublished successfully.",

      note: safeNote(note),
    });
  })
);

/* ============================================
   DELETE /notes/:id
   Admin — Delete Note
   Purchased Notes Cannot Be Deleted
============================================ */

router.delete(
  "/:id",
  protect,
  adminOnly,
  asyncHandler(async (req, res) => {
    const note = await Note.findById(req.params.id);

    if (!note) {
      return res.status(404).json({
        message: "Note not found.",
      });
    }

    // Check paid purchases
    const paid = await Purchase.exists({
      note: note._id,
      status: "paid",
    });

    if (paid) {
      return res.status(409).json({
        message:
          "This note has purchases. Unpublish it instead of deleting it.",
      });
    }

    // Delete DB document first
    await note.deleteOne();

    // Delete Cloudinary files
    await deleteCloudinaryResource(
      note.cloudinaryPublicId,
      "raw"
    );

    await deleteCloudinaryResource(
      note.thumbnailPublicId,
      "image"
    );

    res.json({
      message: "Note deleted successfully.",
    });
  })
);

export default router;
