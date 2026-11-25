import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, type Auth } from 'firebase/auth';
import { doc, getDocFromServer, getFirestore } from 'firebase/firestore';
import oauthAppletConfig from '../../firebase-applet-config.json';

interface FirebaseAppletConfigShape {
  projectId: string;
  appId: string;
  apiKey: string;
  authDomain: string;
  firestoreDatabaseId?: string;
  storageBucket: string;
  messagingSenderId: string;
  measurementId?: string;
  oAuthClientId?: string;
  recaptchaSiteKey?: string;
}

const optionalFirestoreConfigs = import.meta.glob<FirebaseAppletConfigShape>(
  '../../firebase-firestore-config.json',
  { eager: true, import: 'default' }
);

const rawOauthConfig = oauthAppletConfig as FirebaseAppletConfigShape;
const rawFirestoreConfig =
  Object.values(optionalFirestoreConfigs)[0] ?? rawOauthConfig;

// Use firebase-applet-config.json for Firestore when it includes firestoreDatabaseId;
// otherwise keep the existing provisioned Firestore database project so data & user accounts remain intact.
const activeFirestoreConfig: FirebaseAppletConfigShape = rawOauthConfig.firestoreDatabaseId
  ? rawOauthConfig
  : rawFirestoreConfig;

const activeFirestoreDatabaseId =
  activeFirestoreConfig.firestoreDatabaseId || '(default)';

const app =
  getApps().find((a) => a.name === '[DEFAULT]') ?? initializeApp(activeFirestoreConfig);

export const GOOGLE_SHEETS_SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets',
] as const;

export const db = getFirestore(app, activeFirestoreDatabaseId);
export const auth = getAuth(app);
export const googleAuthProvider = new GoogleAuthProvider();

export function createGoogleSheetsAuthProvider(options?: {
  loginHint?: string;
  forceSelectAccount?: boolean;
}): GoogleAuthProvider {
  const provider = new GoogleAuthProvider();
  for (const scope of GOOGLE_SHEETS_SCOPES) {
    provider.addScope(scope);
  }
  const params: Record<string, string> = {};
  if (options?.forceSelectAccount) {
    params.prompt = 'select_account consent';
  } else {
    params.prompt = 'select_account';
  }
  if (options?.loginHint && !options?.forceSelectAccount) {
    params.login_hint = options.loginHint;
  }
  provider.setCustomParameters(params);
  return provider;
}

export const FIREBASE_PROJECT_ID = activeFirestoreConfig.projectId;
export const FIREBASE_DATABASE_ID = activeFirestoreDatabaseId;
export const FIREBASE_OAUTH_PROJECT_ID = rawOauthConfig.projectId;
export const FIREBASE_AUTH_PROVIDERS_URL = `https://console.firebase.google.com/project/${activeFirestoreConfig.projectId}/authentication/providers`;
export const FIREBASE_TTL_POLICY_URL = `https://console.firebase.google.com/project/${activeFirestoreConfig.projectId}/firestore/databases/${activeFirestoreDatabaseId}/ttl`;

let secondaryApp: FirebaseApp | null = null;
let secondaryAuthInstance: Auth | null = null;
let sheetsOAuthApp: FirebaseApp | null = null;
let sheetsOAuthInstance: Auth | null = null;

/**
 * Dedicated Firebase Auth instance for Google Sheets OAuth using the Workspace OAuth project
 * provisioned in firebase-applet-config.json, keeping the primary HydroLog session undisturbed.
 */
export function getGoogleSheetsAuth(): Auth {
  if (rawOauthConfig.projectId === activeFirestoreConfig.projectId) {
    return auth;
  }
  if (!sheetsOAuthApp) {
    sheetsOAuthApp =
      getApps().find((a) => a.name === 'hydrolog-google-sheets-oauth') ??
      initializeApp(rawOauthConfig, 'hydrolog-google-sheets-oauth');
  }
  if (!sheetsOAuthInstance) {
    sheetsOAuthInstance = getAuth(sheetsOAuthApp);
  }
  return sheetsOAuthInstance;
}

/**
 * Secondary Firebase Auth instance used strictly by Administrators when creating
 * new Field User or Admin accounts so the active Admin session is never interrupted.
 */
export function getSecondaryAuth(): Auth {
  if (!secondaryApp) {
    secondaryApp =
      getApps().find((a) => a.name === 'hydrolog-admin-provisioner') ??
      initializeApp(activeFirestoreConfig, 'hydrolog-admin-provisioner');
  }
  if (!secondaryAuthInstance) {
    secondaryAuthInstance = getAuth(secondaryApp);
  }
  return secondaryAuthInstance;
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export function extractFriendlyFirestoreMessage(err: unknown, fallback: string): string {
  if (!(err instanceof Error)) return fallback;
  try {
    const parsed = JSON.parse(err.message) as Partial<FirestoreErrorInfo>;
    if (typeof parsed.error === 'string') {
      if (/permission|insufficient/i.test(parsed.error)) {
        return 'Permission denied by database rules. Make sure you are signed in with an active authorized account.';
      }
      if (/quota exceeded/i.test(parsed.error)) {
        return 'Firebase daily free-tier quota exceeded. Quota resets tomorrow or can be upgraded in Firebase Console.';
      }
      if (/offline/i.test(parsed.error)) {
        return 'Unable to reach the cloud database. Check your internet connection and try again.';
      }
      return parsed.error;
    }
  } catch {
    // Plain error message
  }
  return err.message || fallback;
}

async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}

void testConnection();
