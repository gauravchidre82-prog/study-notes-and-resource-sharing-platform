import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import sqlite3 from 'sqlite3';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import multer from 'multer';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const publicDir = path.join(rootDir, 'public');
const uploadsDir = path.join(rootDir, 'uploads');
const dbPath = path.join(rootDir, 'campusnotes.db');

fs.mkdirSync(uploadsDir, { recursive: true });

const app = express();
const PORT = Number(process.env.PORT) || 3001;
const JWT_SECRET = process.env.JWT_SECRET;
const ADMIN_PASSWORD = process.env.CAMPUSNOTES_ADMIN_PASSWORD;
if (!JWT_SECRET || JWT_SECRET.length < 32) {
  throw new Error('JWT_SECRET must be set to a random value of at least 32 characters.');
}
if (!ADMIN_PASSWORD) {
  throw new Error('CAMPUSNOTES_ADMIN_PASSWORD must be set.');
}
const uploadLimit = 25 * 1024 * 1024;
const teacherUploadLimit = 250 * 1024 * 1024;
const allowedExtensions = new Set(['.pdf', '.doc', '.docx', '.ppt', '.pptx', '.jpg', '.jpeg', '.png']);
const allowedTeacherVideoExtensions = new Set(['.mp4', '.webm', '.mov', '.m4v']);
const allowedMaterialTypes = new Set([
  'Subject Notes',
  'Previous Year Question Paper',
  'Manual Lab',
]);

const db = new sqlite3.Database(dbPath);

function dbRun(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(err) {
      if (err) {
        reject(err);
        return;
      }
      resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

function dbGet(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(row);
    });
  });
}

function dbAll(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(rows || []);
    });
  });
}

function dbExec(sql) {
  return new Promise((resolve, reject) => {
    db.exec(sql, (err) => {
      if (err) {
        reject(err);
        return;
      }
      resolve();
    });
  });
}

await dbExec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    studentId TEXT UNIQUE,
    email TEXT UNIQUE NOT NULL,
    phone TEXT,
    branch TEXT,
    year TEXT,
    semester TEXT,
    password TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'student' CHECK(role IN ('student', 'admin')),
    status TEXT NOT NULL DEFAULT 'active',
    createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS teachers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    subject TEXT NOT NULL,
    password TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS materials (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT,
    subject TEXT NOT NULL,
    branch TEXT,
    year TEXT,
    semester TEXT,
    materialType TEXT NOT NULL,
    fileUrl TEXT NOT NULL,
    uploadedBy INTEGER NOT NULL,
    uploadedByRole TEXT NOT NULL DEFAULT 'student',
    videoUrl TEXT,
    status TEXT NOT NULL DEFAULT 'Pending',
    rejectionReason TEXT,
    uploadedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    approvedAt TEXT,
    approvedBy INTEGER,
    FOREIGN KEY(uploadedBy) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS materialRatings (
    materialId INTEGER NOT NULL,
    studentId INTEGER NOT NULL,
    rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
    updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(materialId, studentId),
    FOREIGN KEY(materialId) REFERENCES materials(id),
    FOREIGN KEY(studentId) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS appSettings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    studentUploadsEnabled INTEGER NOT NULL DEFAULT 1,
    updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedBy TEXT
  );

  CREATE TABLE IF NOT EXISTS activityLogs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    action TEXT NOT NULL,
    performedBy TEXT,
    targetId TEXT,
    timestamp TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);

const materialColumns = await dbAll('PRAGMA table_info(materials)');
if (!materialColumns.some((column) => column.name === 'uploadedByRole')) {
  await dbRun("ALTER TABLE materials ADD COLUMN uploadedByRole TEXT NOT NULL DEFAULT 'student'");
}
if (!materialColumns.some((column) => column.name === 'videoUrl')) {
  await dbRun('ALTER TABLE materials ADD COLUMN videoUrl TEXT');
}

