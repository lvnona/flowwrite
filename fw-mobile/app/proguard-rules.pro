# Keep model/DTO class names stable if you later add reflection-based parsing.
# We parse JSON manually with org.json, so no special rules are required today.

# OkHttp (platform classes referenced reflectively on some JDKs).
-dontwarn okhttp3.internal.platform.**
-dontwarn org.conscrypt.**
-dontwarn org.bouncycastle.**
-dontwarn org.openjsse.**

# ── Firebase (Auth + Firestore) ──────────────────────────────────────────
-keep class com.google.firebase.** { *; }
-keep class com.google.android.gms.** { *; }
-dontwarn com.google.firebase.**
-dontwarn com.google.android.gms.**

# ── Credential Manager + Google ID (Google Sign-In) ──────────────────────
-keep class androidx.credentials.** { *; }
-keep class com.google.android.libraries.identity.googleid.** { *; }
-dontwarn androidx.credentials.**

# ── Kotlin coroutines ────────────────────────────────────────────────────
-dontwarn kotlinx.coroutines.**

# Keep our own data classes (read from Firestore field-by-field).
-keep class ca.u11.flowwrite.data.** { *; }
