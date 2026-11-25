import {
  EmailAuthProvider,
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  linkWithCredential,
  onAuthStateChanged,
  sendEmailVerification,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
  type User as FirebaseUser,
} from 'firebase/auth';
import {
  Timestamp,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type DocumentData,
} from 'firebase/firestore';
import {
  buildWaterFlowWorkbook,
  serializeWorkbookToArrayBuffer,
} from '../utils/excelExport';
import {
  GoogleSheetsAuthError,
  buildGoogleSheetsSpreadsheetPayload,
  createGoogleSheetViaApi,
  type GoogleSheetsExportResult,
} from '../utils/googleSheetsExport';
import {
  OperationType,
  auth,
  createGoogleSheetsAuthProvider,
  db,
  extractFriendlyFirestoreMessage,
  getGoogleSheetsAuth,
  getSecondaryAuth,
  googleAuthProvider,
  handleFirestoreError,
} from '../lib/firebase';
import {
  DEFAULT_MOTORS,
  DEFAULT_PLANTS,
  type AppConfig,
  type AuthResponse,
  type MeterReading,
  type MotorItem,
  type MotorStatus,
  type PlantItem,
  type PlantMotorState,
  type ReadingFilters,
  type User,
  type UserRole,
} from '../types';
import { compressMeterPhoto } from '../utils/imageCompress';
import {
  RETENTION_MS,
  applyPlantMotorStatesToReadings,
  evaluateMotorInterlock,
  filterActiveReadings,
  filterReadings,
  findStaleRunningReadingIds,
} from '../utils/meterLogic';

export const BOOTSTRAP_OWNER_EMAIL = 'kedarpaul53@gmail.com';
export const EMAIL_PASSWORD_DISABLED_CODE = 'EMAIL_PASSWORD_DISABLED';

export class AuthProviderDisabledError extends Error {
  readonly code = EMAIL_PASSWORD_DISABLED_CODE;
  constructor(message: string) {
    super(message);
    this.name = 'AuthProviderDisabledError';
  }
}

export interface AuthSessionState {
  user: User | null;
  pendingVerificationEmail: string | null;
}

export interface GoogleSheetsSessionInfo {
  connected: boolean;
  accountEmail: string | null;
}

const photoCache = new Map<string, string>();
let lastPurgeRunMs = 0;
const PURGE_THROTTLE_MS = 5 * 60 * 1000;

// In-memory only OAuth access token cache for Google Sheets API (never persisted to storage)
let cachedSheetsAccessToken: string | null = null;
let cachedSheetsAccountEmail: string | null = null;

function clearCachedSheetsSession() {
  cachedSheetsAccessToken = null;
  cachedSheetsAccountEmail = null;
}

function timestampToIso(value: unknown, fallbackIso?: string): string {
  if (value instanceof Timestamp) {
    return value.toDate().toISOString();
  }
  if (
    value &&
    typeof value === 'object' &&
    'toDate' in value &&
    typeof (value as { toDate: () => Date }).toDate === 'function'
  ) {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }
  if (typeof value === 'string' && value.trim()) {
    return value;
  }
  return fallbackIso ?? new Date().toISOString();
}

function mapFirebaseAuthError(err: unknown): Error {
  if (err instanceof AuthProviderDisabledError) return err;
  const code =
    typeof err === 'object' && err !== null && 'code' in err
      ? String((err as { code?: unknown }).code)
      : '';

  switch (code) {
    case 'auth/operation-not-allowed':
      return new AuthProviderDisabledError(
        'Email/Password sign-in is not enabled yet in your Firebase project. Enable it once in Firebase Console under Authentication → Sign-in method.'
      );
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return new Error('Invalid email or password.');
    case 'auth/invalid-email':
      return new Error('Enter a valid email address.');
    case 'auth/email-already-in-use':
      return new Error('An account with this email address already exists.');
    case 'auth/weak-password':
      return new Error('Password must be at least 6 characters.');
    case 'auth/too-many-requests':
      return new Error('Too many failed attempts. Please wait a moment and try again.');
    case 'auth/popup-closed-by-user':
      return new Error('Google sign-in window was closed before completing setup.');
    case 'auth/popup-blocked':
      return new Error('Pop-up was blocked by your browser. Allow pop-ups for this site and try again.');
    case 'auth/network-request-failed':
      return new Error('Network error while contacting Firebase Authentication. Check your connection.');
    default:
      if (err instanceof Error) return err;
      return new Error('Authentication failed. Please try again.');
  }
}

function mapReadingDoc(id: string, data: DocumentData): MeterReading {
  const createdAt = timestampToIso(data.createdAt);
  const updatedAt = timestampToIso(data.updatedAt, createdAt);
  const expiresAt = timestampToIso(
    data.expiresAt,
    new Date(Date.parse(createdAt) + RETENTION_MS).toISOString()
  );
  const photoId = typeof data.photoId === 'string' ? data.photoId : '';
  return {
    id,
    photoId,
    imageUrl: photoId ? photoCache.get(photoId) ?? '' : '',
    waterFlow: Number(data.waterFlow) || 0,
    recordedAt: typeof data.recordedAt === 'string' ? data.recordedAt : createdAt,
    plant: typeof data.plant === 'string' ? data.plant : '',
    motorName: typeof data.motorName === 'string' ? data.motorName : '',
    motorStatus: data.motorStatus === 'Stopped' ? 'Stopped' : 'Running',
    review: typeof data.review === 'string' ? data.review : '',
    submittedBy: typeof data.submittedBy === 'string' ? data.submittedBy : '',
    submittedByName: typeof data.submittedByName === 'string' ? data.submittedByName : 'Operator',
    submittedByEmail: typeof data.submittedByEmail === 'string' ? data.submittedByEmail : '',
    createdAt,
    updatedAt,
    expiresAt,
  };
}

function mapUserDoc(uid: string, data: DocumentData, readingCount?: number): User {
  return {
    id: uid,
    name: typeof data.name === 'string' ? data.name : 'Operator',
    email: typeof data.email === 'string' ? data.email : '',
    role: data.role === 'admin' ? 'admin' : 'user',
    createdAt: timestampToIso(data.createdAt),
    ...(readingCount !== undefined ? { readingCount } : {}),
  };
}

function mapPlantMotorStateDoc(plantId: string, data: DocumentData): PlantMotorState {
  return {
    plantId,
    plantName: typeof data.plantName === 'string' ? data.plantName : '',
    activeMotorName: typeof data.activeMotorName === 'string' ? data.activeMotorName : '',
    activeReadingId: typeof data.activeReadingId === 'string' ? data.activeReadingId : '',
    previousStoppedMotor:
      typeof data.previousStoppedMotor === 'string' ? data.previousStoppedMotor : '',
    updatedBy: typeof data.updatedBy === 'string' ? data.updatedBy : '',
    updatedByName: typeof data.updatedByName === 'string' ? data.updatedByName : 'Operator',
    updatedAt: timestampToIso(data.updatedAt),
  };
}

async function resolvePlantDocByName(plantName: string): Promise<PlantItem | null> {
  const clean = plantName.trim().toLowerCase();
  const snap = await getDocs(collection(db, 'plants')).catch((err) =>
    handleFirestoreError(err, OperationType.LIST, 'plants')
  );
  for (const d of snap.docs) {
    const name = String(d.data().name ?? '');
    if (name.trim().toLowerCase() === clean) {
      return {
        id: d.id,
        name,
        sortOrder: Number(d.data().sortOrder ?? 0),
      };
    }
  }
  return null;
}

/**
 * Transitions one or more reading documents from Running -> Stopped in Firestore.
 * Uses only ['motorStatus', 'updatedAt'] so both Admins and active Field Users
 * can mark a stopped or interlock-superseded motor reading as Stopped under firestore.rules.
 */
async function markReadingsStopped(readingIds: Iterable<string>): Promise<void> {
  const uniqueIds = Array.from(new Set(Array.from(readingIds).map((id) => id.trim()).filter(Boolean)));
  if (uniqueIds.length === 0) return;

  await Promise.all(
    uniqueIds.map((readingId) =>
      updateDoc(doc(db, 'readings', readingId), {
        motorStatus: 'Stopped',
        updatedAt: serverTimestamp(),
      }).catch(() => {
        // Ignore if document was already Stopped, deleted, or expired
      })
    )
  );
}