const existingSetting = await dbGet('SELECT * FROM appSettings WHERE id = 1');
if (!existingSetting) {
  await dbRun(
    'INSERT INTO appSettings (id, studentUploadsEnabled, updatedAt, updatedBy) VALUES (1, 1, datetime("now"), "system")'
  );
}

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(uploadsDir));
app.use(express.static(publicDir));

function signToken(user) {
  return jwt.sign(
    {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      studentId: user.studentId || null,
      subject: user.subject || null,
    },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

function sendJsonError(res, status, message) {
  return res.status(status).json({ message });
}

function getTokenFromRequest(req) {
  const authorization = req.headers.authorization || '';
  if (!authorization.startsWith('Bearer ')) return null;
  return authorization.replace('Bearer ', '').trim();
}

function verifyToken(req, res, next) {
  const token = getTokenFromRequest(req);
  if (!token) {
    return sendJsonError(res, 401, 'Unauthorized. Please log in again.');
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    return next();
  } catch (error) {
    return sendJsonError(res, 401, 'Invalid or expired session.');
  }
}

function requireRole(role) {
  return (req, res, next) => {
    const userRole = req.user?.role;
    if (!userRole || userRole !== role) {
      return sendJsonError(res, 403, 'You do not have permission to perform this action.');
    }
    return next();
  };
}

async function logAction(action, performedBy, targetId = null) {
  await dbRun(
    'INSERT INTO activityLogs (action, performedBy, targetId, timestamp) VALUES (?, ?, ?, datetime("now"))',
    [action, performedBy, targetId ? String(targetId) : null]
  );
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${uniqueSuffix}${path.extname(file.originalname).toLowerCase()}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: uploadLimit },
  fileFilter: (req, file, cb) => {
    const extension = path.extname(file.originalname).toLowerCase();
    if (!allowedExtensions.has(extension)) {
      return cb(new Error('Unsupported file type. Allowed formats: PDF, DOC, DOCX, PPT, PPTX, JPG, PNG.'));
    }
    cb(null, true);
  },
});

const teacherUpload = multer({
  storage,
  limits: { fileSize: teacherUploadLimit },
  fileFilter: (req, file, cb) => {
    const extension = path.extname(file.originalname).toLowerCase();
    if (!allowedExtensions.has(extension) && !allowedTeacherVideoExtensions.has(extension)) {
      return cb(new Error('Unsupported file type. Upload notes as PDF, DOC, DOCX, PPT, PPTX, JPG, or PNG, or upload videos as MP4, WEBM, MOV, or M4V.'));
    }
    cb(null, true);
  },
});

app.get('/api/health', (req, res) => {
  res.json({ ok: true, message: 'CampusNotes API is running.' });
});

app.get('/api/me', verifyToken, (req, res) => {
  res.json({
    user: {
      id: req.user.id,
      name: req.user.name,
      email: req.user.email,
      role: req.user.role,
      studentId: req.user.studentId,
      subject: req.user.subject,
    },
  });
});

