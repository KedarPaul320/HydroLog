import 'dotenv/config';
import express from 'express';
import bcrypt from 'bcryptjs';
import multer from 'multer';
import fs from 'node:fs';
import path from 'node:path';
import * as XLSX from 'xlsx';
import {
  addMotorInDb,
  addPlantInDb,
  db,
  deleteUserById,
  getAppConfig,
  getReadingById,
  mapUserRow,
  queryReadings,
  renameMotorInDb,
  renamePlantInDb,
  type DbUserRow,
} from './server/db.ts';
import {
  requireAdmin,
  requireAuth,
  signAuthToken,
  type AuthenticatedRequest,
} from './server/auth.ts';
import {
  formatExcelDate,
  formatExcelTime12h,
  isValidMotorStatus,
} from './src/utils/meterLogic.ts';

const PORT = Number(process.env.PORT || 3000);
const IS_PROD = process.env.NODE_ENV === 'production';
const UPLOADS_DIR = path.resolve(process.cwd(), 'uploads');

if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '.jpg').toLowerCase() || '.jpg';
    const safeExt = ['.jpg', '.jpeg', '.png', '.webp'].includes(ext) ? ext : '.jpg';
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}${safeExt}`;
    cb(null, `meter-${unique}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files (JPEG, PNG, WebP) are allowed for meter evidence.'));
    }
  },
});

