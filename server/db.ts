import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import fs from 'node:fs';
import path from 'node:path';
import type {
  AppConfig,
  MeterReading,
  MotorItem,
  MotorStatus,
  PlantItem,
  User,
  UserRole,
} from '../src/types.ts';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_PATH = path.join(DATA_DIR, 'water_meters.db');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

export const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('admin', 'user')),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );

  CREATE TABLE IF NOT EXISTS plants (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE COLLATE NOCASE,
    sort_order INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS motors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE COLLATE NOCASE,
    sort_order INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS meter_readings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    image_url TEXT NOT NULL,
    water_flow REAL NOT NULL CHECK (water_flow > 0),
    recorded_at TEXT NOT NULL,
    plant TEXT NOT NULL,
    motor_name TEXT NOT NULL DEFAULT 'Motor 1',
    motor_status TEXT NOT NULL DEFAULT 'Running' CHECK (motor_status IN ('Running', 'Stopped')),
    review TEXT NOT NULL DEFAULT '',
    submitted_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    submitted_by_name TEXT NOT NULL DEFAULT '',
    submitted_by_email TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );

  CREATE INDEX IF NOT EXISTS idx_readings_plant ON meter_readings(plant);
  CREATE INDEX IF NOT EXISTS idx_readings_motor_name ON meter_readings(motor_name);
  CREATE INDEX IF NOT EXISTS idx_readings_submitted_by ON meter_readings(submitted_by);
  CREATE INDEX IF NOT EXISTS idx_readings_recorded_at ON meter_readings(recorded_at DESC);
`);

// Safe migration for pre-existing databases (editable plants, motor cols, and ON DELETE SET NULL for user deletion)
function migrateReadingsSchemaIfNeeded(): void {
  const columns = db.prepare('PRAGMA table_info(meter_readings)').all() as Array<{ name: string }>;
  const colNames = new Set(columns.map((c) => c.name));
  const tableRow = db
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'meter_readings'")
    .get() as { sql?: string } | undefined;

  const hasLegacyPlantCheck = Boolean(tableRow?.sql?.includes("CHECK (plant IN ('Plant A'"));
  const hasRestrictFk = Boolean(tableRow?.sql?.includes('ON DELETE RESTRICT'));
  const missingCols =
    !colNames.has('motor_name') ||
    !colNames.has('motor_status') ||
    !colNames.has('submitted_by_name') ||
    !colNames.has('submitted_by_email');

  if (!hasLegacyPlantCheck && !hasRestrictFk && !missingCols) {
    return;
  }

  db.pragma('foreign_keys = OFF');
  const rebuild = db.transaction(() => {
    db.exec(`
      CREATE TABLE meter_readings_v3 (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        image_url TEXT NOT NULL,
        water_flow REAL NOT NULL CHECK (water_flow > 0),
        recorded_at TEXT NOT NULL,
        plant TEXT NOT NULL,
        motor_name TEXT NOT NULL DEFAULT 'Motor 1',
        motor_status TEXT NOT NULL DEFAULT 'Running' CHECK (motor_status IN ('Running', 'Stopped')),
        review TEXT NOT NULL DEFAULT '',
        submitted_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        submitted_by_name TEXT NOT NULL DEFAULT '',
        submitted_by_email TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      );
    `);

    const motorNameExpr = colNames.has('motor_name') ? 'r.motor_name' : "'Motor 1'";
    const motorStatusExpr = colNames.has('motor_status') ? 'r.motor_status' : "'Running'";
    const nameExpr = colNames.has('submitted_by_name')
      ? "COALESCE(NULLIF(r.submitted_by_name, ''), u.name, 'Deleted User')"
      : "COALESCE(u.name, 'Deleted User')";
    const emailExpr = colNames.has('submitted_by_email')
      ? "COALESCE(NULLIF(r.submitted_by_email, ''), u.email, '')"
      : "COALESCE(u.email, '')";

    db.exec(`
      INSERT INTO meter_readings_v3 (
        id, image_url, water_flow, recorded_at, plant, motor_name, motor_status,
        review, submitted_by, submitted_by_name, submitted_by_email, created_at, updated_at
      )
      SELECT
        r.id, r.image_url, r.water_flow, r.recorded_at, r.plant, ${motorNameExpr}, ${motorStatusExpr},
        r.review, r.submitted_by, ${nameExpr}, ${emailExpr}, r.created_at, r.updated_at
      FROM meter_readings r
      LEFT JOIN users u ON u.id = r.submitted_by;
    `);

    db.exec('DROP TABLE meter_readings;');
    db.exec('ALTER TABLE meter_readings_v3 RENAME TO meter_readings;');
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_readings_plant ON meter_readings(plant);
      CREATE INDEX IF NOT EXISTS idx_readings_motor_name ON meter_readings(motor_name);
      CREATE INDEX IF NOT EXISTS idx_readings_submitted_by ON meter_readings(submitted_by);
      CREATE INDEX IF NOT EXISTS idx_readings_recorded_at ON meter_readings(recorded_at DESC);
    `);
  });

  rebuild();
  db.pragma('foreign_keys = ON');
}