app.post('/api/auth/teacher-register', async (req, res) => {
  try {
    const { fullName, email, subject, password, confirmPassword } = req.body || {};
    const normalizedEmail = String(email || '').trim().toLowerCase();
    const normalizedSubject = String(subject || '').trim();

    if (!fullName || !normalizedEmail || !normalizedSubject || !password) {
      return sendJsonError(res, 400, 'Please complete all required teacher details.');
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      return sendJsonError(res, 400, 'Please enter a valid email address.');
    }

    if (password !== confirmPassword) {
      return sendJsonError(res, 400, 'Passwords do not match.');
    }

    if (password.length < 6) {
      return sendJsonError(res, 400, 'Password must be at least 6 characters long.');
    }

    const existingStudent = await dbGet('SELECT id FROM users WHERE lower(email) = ?', [normalizedEmail]);
    const existingTeacher = await dbGet('SELECT id FROM teachers WHERE email = ?', [normalizedEmail]);
    if (existingStudent || existingTeacher) {
      return sendJsonError(res, 409, 'An account with this email already exists.');
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await dbRun(
      `INSERT INTO teachers (name, email, subject, password, status, createdAt)
       VALUES (?, ?, ?, ?, 'active', datetime('now'))`,
      [String(fullName).trim(), normalizedEmail, normalizedSubject, hashedPassword]
    );
    const teacher = await dbGet('SELECT * FROM teachers WHERE id = ?', [result.lastID]);
    const token = signToken({ ...teacher, role: 'teacher' });

    await logAction('Teacher registered', teacher.email, teacher.id);

    res.status(201).json({
      message: 'Teacher account created successfully.',
      token,
      user: {
        id: teacher.id,
        name: teacher.name,
        email: teacher.email,
        role: 'teacher',
        subject: teacher.subject,
      },
    });
  } catch (error) {
    console.error('Teacher register error:', error);
    return sendJsonError(res, 500, 'Unable to create your teacher account right now.');
  }
});

app.post('/api/auth/teacher-login', async (req, res) => {
  try {
    const { email, subject, password } = req.body || {};
    const normalizedEmail = String(email || '').trim().toLowerCase();
    const normalizedSubject = String(subject || '').trim();

    if (!normalizedEmail || !normalizedSubject || !password) {
      return sendJsonError(res, 400, 'Email, subject, and password are required.');
    }

    const teacher = await dbGet(
      'SELECT * FROM teachers WHERE email = ? AND subject = ?',
      [normalizedEmail, normalizedSubject]
    );

    if (!teacher) {
      return sendJsonError(res, 401, 'Email, subject, or password is incorrect.');
    }

    const isValidPassword = await bcrypt.compare(password, teacher.password);
    if (!isValidPassword) {
      return sendJsonError(res, 401, 'Email, subject, or password is incorrect.');
    }

    if (teacher.status === 'inactive') {
      return sendJsonError(res, 403, 'Your account has been deactivated by the administrator.');
    }

    const user = { ...teacher, role: 'teacher' };
    const token = signToken(user);
    await logAction('Teacher logged in', teacher.email, teacher.id);

    res.json({
      token,
      user: {
        id: teacher.id,
        name: teacher.name,
        email: teacher.email,
        role: 'teacher',
        subject: teacher.subject,
      },
    });
  } catch (error) {
    console.error('Teacher login error:', error);
    return sendJsonError(res, 500, 'Unable to log you in at the moment.');
  }
});

app.post('/api/auth/register', async (req, res) => {
  try {
    const {
      fullName,
      studentId,
      email,
      phone,
      branch,
      year,
      semester,
      password,
      confirmPassword,
    } = req.body || {};

    if (!fullName || !studentId || !email || !branch || !year || !semester || !password) {
      return sendJsonError(res, 400, 'Please complete all required student details.');
    }

    if (password !== confirmPassword) {
      return sendJsonError(res, 400, 'Passwords do not match.');
    }

    if (password.length < 6) {
      return sendJsonError(res, 400, 'Password must be at least 6 characters long.');
    }

    const normalizedEmail = email.trim().toLowerCase();
    const existingUser = await dbGet(
      'SELECT id FROM users WHERE lower(email) = ? OR studentId = ?',
      [normalizedEmail, studentId.trim()]
    );
    if (existingUser) {
      return sendJsonError(res, 409, 'A student account with this email or student ID already exists.');
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await dbRun(
      `INSERT INTO users (name, studentId, email, phone, branch, year, semester, password, role, status, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'student', 'active', datetime('now'))`,
      [fullName.trim(), studentId.trim(), normalizedEmail, phone?.trim() || null, branch.trim(), year.trim(), semester.trim(), hashedPassword]
    );

    const user = await dbGet('SELECT * FROM users WHERE id = ?', [result.lastID]);
    const token = signToken(user);

    await logAction('Student registered', user.email, user.id);

    res.status(201).json({
      message: 'Student account created successfully.',
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        studentId: user.studentId,
      },
    });
  } catch (error) {
    console.error('Register error:', error);
    return sendJsonError(res, 500, 'Unable to create your account right now.');
  }
});

app.post('/api/auth/student-login', async (req, res) => {
  try {
    const { emailOrStudentId, password } = req.body || {};
    if (!emailOrStudentId || !password) {
      return sendJsonError(res, 400, 'Email / Student ID and password are required.');
    }

    const user = await dbGet(
      'SELECT * FROM users WHERE (email = ? OR studentId = ?) AND role = "student"',
      [String(emailOrStudentId).trim().toLowerCase(), String(emailOrStudentId).trim()]
    );

    if (!user) {
      return sendJsonError(res, 401, 'No student account found for that email or student ID.');
    }

    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      return sendJsonError(res, 401, 'Incorrect password.');
    }

    if (user.status === 'inactive') {
      return sendJsonError(res, 403, 'Your account has been deactivated by the administrator.');
    }

    const token = signToken(user);
    await logAction('Student logged in', user.email, user.id);

    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        studentId: user.studentId,
      },
    });
  } catch (error) {
    console.error('Student login error:', error);
    return sendJsonError(res, 500, 'Unable to log you in at the moment.');
  }
});