/**
 * Finds any lingering Running reading IDs for a given plant without requiring
 * composite Firestore indexes (uses single-field queries + client-side filtering).
 */
async function collectRunningReadingIdsForPlant(
  plantName: string,
  profile: User,
  uid: string,
  options?: { excludeReadingId?: string; onlyMotorName?: string }
): Promise<string[]> {
  const cleanPlant = plantName.trim();
  const cleanPlantLower = cleanPlant.toLowerCase();
  const motorFilterLower = options?.onlyMotorName?.trim().toLowerCase();

  try {
    const q =
      profile.role === 'admin'
        ? query(collection(db, 'readings'), where('plant', '==', cleanPlant))
        : query(collection(db, 'readings'), where('submittedBy', '==', uid));
    const snap = await getDocs(q);
    const ids: string[] = [];
    for (const d of snap.docs) {
      if (options?.excludeReadingId && d.id === options.excludeReadingId) continue;
      const data = d.data();
      if (data.motorStatus !== 'Running') continue;
      if (String(data.plant ?? '').trim().toLowerCase() !== cleanPlantLower) continue;
      if (
        motorFilterLower &&
        String(data.motorName ?? '').trim().toLowerCase() !== motorFilterLower
      ) {
        continue;
      }
      ids.push(d.id);
    }
    return ids;
  } catch {
    return [];
  }
}