migrateReadingsSchemaIfNeeded();

export interface DbUserRow {
  id: number;
  name: string;
  email: string;
  password_hash: string;
  role: UserRole;
  created_at: string;
  reading_count?: number;
}

export interface DbReadingRow {
  id: number;
  image_url: string;
  water_flow: number;
  recorded_at: string;
  plant: string;
  motor_name: string;
  motor_status: MotorStatus;
  review: string;
  submitted_by: number | null;
  submitted_by_name: string;
  submitted_by_email: string;
  created_at: string;
  updated_at: string;
}

export function mapUserRow(row: DbUserRow): User {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    createdAt: row.created_at,
    ...(row.reading_count !== undefined ? { readingCount: row.reading_count } : {}),
  };
}

export function mapReadingRow(row: DbReadingRow): MeterReading {
  return {
    id: row.id,
    imageUrl: row.image_url,
    waterFlow: Number(row.water_flow),
    recordedAt: row.recorded_at,
    plant: row.plant,
    motorName: row.motor_name || 'Motor 1',
    motorStatus: row.motor_status === 'Stopped' ? 'Stopped' : 'Running',
    review: row.review,
    submittedBy: row.submitted_by ?? 0,
    submittedByName: row.submitted_by_name || 'Deleted User',
    submittedByEmail: row.submitted_by_email || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function seedPlantsAndMotors(): void {
  const plantCount = (db.prepare('SELECT COUNT(*) as count FROM plants').get() as { count: number }).count;
  if (plantCount === 0) {
    const insertPlant = db.prepare('INSERT INTO plants (name, sort_order) VALUES (?, ?)');
    insertPlant.run('Plant A', 1);
    insertPlant.run('Plant B', 2);
    insertPlant.run('Plant C', 3);
  }

  const motorCount = (db.prepare('SELECT COUNT(*) as count FROM motors').get() as { count: number }).count;
  if (motorCount === 0) {
    const insertMotor = db.prepare('INSERT INTO motors (name, sort_order) VALUES (?, ?)');
    insertMotor.run('Motor 1', 1);
    insertMotor.run('Motor 2', 2);
    insertMotor.run('Motor 3', 3);
  }
}

export function seedInitialData(): void {
  seedPlantsAndMotors();

  const userCountRow = db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number };
  if (userCountRow.count > 0) {
    return;
  }

  const insertUser = db.prepare(`
    INSERT INTO users (name, email, password_hash, role, created_at)
    VALUES (?, ?, ?, ?, ?)
  `);

  const adminHash = bcrypt.hashSync('admin123', 10);
  const fieldHash = bcrypt.hashSync('field123', 10);

  const adminInfo = insertUser.run(
    'Elena Vance',
    'admin@aquaflow.io',
    adminHash,
    'admin',
    '2026-11-01T08:00:00.000Z'
  );
  const marcusInfo = insertUser.run(
    'Marcus Chen',
    'marcus@aquaflow.io',
    fieldHash,
    'user',
    '2026-11-02T09:15:00.000Z'
  );
  const priyaInfo = insertUser.run(
    'Priya Nair',
    'priya@aquaflow.io',
    fieldHash,
    'user',
    '2026-11-03T10:30:00.000Z'
  );

  const adminId = Number(adminInfo.lastInsertRowid);
  const marcusId = Number(marcusInfo.lastInsertRowid);
  const priyaId = Number(priyaInfo.lastInsertRowid);

  const imgPlantA = '/src/assets/images/meter_plant_a_1795143190179.jpg';
  const imgPlantB = '/src/assets/images/meter_plant_b_1795143191668.jpg';
  const imgPlantC = '/src/assets/images/meter_plant_c_1795143192398.jpg';
  const imgValve = '/src/assets/images/meter_plant_a_valve_1795143192497.jpg';

  const seededReadings: Array<{
    imageUrl: string;
    waterFlow: number;
    recordedAt: string;
    plant: string;
    motorName: string;
    motorStatus: MotorStatus;
    review: string;
    submittedBy: number;
  }> = [
    {
      imageUrl: imgPlantA,
      waterFlow: 482.4,
      recordedAt: '2026-11-19T08:15:00.000Z',
      plant: 'Plant A',
      motorName: 'Motor 1',
      motorStatus: 'Running',
      review: 'Normal operation',
      submittedBy: marcusId,
    },
    {
      imageUrl: imgPlantB,
      waterFlow: 147.92,
      recordedAt: '2026-11-19T09:40:00.000Z',
      plant: 'Plant B',
      motorName: 'Motor 2',
      motorStatus: 'Running',
      review: 'Minor condensation behind turbine dial glass; register still clearly legible.',
      submittedBy: marcusId,
    },
    {
      imageUrl: imgPlantC,
      waterFlow: 318.65,
      recordedAt: '2026-11-19T11:05:00.000Z',
      plant: 'Plant C',
      motorName: 'Motor 3',
      motorStatus: 'Running',
      review: 'Normal operation',
      submittedBy: priyaId,
    },
    {
      imageUrl: imgValve,
      waterFlow: 412.1,
      recordedAt: '2026-11-18T16:20:00.000Z',
      plant: 'Plant A',
      motorName: 'Motor 2',
      motorStatus: 'Stopped',
      review: 'Pressure gauge fluctuating slightly during standby pump switchover.',
      submittedBy: marcusId,
    },
    {
      imageUrl: imgPlantB,
      waterFlow: 164.35,
      recordedAt: '2026-11-18T14:10:00.000Z',
      plant: 'Plant B',
      motorName: 'Motor 1',
      motorStatus: 'Running',
      review: 'Normal operation',
      submittedBy: priyaId,
    },
    {
      imageUrl: imgPlantC,
      waterFlow: 295.8,
      recordedAt: '2026-11-17T15:50:00.000Z',
      plant: 'Plant C',
      motorName: 'Motor 3',
      motorStatus: 'Running',
      review: 'Ultrasonic manifold cable clamp tightened after routine inspection.',
      submittedBy: adminId,
    },
    {
      imageUrl: imgPlantA,
      waterFlow: 451.25,
      recordedAt: '2026-11-17T08:30:00.000Z',
      plant: 'Plant A',
      motorName: 'Motor 1',
      motorStatus: 'Running',
      review: 'Normal operation',
      submittedBy: marcusId,
    },
    {
      imageUrl: imgPlantB,
      waterFlow: 158.9,
      recordedAt: '2026-11-16T10:15:00.000Z',
      plant: 'Plant B',
      motorName: 'Motor 2',
      motorStatus: 'Stopped',
      review: 'Slight seepage noticed at downstream flange bolt #3; motor halted for check.',
      submittedBy: priyaId,
    },
    {
      imageUrl: imgPlantC,
      waterFlow: 304.4,
      recordedAt: '2026-11-15T09:00:00.000Z',
      plant: 'Plant C',
      motorName: 'Motor 3',
      motorStatus: 'Running',
      review: 'Normal operation',
      submittedBy: priyaId,
    },
  ];

  const userLookup = new Map<number, { name: string; email: string }>([
    [adminId, { name: 'Elena Vance', email: 'admin@aquaflow.io' }],
    [marcusId, { name: 'Marcus Chen', email: 'marcus@aquaflow.io' }],
    [priyaId, { name: 'Priya Nair', email: 'priya@aquaflow.io' }],
  ]);

  const insertReading = db.prepare(`
    INSERT INTO meter_readings (
      image_url, water_flow, recorded_at, plant, motor_name, motor_status,
      review, submitted_by, submitted_by_name, submitted_by_email, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertMany = db.transaction((items: typeof seededReadings) => {
    for (const item of items) {
      const owner = userLookup.get(item.submittedBy) ?? { name: 'Deleted User', email: '' };
      insertReading.run(
        item.imageUrl,
        item.waterFlow,
        item.recordedAt,
        item.plant,
        item.motorName,
        item.motorStatus,
        item.review,
        item.submittedBy,
        owner.name,
        owner.email,
        item.recordedAt,
        item.recordedAt
      );
    }
  });

  insertMany(seededReadings);
}

export function getAppConfig(): AppConfig {
  const plantRows = db
    .prepare('SELECT id, name, sort_order FROM plants ORDER BY sort_order ASC, id ASC')
    .all() as Array<{ id: number; name: string; sort_order: number }>;

  const motorRows = db
    .prepare('SELECT id, name, sort_order FROM motors ORDER BY sort_order ASC, id ASC')
    .all() as Array<{ id: number; name: string; sort_order: number }>;

  const plants: PlantItem[] = plantRows.map((p) => ({
    id: p.id,
    name: p.name,
    sortOrder: p.sort_order,
  }));

  const motors: MotorItem[] = motorRows.map((m) => ({
    id: m.id,
    name: m.name,
    sortOrder: m.sort_order,
  }));

  return { plants, motors };
}

export function renamePlantInDb(id: number, newName: string): PlantItem | null {
  const existing = db
    .prepare('SELECT id, name, sort_order FROM plants WHERE id = ?')
    .get(id) as { id: number; name: string; sort_order: number } | undefined;
  if (!existing) return null;

  const renameTx = db.transaction(() => {
    db.prepare('UPDATE plants SET name = ? WHERE id = ?').run(newName, id);
    db.prepare('UPDATE meter_readings SET plant = ? WHERE plant = ?').run(newName, existing.name);
  });
  renameTx();

  return { id: existing.id, name: newName, sortOrder: existing.sort_order };
}

export function addPlantInDb(name: string): PlantItem {
  const maxRow = db.prepare('SELECT COALESCE(MAX(sort_order), 0) AS maxOrder FROM plants').get() as {
    maxOrder: number;
  };
  const nextOrder = maxRow.maxOrder + 1;
  const info = db
    .prepare('INSERT INTO plants (name, sort_order) VALUES (?, ?)')
    .run(name, nextOrder);
  return { id: Number(info.lastInsertRowid), name, sortOrder: nextOrder };
}

export function renameMotorInDb(id: number, newName: string): MotorItem | null {
  const existing = db
    .prepare('SELECT id, name, sort_order FROM motors WHERE id = ?')
    .get(id) as { id: number; name: string; sort_order: number } | undefined;
  if (!existing) return null;

  const renameTx = db.transaction(() => {
    db.prepare('UPDATE motors SET name = ? WHERE id = ?').run(newName, id);
    db.prepare('UPDATE meter_readings SET motor_name = ? WHERE motor_name = ?').run(
      newName,
      existing.name
    );
  });
  renameTx();

  return { id: existing.id, name: newName, sortOrder: existing.sort_order };
}

export function addMotorInDb(name: string): MotorItem {
  const maxRow = db.prepare('SELECT COALESCE(MAX(sort_order), 0) AS maxOrder FROM motors').get() as {
    maxOrder: number;
  };
  const nextOrder = maxRow.maxOrder + 1;
  const info = db
    .prepare('INSERT INTO motors (name, sort_order) VALUES (?, ?)')
    .run(name, nextOrder);
  return { id: Number(info.lastInsertRowid), name, sortOrder: nextOrder };
}

export function deleteUserById(id: number): boolean {
  const existing = db
    .prepare('SELECT id, name, email FROM users WHERE id = ?')
    .get(id) as { id: number; name: string; email: string } | undefined;
  if (!existing) return false;

  const deleteTx = db.transaction(() => {
    db.prepare(`
      UPDATE meter_readings
      SET submitted_by_name = COALESCE(NULLIF(submitted_by_name, ''), ?),
          submitted_by_email = COALESCE(NULLIF(submitted_by_email, ''), ?)
      WHERE submitted_by = ?
    `).run(existing.name, existing.email, id);
    db.prepare('DELETE FROM users WHERE id = ?').run(id);
  });

  deleteTx();
  return true;
}

export function getReadingById(id: number): MeterReading | null {
  const row = db
    .prepare(`
      SELECT
        r.id, r.image_url, r.water_flow, r.recorded_at, r.plant, r.motor_name, r.motor_status,
        r.review, r.submitted_by, r.created_at, r.updated_at,
        COALESCE(u.name, NULLIF(r.submitted_by_name, ''), 'Deleted User') AS submitted_by_name,
        COALESCE(u.email, r.submitted_by_email, '') AS submitted_by_email
      FROM meter_readings r
      LEFT JOIN users u ON u.id = r.submitted_by
      WHERE r.id = ?
    `)
    .get(id) as DbReadingRow | undefined;

  return row ? mapReadingRow(row) : null;
}

export interface QueryReadingsParams {
  plant?: string;
  motorName?: string;
  motorStatus?: string;
  userId?: number;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
}

export function queryReadings(params: QueryReadingsParams = {}): MeterReading[] {
  const clauses: string[] = [];
  const values: unknown[] = [];

  if (params.plant && params.plant !== 'all') {
    clauses.push('r.plant = ?');
    values.push(params.plant);
  }

  if (params.motorName && params.motorName !== 'all') {
    clauses.push('r.motor_name = ?');
    values.push(params.motorName);
  }

  if (params.motorStatus && params.motorStatus !== 'all') {
    clauses.push('r.motor_status = ?');
    values.push(params.motorStatus);
  }

  if (params.userId !== undefined) {
    clauses.push('r.submitted_by = ?');
    values.push(params.userId);
  }

  if (params.dateFrom) {
    clauses.push('substr(r.recorded_at, 1, 10) >= ?');
    values.push(params.dateFrom);
  }

  if (params.dateTo) {
    clauses.push('substr(r.recorded_at, 1, 10) <= ?');
    values.push(params.dateTo);
  }

  if (params.search && params.search.trim()) {
    const pattern = `%${params.search.trim().toLowerCase()}%`;
    clauses.push(
      "(LOWER(r.plant) LIKE ? OR LOWER(r.motor_name) LIKE ? OR LOWER(r.motor_status) LIKE ? OR LOWER(r.review) LIKE ? OR LOWER(COALESCE(u.name, r.submitted_by_name, '')) LIKE ? OR CAST(r.water_flow AS TEXT) LIKE ?)"
    );
    values.push(pattern, pattern, pattern, pattern, pattern, pattern);
  }

  const whereSql = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
  const rows = db
    .prepare(`
      SELECT
        r.id, r.image_url, r.water_flow, r.recorded_at, r.plant, r.motor_name, r.motor_status,
        r.review, r.submitted_by, r.created_at, r.updated_at,
        COALESCE(u.name, NULLIF(r.submitted_by_name, ''), 'Deleted User') AS submitted_by_name,
        COALESCE(u.email, r.submitted_by_email, '') AS submitted_by_email
      FROM meter_readings r
      LEFT JOIN users u ON u.id = r.submitted_by
      ${whereSql}
      ORDER BY r.recorded_at DESC, r.id DESC
    `)
    .all(...values) as DbReadingRow[];

  return rows.map(mapReadingRow);
}

seedInitialData();