app.post('/api/auth/admin-login', async (req, res) => {
  const { username, password } = req.body || {};

  if (!password) {
    return sendJsonError(res, 400, 'Please enter the admin password.');
  }

  if (String(password) !== String(ADMIN_PASSWORD)) {
    return sendJsonError(res, 401, 'Access denied. Incorrect admin password.');
  }

  const adminUser = {
    id: 'admin',
    name: String(username || 'Administrator').trim() || 'Administrator',
    email: 'admin@campusnotes.local',
    role: 'admin',
    studentId: null,
  };

  const token = signToken(adminUser);
  await logAction('Admin logged in', adminUser.name, adminUser.id);

  res.json({
    token,
    user: {
      id: adminUser.id,
      name: adminUser.name,
      email: adminUser.email,
      role: adminUser.role,
      studentId: null,
    },
  });
});

app.get('/api/settings/student-uploads', async (req, res) => {
  const setting = await dbGet('SELECT * FROM appSettings WHERE id = 1');
  res.json({
    enabled: Boolean(setting?.studentUploadsEnabled),
    updatedAt: setting?.updatedAt,
    updatedBy: setting?.updatedBy,
  });
});

app.put('/api/settings/student-uploads', verifyToken, requireRole('admin'), async (req, res) => {
  const { enabled } = req.body || {};
  const nextValue = enabled === true || enabled === 'true' || enabled === 1 ? 1 : 0;

  await dbRun(
    'UPDATE appSettings SET studentUploadsEnabled = ?, updatedAt = datetime("now"), updatedBy = ? WHERE id = 1',
    [nextValue, req.user.name || 'admin']
  );

  await logAction(nextValue ? 'Student uploads enabled' : 'Student uploads disabled', req.user.name || 'admin', 'appSettings');

  res.json({
    enabled: Boolean(nextValue),
    message: nextValue ? 'Student uploads have been enabled.' : 'Student uploads have been disabled.',
  });
});

