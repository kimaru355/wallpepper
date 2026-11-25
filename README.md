# Wallpepper

Wallpaper browser, manager and sync for **Android** (React Native / Expo) and **Windows, macOS, Linux** (Electron).

```
packages/core   shared TypeScript logic: sources, groups, sync, playlist rotation  (used by both apps)
apps/desktop    Electron + React + Vite
apps/mobile     React Native (Expo, dev-client) + a small Kotlin module that sets the Android wallpaper
```

## Features

| Request | How it works |
|---|---|
| Main categories anime / movies & series / linux, plus others (tech, nature, space, games, abstract, minimal) | Category chips in Browse. Sources declare which categories they serve; results from all matching sources are interleaved. |
| 6 built-in sources | **Konachan** and **Yande.re** (anime, safe-rated only) · **TVmaze** (series posters & backdrops, no key) and **Wallhaven** (movies/series + tech/nature/space/games/…) · **Linux Walls** (GitHub repo `dharmx/walls`) · **Picsum** (photography). |
| Add your own sources | Sources → Add. Types: Moebooru board, Wallhaven, any **GitHub image repo**, or a **custom JSON API** (URL template + paths to the image/thumb/id fields). Built-ins can be switched off but never removed. |
| Set home/desktop **and** lock screen | Preview → Home / Lock / Both (Android), Desktop / Lock screen (Windows, Linux). |
| Optional "folder mode" | Per device: instead of setting the wallpaper, the app only downloads into a folder the OS reads (Windows slideshow folder, GNOME/KDE, Android gallery album). In folder mode the app also keeps that folder filled with the active group. |
| Accounts, devices, sync | Hosted backend (Express + PostgreSQL). The account stores image links (not files), groups and custom sources. Everything saved before signing in is uploaded on first login. |
| Groups, sub-groups, playlists | Default **All** group (downloading or saving adds to it). Create groups and **sub-groups** (All › Anime › Naruto). A group includes its sub-groups, so "Anime" shows every anime wallpaper and "Naruto" only Naruto; set either as a device's active group. Automatic rotation (interval, shuffle/in-order). |
| First run | 4 steps: 3 info slides → account (email, **username**, password; required) → who changes the wallpaper (**Wallpepper** recommended, or the OS) → fit (fill / fit / stretch / center, plus tile / span on desktop). |
| Home | **Recommended**: author picks by title (Naruto, Demon Slayer, Marvel…) with covers, loaded from the server; open one and *Save as group* to get Anime › Naruto. **Community**: collections other users shared, with search (name, group, sub-group, creator), category chips and filters (creator, sort, size, has sub-groups). |
| Phone vs PC images | Phones are portrait, PCs landscape. When you add a wallpaper to a group the app measures it and, if it is not square, asks how it should look in the **other** orientation: pick a similar image (Wallhaven *like*, keyword search on the boards, TVmaze poster/background pair, Picsum resized), **crop it yourself**, or use a **blurred background**. The choice is a synced record, so each device uses what suits its screen; *Check compatibility* in the viewer shows the status and lets you change it. Unset mismatches use the blurred background. Choices also travel with shared community collections. |
| Recommendations | Home › Recommended is served by the backend (`/recommendations`) and curated on its admin page (`/admin`: edit, discover, import JSON, export). |
| Offline / caching | Browse pages, Home covers and community lists are remembered and shown instantly (then refreshed); thumbnails are cached on disk (desktop 500 MB, phone 300 MB). |
| Folder mode layout | Desktop: real folders `Wallpepper/Anime/Naruto/`. Android: one album per group (`Wallpepper`, `Wallpepper - Anime`, `Wallpepper - Anime - Naruto`) because albums cannot be nested. Point the OS slideshow at the folder/album you want. |
| Per-device sync settings | Account & Devices lists every device with its own settings: active group, mode, target, rotation, sync on/off. You can edit **any** device from any device (e.g. phone → `anime`, PC → `All`); the change arrives on its next sync. |

Extras: tray icon with "Next wallpaper", launch at login, background rotation on Android (WorkManager via `expo-background-task`), infinite-scroll browsing, portrait wallpapers on phones / landscape on PCs, API keys kept local (never synced).

## Run it

Requirements: Node 24+ (tested on 26), npm 11.

```powershell
npm install                  # root: core + desktop
```

npm 11 blocks dependency install scripts by default. If Electron complains it "failed to install correctly", run `node node_modules/electron/install.js` (or approve the scripts with `npm install-scripts approve electron esbuild`).

**1. Sync backend**

Both apps use the hosted backend **https://wallpepper.pcstack.top** by default (Express + PostgreSQL, repo `wallpepper-backend`, deployed on the VPS) — nothing to run. The apps no longer show a server field; to use another deployment change `DEFAULT_SERVER_URL` in `packages/core/src/types.ts`.

**2. Desktop**

```powershell
npm run desktop              # dev
npm run dist:win -w apps/desktop    # or dist:mac / dist:linux (build on that OS)
```

