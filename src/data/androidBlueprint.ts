export interface BlueprintFile {
  id: string;
  path: string;
  title: string;
  category: 'Project Structure' | 'Android Kotlin' | 'Database & RBAC';
  language: string;
  summary: string;
  code: string;
}

export const ANDROID_PROJECT_TREE = `hydrolog-android/
├── app/
│   ├── build.gradle.kts                  # Compose, CameraX, Retrofit, OkHttp, DataStore
│   └── src/main/
│       ├── AndroidManifest.xml           # CAMERA + INTERNET permissions, FileProvider
│       ├── res/xml/file_paths.xml        # Temporary URI storage for meter photos
│       └── java/com/hydrolog/app/
│           ├── MainActivity.kt           # Role-gated NavHost (Field Users: Home/Submit/Records; Admin: +Dashboard/Setup/Users/Android)
│           ├── data/
│           │   ├── AuthStore.kt          # Encrypted/DataStore JWT & UserRole persistence
│           │   ├── ApiService.kt         # Retrofit REST endpoints + Multipart image upload
│           │   ├── AuthInterceptor.kt    # Attaches Authorization: Bearer <jwt>
│           │   └── Models.kt             # User, MeterReading, Plant, Motor, LoginRequest
│           └── ui/screens/
│               ├── LoginScreen.kt        # Clean admin-provisioned login (no demo accounts or public sign-up)
│               ├── UserHomeScreen.kt     # Field operator overview + quick submit CTA
│               ├── SubmitReadingScreen.kt# Runtime camera permission on 1st tap, auto-open thereafter, Plant/Motor/Status
│               ├── MyRecordsScreen.kt    # GET /api/readings/mine scoped list
│               ├── AdminDashboardScreen.kt # Total m³ summary + plant/date/user filters
│               ├── AllRecordsScreen.kt   # Full records table, edit dialog, .xlsx export
│               └── CreateUserScreen.kt   # Admin-only POST /api/users account creation
└── backend/
    ├── server.ts                         # Express REST API + Multer + SheetJS (.xlsx)
    ├── server/auth.ts                    # JWT verify + requireAdmin RBAC middleware
    └── server/db.ts                      # Relational SQL schema (SQLite / PostgreSQL)`;