function normalizeRecordedAt(raw: string): string | null {
  if (!raw || typeof raw !== 'string') return null;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

function isConfiguredPlant(name: string): boolean {
  const { plants } = getAppConfig();
  return plants.some((p) => p.name === name);
}

function isConfiguredMotor(name: string): boolean {
  const { motors } = getAppConfig();
  return motors.some((m) => m.name === name);
}

async function startServer() {
  const app = express();

  app.use(express.json({ limit: '2mb' }));
  app.use('/uploads', express.static(UPLOADS_DIR));

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', service: 'hydrolog-api' });
  });

  // Authentication — Admin-provisioned login only (no public registration)
  app.post('/api/auth/login', (req, res) => {
    const { email, password } = req.body ?? {};
    if (typeof email !== 'string' || typeof password !== 'string' || !email.trim() || !password) {
      res.status(400).json({ error: 'Email and password are required.' });
      return;
    }

    const row = db
      .prepare('SELECT id, name, email, password_hash, role, created_at FROM users WHERE email = ?')
      .get(email.trim().toLowerCase()) as DbUserRow | undefined;

    if (!row || !bcrypt.compareSync(password, row.password_hash)) {
      res.status(401).json({ error: 'Invalid email or password.' });
      return;
    }

    const user = mapUserRow(row);
    const token = signAuthToken(user);
    res.json({ token, user });
  });

  app.get('/api/auth/me', requireAuth, (req: AuthenticatedRequest, res) => {
    res.json({ user: req.user });
  });

  // Plant & Motor Configuration — Read by any authenticated user, mutated by Admin only
  app.get('/api/config', requireAuth, (_req, res) => {
    res.json(getAppConfig());
  });

  app.put('/api/config/plants/:id', requireAuth, requireAdmin, (req, res) => {
    const id = Number(req.params.id);
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: 'Invalid plant ID.' });
      return;
    }
    if (name.length < 2 || name.length > 60) {
      res.status(400).json({ error: 'Plant name must be between 2 and 60 characters.' });
      return;
    }

    const duplicate = db
      .prepare('SELECT id FROM plants WHERE LOWER(name) = LOWER(?) AND id != ?')
      .get(name, id);
    if (duplicate) {
      res.status(409).json({ error: 'Another plant already uses that name.' });
      return;
    }

    const updated = renamePlantInDb(id, name);
    if (!updated) {
      res.status(404).json({ error: 'Plant not found.' });
      return;
    }
    res.json({ plant: updated, config: getAppConfig() });
  });

  app.post('/api/config/plants', requireAuth, requireAdmin, (req, res) => {
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    if (name.length < 2 || name.length > 60) {
      res.status(400).json({ error: 'Plant name must be between 2 and 60 characters.' });
      return;
    }
    const duplicate = db
      .prepare('SELECT id FROM plants WHERE LOWER(name) = LOWER(?)')
      .get(name);
    if (duplicate) {
      res.status(409).json({ error: 'A plant with that name already exists.' });
      return;
    }
    const created = addPlantInDb(name);
    res.status(201).json({ plant: created, config: getAppConfig() });
  });

  app.put('/api/config/motors/:id', requireAuth, requireAdmin, (req, res) => {
    const id = Number(req.params.id);
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: 'Invalid motor ID.' });
      return;
    }
    if (name.length < 2 || name.length > 60) {
      res.status(400).json({ error: 'Motor name must be between 2 and 60 characters.' });
      return;
    }

    const duplicate = db
      .prepare('SELECT id FROM motors WHERE LOWER(name) = LOWER(?) AND id != ?')
      .get(name, id);
    if (duplicate) {
      res.status(409).json({ error: 'Another motor already uses that name.' });
      return;
    }

    const updated = renameMotorInDb(id, name);
    if (!updated) {
      res.status(404).json({ error: 'Motor not found.' });
      return;
    }
    res.json({ motor: updated, config: getAppConfig() });
  });

  app.post('/api/config/motors', requireAuth, requireAdmin, (req, res) => {
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    if (name.length < 2 || name.length > 60) {
      res.status(400).json({ error: 'Motor name must be between 2 and 60 characters.' });
      return;
    }
    const duplicate = db
      .prepare('SELECT id FROM motors WHERE LOWER(name) = LOWER(?)')
      .get(name);
    if (duplicate) {
      res.status(409).json({ error: 'A motor with that name already exists.' });
      return;
    }
    const created = addMotorInDb(name);
    res.status(201).json({ motor: created, config: getAppConfig() });
  });

  // User Management — Admin only
  app.get('/api/users', requireAuth, requireAdmin, (_req, res) => {
    const rows = db
      .prepare(`
        SELECT
          u.id, u.name, u.email, u.password_hash, u.role, u.created_at,
          COUNT(r.id) AS reading_count
        FROM users u
        LEFT JOIN meter_readings r ON r.submitted_by = u.id
        GROUP BY u.id
        ORDER BY u.created_at DESC, u.id DESC
      `)
      .all() as DbUserRow[];

    res.json({ users: rows.map(mapUserRow) });
  });

  app.post('/api/users', requireAuth, requireAdmin, (req, res) => {
    const { name, email, password, role } = req.body ?? {};
    const cleanName = typeof name === 'string' ? name.trim() : '';
    const cleanEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
    const cleanPassword = typeof password === 'string' ? password : '';
    const cleanRole = role === 'admin' ? 'admin' : 'user';

    if (cleanName.length < 2) {
      res.status(400).json({ error: 'Full name must be at least 2 characters.' });
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      res.status(400).json({ error: 'Enter a valid email address.' });
      return;
    }
    if (cleanPassword.length < 6) {
      res.status(400).json({ error: 'Password must be at least 6 characters.' });
      return;
    }

    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(cleanEmail);
    if (existing) {
      res.status(409).json({ error: 'An account with this email already exists.' });
      return;
    }

    const passwordHash = bcrypt.hashSync(cleanPassword, 10);
    const nowIso = new Date().toISOString();
    const info = db
      .prepare(
        'INSERT INTO users (name, email, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?)'
      )
      .run(cleanName, cleanEmail, passwordHash, cleanRole, nowIso);

    const created = db
      .prepare('SELECT id, name, email, password_hash, role, created_at FROM users WHERE id = ?')
      .get(info.lastInsertRowid) as DbUserRow;

    res.status(201).json({
      user: { ...mapUserRow(created), readingCount: 0 },
    });
  });

  app.delete('/api/users/:id', requireAuth, requireAdmin, (req: AuthenticatedRequest, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: 'Invalid user ID.' });
      return;
    }
    if (req.user && req.user.id === id) {
      res.status(400).json({ error: 'You cannot delete your own active administrator account.' });
      return;
    }

    const target = db
      .prepare('SELECT id, role FROM users WHERE id = ?')
      .get(id) as { id: number; role: string } | undefined;
    if (!target) {
      res.status(404).json({ error: 'User account not found.' });
      return;
    }

    if (target.role === 'admin') {
      const adminCount = (
        db.prepare("SELECT COUNT(*) AS count FROM users WHERE role = 'admin'").get() as {
          count: number;
        }
      ).count;
      if (adminCount <= 1) {
        res
          .status(400)
          .json({ error: 'Cannot delete the last remaining administrator account.' });
        return;
      }
    }

    deleteUserById(id);
    res.json({ deletedId: id });
  });

  // Field User Scoped Records — returns strictly the logged-in user's readings
  app.get('/api/readings/mine', requireAuth, (req: AuthenticatedRequest, res) => {
    const plant = typeof req.query.plant === 'string' ? req.query.plant : undefined;
    const motorName = typeof req.query.motorName === 'string' ? req.query.motorName : undefined;
    const motorStatus =
      typeof req.query.motorStatus === 'string' ? req.query.motorStatus : undefined;
    const search = typeof req.query.search === 'string' ? req.query.search : undefined;
    const readings = queryReadings({
      userId: req.user!.id,
      plant,
      motorName,
      motorStatus,
      search,
    });
    res.json({ readings });
  });

  // Admin All Records — full visibility with filtering
  app.get('/api/readings', requireAuth, requireAdmin, (req, res) => {
    const plant = typeof req.query.plant === 'string' ? req.query.plant : undefined;
    const motorName = typeof req.query.motorName === 'string' ? req.query.motorName : undefined;
    const motorStatus =
      typeof req.query.motorStatus === 'string' ? req.query.motorStatus : undefined;
    const userIdRaw = typeof req.query.userId === 'string' ? req.query.userId : undefined;
    const userId =
      userIdRaw && userIdRaw !== 'all' && Number.isFinite(Number(userIdRaw))
        ? Number(userIdRaw)
        : undefined;
    const dateFrom = typeof req.query.dateFrom === 'string' ? req.query.dateFrom : undefined;
    const dateTo = typeof req.query.dateTo === 'string' ? req.query.dateTo : undefined;
    const search = typeof req.query.search === 'string' ? req.query.search : undefined;

    const readings = queryReadings({
      plant,
      motorName,
      motorStatus,
      userId,
      dateFrom,
      dateTo,
      search,
    });
    res.json({ readings });
  });

  // Admin Excel (.xlsx) Export
  app.get('/api/readings/export', requireAuth, requireAdmin, (req, res) => {
    const plant = typeof req.query.plant === 'string' ? req.query.plant : undefined;
    const motorName = typeof req.query.motorName === 'string' ? req.query.motorName : undefined;
    const motorStatus =
      typeof req.query.motorStatus === 'string' ? req.query.motorStatus : undefined;
    const userIdRaw = typeof req.query.userId === 'string' ? req.query.userId : undefined;
    const userId =
      userIdRaw && userIdRaw !== 'all' && Number.isFinite(Number(userIdRaw))
        ? Number(userIdRaw)
        : undefined;
    const dateFrom = typeof req.query.dateFrom === 'string' ? req.query.dateFrom : undefined;
    const dateTo = typeof req.query.dateTo === 'string' ? req.query.dateTo : undefined;
    const search = typeof req.query.search === 'string' ? req.query.search : undefined;

    const tzOffsetRaw =
      typeof req.query.tzOffset === 'string' ? Number(req.query.tzOffset) : 0;
    const tzOffset =
      Number.isFinite(tzOffsetRaw) && Math.abs(tzOffsetRaw) <= 840
        ? Math.trunc(tzOffsetRaw)
        : 0;

    const readings = queryReadings({
      plant,
      motorName,
      motorStatus,
      userId,
      dateFrom,
      dateTo,
      search,
    });

    const rows = readings.map((r) => ({
      'Record ID': r.id,
      Date: formatExcelDate(r.recordedAt, tzOffset),
      Time: formatExcelTime12h(r.recordedAt, tzOffset),
      Plant: r.plant,
      'Motor No.': r.motorName,
      'Motor Status': r.motorStatus,
      'Water Flow (m³)': r.waterFlow,
      'Review / Remarks': r.review || 'Normal operation',
      'Submitted By': r.submittedByName,
      'Operator Email': r.submittedByEmail,
      'Meter Photo URL': r.imageUrl,
    }));

    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(rows);
    worksheet['!cols'] = [
      { wch: 11 },
      { wch: 14 },
      { wch: 13 },
      { wch: 16 },
      { wch: 16 },
      { wch: 14 },
      { wch: 18 },
      { wch: 42 },
      { wch: 20 },
      { wch: 26 },
      { wch: 44 },
    ];
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Water Meter Readings');

    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    const stamp = new Date().toISOString().slice(0, 10);

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="water-meter-readings-${stamp}.xlsx"`
    );
    res.send(buffer);
  });

  // Submit Reading — Both User and Admin
  app.post(
    '/api/readings',
    requireAuth,
    upload.single('image'),
    (req: AuthenticatedRequest, res) => {
      const { waterFlow, plant, motorName, motorStatus, recordedAt, review } = req.body ?? {};
      const parsedFlow = Number(waterFlow);
      const cleanPlant = typeof plant === 'string' ? plant.trim() : '';
      const cleanMotor = typeof motorName === 'string' ? motorName.trim() : '';
      const cleanStatus = typeof motorStatus === 'string' ? motorStatus.trim() : 'Running';

      if (!req.file) {
        res.status(400).json({ error: 'Meter photo evidence is required.' });
        return;
      }
      if (!Number.isFinite(parsedFlow) || parsedFlow <= 0 || parsedFlow > 1_000_000) {
        res.status(400).json({ error: 'Enter a valid water flow in m³ greater than 0.' });
        return;
      }
      if (!cleanPlant || !isConfiguredPlant(cleanPlant)) {
        res.status(400).json({ error: 'Select a valid configured plant.' });
        return;
      }
      if (!cleanMotor || !isConfiguredMotor(cleanMotor)) {
        res.status(400).json({ error: 'Select a valid configured motor.' });
        return;
      }
      if (!isValidMotorStatus(cleanStatus)) {
        res.status(400).json({ error: 'Motor status must be Running or Stopped.' });
        return;
      }

      const isoDate = normalizeRecordedAt(String(recordedAt || new Date().toISOString()));
      if (!isoDate) {
        res.status(400).json({ error: 'Provide a valid date and time.' });
        return;
      }

      const cleanReview = typeof review === 'string' ? review.trim().slice(0, 500) : '';
      const roundedFlow = Math.round(parsedFlow * 100) / 100;
      const imageUrl = `/uploads/${req.file.filename}`;
      const nowIso = new Date().toISOString();

      const info = db
        .prepare(`
          INSERT INTO meter_readings (
            image_url, water_flow, recorded_at, plant, motor_name, motor_status,
            review, submitted_by, submitted_by_name, submitted_by_email, created_at, updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .run(
          imageUrl,
          roundedFlow,
          isoDate,
          cleanPlant,
          cleanMotor,
          cleanStatus,
          cleanReview,
          req.user!.id,
          req.user!.name,
          req.user!.email,
          nowIso,
          nowIso
        );

      const created = getReadingById(Number(info.lastInsertRowid));
      res.status(201).json({ reading: created });
    }
  );

  // Edit Record — Admin only
  app.put(
    '/api/readings/:id',
    requireAuth,
    requireAdmin,
    upload.single('image'),
    (req: AuthenticatedRequest, res) => {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) {
        res.status(400).json({ error: 'Invalid reading ID.' });
        return;
      }

      const existing = getReadingById(id);
      if (!existing) {
        res.status(404).json({ error: 'Meter reading not found.' });
        return;
      }

      const { waterFlow, plant, motorName, motorStatus, recordedAt, review } = req.body ?? {};
      const nextFlow =
        waterFlow !== undefined ? Math.round(Number(waterFlow) * 100) / 100 : existing.waterFlow;
      const nextPlant = plant !== undefined ? String(plant).trim() : existing.plant;
      const nextMotor = motorName !== undefined ? String(motorName).trim() : existing.motorName;
      const nextStatus =
        motorStatus !== undefined ? String(motorStatus).trim() : existing.motorStatus;
      const nextRecordedAt =
        recordedAt !== undefined ? normalizeRecordedAt(String(recordedAt)) : existing.recordedAt;
      const nextReview =
        review !== undefined ? String(review).trim().slice(0, 500) : existing.review;
      const nextImageUrl = req.file ? `/uploads/${req.file.filename}` : existing.imageUrl;

      if (!Number.isFinite(nextFlow) || nextFlow <= 0 || nextFlow > 1_000_000) {
        res.status(400).json({ error: 'Enter a valid water flow in m³ greater than 0.' });
        return;
      }
      if (!nextPlant || !isConfiguredPlant(nextPlant)) {
        res.status(400).json({ error: 'Select a valid configured plant.' });
        return;
      }
      if (!nextMotor || !isConfiguredMotor(nextMotor)) {
        res.status(400).json({ error: 'Select a valid configured motor.' });
        return;
      }
      if (!isValidMotorStatus(nextStatus)) {
        res.status(400).json({ error: 'Motor status must be Running or Stopped.' });
        return;
      }
      if (!nextRecordedAt) {
        res.status(400).json({ error: 'Provide a valid date and time.' });
        return;
      }

      const nowIso = new Date().toISOString();
      db.prepare(`
        UPDATE meter_readings
        SET image_url = ?, water_flow = ?, recorded_at = ?, plant = ?, motor_name = ?,
            motor_status = ?, review = ?, updated_at = ?
        WHERE id = ?
      `).run(
        nextImageUrl,
        nextFlow,
        nextRecordedAt,
        nextPlant,
        nextMotor,
        nextStatus,
        nextReview,
        nowIso,
        id
      );

      const updated = getReadingById(id);
      res.json({ reading: updated });
    }
  );

  // Delete Record — Admin only
  app.delete('/api/readings/:id', requireAuth, requireAdmin, (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: 'Invalid reading ID.' });
      return;
    }
    const result = db.prepare('DELETE FROM meter_readings WHERE id = ?').run(id);
    if (result.changes === 0) {
      res.status(404).json({ error: 'Meter reading not found.' });
      return;
    }
    res.json({ deletedId: id });
  });

  // Multer & API error handler
  app.use(
    (
      err: Error,
      _req: express.Request,
      res: express.Response,
      next: express.NextFunction
    ) => {
      if (err instanceof multer.MulterError || err.message.includes('image')) {
        res.status(400).json({ error: err.message });
        return;
      }
      next(err);
    }
  );

  // Frontend serving (Vite middleware in dev, dist in prod)
  if (!IS_PROD) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir, { index: false }));
    app.get('*', (_req, res) => {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`HydroLog server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start HydroLog server:', err);
  process.exit(1);
});