app.get('/api/materials', verifyToken, async (req, res) => {
  try {
    const { status, branch, year, semester, subject, type } = req.query;
    const userRole = req.user.role;

    let query = `
      SELECT m.*, COALESCE(t.name, u.name) AS uploadedByName,
        COALESCE(ratingSummary.averageRating, 0) AS averageRating,
        COALESCE(ratingSummary.ratingCount, 0) AS ratingCount,
        COALESCE(myRating.rating, 0) AS myRating
      FROM materials m
      LEFT JOIN users u ON u.id = m.uploadedBy
      LEFT JOIN teachers t ON t.id = m.uploadedBy AND m.uploadedByRole = 'teacher'
      LEFT JOIN (
        SELECT materialId, AVG(rating) AS averageRating, COUNT(*) AS ratingCount
        FROM materialRatings
        GROUP BY materialId
      ) ratingSummary ON ratingSummary.materialId = m.id
      LEFT JOIN materialRatings myRating ON myRating.materialId = m.id AND myRating.studentId = ?
    `;
    const clauses = [];
    const values = [req.user.id];

    if (userRole === 'student') {
      clauses.push('m.status = ?');
      values.push('Approved');
    } else if (userRole === 'teacher') {
      clauses.push('m.status = ?');
      values.push('Approved');
      clauses.push('m.subject = ?');
      values.push(req.user.subject);
    } else if (status && status !== 'all') {
      clauses.push('m.status = ?');
      values.push(status);
    }

    if (branch) {
      clauses.push('m.branch = ?');
      values.push(branch);
    }
    if (year) {
      clauses.push('m.year = ?');
      values.push(year);
    }
    if (semester) {
      clauses.push('m.semester = ?');
      values.push(semester);
    }
    if (subject) {
      clauses.push('m.subject LIKE ?');
      values.push(`%${subject}%`);
    }
    if (type) {
      clauses.push('m.materialType = ?');
      values.push(type);
    }

    if (clauses.length) {
      query += ` WHERE ${clauses.join(' AND ')}`;
    }

    query += ' ORDER BY m.uploadedAt DESC';

    const rows = await dbAll(query, values);
    res.json(rows);
  } catch (error) {
    console.error('Get materials error:', error);
    sendJsonError(res, 500, 'Unable to load materials.');
  }
});

app.put('/api/materials/:id/rating', verifyToken, requireRole('student'), async (req, res) => {
  try {
    const materialId = Number(req.params.id);
    const rating = Number(req.body?.rating);
    if (!Number.isInteger(materialId) || materialId < 1) {
      return sendJsonError(res, 400, 'Invalid material.');
    }
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return sendJsonError(res, 400, 'Choose a rating from 1 to 5 stars.');
    }

    const material = await dbGet(
      'SELECT id, materialType, status, uploadedBy, uploadedByRole FROM materials WHERE id = ?',
      [materialId]
    );
    if (!material || material.status !== 'Approved' || material.materialType !== 'Subject Notes') {
      return sendJsonError(res, 404, 'Approved notes not found.');
    }
    if (material.uploadedByRole === 'student' && Number(material.uploadedBy) === Number(req.user.id)) {
      return sendJsonError(res, 403, 'You cannot rate your own notes.');
    }

    await dbRun(
      `INSERT INTO materialRatings (materialId, studentId, rating, updatedAt)
       VALUES (?, ?, ?, datetime('now'))
       ON CONFLICT(materialId, studentId)
       DO UPDATE SET rating = excluded.rating, updatedAt = datetime('now')`,
      [materialId, req.user.id, rating]
    );
    res.json({ message: 'Your rating has been saved.' });
  } catch (error) {
    console.error('Save material rating error:', error);
    sendJsonError(res, 500, 'Unable to save your rating.');
  }
});

app.get('/api/teacher/materials', verifyToken, requireRole('teacher'), async (req, res) => {
  try {
    const rows = await dbAll(
      `SELECT m.*, t.name AS uploadedByName
       FROM materials m
       LEFT JOIN teachers t ON t.id = m.uploadedBy AND m.uploadedByRole = 'teacher'
       WHERE m.uploadedBy = ? AND m.uploadedByRole = 'teacher'
       ORDER BY m.uploadedAt DESC`,
      [req.user.id]
    );
    res.json(rows);
  } catch (error) {
    console.error('Get teacher materials error:', error);
    sendJsonError(res, 500, 'Unable to load your teaching materials.');
  }
});