export const BLUEPRINT_FILES: BlueprintFile[] = [
  {
    id: 'structure',
    path: 'hydrolog-android/README-ARCHITECTURE.txt',
    title: 'Android Studio Project Structure',
    category: 'Project Structure',
    language: 'text',
    summary:
      'Complete Android (Kotlin + Jetpack Compose) module hierarchy mapped 1:1 to the live REST API running in this application.',
    code: ANDROID_PROJECT_TREE,
  },
  {
    id: 'gradle',
    path: 'app/build.gradle.kts',
    title: 'Gradle Dependencies & Manifest Setup',
    category: 'Android Kotlin',
    language: 'kotlin',
    summary:
      'CameraX for meter photography, Retrofit + OkHttp for multipart uploads, Coil for photo thumbnails, and DataStore for JWT persistence.',
    code: `plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.hydrolog.app"
    compileSdk = 35
    defaultConfig {
        applicationId = "com.hydrolog.app"
        minSdk = 26
        targetSdk = 35
        buildConfigField("String", "API_BASE_URL", "\\"https://hydrolog-water-meter-reading-app-199133736510.asia-east1.run.app/\\"")
    }
    buildFeatures { compose = true; buildConfig = true }
}

dependencies {
    implementation(platform("androidx.compose:compose-bom:2025.01.00"))
    implementation("androidx.compose.material3:material3")
    implementation("androidx.navigation:navigation-compose:2.8.5")

    // CameraX for field meter evidence capture
    implementation("androidx.camera:camera-camera2:1.4.1")
    implementation("androidx.camera:camera-lifecycle:1.4.1")
    implementation("androidx.camera:camera-view:1.4.1")

    // Networking & Multipart Upload
    implementation("com.squareup.retrofit2:retrofit:2.11.0")
    implementation("com.squareup.retrofit2:converter-gson:2.11.0")
    implementation("com.squareup.okhttp3:okhttp:4.12.0")

    // Image loading & Token persistence
    implementation("io.coil-kt:coil-compose:2.7.0")
    implementation("androidx.datastore:datastore-preferences:1.1.2")
}`,
  },
  {
    id: 'api-service',
    path: 'app/src/main/java/com/hydrolog/app/data/ApiService.kt',
    title: 'Retrofit API Client & JWT Interceptor',
    category: 'Android Kotlin',
    language: 'kotlin',
    summary:
      'Typed Retrofit interface covering login, user-scoped readings, multipart meter photo upload, admin editing, user creation, and Excel export.',
    code: `package com.hydrolog.app.data

import okhttp3.*
import retrofit2.http.*

interface ApiService {
    @POST("api/auth/login")
    suspend fun login(@Body body: LoginRequest): AuthResponse

    @GET("api/readings/mine")
    suspend fun getMyReadings(@Query("plant") plant: String? = null): ReadingsResponse

    @GET("api/readings")
    suspend fun getAllReadings(
        @Query("plant") plant: String? = null,
        @Query("userId") userId: Int? = null,
        @Query("dateFrom") dateFrom: String? = null,
        @Query("dateTo") dateTo: String? = null
    ): ReadingsResponse

    @Multipart
    @POST("api/readings")
    suspend fun submitReading(
        @Part image: MultipartBody.Part,
        @Part("waterFlow") waterFlow: RequestBody,
        @Part("plant") plant: RequestBody,
        @Part("recordedAt") recordedAt: RequestBody,
        @Part("review") review: RequestBody
    ): SingleReadingResponse

    @Multipart
    @PUT("api/readings/{id}")
    suspend fun updateReading(
        @Path("id") id: Int,
        @Part("waterFlow") waterFlow: RequestBody,
        @Part("plant") plant: RequestBody,
        @Part("recordedAt") recordedAt: RequestBody,
        @Part("review") review: RequestBody,
        @Part image: MultipartBody.Part? = null
    ): SingleReadingResponse

    @POST("api/users")
    suspend fun createUser(@Body body: CreateUserRequest): UserResponse

    @Streaming
    @GET("api/readings/export")
    suspend fun exportExcel(
        @Query("plant") plant: String? = null,
        @Query("userId") userId: Int? = null,
        @Query("dateFrom") dateFrom: String? = null,
        @Query("dateTo") dateTo: String? = null
    ): ResponseBody
}

class AuthInterceptor(private val tokenProvider: () -> String?) : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val token = tokenProvider()
        val request = chain.request().newBuilder().apply {
            if (!token.isNullOrBlank()) header("Authorization", "Bearer \$token")
        }.build()
        return chain.proceed(request)
    }
}`,
  },
  {
    id: 'submit-kotlin',
    path: 'app/src/main/java/com/hydrolog/app/ui/screens/SubmitReadingScreen.kt',
    title: 'Submit Reading Screen (Camera + Upload)',
    category: 'Android Kotlin',
    language: 'kotlin',
    summary:
      'Jetpack Compose form that pops up Android runtime Camera permission on first tap, opens the camera automatically on subsequent taps via TakePicture, and uploads multipart FormData.',
    code: `package com.hydrolog.app.ui.screens

import android.Manifest
import android.content.pm.PackageManager
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import java.time.Instant

@Composable
fun SubmitReadingScreen(
    onSubmit: (photoUri: Uri, flowM3: Double, plant: String, recordedAt: String, review: String) -> Unit
) {
    val context = LocalContext.current
    var photoUri by remember { mutableStateOf<Uri?>(null) }
    var pendingPhotoUri by remember { mutableStateOf<Uri?>(null) }
    var waterFlow by remember { mutableStateOf("") }
    var selectedPlant by remember { mutableStateOf("Plant A") }
    var recordedAt by remember { mutableStateOf(Instant.now().toString()) }
    var review by remember { mutableStateOf("") }

    val cameraLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.TakePicture()
    ) { success ->
        if (success) {
            photoUri = pendingPhotoUri
        } else {
            pendingPhotoUri = null
        }
    }

    val openCamera = {
        val tempUri = createTempMeterPhotoUri(context)
        pendingPhotoUri = tempUri
        cameraLauncher.launch(tempUri)
    }

    // Pops up Android's native Camera permission dialog on first click; once granted, opens automatically
    val cameraPermissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted ->
        if (granted) openCamera()
    }

    Column(Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text("Submit Water Meter Reading", style = MaterialTheme.typography.titleLarge)

        OutlinedButton(onClick = {
            val granted = ContextCompat.checkSelfPermission(
                context,
                Manifest.permission.CAMERA
            ) == PackageManager.PERMISSION_GRANTED
            if (granted) {
                openCamera()
            } else {
                cameraPermissionLauncher.launch(Manifest.permission.CAMERA)
            }
        }) {
            Text(if (photoUri == null) "Open Camera" else "Retake Meter Photo")
        }

        OutlinedTextField(
            value = waterFlow,
            onValueChange = { waterFlow = it },
            label = { Text("Water Flow (m³)") },
            singleLine = true,
            modifier = Modifier.fillMaxWidth()
        )

        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            listOf("Plant A", "Plant B", "Plant C").forEach { plant ->
                FilterChip(
                    selected = selectedPlant == plant,
                    onClick = { selectedPlant = plant },
                    label = { Text(plant) }
                )
            }
        }

        OutlinedTextField(
            value = recordedAt,
            onValueChange = { recordedAt = it },
            label = { Text("Date & Time (Auto-filled)") },
            modifier = Modifier.fillMaxWidth()
        )

        OutlinedTextField(
            value = review,
            onValueChange = { review = it },
            label = { Text("Review / Abnormality Remarks") },
            minLines = 3,
            modifier = Modifier.fillMaxWidth()
        )

        Button(
            onClick = {
                val flow = waterFlow.toDoubleOrNull() ?: return@Button
                val uri = photoUri ?: return@Button
                onSubmit(uri, flow, selectedPlant, recordedAt, review)
            },
            modifier = Modifier.fillMaxWidth().height(48.dp)
        ) {
            Text("Upload Reading")
        }
    }
}`,
  },
  {
    id: 'sql-schema',
    path: 'backend/schema.sql',
    title: 'Database Schema (PostgreSQL / SQLite)',
    category: 'Database & RBAC',
    language: 'sql',
    summary:
      'Relational schema enforcing valid roles (admin, user), positive cubic meter readings, valid plant enums, and foreign-key ownership to submitted_by.',
    code: `-- PostgreSQL / SQLite Compatible Relational Schema
CREATE TABLE users (
    id            SERIAL PRIMARY KEY,
    name          VARCHAR(120) NOT NULL,
    email         VARCHAR(180) NOT NULL UNIQUE,
    password_hash TEXT         NOT NULL,
    role          VARCHAR(10)  NOT NULL CHECK (role IN ('admin', 'user')),
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE plants (
    id            SERIAL PRIMARY KEY,
    name          VARCHAR(60)  NOT NULL UNIQUE,
    sort_order    INTEGER      NOT NULL DEFAULT 0
);

CREATE TABLE motors (
    id            SERIAL PRIMARY KEY,
    name          VARCHAR(60)  NOT NULL UNIQUE,
    sort_order    INTEGER      NOT NULL DEFAULT 0
);

CREATE TABLE meter_readings (
    id            SERIAL PRIMARY KEY,
    image_url     TEXT           NOT NULL,
    water_flow    NUMERIC(12, 2) NOT NULL CHECK (water_flow > 0),
    recorded_at   TIMESTAMPTZ    NOT NULL,
    plant         VARCHAR(60)    NOT NULL,
    motor_name    VARCHAR(60)    NOT NULL DEFAULT 'Motor 1',
    motor_status  VARCHAR(12)    NOT NULL DEFAULT 'Running' CHECK (motor_status IN ('Running', 'Stopped')),
    review        TEXT           NOT NULL DEFAULT '',
    submitted_by  INTEGER        NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at    TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_meter_readings_plant        ON meter_readings (plant);
CREATE INDEX idx_meter_readings_motor_name   ON meter_readings (motor_name);
CREATE INDEX idx_meter_readings_submitted_by ON meter_readings (submitted_by);
CREATE INDEX idx_meter_readings_recorded_at  ON meter_readings (recorded_at DESC);`,
  },
  {
    id: 'rbac-matrix',
    path: 'backend/RBAC-SECURITY.md',
    title: 'Server-Enforced RBAC & API Endpoints',
    category: 'Database & RBAC',
    language: 'text',
    summary:
      'Every endpoint verifies the signed JWT and enforces Admin vs User permissions on the backend server before reading or mutating records.',
    code: `Endpoint                  Method   Auth        Role Required   Behavior
------------------------------------------------------------------------------------------
/api/auth/login           POST     Public      Any existing    Verifies bcrypt hash -> JWT
/api/auth/me              GET      Bearer JWT  Admin | User    Returns active user profile
/api/readings/mine        GET      Bearer JWT  Admin | User    WHERE submitted_by = req.user.id
/api/readings             POST     Bearer JWT  Admin | User    Uploads meter photo + reading
/api/readings             GET      Bearer JWT  Admin ONLY      All records + plant/date/user filters
/api/readings/:id         PUT      Bearer JWT  Admin ONLY      Edit flow, plant, timestamp, remarks, photo
/api/readings/:id         DELETE   Bearer JWT  Admin ONLY      Remove erroneous record
/api/readings/export      GET      Bearer JWT  Admin ONLY      Streams filtered Excel (.xlsx) workbook
/api/users                GET      Bearer JWT  Admin ONLY      Lists accounts + reading counts
/api/users                POST     Bearer JWT  Admin ONLY      Provisions new User or Admin account

Security Controls:
1. Public sign-up is intentionally disabled; only requireAdmin middleware can call POST /api/users.
2. Field users calling /api/readings, /api/readings/:id (PUT), /api/readings/export, or /api/users
   receive HTTP 403 Forbidden directly from the Express server.
3. Meter photos are validated for image MIME types (JPEG/PNG/WebP, max 10MB) and stored on disk
   (or S3-compatible bucket in cloud deployment) with persisted URL references.`,
  },
];
