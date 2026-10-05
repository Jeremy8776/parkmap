# Android APK releases

The app checks published GitHub Releases on launch. It offers an update only for a newer tag of the form `vMAJOR.MINOR.PATCH` with a `parkmap-vMAJOR.MINOR.PATCH.apk` asset and a SHA-256 digest. Android still asks the user to approve installation.

## Prepare a release

1. Update the app version in `package.json` and the fallback `versionName` / `versionCode` in `android/app/build.gradle`. The tag's numeric version overrides Gradle defaults in CI; use `python scripts/release_version.py v0.3.0` to check the code. Never reuse or lower a version code.
2. Rebuild `docs/` with `python build.py`. Run `npm test`, then `npx cap sync android` and the Android unit tests.
3. After the intended code is on GitHub, push a new version tag. `.github/workflows/android.yml` builds a release APK with the stable key, attaches it to a pre-release and makes it available to the updater. A tag does not deploy the web app to `prod`.

**First signed release:** Existing v0.2.0 debug APKs use a different certificate. They cannot update in place and must be uninstalled once before installing the first signed release. Do not remove an installed build until the new APK is available.

## Signing key

CI needs repository Actions secrets `PARKMAP_KEYSTORE_B64` (base64-encoded PKCS12 keystore) and `PARKMAP_SIGNING_PASSWORD`. The alias is `parkmap`. Gradle fails closed when either is absent. Never commit a keystore or password. The release certificate SHA-256 fingerprint is `4fef00f85b48a0efb9fe4e26d09274ee9dbc3e502264d7efb24d69fe22564d07`; verify this fingerprint on every signed APK.

The local backup is in `~/ParkMap-signing/`: `parkmap-release.p12` and `signing-password.dpapi`. The password file is encrypted for the Windows account that created it and is **not portable to another PC**. Back up both the keystore and a separately recoverable password in your own secure storage before migrating or wiping Windows. Losing this signing key means future APKs cannot update existing installations.