async function ensureDefaultPlantsAndMotorsIfEmpty(): Promise<void> {
  const plantsSnap = await getDocs(collection(db, 'plants')).catch((err) =>
    handleFirestoreError(err, OperationType.LIST, 'plants')
  );
  const motorsSnap = await getDocs(collection(db, 'motors')).catch((err) =>
    handleFirestoreError(err, OperationType.LIST, 'motors')
  );

  if (plantsSnap.empty || motorsSnap.empty) {
    const batch = writeBatch(db);
    if (plantsSnap.empty) {
      DEFAULT_PLANTS.forEach((name, idx) => {
        const ref = doc(db, 'plants', `plant-${idx + 1}`);
        batch.set(ref, {
          name,
          sortOrder: idx + 1,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      });
    }
    if (motorsSnap.empty) {
      DEFAULT_MOTORS.forEach((name, idx) => {
        const ref = doc(db, 'motors', `motor-${idx + 1}`);
        batch.set(ref, {
          name,
          sortOrder: idx + 1,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      });
    }
    await batch.commit().catch((err) =>
      handleFirestoreError(err, OperationType.WRITE, 'plants,motors')
    );
  }
}

async function ensureBootstrapOwnerProfile(
  fbUser: FirebaseUser,
  preferredName?: string
): Promise<User> {
  const uid = fbUser.uid;
  const email = (fbUser.email ?? BOOTSTRAP_OWNER_EMAIL).trim().toLowerCase();
  const displayName =
    (preferredName ?? fbUser.displayName ?? 'Plant Administrator').trim() || 'Plant Administrator';
  const safeName = displayName.length >= 2 ? displayName.slice(0, 120) : 'Plant Administrator';

  const adminRef = doc(db, 'admins', uid);
  const userRef = doc(db, 'users', uid);

  const [adminSnap, userSnap] = await Promise.all([
    getDoc(adminRef).catch((err) => handleFirestoreError(err, OperationType.GET, `admins/${uid}`)),
    getDoc(userRef).catch((err) => handleFirestoreError(err, OperationType.GET, `users/${uid}`)),
  ]);

  if (!adminSnap.exists() || !userSnap.exists()) {
    const batch = writeBatch(db);
    if (!adminSnap.exists()) {
      batch.set(adminRef, {
        uid,
        email,
        createdAt: serverTimestamp(),
      });
    }
    if (!userSnap.exists()) {
      batch.set(userRef, {
        uid,
        name: safeName,
        email,
        role: 'admin',
        active: true,
        createdAt: serverTimestamp(),
      });
    }
    await batch.commit().catch((err) =>
      handleFirestoreError(err, OperationType.WRITE, `admins/${uid},users/${uid}`)
    );
  }

  await ensureDefaultPlantsAndMotorsIfEmpty();

  const refreshed = await getDoc(userRef).catch((err) =>
    handleFirestoreError(err, OperationType.GET, `users/${uid}`)
  );
  if (refreshed.exists()) {
    return mapUserDoc(uid, refreshed.data());
  }

  return {
    id: uid,
    name: safeName,
    email,
    role: 'admin',
    createdAt: new Date().toISOString(),
  };
}

async function resolveSignedInUser(fbUser: FirebaseUser): Promise<AuthSessionState> {
  const email = (fbUser.email ?? '').trim().toLowerCase();
  const isOwnerEmail = email === BOOTSTRAP_OWNER_EMAIL;

  if (isOwnerEmail && fbUser.emailVerified) {
    const ownerUser = await ensureBootstrapOwnerProfile(fbUser);
    return { user: ownerUser, pendingVerificationEmail: null };
  }

  const uid = fbUser.uid;
  const userRef = doc(db, 'users', uid);
  const adminRef = doc(db, 'admins', uid);

  const [userSnap, adminSnap] = await Promise.all([
    getDoc(userRef).catch((err) => handleFirestoreError(err, OperationType.GET, `users/${uid}`)),
    getDoc(adminRef).catch((err) => handleFirestoreError(err, OperationType.GET, `admins/${uid}`)),
  ]);

  if (adminSnap.exists()) {
    if (userSnap.exists()) {
      return {
        user: { ...mapUserDoc(uid, userSnap.data()), role: 'admin' },
        pendingVerificationEmail: null,
      };
    }
    return {
      user: {
        id: uid,
        name: fbUser.displayName || 'Administrator',
        email,
        role: 'admin',
        createdAt: timestampToIso(adminSnap.data().createdAt),
      },
      pendingVerificationEmail: null,
    };
  }

  if (userSnap.exists()) {
    const data = userSnap.data();
    if (data.active !== true) {
      await signOut(auth);
      throw new Error('This account has been deactivated by an administrator.');
    }
    return { user: mapUserDoc(uid, data), pendingVerificationEmail: null };
  }

  if (isOwnerEmail && !fbUser.emailVerified) {
    return { user: null, pendingVerificationEmail: email };
  }

  await signOut(auth);
  throw new Error(
    'This account is not provisioned in HydroLog. Ask your plant administrator to create your account.'
  );
}

async function requireActiveAuthProfile(): Promise<{ fbUser: FirebaseUser; profile: User }> {
  const fbUser = auth.currentUser;
  if (!fbUser) {
    throw new Error('You must be signed in to perform this action.');
  }
  const resolved = await resolveSignedInUser(fbUser);
  if (!resolved.user) {
    throw new Error('Verify your administrator email before accessing the database.');
  }
  return { fbUser, profile: resolved.user };
}

/**
 * Permanently deletes all meter readings and their paired /reading_photos
 * that have completed their 45th day and entered Day 46 (expiresAt <= now).
 */
async function runDay46PurgeIfAdmin(force = false): Promise<number> {
  const nowMs = Date.now();
  if (!force && nowMs - lastPurgeRunMs < PURGE_THROTTLE_MS) {
    return 0;
  }
  lastPurgeRunMs = nowMs;

  let deletedCount = 0;
  try {
    const nowTs = Timestamp.fromMillis(nowMs);
    const expiredReadingsSnap = await getDocs(
      query(collection(db, 'readings'), where('expiresAt', '<=', nowTs))
    );

    const photoIdsToDelete = new Set<string>();
    const readingRefsToDelete = expiredReadingsSnap.docs.map((d) => {
      const pId = d.data()?.photoId;
      if (typeof pId === 'string' && pId) {
        photoIdsToDelete.add(pId);
      }
      return d.ref;
    });

    // Also sweep any orphaned expired photos
    const expiredPhotosSnap = await getDocs(
      query(collection(db, 'reading_photos'), where('expiresAt', '<=', nowTs))
    );
    expiredPhotosSnap.docs.forEach((d) => photoIdsToDelete.add(d.id));

    const allRefs = [
      ...readingRefsToDelete,
      ...Array.from(photoIdsToDelete).map((pid) => doc(db, 'reading_photos', pid)),
    ];

    const CHUNK_SIZE = 400;
    for (let i = 0; i < allRefs.length; i += CHUNK_SIZE) {
      const batch = writeBatch(db);
      const slice = allRefs.slice(i, i + CHUNK_SIZE);
      for (const ref of slice) {
        batch.delete(ref);
      }
      await batch.commit();
    }

    photoIdsToDelete.forEach((pid) => photoCache.delete(pid));
    deletedCount = readingRefsToDelete.length;
  } catch (err) {
    // Non-fatal background maintenance: log but don't block viewing active records
    console.warn('Day-46 retention purge skipped:', err);
  }
  return deletedCount;
}

export const api = {
  async purgeExpiredRecords(force = false): Promise<number> {
    return runDay46PurgeIfAdmin(force);
  },

  subscribeAuth(
    onState: (state: AuthSessionState) => void,
    onError?: (message: string) => void
  ): () => void {
    return onAuthStateChanged(auth, async (fbUser) => {
      if (!fbUser) {
        photoCache.clear();
        clearCachedSheetsSession();
        onState({ user: null, pendingVerificationEmail: null });
        return;
      }
      try {
        const resolved = await resolveSignedInUser(fbUser);
        if (resolved.user?.role === 'admin') {
          void runDay46PurgeIfAdmin();
        }
        onState(resolved);
      } catch (err) {
        onState({ user: null, pendingVerificationEmail: null });
        if (onError) {
          onError(extractFriendlyFirestoreMessage(err, 'Unable to verify your session.'));
        }
      }
    });
  },

  async login(email: string, password: string): Promise<AuthResponse> {
    const cleanEmail = email.trim().toLowerCase();
    try {
      const cred = await signInWithEmailAndPassword(auth, cleanEmail, password);
      const resolved = await resolveSignedInUser(cred.user);
      if (resolved.pendingVerificationEmail) {
        throw new Error(
          `Please verify ${resolved.pendingVerificationEmail} using the link sent to your inbox, then complete setup below.`
        );
      }
      if (!resolved.user) {
        throw new Error('Unable to sign in with this account.');
      }
      if (resolved.user.role === 'admin') {
        void runDay46PurgeIfAdmin(true);
      }
      return { user: resolved.user };
    } catch (err) {
      const mapped = mapFirebaseAuthError(err);
      throw new Error(extractFriendlyFirestoreMessage(mapped, mapped.message));
    }
  },

  async bootstrapAdminWithGoogle(preferredName?: string, optionalPassword?: string): Promise<AuthResponse> {
    try {
      googleAuthProvider.setCustomParameters({ prompt: 'select_account' });
      const cred = await signInWithPopup(auth, googleAuthProvider);
      const email = (cred.user.email ?? '').trim().toLowerCase();
      if (email !== BOOTSTRAP_OWNER_EMAIL || !cred.user.emailVerified) {
        await signOut(auth);
        throw new Error(
          `First-time administrator initialization is restricted to ${BOOTSTRAP_OWNER_EMAIL}.`
        );
      }

      if (optionalPassword && optionalPassword.length >= 6) {
        const hasPasswordProvider = cred.user.providerData.some(
          (p) => p.providerId === 'password'
        );
        if (!hasPasswordProvider) {
          try {
            const emailCred = EmailAuthProvider.credential(email, optionalPassword);
            await linkWithCredential(cred.user, emailCred);
          } catch (linkErr) {
            const mapped = mapFirebaseAuthError(linkErr);
            if (mapped instanceof AuthProviderDisabledError) {
              throw mapped;
            }
            // If already linked or minor conflict, proceed with admin initialization
          }
        }
      }

      const ownerUser = await ensureBootstrapOwnerProfile(cred.user, preferredName);
      void runDay46PurgeIfAdmin(true);
      return { user: ownerUser };
    } catch (err) {
      if (err instanceof AuthProviderDisabledError) throw err;
      const mapped = mapFirebaseAuthError(err);
      throw new Error(extractFriendlyFirestoreMessage(mapped, mapped.message));
    }
  },

  async bootstrapAdminWithEmail(
    name: string,
    email: string,
    password: string
  ): Promise<{ verificationSent: boolean; user?: User }> {
    const cleanName = name.trim();
    const cleanEmail = email.trim().toLowerCase();
    if (cleanEmail !== BOOTSTRAP_OWNER_EMAIL) {
      throw new Error(
        `First-time administrator setup is restricted to ${BOOTSTRAP_OWNER_EMAIL}.`
      );
    }
    if (cleanName.length < 2) {
      throw new Error('Enter your full name (at least 2 characters).');
    }
    if (password.length < 6) {
      throw new Error('Password must be at least 6 characters.');
    }

    try {
      const cred = await createUserWithEmailAndPassword(auth, cleanEmail, password);
      await updateProfile(cred.user, { displayName: cleanName }).catch(() => {});
      if (!cred.user.emailVerified) {
        await sendEmailVerification(cred.user);
        return { verificationSent: true };
      }
      const ownerUser = await ensureBootstrapOwnerProfile(cred.user, cleanName);
      return { verificationSent: false, user: ownerUser };
    } catch (err) {
      if (err instanceof AuthProviderDisabledError) throw err;
      const mapped = mapFirebaseAuthError(err);
      if (mapped instanceof AuthProviderDisabledError) throw mapped;
      throw new Error(extractFriendlyFirestoreMessage(mapped, mapped.message));
    }
  },

  async completeEmailAdminBootstrap(preferredName?: string): Promise<AuthResponse> {
    const fbUser = auth.currentUser;
    if (!fbUser) {
      throw new Error('Sign in with your administrator email and password first.');
    }
    await fbUser.reload();
    await fbUser.getIdToken(true);
    if (!fbUser.emailVerified) {
      throw new Error(
        'Your email is not verified yet. Open the verification email in your inbox, click the link, and try again.'
      );
    }
    const ownerUser = await ensureBootstrapOwnerProfile(fbUser, preferredName);
    void runDay46PurgeIfAdmin(true);
    return { user: ownerUser };
  },

  async resendVerificationEmail(): Promise<void> {
    const fbUser = auth.currentUser;
    if (!fbUser) {
      throw new Error('No pending account found. Please sign in first.');
    }
    try {
      await sendEmailVerification(fbUser);
    } catch (err) {
      throw mapFirebaseAuthError(err);
    }
  },

  async logout(): Promise<void> {
    photoCache.clear();
    clearCachedSheetsSession();
    await signOut(auth);
    try {
      const sheetsAuth = getGoogleSheetsAuth();
      if (sheetsAuth !== auth) {
        await signOut(sheetsAuth);
      }
    } catch {
      // Sheets OAuth instance may not be signed in
    }
    try {
      await signOut(getSecondaryAuth());
    } catch {
      // Secondary auth may not be signed in
    }
  },

  async getConfig(): Promise<AppConfig> {
    try {
      const [plantsSnap, motorsSnap] = await Promise.all([
        getDocs(query(collection(db, 'plants'), orderBy('sortOrder', 'asc'))).catch((err) =>
          handleFirestoreError(err, OperationType.LIST, 'plants')
        ),
        getDocs(query(collection(db, 'motors'), orderBy('sortOrder', 'asc'))).catch((err) =>
          handleFirestoreError(err, OperationType.LIST, 'motors')
        ),
      ]);

      const plants: PlantItem[] = plantsSnap.docs.map((d) => ({
        id: d.id,
        name: String(d.data().name ?? ''),
        sortOrder: Number(d.data().sortOrder ?? 0),
      }));

      const motors: MotorItem[] = motorsSnap.docs.map((d) => ({
        id: d.id,
        name: String(d.data().name ?? ''),
        sortOrder: Number(d.data().sortOrder ?? 0),
      }));

      return { plants, motors };
    } catch (err) {
      throw new Error(extractFriendlyFirestoreMessage(err, 'Unable to load plants and motors.'));
    }
  },

  async renamePlant(id: string, name: string): Promise<{ plant: PlantItem; config: AppConfig }> {
    const cleanName = name.trim();
    if (cleanName.length < 2 || cleanName.length > 60) {
      throw new Error('Plant name must be between 2 and 60 characters.');
    }

    try {
      const currentConfig = await this.getConfig();
      const target = currentConfig.plants.find((p) => p.id === id);
      if (!target) {
        throw new Error('Plant not found.');
      }
      const duplicate = currentConfig.plants.find(
        (p) => p.id !== id && p.name.toLowerCase() === cleanName.toLowerCase()
      );
      if (duplicate) {
        throw new Error('Another plant already uses that name.');
      }

      const plantRef = doc(db, 'plants', id);
      await updateDoc(plantRef, {
        name: cleanName,
        updatedAt: serverTimestamp(),
      }).catch((err) => handleFirestoreError(err, OperationType.UPDATE, `plants/${id}`));

      // Cascade rename to all matching readings and plant motor interlock state
      if (target.name !== cleanName) {
        const matchingReadings = await getDocs(
          query(collection(db, 'readings'), where('plant', '==', target.name))
        ).catch((err) => handleFirestoreError(err, OperationType.LIST, 'readings'));

        const CHUNK = 400;
        for (let i = 0; i < matchingReadings.docs.length; i += CHUNK) {
          const batch = writeBatch(db);
          matchingReadings.docs.slice(i, i + CHUNK).forEach((d) => {
            batch.update(d.ref, {
              plant: cleanName,
              updatedAt: serverTimestamp(),
            });
          });
          await batch.commit().catch((err) =>
            handleFirestoreError(err, OperationType.UPDATE, 'readings')
          );
        }

        const stateRef = doc(db, 'plant_motor_states', id);
        const stateSnap = await getDoc(stateRef).catch(() => null);
        if (stateSnap && stateSnap.exists() && auth.currentUser) {
          const existingState = stateSnap.data();
          const { profile } = await requireActiveAuthProfile();
          await setDoc(stateRef, {
            plantId: id,
            plantName: cleanName,
            activeMotorName: String(existingState.activeMotorName ?? ''),
            activeReadingId: String(existingState.activeReadingId ?? ''),
            previousStoppedMotor: String(existingState.previousStoppedMotor ?? ''),
            updatedBy: auth.currentUser.uid,
            updatedByName: profile.name,
            updatedAt: serverTimestamp(),
          }).catch(() => {});
        }
      }

      const nextConfig = await this.getConfig();
      const updatedPlant = nextConfig.plants.find((p) => p.id === id) ?? {
        ...target,
        name: cleanName,
      };
      return { plant: updatedPlant, config: nextConfig };
    } catch (err) {
      throw new Error(extractFriendlyFirestoreMessage(err, 'Unable to rename plant.'));
    }
  },

  async createPlant(name: string): Promise<{ plant: PlantItem; config: AppConfig }> {
    const cleanName = name.trim();
    if (cleanName.length < 2 || cleanName.length > 60) {
      throw new Error('Plant name must be between 2 and 60 characters.');
    }

    try {
      const currentConfig = await this.getConfig();
      if (currentConfig.plants.some((p) => p.name.toLowerCase() === cleanName.toLowerCase())) {
        throw new Error('A plant with that name already exists.');
      }
      const nextSort =
        currentConfig.plants.reduce((max, p) => Math.max(max, p.sortOrder), 0) + 1;
      const newRef = doc(collection(db, 'plants'));
      const batch = writeBatch(db);
      batch.set(newRef, {
        name: cleanName,
        sortOrder: nextSort,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await batch.commit().catch((err) =>
        handleFirestoreError(err, OperationType.CREATE, `plants/${newRef.id}`)
      );

      const nextConfig = await this.getConfig();
      const created: PlantItem = { id: newRef.id, name: cleanName, sortOrder: nextSort };
      return { plant: created, config: nextConfig };
    } catch (err) {
      throw new Error(extractFriendlyFirestoreMessage(err, 'Unable to add plant.'));
    }
  },

  async renameMotor(id: string, name: string): Promise<{ motor: MotorItem; config: AppConfig }> {
    const cleanName = name.trim();
    if (cleanName.length < 2 || cleanName.length > 60) {
      throw new Error('Motor name must be between 2 and 60 characters.');
    }

    try {
      const currentConfig = await this.getConfig();
      const target = currentConfig.motors.find((m) => m.id === id);
      if (!target) {
        throw new Error('Motor not found.');
      }
      const duplicate = currentConfig.motors.find(
        (m) => m.id !== id && m.name.toLowerCase() === cleanName.toLowerCase()
      );
      if (duplicate) {
        throw new Error('Another motor already uses that name.');
      }

      const motorRef = doc(db, 'motors', id);
      await updateDoc(motorRef, {
        name: cleanName,
        updatedAt: serverTimestamp(),
      }).catch((err) => handleFirestoreError(err, OperationType.UPDATE, `motors/${id}`));

      if (target.name !== cleanName) {
        const matchingReadings = await getDocs(
          query(collection(db, 'readings'), where('motorName', '==', target.name))
        ).catch((err) => handleFirestoreError(err, OperationType.LIST, 'readings'));

        const CHUNK = 400;
        for (let i = 0; i < matchingReadings.docs.length; i += CHUNK) {
          const batch = writeBatch(db);
          matchingReadings.docs.slice(i, i + CHUNK).forEach((d) => {
            batch.update(d.ref, {
              motorName: cleanName,
              updatedAt: serverTimestamp(),
            });
          });
          await batch.commit().catch((err) =>
            handleFirestoreError(err, OperationType.UPDATE, 'readings')
          );
        }

        // Update any plant motor interlock states referencing the renamed motor
        const statesSnap = await getDocs(collection(db, 'plant_motor_states')).catch(() => null);
        if (statesSnap && auth.currentUser) {
          const { profile } = await requireActiveAuthProfile();
          const stateBatch = writeBatch(db);
          let hasStateUpdates = false;
          statesSnap.docs.forEach((d) => {
            const sData = d.data();
            const activeMatches = sData.activeMotorName === target.name;
            const prevMatches = sData.previousStoppedMotor === target.name;
            if (activeMatches || prevMatches) {
              hasStateUpdates = true;
              stateBatch.set(d.ref, {
                plantId: d.id,
                plantName: String(sData.plantName ?? ''),
                activeMotorName: activeMatches ? cleanName : String(sData.activeMotorName ?? ''),
                activeReadingId: String(sData.activeReadingId ?? ''),
                previousStoppedMotor: prevMatches
                  ? cleanName
                  : String(sData.previousStoppedMotor ?? ''),
                updatedBy: auth.currentUser!.uid,
                updatedByName: profile.name,
                updatedAt: serverTimestamp(),
              });
            }
          });
          if (hasStateUpdates) {
            await stateBatch.commit().catch(() => {});
          }
        }
      }

      const nextConfig = await this.getConfig();
      const updatedMotor = nextConfig.motors.find((m) => m.id === id) ?? {
        ...target,
        name: cleanName,
      };
      return { motor: updatedMotor, config: nextConfig };
    } catch (err) {
      throw new Error(extractFriendlyFirestoreMessage(err, 'Unable to rename motor.'));
    }
  },

  async createMotor(name: string): Promise<{ motor: MotorItem; config: AppConfig }> {
    const cleanName = name.trim();
    if (cleanName.length < 2 || cleanName.length > 60) {
      throw new Error('Motor name must be between 2 and 60 characters.');
    }

    try {
      const currentConfig = await this.getConfig();
      if (currentConfig.motors.some((m) => m.name.toLowerCase() === cleanName.toLowerCase())) {
        throw new Error('A motor with that name already exists.');
      }
      const nextSort =
        currentConfig.motors.reduce((max, m) => Math.max(max, m.sortOrder), 0) + 1;
      const newRef = doc(collection(db, 'motors'));
      const batch = writeBatch(db);
      batch.set(newRef, {
        name: cleanName,
        sortOrder: nextSort,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await batch.commit().catch((err) =>
        handleFirestoreError(err, OperationType.CREATE, `motors/${newRef.id}`)
      );

      const nextConfig = await this.getConfig();
      const created: MotorItem = { id: newRef.id, name: cleanName, sortOrder: nextSort };
      return { motor: created, config: nextConfig };
    } catch (err) {
      throw new Error(extractFriendlyFirestoreMessage(err, 'Unable to add motor.'));
    }
  },

  async getPlantMotorStates(): Promise<PlantMotorState[]> {
    try {
      const snap = await getDocs(collection(db, 'plant_motor_states')).catch((err) =>
        handleFirestoreError(err, OperationType.LIST, 'plant_motor_states')
      );
      return snap.docs.map((d) => mapPlantMotorStateDoc(d.id, d.data()));
    } catch (err) {
      throw new Error(
        extractFriendlyFirestoreMessage(err, 'Unable to load live plant motor status.')
      );
    }
  },

  subscribePlantMotorStates(
    onStates: (states: PlantMotorState[]) => void
  ): () => void {
    return onSnapshot(
      collection(db, 'plant_motor_states'),
      (snap) => {
        onStates(snap.docs.map((d) => mapPlantMotorStateDoc(d.id, d.data())));
      },
      (err) => {
        console.warn('Plant motor states listener error:', err);
      }
    );
  },

  async stopPlantMotor(
    plantId: string,
    plantName: string
  ): Promise<{ stoppedMotor: string }> {
    try {
      const { fbUser, profile } = await requireActiveAuthProfile();
      const cleanPlant = plantName.trim();
      const stateRef = doc(db, 'plant_motor_states', plantId);
      const snap = await getDoc(stateRef).catch((err) =>
        handleFirestoreError(err, OperationType.GET, `plant_motor_states/${plantId}`)
      );
      const prevActive = snap.exists() ? String(snap.data().activeMotorName ?? '').trim() : '';
      const prevReadingId = snap.exists() ? String(snap.data().activeReadingId ?? '').trim() : '';

      await setDoc(stateRef, {
        plantId,
        plantName: cleanPlant,
        activeMotorName: '',
        activeReadingId: '',
        previousStoppedMotor: prevActive,
        updatedBy: fbUser.uid,
        updatedByName: profile.name,
        updatedAt: serverTimestamp(),
      }).catch((err) =>
        handleFirestoreError(err, OperationType.WRITE, `plant_motor_states/${plantId}`)
      );

      const idsToStop = new Set<string>();
      if (prevReadingId) {
        idsToStop.add(prevReadingId);
      }
      const lingeringIds = await collectRunningReadingIdsForPlant(cleanPlant, profile, fbUser.uid);
      lingeringIds.forEach((id) => idsToStop.add(id));
      await markReadingsStopped(idsToStop);

      return { stoppedMotor: prevActive };
    } catch (err) {
      throw new Error(extractFriendlyFirestoreMessage(err, 'Unable to stop motor.'));
    }
  },

  async getPhotoDataUrl(photoId: string): Promise<string | null> {
    if (!photoId) return null;
    const cached = photoCache.get(photoId);
    if (cached) return cached;

    try {
      const snap = await getDoc(doc(db, 'reading_photos', photoId)).catch((err) =>
        handleFirestoreError(err, OperationType.GET, `reading_photos/${photoId}`)
      );
      if (!snap.exists()) return null;
      const dataUrl = snap.data()?.dataUrl;
      if (typeof dataUrl === 'string' && dataUrl.length > 0) {
        photoCache.set(photoId, dataUrl);
        return dataUrl;
      }
      return null;
    } catch {
      return null;
    }
  },

  async getMyReadings(
    filters?: Pick<ReadingFilters, 'plant' | 'motorName' | 'motorStatus' | 'search'>
  ): Promise<MeterReading[]> {
    try {
      const { fbUser } = await requireActiveAuthProfile();
      const [snap, statesSnap] = await Promise.all([
        getDocs(query(collection(db, 'readings'), where('submittedBy', '==', fbUser.uid))).catch(
          (err) => handleFirestoreError(err, OperationType.LIST, 'readings')
        ),
        getDocs(collection(db, 'plant_motor_states')).catch(() => null),
      ]);

      const mapped = snap.docs
        .map((d) => mapReadingDoc(d.id, d.data()))
        .sort((a, b) => b.recordedAt.localeCompare(a.recordedAt));

      const active = filterActiveReadings(mapped);
      const states = statesSnap
        ? statesSnap.docs.map((d) => mapPlantMotorStateDoc(d.id, d.data()))
        : [];
      const staleIds = findStaleRunningReadingIds(active, states);
      if (staleIds.length > 0) {
        void markReadingsStopped(staleIds);
      }
      const reconciled = applyPlantMotorStatesToReadings(active, states);
      return filters ? filterReadings(reconciled, filters) : reconciled;
    } catch (err) {
      throw new Error(extractFriendlyFirestoreMessage(err, 'Unable to load your readings.'));
    }
  },

  async getAllReadings(filters?: ReadingFilters): Promise<MeterReading[]> {
    try {
      void runDay46PurgeIfAdmin();
      const [snap, statesSnap] = await Promise.all([
        getDocs(collection(db, 'readings')).catch((err) =>
          handleFirestoreError(err, OperationType.LIST, 'readings')
        ),
        getDocs(collection(db, 'plant_motor_states')).catch(() => null),
      ]);

      const mapped = snap.docs
        .map((d) => mapReadingDoc(d.id, d.data()))
        .sort((a, b) => b.recordedAt.localeCompare(a.recordedAt));

      const active = filterActiveReadings(mapped);
      const states = statesSnap
        ? statesSnap.docs.map((d) => mapPlantMotorStateDoc(d.id, d.data()))
        : [];
      const staleIds = findStaleRunningReadingIds(active, states);
      if (staleIds.length > 0) {
        void markReadingsStopped(staleIds);
      }
      const reconciled = applyPlantMotorStatesToReadings(active, states);
      return filters ? filterReadings(reconciled, filters) : reconciled;
    } catch (err) {
      throw new Error(extractFriendlyFirestoreMessage(err, 'Unable to load records.'));
    }
  },

  async createReading(payload: {
    imageFile: File;
    waterFlow: number;
    plant: string;
    motorName: string;
    motorStatus: MotorStatus;
    recordedAt: string;
    review: string;
  }): Promise<MeterReading> {
    try {
      const { fbUser, profile } = await requireActiveAuthProfile();
      const compressed = await compressMeterPhoto(payload.imageFile);

      const cleanPlant = payload.plant.trim();
      const cleanMotor = payload.motorName.trim();
      const plantDoc = await resolvePlantDocByName(cleanPlant);

      let currentPlantState: PlantMotorState | null = null;
      if (plantDoc) {
        const stateSnap = await getDoc(doc(db, 'plant_motor_states', plantDoc.id)).catch((err) =>
          handleFirestoreError(err, OperationType.GET, `plant_motor_states/${plantDoc.id}`)
        );
        if (stateSnap.exists()) {
          currentPlantState = mapPlantMotorStateDoc(plantDoc.id, stateSnap.data());
        }
      }

      const interlock = evaluateMotorInterlock(
        currentPlantState,
        cleanMotor,
        payload.motorStatus
      );

      const readingRef = doc(collection(db, 'readings'));
      const photoRef = doc(collection(db, 'reading_photos'));
      const nowMs = Date.now();
      const expiresAtDate = new Date(nowMs + RETENTION_MS);
      const expiresAtIso = expiresAtDate.toISOString();
      const expiresAtTs = Timestamp.fromDate(expiresAtDate);

      const batch = writeBatch(db);
      batch.set(photoRef, {
        readingId: readingRef.id,
        ownerUid: fbUser.uid,
        mimeType: compressed.mimeType,
        dataUrl: compressed.dataUrl,
        createdAt: serverTimestamp(),
        expiresAt: expiresAtTs,
      });

      batch.set(readingRef, {
        waterFlow: Math.round(payload.waterFlow * 100) / 100,
        recordedAt: payload.recordedAt,
        plant: cleanPlant,
        motorName: cleanMotor,
        motorStatus: payload.motorStatus,
        review: payload.review.trim().slice(0, 500),
        photoId: photoRef.id,
        submittedBy: fbUser.uid,
        submittedByName: profile.name,
        submittedByEmail: profile.email,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        expiresAt: expiresAtTs,
      });

      // Atomically enforce single-motor-per-plant interlock state
      if (plantDoc) {
        const stateRef = doc(db, 'plant_motor_states', plantDoc.id);
        if (payload.motorStatus === 'Running') {
          batch.set(stateRef, {
            plantId: plantDoc.id,
            plantName: plantDoc.name,
            activeMotorName: cleanMotor,
            activeReadingId: readingRef.id,
            previousStoppedMotor: interlock.motorToAutoStop ?? '',
            updatedBy: fbUser.uid,
            updatedByName: profile.name,
            updatedAt: serverTimestamp(),
          });
        } else if (interlock.isSameMotorAlreadyRunning) {
          batch.set(stateRef, {
            plantId: plantDoc.id,
            plantName: plantDoc.name,
            activeMotorName: '',
            activeReadingId: '',
            previousStoppedMotor: cleanMotor,
            updatedBy: fbUser.uid,
            updatedByName: profile.name,
            updatedAt: serverTimestamp(),
          });
        }
      }

      await batch.commit().catch((err) =>
        handleFirestoreError(err, OperationType.CREATE, `readings/${readingRef.id}`)
      );

      // Reflect auto-stop or manual stop on previously running reading documents in this plant
      const idsToStop = new Set<string>();
      const prevActiveReadingId = currentPlantState?.activeReadingId?.trim() ?? '';
      if (payload.motorStatus === 'Running') {
        if (prevActiveReadingId && prevActiveReadingId !== readingRef.id) {
          idsToStop.add(prevActiveReadingId);
        }
        const lingering = await collectRunningReadingIdsForPlant(cleanPlant, profile, fbUser.uid, {
          excludeReadingId: readingRef.id,
        });
        lingering.forEach((id) => idsToStop.add(id));
      } else if (interlock.isSameMotorAlreadyRunning) {
        if (prevActiveReadingId && prevActiveReadingId !== readingRef.id) {
          idsToStop.add(prevActiveReadingId);
        }
        const lingering = await collectRunningReadingIdsForPlant(cleanPlant, profile, fbUser.uid, {
          excludeReadingId: readingRef.id,
          onlyMotorName: cleanMotor,
        });
        lingering.forEach((id) => idsToStop.add(id));
      }
      if (idsToStop.size > 0) {
        await markReadingsStopped(idsToStop);
      }

      photoCache.set(photoRef.id, compressed.dataUrl);
      const nowIso = new Date(nowMs).toISOString();
      return {
        id: readingRef.id,
        photoId: photoRef.id,
        imageUrl: compressed.dataUrl,
        waterFlow: Math.round(payload.waterFlow * 100) / 100,
        recordedAt: payload.recordedAt,
        plant: cleanPlant,
        motorName: cleanMotor,
        motorStatus: payload.motorStatus,
        review: payload.review.trim().slice(0, 500),
        submittedBy: fbUser.uid,
        submittedByName: profile.name,
        submittedByEmail: profile.email,
        createdAt: nowIso,
        updatedAt: nowIso,
        expiresAt: expiresAtIso,
        ...(interlock.motorToAutoStop ? { autoStoppedMotor: interlock.motorToAutoStop } : {}),
      };
    } catch (err) {
      throw new Error(extractFriendlyFirestoreMessage(err, 'Failed to save water meter reading.'));
    }
  },

  async updateReading(
    id: string,
    payload: {
      waterFlow: number;
      plant: string;
      motorName: string;
      motorStatus: MotorStatus;
      recordedAt: string;
      review: string;
      imageFile?: File | null;
    }
  ): Promise<MeterReading> {
    try {
      const readingRef = doc(db, 'readings', id);
      const existingSnap = await getDoc(readingRef).catch((err) =>
        handleFirestoreError(err, OperationType.GET, `readings/${id}`)
      );
      if (!existingSnap.exists()) {
        throw new Error('Meter reading not found (it may have been deleted).');
      }
      const existingData = existingSnap.data();
      const oldPhotoId = typeof existingData.photoId === 'string' ? existingData.photoId : '';
      const existingExpiresAt: Timestamp =
        existingData.expiresAt instanceof Timestamp
          ? existingData.expiresAt
          : Timestamp.fromDate(new Date(Date.now() + RETENTION_MS));

      let nextPhotoId = oldPhotoId;
      let nextImageUrl = photoCache.get(oldPhotoId) ?? '';

      if (payload.imageFile) {
        if (existingExpiresAt.toMillis() <= Date.now()) {
          throw new Error('This record has reached Day 46 and is scheduled for deletion.');
        }
        const compressed = await compressMeterPhoto(payload.imageFile);
        const newPhotoRef = doc(collection(db, 'reading_photos'));
        nextPhotoId = newPhotoRef.id;
        nextImageUrl = compressed.dataUrl;

        const batch = writeBatch(db);
        batch.set(newPhotoRef, {
          readingId: id,
          ownerUid: String(existingData.submittedBy ?? ''),
          mimeType: compressed.mimeType,
          dataUrl: compressed.dataUrl,
          createdAt: serverTimestamp(),
          expiresAt: existingExpiresAt,
        });
        batch.update(readingRef, {
          waterFlow: Math.round(payload.waterFlow * 100) / 100,
          plant: payload.plant.trim(),
          motorName: payload.motorName.trim(),
          motorStatus: payload.motorStatus,
          recordedAt: payload.recordedAt,
          review: payload.review.trim().slice(0, 500),
          photoId: nextPhotoId,
          updatedAt: serverTimestamp(),
        });
        await batch.commit().catch((err) =>
          handleFirestoreError(
            err,
            OperationType.UPDATE,
            `readings/${id},reading_photos/${nextPhotoId}`
          )
        );
        photoCache.set(nextPhotoId, compressed.dataUrl);

        if (oldPhotoId && oldPhotoId !== nextPhotoId) {
          photoCache.delete(oldPhotoId);
          await deleteDoc(doc(db, 'reading_photos', oldPhotoId)).catch(() => {});
        }
      } else {
        await updateDoc(readingRef, {
          waterFlow: Math.round(payload.waterFlow * 100) / 100,
          plant: payload.plant.trim(),
          motorName: payload.motorName.trim(),
          motorStatus: payload.motorStatus,
          recordedAt: payload.recordedAt,
          review: payload.review.trim().slice(0, 500),
          updatedAt: serverTimestamp(),
        }).catch((err) => handleFirestoreError(err, OperationType.UPDATE, `readings/${id}`));
      }

      const { fbUser, profile } = await requireActiveAuthProfile();
      const previousPlantName =
        typeof existingData.plant === 'string' ? existingData.plant.trim() : '';
      const cleanPlant = payload.plant.trim();
      const cleanMotor = payload.motorName.trim();
      const plantDoc = await resolvePlantDocByName(cleanPlant);
      let autoStoppedMotor: string | undefined;

      // If the reading moved from another plant where it was the active motor, release that old plant's interlock
      if (
        previousPlantName &&
        previousPlantName.toLowerCase() !== cleanPlant.toLowerCase()
      ) {
        const oldPlantDoc = await resolvePlantDocByName(previousPlantName).catch(() => null);
        if (oldPlantDoc) {
          const oldStateRef = doc(db, 'plant_motor_states', oldPlantDoc.id);
          const oldStateSnap = await getDoc(oldStateRef).catch(() => null);
          if (oldStateSnap && oldStateSnap.exists() && oldStateSnap.data().activeReadingId === id) {
            await setDoc(oldStateRef, {
              plantId: oldPlantDoc.id,
              plantName: oldPlantDoc.name,
              activeMotorName: '',
              activeReadingId: '',
              previousStoppedMotor: String(oldStateSnap.data().activeMotorName ?? ''),
              updatedBy: fbUser.uid,
              updatedByName: profile.name,
              updatedAt: serverTimestamp(),
            }).catch(() => {});
          }
        }
      }

      if (plantDoc) {
        const stateRef = doc(db, 'plant_motor_states', plantDoc.id);
        const stateSnap = await getDoc(stateRef).catch(() => null);
        const existingState =
          stateSnap && stateSnap.exists()
            ? mapPlantMotorStateDoc(plantDoc.id, stateSnap.data())
            : null;
        const interlock = evaluateMotorInterlock(
          existingState,
          cleanMotor,
          payload.motorStatus
        );

        if (payload.motorStatus === 'Running') {
          if (interlock.motorToAutoStop) {
            autoStoppedMotor = interlock.motorToAutoStop;
          }
          await setDoc(stateRef, {
            plantId: plantDoc.id,
            plantName: plantDoc.name,
            activeMotorName: cleanMotor,
            activeReadingId: id,
            previousStoppedMotor: interlock.motorToAutoStop ?? '',
            updatedBy: fbUser.uid,
            updatedByName: profile.name,
            updatedAt: serverTimestamp(),
          }).catch(() => {});

          const idsToStop = new Set<string>();
          const prevActiveId = existingState?.activeReadingId?.trim() ?? '';
          if (prevActiveId && prevActiveId !== id) {
            idsToStop.add(prevActiveId);
          }
          const lingering = await collectRunningReadingIdsForPlant(cleanPlant, profile, fbUser.uid, {
            excludeReadingId: id,
          });
          lingering.forEach((rid) => idsToStop.add(rid));
          if (idsToStop.size > 0) {
            await markReadingsStopped(idsToStop);
          }
        } else if (
          existingState &&
          (existingState.activeReadingId === id ||
            existingState.activeMotorName === cleanMotor)
        ) {
          await setDoc(stateRef, {
            plantId: plantDoc.id,
            plantName: plantDoc.name,
            activeMotorName: '',
            activeReadingId: '',
            previousStoppedMotor: cleanMotor,
            updatedBy: fbUser.uid,
            updatedByName: profile.name,
            updatedAt: serverTimestamp(),
          }).catch(() => {});

          const idsToStop = new Set<string>();
          const prevActiveId = existingState.activeReadingId.trim();
          if (prevActiveId && prevActiveId !== id) {
            idsToStop.add(prevActiveId);
          }
          const lingering = await collectRunningReadingIdsForPlant(cleanPlant, profile, fbUser.uid, {
            excludeReadingId: id,
            onlyMotorName: cleanMotor,
          });
          lingering.forEach((rid) => idsToStop.add(rid));
          if (idsToStop.size > 0) {
            await markReadingsStopped(idsToStop);
          }
        }
      }

      const refreshed = await getDoc(readingRef).catch((err) =>
        handleFirestoreError(err, OperationType.GET, `readings/${id}`)
      );
      if (refreshed.exists()) {
        const mapped = mapReadingDoc(refreshed.id, refreshed.data());
        return {
          ...mapped,
          imageUrl: nextImageUrl || mapped.imageUrl,
          ...(autoStoppedMotor ? { autoStoppedMotor } : {}),
        };
      }

      return {
        ...mapReadingDoc(id, existingData),
        waterFlow: Math.round(payload.waterFlow * 100) / 100,
        plant: cleanPlant,
        motorName: cleanMotor,
        motorStatus: payload.motorStatus,
        recordedAt: payload.recordedAt,
        review: payload.review.trim().slice(0, 500),
        photoId: nextPhotoId,
        imageUrl: nextImageUrl,
        updatedAt: new Date().toISOString(),
        ...(autoStoppedMotor ? { autoStoppedMotor } : {}),
      };
    } catch (err) {
      throw new Error(extractFriendlyFirestoreMessage(err, 'Unable to save reading changes.'));
    }
  },

  async deleteReading(id: string): Promise<void> {
    try {
      const readingRef = doc(db, 'readings', id);
      const snap = await getDoc(readingRef).catch((err) =>
        handleFirestoreError(err, OperationType.GET, `readings/${id}`)
      );
      const readingData = snap.exists() ? snap.data() : null;
      const photoId = readingData?.photoId;

      const batch = writeBatch(db);
      batch.delete(readingRef);
      if (typeof photoId === 'string' && photoId) {
        batch.delete(doc(db, 'reading_photos', photoId));
      }
      await batch.commit().catch((err) =>
        handleFirestoreError(err, OperationType.DELETE, `readings/${id}`)
      );
      if (typeof photoId === 'string' && photoId) {
        photoCache.delete(photoId);
      }

      // If this deleted reading was the active running motor for its plant, clear interlock state
      if (readingData && typeof readingData.plant === 'string') {
        const plantDoc = await resolvePlantDocByName(readingData.plant).catch(() => null);
        if (plantDoc && auth.currentUser) {
          const stateRef = doc(db, 'plant_motor_states', plantDoc.id);
          const stateSnap = await getDoc(stateRef).catch(() => null);
          if (stateSnap && stateSnap.exists() && stateSnap.data().activeReadingId === id) {
            const { profile } = await requireActiveAuthProfile();
            await setDoc(stateRef, {
              plantId: plantDoc.id,
              plantName: plantDoc.name,
              activeMotorName: '',
              activeReadingId: '',
              previousStoppedMotor: String(stateSnap.data().activeMotorName ?? ''),
              updatedBy: auth.currentUser.uid,
              updatedByName: profile.name,
              updatedAt: serverTimestamp(),
            }).catch(() => {});
          }
        }
      }
    } catch (err) {
      throw new Error(extractFriendlyFirestoreMessage(err, 'Failed to delete meter reading.'));
    }
  },

  async getUsers(): Promise<User[]> {
    try {
      const [usersSnap, readingsSnap] = await Promise.all([
        getDocs(collection(db, 'users')).catch((err) =>
          handleFirestoreError(err, OperationType.LIST, 'users')
        ),
        getDocs(collection(db, 'readings')).catch((err) =>
          handleFirestoreError(err, OperationType.LIST, 'readings')
        ),
      ]);

      const activeReadings = filterActiveReadings(
        readingsSnap.docs.map((d) => mapReadingDoc(d.id, d.data()))
      );
      const counts = new Map<string, number>();
      for (const r of activeReadings) {
        counts.set(r.submittedBy, (counts.get(r.submittedBy) ?? 0) + 1);
      }

      return usersSnap.docs
        .map((d) => mapUserDoc(d.id, d.data(), counts.get(d.id) ?? 0))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    } catch (err) {
      throw new Error(extractFriendlyFirestoreMessage(err, 'Unable to load user directory.'));
    }
  },

  async createUser(payload: {
    name: string;
    email: string;
    password: string;
    role: UserRole;
  }): Promise<User> {
    const cleanName = payload.name.trim();
    const cleanEmail = payload.email.trim().toLowerCase();
    const cleanRole: UserRole = payload.role === 'admin' ? 'admin' : 'user';

    if (cleanName.length < 2) {
      throw new Error('Full name must be at least 2 characters.');
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      throw new Error('Enter a valid email address.');
    }
    if (payload.password.length < 6) {
      throw new Error('Password must be at least 6 characters.');
    }

    const secondaryAuth = getSecondaryAuth();
    let newUid = '';
    try {
      const cred = await createUserWithEmailAndPassword(secondaryAuth, cleanEmail, payload.password);
      newUid = cred.user.uid;
      await updateProfile(cred.user, { displayName: cleanName }).catch(() => {});
    } catch (err) {
      throw mapFirebaseAuthError(err);
    } finally {
      await signOut(secondaryAuth).catch(() => {});
    }

    try {
      const batch = writeBatch(db);
      batch.set(doc(db, 'users', newUid), {
        uid: newUid,
        name: cleanName,
        email: cleanEmail,
        role: cleanRole,
        active: true,
        createdAt: serverTimestamp(),
      });
      if (cleanRole === 'admin') {
        batch.set(doc(db, 'admins', newUid), {
          uid: newUid,
          email: cleanEmail,
          createdAt: serverTimestamp(),
        });
      }
      await batch.commit().catch((err) =>
        handleFirestoreError(err, OperationType.CREATE, `users/${newUid}`)
      );

      return {
        id: newUid,
        name: cleanName,
        email: cleanEmail,
        role: cleanRole,
        createdAt: new Date().toISOString(),
        readingCount: 0,
      };
    } catch (err) {
      throw new Error(extractFriendlyFirestoreMessage(err, 'Unable to create user profile.'));
    }
  },

  async deleteUser(id: string): Promise<void> {
    const currentUid = auth.currentUser?.uid;
    if (currentUid && currentUid === id) {
      throw new Error('You cannot delete your own active administrator account.');
    }

    try {
      const allUsers = await this.getUsers();
      const target = allUsers.find((u) => u.id === id);
      if (!target) {
        throw new Error('User account not found.');
      }
      if (target.role === 'admin') {
        const adminCount = allUsers.filter((u) => u.role === 'admin').length;
        if (adminCount <= 1) {
          throw new Error('Cannot delete the last remaining administrator account.');
        }
      }

      const batch = writeBatch(db);
      batch.delete(doc(db, 'users', id));
      if (target.role === 'admin') {
        batch.delete(doc(db, 'admins', id));
      }
      await batch.commit().catch((err) =>
        handleFirestoreError(err, OperationType.DELETE, `users/${id}`)
      );
    } catch (err) {
      throw new Error(extractFriendlyFirestoreMessage(err, 'Unable to delete user account.'));
    }
  },

  getGoogleSheetsSession(): GoogleSheetsSessionInfo {
    return {
      connected: Boolean(cachedSheetsAccessToken),
      accountEmail: cachedSheetsAccountEmail,
    };
  },

  async connectGoogleSheets(options?: {
    switchAccount?: boolean;
  }): Promise<GoogleSheetsSessionInfo> {
    const activeAdminEmail = (auth.currentUser?.email ?? '').trim().toLowerCase();
    const provider = createGoogleSheetsAuthProvider({
      loginHint: activeAdminEmail || undefined,
      forceSelectAccount: Boolean(options?.switchAccount),
    });

    try {
      const targetAuth = getGoogleSheetsAuth();
      const result = await signInWithPopup(targetAuth, provider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      if (!credential?.accessToken) {
        throw new Error(
          'Google did not return a Sheets access token. Please allow Google Sheets permission and try again.'
        );
      }

      cachedSheetsAccessToken = credential.accessToken;
      cachedSheetsAccountEmail =
        (result.user.email ?? activeAdminEmail).trim().toLowerCase() || null;

      return {
        connected: true,
        accountEmail: cachedSheetsAccountEmail,
      };
    } catch (err) {
      const mapped = mapFirebaseAuthError(err);
      throw new Error(extractFriendlyFirestoreMessage(mapped, mapped.message));
    }
  },

  async disconnectGoogleSheets(): Promise<void> {
    clearCachedSheetsSession();
    try {
      const sheetsAuth = getGoogleSheetsAuth();
      if (sheetsAuth !== auth) {
        await signOut(sheetsAuth);
      }
    } catch {
      // Ignore if sheets OAuth instance is not signed in
    }
  },

  async computeExportBaselines(
    readings: readonly MeterReading[],
    effectiveFilters: ReadingFilters
  ): Promise<Record<string, number>> {
    const baselineFlowByPlant: Record<string, number> = {};
    if (!effectiveFilters.dateFrom || readings.length === 0) {
      return baselineFlowByPlant;
    }

    try {
      const broader = await this.getAllReadings({
        plant: effectiveFilters.plant,
      });
      const earliestByPlant = new Map<string, number>();
      for (const r of readings) {
        const key = r.plant.trim().toLowerCase();
        const ts = Date.parse(r.recordedAt);
        if (Number.isNaN(ts)) continue;
        const prevMin = earliestByPlant.get(key);
        if (prevMin === undefined || ts < prevMin) {
          earliestByPlant.set(key, ts);
        }
      }
      const bestPriorByPlant = new Map<string, { ts: number; flow: number }>();
      for (const r of broader) {
        const key = r.plant.trim().toLowerCase();
        const minTs = earliestByPlant.get(key);
        if (minTs === undefined) continue;
        const ts = Date.parse(r.recordedAt);
        if (Number.isNaN(ts) || ts >= minTs) continue;
        const currentBest = bestPriorByPlant.get(key);
        if (!currentBest || ts > currentBest.ts) {
          bestPriorByPlant.set(key, { ts, flow: r.waterFlow });
        }
      }
      for (const [key, prior] of bestPriorByPlant.entries()) {
        baselineFlowByPlant[key] = prior.flow;
      }
    } catch {
      // Non-fatal: continue export using in-range readings only
    }

    return baselineFlowByPlant;
  },

  async exportReadingsToGoogleSheets(
    filters?: ReadingFilters,
    selectedPlant?: string,
    plantNames?: readonly string[]
  ): Promise<GoogleSheetsExportResult> {
    if (!cachedSheetsAccessToken) {
      throw new GoogleSheetsAuthError(
        'Please sign in with your Google administrator account to connect Google Sheets first.',
        401
      );
    }

    const effectivePlant =
      selectedPlant !== undefined ? selectedPlant : filters?.plant ?? 'all';
    // Always fetch across all plants (keeping active date/motor/user filters) so
    // Sheet 1 ("All Plants") and every individual plant tab are fully populated.
    const allPlantsFilters: ReadingFilters = {
      ...(filters ?? {}),
      plant: 'all',
    };

    const readings = await this.getAllReadings(allPlantsFilters);
    const tzOffset = new Date().getTimezoneOffset();
    const baselineFlowByPlant = await this.computeExportBaselines(readings, allPlantsFilters);

    const { payload, plantLabel, targetSheetId, targetSheetTitle } =
      buildGoogleSheetsSpreadsheetPayload(readings, {
        tzOffsetMinutes: tzOffset,
        baselineFlowByPlant,
        selectedPlant: effectivePlant,
        emptyFallbackPlant: effectivePlant,
        plantNames,
      });

    try {
      return await createGoogleSheetViaApi(cachedSheetsAccessToken, payload, {
        recordCount: readings.length,
        plantLabel,
        accountEmail: cachedSheetsAccountEmail,
        targetSheetId,
        targetSheetTitle,
      });
    } catch (err) {
      if (err instanceof GoogleSheetsAuthError) {
        clearCachedSheetsSession();
      }
      throw err;
    }
  },

  async exportReadingsXlsx(
    filters?: ReadingFilters,
    selectedPlant?: string,
    plantNames?: readonly string[]
  ): Promise<string> {
    const effectivePlant =
      selectedPlant !== undefined ? selectedPlant : filters?.plant ?? 'all';
    const allPlantsFilters: ReadingFilters = {
      ...(filters ?? {}),
      plant: 'all',
    };

    const readings = await this.getAllReadings(allPlantsFilters);
    const tzOffset = new Date().getTimezoneOffset();
    const baselineFlowByPlant = await this.computeExportBaselines(readings, allPlantsFilters);

    const workbook = buildWaterFlowWorkbook(readings, {
      tzOffsetMinutes: tzOffset,
      baselineFlowByPlant,
      emptyFallbackPlant: effectivePlant,
      plantNames,
    });

    const stamp = new Date().toISOString().slice(0, 10);
    const plantSlug =
      effectivePlant && effectivePlant !== 'all'
        ? `-${effectivePlant.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`
        : '';
    const filename = `water-meter-readings${plantSlug}-${stamp}.xlsx`;
    const arrayBuffer = serializeWorkbookToArrayBuffer(workbook);

    const androidBridge = (
      window as unknown as {
        HydroLogAndroid?: {
          saveBase64File?: (base64Data: string, filename: string, mimeType: string) => boolean;
        };
      }
    ).HydroLogAndroid;

    if (androidBridge?.saveBase64File) {
      const bytes = new Uint8Array(arrayBuffer);
      let binary = '';
      const chunkSize = 0x8000;
      for (let i = 0; i < bytes.length; i += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
      }
      const base64 = btoa(binary);
      const saved = androidBridge.saveBase64File(
        base64,
        filename,
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      if (saved) {
        return filename;
      }
    }

    const blob = new Blob([arrayBuffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const blobUrl = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = blobUrl;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(blobUrl), 1500);

    return filename;
  },
};
