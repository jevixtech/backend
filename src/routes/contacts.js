import { Router } from "express";
import Contact from "../models/Contact.js";
import { protect, adminOnly } from "../middleware/auth.js";

const router = Router();

/* =========================================================
   PUBLIC — SUBMIT CONTACT FORM
   POST /api/contacts
========================================================= */

router.post("/", async (req, res) => {
  try {
    const { name, email, phone, subject, message } = req.body;

    /* Validate required fields */
    const missing = [];
    if (!name?.trim()) missing.push("name");
    if (!email?.trim()) missing.push("email");
    if (!subject?.trim()) missing.push("subject");
    if (!message?.trim()) missing.push("message");

    if (missing.length) {
      return res.status(400).json({
        message: `Missing required fields: ${missing.join(", ")}`,
      });
    }

    /* Validate email format */
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      return res.status(400).json({
        message: "Please provide a valid email address",
      });
    }

    /* Basic spam check — reject messages with too many links */
    const linkCount = (message.match(/https?:\/\//gi) || []).length;
    if (linkCount > 3) {
      return res.status(400).json({
        message: "Too many links detected. Please remove some and try again.",
      });
    }

    /* Save contact */
    const contact = await Contact.create({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      phone: phone?.trim() || "",
      subject: subject.trim(),
      message: message.trim(),
      ipAddress: req.ip || req.headers["x-forwarded-for"] || "",
      userAgent: req.headers["user-agent"] || "",
    });

    return res.status(201).json({
      success: true,
      message: "Thank you! Your message has been sent successfully.",
      contact: {
        id: contact._id,
        name: contact.name,
        email: contact.email,
        subject: contact.subject,
        createdAt: contact.createdAt,
      },
    });
  } catch (err) {
    console.error("contact submit error:", err);

    if (err.name === "ValidationError") {
      const messages = Object.values(err.errors).map((e) => e.message);
      return res.status(400).json({ message: messages.join(", ") });
    }

    return res.status(500).json({ message: "Server error. Please try again." });
  }
});

/* =========================================================
   ADMIN — LIST CONTACTS
   GET /api/contacts
========================================================= */

router.get("/", protect, adminOnly, async (req, res) => {
  try {
    const {
      status,
      search,
      page = 1,
      limit = 20,
    } = req.query;

    const filter = {};
    if (status && status !== "all") filter.status = status;

    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
        { subject: { $regex: search, $options: "i" } },
        { message: { $regex: search, $options: "i" } },
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [contacts, total] = await Promise.all([
      Contact.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      Contact.countDocuments(filter),
    ]);

    return res.json({
      contacts,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (err) {
    console.error("contact list error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

/* =========================================================
   ADMIN — STATS
   GET /api/contacts/stats
========================================================= */

router.get("/stats", protect, adminOnly, async (_req, res) => {
  try {
    const [total, newCount, read, replied, archived] = await Promise.all([
      Contact.countDocuments(),
      Contact.countDocuments({ status: "new" }),
      Contact.countDocuments({ status: "read" }),
      Contact.countDocuments({ status: "replied" }),
      Contact.countDocuments({ status: "archived" }),
    ]);

    return res.json({
      total,
      new: newCount,
      read,
      replied,
      archived,
    });
  } catch (err) {
    console.error("contact stats error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

/* =========================================================
   ADMIN — GET ONE
   GET /api/contacts/:id
========================================================= */

router.get("/:id", protect, adminOnly, async (req, res) => {
  try {
    const contact = await Contact.findById(req.params.id);
    if (!contact) {
      return res.status(404).json({ message: "Contact not found" });
    }

    /* Auto mark as read */
    if (contact.status === "new") {
      contact.status = "read";
      await contact.save();
    }

    return res.json({ contact });
  } catch (err) {
    console.error("contact detail error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

/* =========================================================
   ADMIN — UPDATE
   PUT /api/contacts/:id
========================================================= */

router.put("/:id", protect, adminOnly, async (req, res) => {
  try {
    const { status, reply } = req.body;
    const update = {};

    if (status) {
      if (!["new", "read", "replied", "archived"].includes(status)) {
        return res.status(400).json({ message: "Invalid status" });
      }
      update.status = status;
    }

    if (reply !== undefined) {
      update.reply = reply;
      if (reply.trim()) {
        update.status = "replied";
        update.repliedAt = new Date();
      }
    }

    const contact = await Contact.findByIdAndUpdate(req.params.id, update, {
      new: true,
      runValidators: true,
    });

    if (!contact) {
      return res.status(404).json({ message: "Contact not found" });
    }

    return res.json({ contact });
  } catch (err) {
    console.error("contact update error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

/* =========================================================
   ADMIN — DELETE
   DELETE /api/contacts/:id
========================================================= */

router.delete("/:id", protect, adminOnly, async (req, res) => {
  try {
    const contact = await Contact.findByIdAndDelete(req.params.id);
    if (!contact) {
      return res.status(404).json({ message: "Contact not found" });
    }
    return res.json({ message: "Contact deleted", id: req.params.id });
  } catch (err) {
    console.error("contact delete error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

export default router;