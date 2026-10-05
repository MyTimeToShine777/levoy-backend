# Levoy — Android client

Jetpack Compose app that reads the phone's call log, syncs it to the Levoy API and shows it the way the
reference app does (call history, analytics, contacts, premium plans). Dark UI matched to the 50 reference
screenshots — see [`../PARITY.md`](../PARITY.md) for exactly what is built and what is not.

> Rebuilt from scratch in this pass. The previous XML-layout tree never compiled (stray text in three files,
> missing imports, a broken resources file); it is kept, unbuilt, in `legacy-xml-ui/` for reference and can be deleted.
> `APP_SOURCE.txt` is the original single-file listing and is history only.

## Layout

```
app/src/main/java/com/levoy/app/
  MainActivity.kt, Os.kt          activity + the Android calls the UI needs (dial, share, permissions…)
  AppModel.kt                     one ViewModel: state, navigation stack, all API calls
  LevoyApp.kt                  schedules sync, watches the call log
  data/    Api.kt Models.kt Session.kt        OkHttp client, API shapes, stored settings
  sync/    CallLogReader.kt SyncWorker.kt AutoBackup.kt     read calls + SIM slot, upload only what is new (WorkManager, every 15 min and on change); daily backup file for Android Auto Backup
  calls/   InCall.kt (default-phone-app call screen) QuickCallService.kt (browser → phone) QuickActionReceiver.kt PostCallPrompts.kt WhatsAppCallListener.kt
  ui/      Root.kt Shell.kt Components.kt Charts.kt, theme/{Color,Type,Theme}.kt
  ui/screens/   one file per group of screens — stateless composables, so they can be rendered in tests
  util/    Format.kt (clock, durations, date presets) Strings.kt (6 languages)
app/src/test/                     unit tests + ScreenshotTest (Paparazzi) → snapshots/images/*.png
legacy-xml-ui/                    the retired attempt
```

## Build

Needs JDK 17 and the Android SDK (compileSdk 34). Gradle 8.5 (no wrapper jar is checked in — use a local Gradle 8.5+, or run
`gradle wrapper` once).

```bash
export ANDROID_HOME=/path/to/android-sdk
gradle assembleDebug                          # app/build/outputs/apk/debug/app-debug.apk
gradle testDebugUnitTest                      # logic tests + renders every screen
gradle recordPaparazziDebug                   # refresh app/src/test/snapshots/images
gradle assembleDebug -PapiBaseUrl=http://192.168.1.10:3001/api     # point at your server
```

The server address can also be typed on the sign-in screen ("Server address"). The emulator reaches your computer at
`10.0.2.2`; a real phone needs the computer's LAN address.

### Push notifications and payments

- **Push (Firebase Cloud Messaging):** put the Firebase `google-services.json` for `com.levoy.app` at `app/google-services.json` (git-ignored; a copy
  is kept at `android/google-services.local.json`). With the file the build applies the Google services plugin; without it the app builds and runs but has
  no push. The server must have `FIREBASE_*` set (see the root README, "Integrations"). Android 13+ asks for the notification permission once after sign-in.
- **Subscribe:** after the free trial, opens Stripe Checkout in the browser; Stripe's pay page returns to `levoy://premium`, which the app handles.
  The server address the phone uses must be reachable from the phone's browser too (`PUBLIC_API_URL` on the server if it sits behind a proxy).

## What it needs from the phone

| Permission | Why | Asked |
|---|---|---|
| `READ_CALL_LOG`, `READ_PHONE_STATE` | read calls and which SIM they used | first run (primer screen) |
| `READ_CONTACTS` | saved names instead of bare numbers | first run, optional |
| Display over other apps | Quick Action bubble | Settings → Quick Action |
| Notification access | WhatsApp calls | Settings → WhatsApp Call |
| Phone (`CALL_PHONE`) | place calls for Quick Call / as the default phone app | Linked Quick Call Extension |
| `PROCESS_OUTGOING_CALLS` | number of outgoing calls for the bubble and post-call prompts | Quick Action / Note Popup / Missed Call Reminder |
| Default phone app role | Levoy handles calls itself (**experimental**) | first run, or Settings |

How the sync stays correct: it uploads calls newer than the last one it sent; on a fresh install it first asks the server for
the newest call it already holds, so signing out and in again does not upload everything twice.
