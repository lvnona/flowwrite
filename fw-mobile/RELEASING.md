# Releasing FlowWrite Android

**Source code stays in this folder (`fw-mobile/`) inside the
`lvnona/flowwrite` repo. Release artifacts (the signed APK + notes)
go to a SEPARATE repository:**

> **`lvnona/flowwrite-android`** ← the only place Android releases are published from now on.

## Why

The `lvnona/flowwrite` repo also hosts the desktop Electron app, which
auto-updates via `electron-updater` by fetching
`releases/latest/download/latest-mac.yml` / `latest.yml`. Every Android
release used to claim GitHub's "Latest" badge by default and broke that
feed (an APK-only release has no `.yml` files). Separating the artifact
repo fixes it permanently.

## Tag conventions

- **New repo (Android):** `v1.0.X` — no `mobile-` prefix needed.
- **Old repo (`lvnona/flowwrite`):** `mobile-v*` tags exist there from
  v1.0.0–v1.0.10 for history. Do NOT publish anything new there.

## Steps for the next release

Assuming:
- `versionName` / `versionCode` bumped in `app/build.gradle.kts`.
- A new `## 1.0.X` entry added to `CHANGELOG.md`.
- Source changes committed and pushed to `main` on `lvnona/flowwrite`.

Build + publish the artifact:

```bash
SDK=/Users/normundsmurnieks/Library/Android/sdk
cd /Users/normundsmurnieks/Documents/AI/FlowWrite/fw-mobile

# 1. Build the release-signed APK
ANDROID_HOME=$SDK ./gradlew assembleRelease --no-daemon

# 2. Stage the artifact under a versioned name
cp app/build/outputs/apk/release/app-release.apk /tmp/FlowWrite-v1.0.X.apk

# 3. Publish to the Android-only repo (NOT lvnona/flowwrite)
gh release create v1.0.X /tmp/FlowWrite-v1.0.X.apk \
  --repo lvnona/flowwrite-android \
  --title "FlowWrite Android v1.0.X" \
  --notes "(release notes — pull the matching section from CHANGELOG.md)"
```

Direct-download URL for that release becomes:

```
https://github.com/lvnona/flowwrite-android/releases/download/v1.0.X/FlowWrite-v1.0.X.apk
```

## DO NOT

- `gh release create … --repo lvnona/flowwrite …` for Android. Ever.
- Use the `mobile-` prefix in new tags (the new repo is Android-only,
  the prefix adds noise).
- Add a GitHub Actions workflow for this without giving it a PAT for
  `lvnona/flowwrite-android` — `GITHUB_TOKEN` only has rights on its
  own repo.

## Keystore + signing

The release keystore lives at `app/flowwrite-upload.jks` and the
password file at `app/keystore.properties` — both git-ignored.
Lose these and you can't publish updates to existing installs.