**3. Android** (needs JDK 17 + Android SDK, or use EAS Build)

```powershell
cd apps/mobile
npm install
npx expo run:android         # builds a dev client (the app needs the local native module, so Expo Go will not work)
```

**Android Studio / signed release build**

```powershell
cd apps/mobile
npm install
npx expo prebuild --platform android      # generates apps/mobile/android (gitignored) with the signing config applied
```

Open `apps/mobile/android` in Android Studio → *Build ▸ Generate Signed App Bundle / APK* is **not** needed: `release` builds are already signed with `apps/mobile/signing/wallpepper-release.keystore` (alias `wallpepper`, passwords in `signing/keystore.properties`). Use the Gradle task `app:assembleRelease` (APK) or `app:bundleRelease` (Play Store AAB), or from a terminal `cd android; ./gradlew assembleRelease`. Debug builds keep the standard debug key.

The signing config is added by `plugins/withReleaseSigning.js`, so it is re-applied on every `expo prebuild --clean`. **Back up the `signing/` folder somewhere safe (password manager / encrypted drive) and never commit it** — it is gitignored. If you lose the key you cannot update the app for existing users (Play App Signing can reduce that risk). Without `signing/keystore.properties` the release build falls back to the debug key and prints a warning.

Desktop installers are not code-signed (that needs a purchased Windows certificate / Apple Developer ID); Windows SmartScreen and macOS Gatekeeper will warn on first run.

Android blocks plain `http://` servers, so a self-hosted backend needs HTTPS.


## Releasing (download site)

The site at **https://wallpepper.pcstack.top** (`site/`) lists the latest build of each app; the API lives on the same domain (`/auth /sync /devices /me /health` → backend, everything else → site).

```powershell
# 1. build
cd apps/mobile/android; ./gradlew assembleRelease          # or Android Studio → app-release.apk (signed with the release key)
cd apps/desktop; npx electron-vite build; npx electron-builder --win   # Windows installer (dist/)
# Linux AppImage + deb must be built on Linux (WSL works): electron-builder --linux
# 2. put the files in releases/<version>/ named: Wallpepper-<v>.apk, Wallpepper-Setup-<v>.exe, Wallpepper-<v>-linux-x86_64.AppImage, Wallpepper-<v>-linux-amd64.deb
# 3. publish (uploads to the VPS, verifies SHA-256, then switches latest.json)
bash site/scripts/publish.sh <version>
# site page changes: just push to main (the VPS dashboard project "wallpepper-site" rebuilds from site/)
# /downloads/ server (rarely changes): bash site/scripts/deploy-downloads.sh
```

Bump `version` in `apps/desktop/package.json` and `apps/mobile/app.json` (and `versionCode` for Android updates) before building. Old versions stay on the server under `/downloads/<version>/`. There is no macOS build yet (it needs a Mac).

**Self-update.** Both apps read `/downloads/latest.json` (the manifest `publish.sh` switches last) and offer a release whose `version` is *higher* than the installed one, so always bump the version for a release. Desktop (packaged builds) checks 15 s after start and every 6 h: Windows downloads the installer (SHA-256 verified) and launches it; the Linux AppImage replaces itself and restarts; a `.deb` opens the download page. Android checks on launch and in Settings, downloads the APK and hands it to the system installer (Android accepts it only if it is signed with the same key, and asks once to allow installs from Wallpepper).

## Tests

```powershell
npm test                     # core: sources, groups, sync between two simulated devices (in-memory fake backend)
npm run typecheck
```

## How sync works

Every synced thing is a record `{kind, id, data, deleted, updatedAt}` (kinds: `wallpaper`, `group`, `membership`, `source`, `deviceSettings`). Devices push their dirty records and pull everything newer than their cursor; conflicts are last-write-wins per record, deletes are tombstones. Group membership is one record per (group, wallpaper) so two devices adding different wallpapers to the same group never overwrite each other. Device settings are records with `id = deviceId`, which is why one device can edit another's.

## Platform notes / limitations

- **Windows lock screen** uses the WinRT `LockScreen.SetImageFileAsync` API through Windows PowerShell; if Windows Spotlight or a slideshow owns the lock screen you may need to pick "Picture" once in Settings → Personalization → Lock screen.
- **macOS** cannot set the lock screen independently (it mirrors the desktop wallpaper), so "Lock only" reports that instead of failing silently.
- **Linux** supports GNOME/Cinnamon/MATE/KDE Plasma (incl. lock screen on GNOME & Plasma)/XFCE, and falls back to `swaymsg`, `feh` or `nitrogen`. Anything else: use folder mode.
- **Android** background switching uses WorkManager: ~15 min minimum and some phone makers throttle swiped-away apps.
- Danbooru and Reddit were evaluated but sit behind bot protection, so they are not built in; a custom JSON/Moebooru source can add similar boards.
- iOS is intentionally out of scope (no public API for setting wallpapers).
