plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

val configuredAppUrl = (project.findProperty("APP_URL") as String?)
    ?.trim()
    ?.takeIf { it.isNotEmpty() }
    ?: "https://ais-pre-5tnfqkbxa6fnkmd222jbzd-514499993628.asia-southeast1.run.app"

val escapedAppUrl = configuredAppUrl
    .replace("\\", "\\\\")
    .replace("\"", "\\\"")

val configuredVersionName = (project.findProperty("VERSION_NAME") as String?)
    ?.trim()
    ?.removePrefix("v")
    ?.takeIf { it.isNotEmpty() }
    ?: "1.0.0"

val configuredVersionCode = (project.findProperty("VERSION_CODE") as String?)
    ?.toIntOrNull()
    ?.coerceAtLeast(1)
    ?: 1

val releaseStoreFilePath = (project.findProperty("RELEASE_STORE_FILE") as String?)?.trim()
val releaseStorePassword = (project.findProperty("RELEASE_STORE_PASSWORD") as String?)?.trim()
val releaseKeyAlias = (project.findProperty("RELEASE_KEY_ALIAS") as String?)?.trim()
val releaseKeyPassword = (project.findProperty("RELEASE_KEY_PASSWORD") as String?)?.trim()
val hasReleaseSigning = !releaseStoreFilePath.isNullOrEmpty() &&
    !releaseStorePassword.isNullOrEmpty() &&
    !releaseKeyAlias.isNullOrEmpty() &&
    !releaseKeyPassword.isNullOrEmpty() &&
    file(releaseStoreFilePath).exists()

android {
    namespace = "com.hydrolog.app"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.hydrolog.app"
        minSdk = 26
        targetSdk = 35
        versionCode = configuredVersionCode
        versionName = configuredVersionName

        buildConfigField("String", "APP_URL", "\"$escapedAppUrl\"")
    }

    signingConfigs {
        if (hasReleaseSigning) {
            create("release") {
                storeFile = file(releaseStoreFilePath!!)
                storePassword = releaseStorePassword
                keyAlias = releaseKeyAlias
                keyPassword = releaseKeyPassword
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            isShrinkResources = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
            signingConfig = if (hasReleaseSigning) {
                signingConfigs.getByName("release")
            } else {
                signingConfigs.getByName("debug")
            }
        }
        debug {
            applicationIdSuffix = ""
            versionNameSuffix = ""
        }
    }

    buildFeatures {
        buildConfig = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("androidx.activity:activity-ktx:1.9.3")
    implementation("com.google.android.material:material:1.12.0")
}