app.get('/api/my-materials', verifyToken, requireRole('student'), async (req, res) => {
  const rows = await dbAll(
    `SELECT m.*, u.name AS uploadedByName
     FROM materials m
     LEFT JOIN users u ON u.id = m.uploadedBy
     WHERE m.uploadedBy = ?
     ORDER BY m.uploadedAt DESC`,
    [req.user.id]
  );
  res.json(rows);
});

app.post('/api/teacher/materials', verifyToken, requireRole('teacher'), async (req, res) => {
  try {
    await new Promise((resolve, reject) => {
      teacherUpload.single('file')(req, res, (error) => (error ? reject(error) : resolve()));
    });

    const {
      title,
      description,
      branch,
      year,
      semester,
      materialType,
      videoUrl,
    } = req.body || {};
    const normalizedType = String(materialType || '').trim();
    const normalizedTitle = String(title || '').trim();
    const normalizedVideoUrl = String(videoUrl || '').trim();
    const uploadedExtension = req.file ? path.extname(req.file.originalname).toLowerCase() : '';
    const uploadedVideo = allowedTeacherVideoExtensions.has(uploadedExtension);

    if (!normalizedTitle || !branch || !year || !semester || !normalizedType) {
      if (req.file) fs.unlinkSync(req.file.path);
      return sendJsonError(res, 400, 'Please fill in all required material details.');
    }

    if (!['Subject Notes', 'Lecture Video'].includes(normalizedType)) {
      if (req.file) fs.unlinkSync(req.file.path);
      return sendJsonError(res, 400, 'Material type must be Subject Notes or Lecture Video.');
    }

    let validatedVideoUrl = null;
    if (normalizedType === 'Lecture Video' && normalizedVideoUrl) {
      try {
        const parsedUrl = new URL(normalizedVideoUrl);
        if (!['http:', 'https:'].includes(parsedUrl.protocol)) throw new Error('Unsupported protocol');
        validatedVideoUrl = parsedUrl.href;
      } catch {
        if (req.file) fs.unlinkSync(req.file.path);
        return sendJsonError(res, 400, 'Enter a valid HTTP or HTTPS lecture video URL.');
      }
    }

    if (normalizedType === 'Subject Notes' && (!req.file || uploadedVideo || normalizedVideoUrl)) {
      if (req.file) fs.unlinkSync(req.file.path);
      return sendJsonError(res, 400, 'Please upload a notes file (PDF, DOC, DOCX, PPT, PPTX, JPG, or PNG).');
    }
    if (normalizedType === 'Subject Notes' && req.file.size > uploadLimit) {
      fs.unlinkSync(req.file.path);
      return sendJsonError(res, 400, 'Notes uploads are limited to 25 MB.');
    }

    if (normalizedType === 'Lecture Video') {
      if (req.file && (!uploadedVideo || validatedVideoUrl)) {
        if (req.file) fs.unlinkSync(req.file.path);
        return sendJsonError(res, 400, 'Upload a supported video file or provide a video link, not both.');
      }
      if (!req.file && !validatedVideoUrl) {
        return sendJsonError(res, 400, 'Upload a lecture video file or provide a video link.');
      }
    }

    const fileUrl = req.file ? `/uploads/${req.file.filename}` : '';
    const result = await dbRun(
      `INSERT INTO materials
        (title, description, subject, branch, year, semester, materialType, fileUrl, uploadedBy, uploadedByRole, videoUrl, status, uploadedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'teacher', ?, 'Pending', datetime('now'))`,
      [
        normalizedTitle,
        String(description || '').trim(),
        req.user.subject,
        String(branch).trim(),
        String(year).trim(),
        String(semester).trim(),
        normalizedType,
        fileUrl,
        req.user.id,
        validatedVideoUrl,
      ]
    );

    await logAction('Teacher material submitted for approval', req.user.name, result.lastID);
    res.status(201).json({
      message: 'Your teaching material has been submitted and is waiting for administrator approval.',
      id: result.lastID,
    });
  } catch (error) {
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    if (error instanceof multer.MulterError) {
      return sendJsonError(res, 400, error.code === 'LIMIT_FILE_SIZE'
        ? 'Uploads are limited to 25 MB for notes and 250 MB for videos.'
        : error.message);
    }
    if (error.message && error.message.startsWith('Unsupported file type.')) {
      return sendJsonError(res, 400, error.message);
    }
    console.error('Teacher material upload error:', error);
    return sendJsonError(res, 500, 'Unable to upload your teaching material.');
  }
});

