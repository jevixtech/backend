import 'dotenv/config';
import { connectDB } from './config/db.js';
import User from './models/User.js';
import Note from './models/Note.js';
import bcrypt from 'bcryptjs';

await connectDB();
const email = (process.env.ADMIN_EMAIL || 'admin@orbitstech.in').toLowerCase();
let admin = await User.findOne({ email });
if (!admin) {
  admin = await User.create({
    name: process.env.ADMIN_NAME || 'OrbitsTech Admin', email,
    passwordHash: await bcrypt.hash(process.env.ADMIN_PASSWORD || 'change_this_admin_password', 12),
    role: 'admin'
  });
}
const samples = [
  ['DBMS Complete Notes','ER models, normalization, SQL and transactions.','Computer Science','Database Management Systems',99],
  ['Python for Data Science','Python, NumPy and Pandas reference.','Data Science','Python · Data Analytics',129],
  ['Operating System Revision Guide','Scheduling, memory and deadlocks.','Computer Science','Operating Systems',89],
  ['DSA Interview Notes','Data structures and algorithm patterns.','Programming','Data Structures & Algorithms',149],
  ['Machine Learning Essentials','Core ML concepts and evaluation.','Data Science','Machine Learning',159],
  ['GATE DA Quick Revision','Quick revision for Data Science & AI.','Exam Prep','GATE Data Science & AI',179]
];
for (const [title, description, category, subject, price] of samples) {
  if (!(await Note.exists({ title }))) {
    await Note.create({ title, description, category, subject, price, pdfUrl: 'https://example.com/replace-with-uploaded-pdf.pdf', cloudinaryPublicId: 'seed-placeholder', createdBy: admin._id, published: false });
  }
}
console.log('Seed complete. Sample notes are unpublished until PDFs are uploaded.');
process.exit(0);