app.post('/api/materials', verifyToken, requireRole('student'), async (req, res) => {
  try {
    const setting = await dbGet('SELECT studentUploadsEnabled FROM appSettings WHERE id = 1');
    if (!setting || Number(setting.studentUploadsEnabled) !== 1) {
      return sendJsonError(res, 403, 'Student uploads are currently disabled by the administrator. Please try again later.');
    }

    const uploadMiddleware = upload.single('file');
    uploadMiddleware(req, res, async (error) => {
      if (error) {
        return sendJsonError(res, 400, error.message || 'File upload failed.');
      }

      if (!req.file) {
        return sendJsonError(res, 400, 'Please choose a valid file to upload.');
      }

      const {
        title,
        subject,
        description,
        branch,
        year,
        semester,
        materialType,
      } = req.body || {};

      if (!title || !subject || !branch || !year || !semester || !materialType) {
        return sendJsonError(res, 400, 'Please fill in all required material details.');
      }

      const normalizedMaterialType = String(materialType).trim();
      if (!allowedMaterialTypes.has(normalizedMaterialType)) {
        return sendJsonError(res, 400, 'Material type must be one of: Subject Notes, Previous Year Question Paper, Manual Lab.');
      }

      const materialRecord = {
        title: String(title).trim(),
        subject: String(subject).trim(),
        description: String(description || '').trim(),
        branch: String(branch).trim(),
        year: String(year).trim(),
        semester: String(semester).trim(),
        materialType: normalizedMaterialType,
        fileUrl: `/uploads/${req.file.filename}`,
      };

      const result = await dbRun(
        `INSERT INTO materials (title, description, subject, branch, year, semester, materialType, fileUrl, uploadedBy, status, uploadedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pending', datetime('now'))`,
        [materialRecord.title, materialRecord.description, materialRecord.subject, materialRecord.branch, materialRecord.year, materialRecord.semester, materialRecord.materialType, materialRecord.fileUrl, req.user.id]
      );

      await logAction('Material submitted for approval', req.user.name, result.lastID);

      res.status(201).json({
        message: 'Your material has been submitted successfully and is waiting for administrator approval.',
        id: result.lastID,
      });
    });
  } catch (error) {
    console.error('Material upload error:', error);
    return sendJsonError(res, 500, 'Unable to upload your study material.');
  }
});

app.patch('/api/materials/:id/approve', verifyToken, requireRole('admin'), async (req, res) => {
  const { id } = req.params;
  const material = await db.get('SELECT * FROM materials WHERE id = ?', [id]);

  if (!material) {
    return sendJsonError(res, 404, 'Material not found.');
  }

  await dbRun(
    'UPDATE materials SET status = "Approved", approvedAt = datetime("now"), approvedBy = ?, rejectionReason = NULL WHERE id = ?',
    [req.user.id, id]
  );

  await logAction('Material approved', req.user.name, id);

  res.json({ message: 'Material approved and published to students.' });
});

app.patch('/api/materials/:id/reject', verifyToken, requireRole('admin'), async (req, res) => {
  const { id } = req.params;
  const { rejectionReason } = req.body || {};
  const material = await dbGet('SELECT * FROM materials WHERE id = ?', [id]);

  if (!material) {
    return sendJsonError(res, 404, 'Material not found.');
  }

  await dbRun(
    'UPDATE materials SET status = "Rejected", rejectionReason = ?, approvedAt = NULL, approvedBy = NULL WHERE id = ?',
    [rejectionReason ? String(rejectionReason).trim() : 'No reason provided', id]
  );

  await logAction('Material rejected', req.user.name, id);

  res.json({ message: 'Material rejected and hidden from students.' });
});

app.delete('/api/materials/:id', verifyToken, requireRole('admin'), async (req, res) => {
  const { id } = req.params;
  const material = await dbGet('SELECT * FROM materials WHERE id = ?', [id]);

  if (!material) {
    return sendJsonError(res, 404, 'Material not found.');
  }

  if (material.fileUrl && material.fileUrl.startsWith('/uploads/')) {
    const fullPath = path.join(rootDir, material.fileUrl.replace(/^\//, ''));
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
    }
  }

  await dbRun('DELETE FROM materials WHERE id = ?', [id]);
  await logAction('Material deleted', req.user.name, id);

  res.json({ message: 'Material deleted successfully.' });
});

app.get('/api/students', verifyToken, requireRole('admin'), async (req, res) => {
  const students = await dbAll(
    'SELECT id, name, studentId, email, phone, branch, year, semester, status, createdAt FROM users WHERE role = "student" ORDER BY createdAt DESC'
  );
  res.json(students);
});

app.patch('/api/students/:id/status', verifyToken, requireRole('admin'), async (req, res) => {
  const { id } = req.params;
  const { status } = req.body || {};
  const nextStatus = status === 'active' || status === 'inactive' ? status : 'active';

  const user = await dbGet('SELECT * FROM users WHERE id = ?', [id]);
  if (!user) {
    return sendJsonError(res, 404, 'Student not found.');
  }

  await dbRun('UPDATE users SET status = ? WHERE id = ?', [nextStatus, id]);
  await logAction(nextStatus === 'active' ? 'Student activated' : 'Student deactivated', req.user.name, id);

  res.json({
    message: nextStatus === 'active' ? 'Student account activated.' : 'Student account deactivated.',
    status: nextStatus,
  });
});

app.get('/api/dashboard/stats', verifyToken, requireRole('admin'), async (req, res) => {
  const totalStudents = await dbGet('SELECT COUNT(*) AS count FROM users WHERE role = "student"');
  const totalMaterials = await dbGet('SELECT COUNT(*) AS count FROM materials');
  const pendingMaterials = await dbGet('SELECT COUNT(*) AS count FROM materials WHERE status = "Pending"');
  const approvedMaterials = await dbGet('SELECT COUNT(*) AS count FROM materials WHERE status = "Approved"');
  const rejectedMaterials = await dbGet('SELECT COUNT(*) AS count FROM materials WHERE status = "Rejected"');

  const setting = await dbGet('SELECT studentUploadsEnabled FROM appSettings WHERE id = 1');

  res.json({
    totalStudents: totalStudents?.count || 0,
    totalMaterials: totalMaterials?.count || 0,
    pendingMaterials: pendingMaterials?.count || 0,
    approvedMaterials: approvedMaterials?.count || 0,
    rejectedMaterials: rejectedMaterials?.count || 0,
    totalDownloads: 0,
    studentUploadStatus: Number(setting?.studentUploadsEnabled ?? 0) === 1 ? 'Enabled' : 'Disabled',
  });
});

app.get('/api/activity-logs', verifyToken, requireRole('admin'), async (req, res) => {
  const logs = await dbAll(
    'SELECT * FROM activityLogs ORDER BY timestamp DESC LIMIT 50'
  );
  res.json(logs);
});

app.get('/api/health-check', (req, res) => {
  res.json({ ok: true });
});

app.use((req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`CampusNotes server listening on port ${PORT} on all network interfaces.`);
  console.log(`On this computer: http://localhost:${PORT}`);
  console.log(`On another device: http://<this-computer-LAN-IP>:${PORT}`);
});
