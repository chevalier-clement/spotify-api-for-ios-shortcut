# Spotify API — iOS Shortcut Bridge

A static GitHub Pages site that handles Spotify interactions from iOS Shortcuts.  
No server, no client secret — all logic runs in the browser via JavaScript.

---

## Project structure

```
/
├── auth/               ← OAuth 2.0 PKCE flow (get an access token)
├── sync/               ← Sync grouped playlists into Mixed playlists
├── api/
│   └── spotify/
│       ├── config.js   ← Spotify API URLs
│       └── client.js   ← HTTP helpers (get, post, del, paginate)
├── utils/
│   └── crypto.js       ← PKCE helpers (random string, SHA-256, base64url)
└── index.html          ← Redirects to /auth/
```

---

## Routes

### `/auth/` — Get an access token (OAuth 2.0 PKCE)

Handles the full PKCE flow and passes the resulting access token back to an iOS Shortcut.

```
https://chevalier-clement.github.io/spotify-api-for-ios-shortcut/auth/?client_id=<CLIENT_ID>&shortcut_name=<SHORTCUT_NAME>&scope=<SCOPE>
```

| Parameter | Required | Description |
|---|---|---|
| `client_id` | Yes | Your Spotify app Client ID |
| `shortcut_name` | Yes | Exact name of the Shortcut to call back with the token |
| `scope` | No | Space-separated Spotify scopes — displayed to the user before redirecting |

**Flow:**
1. The page displays the requested permissions and asks for confirmation
2. Redirects to Spotify's authorization screen
3. Exchanges the authorization code for a token (PKCE — no client secret needed)
4. Calls `shortcuts://run-shortcut?name=<shortcut_name>&input=text&text=<access_token>`

---

### `/sync/` — Sync grouped playlists into Mixed playlists

Reads all your marked playlists, groups them by prefix, and creates or updates a `<Prefix> - Mixed` playlist for each group.

```
https://chevalier-clement.github.io/spotify-api-for-ios-shortcut/sync/?token=<ACCESS_TOKEN>&shortcut_name=<SHORTCUT_NAME>
```

| Parameter | Required | Description |
|---|---|---|
| `token` | Yes | A valid Spotify access token (obtained from `/auth/`) |
| `shortcut_name` | No | Shortcut to call back with a sync summary on completion |

#### Why a naming convention?

Spotify's folder structure (the folders visible in the desktop and mobile apps) is a **client-side only feature** — the Spotify Web API has no concept of folders. There is no endpoint to list folders, get playlists within a folder, or assign a playlist to a folder.

The naming convention below is the workaround: the playlist name encodes the folder path, allowing the sync to group playlists without needing folder access.

#### Naming convention

Playlists must follow this pattern to be picked up by the sync:

```
<Prefix> - <Name> @
```

- The `@` marker at the end **opts the playlist in** — playlists without it are ignored entirely, letting you exclude specific playlists or entire folder groups
- Everything before the last ` - ` is the **group key**: playlists sharing the same group key are merged into one Mixed playlist
- The prefix should reflect the **leaf folder** of your Spotify folder hierarchy (not parent folders — one Mixed playlist is created per leaf group only)
- The generated Mixed playlists never carry the `@` marker and are never included in themselves

**Example** — for a hierarchy `Rap > France`:

| Playlist name | Group key | Outcome |
|---|---|---|
| `Rap France - 2010's @` | `Rap France` | merged into `Rap France - Mixed` |
| `Rap France - 2020's @` | `Rap France` | merged into `Rap France - Mixed` |
| `Rap France - Old School` | *(no marker — ignored)* | — |
| `Rap US - Old School @` | `Rap US` | merged into `Rap US - Mixed` |

#### First run

On first sync, `Rap France - Mixed` is created at the **root of your library** — the Spotify API cannot place playlists into folders programmatically.

Open the Spotify desktop client, drag the playlist into the folder of your choice. Subsequent syncs update its tracks regardless of where it sits in your library.

#### Sync behaviour

For each group, the sync:
- **Adds** tracks present in source playlists but missing from Mixed
- **Removes** tracks no longer present in any source playlist of the group
- **Deduplicates** — each track appears at most once in Mixed
- **Skips** playlists you do not own (followed playlists are never touched)
- **Ignores** podcast episodes — only music tracks are included

---

## Required Spotify scopes

| Route | Scopes |
|---|---|
| `/auth/` | *(any scope you need — they are listed to the user before the redirect)* |
| `/sync/` | `playlist-read-private playlist-modify-private` |

Pass scopes as the `scope` parameter when calling `/auth/`:

```
scope=playlist-read-private%20playlist-modify-private
```

---

## Setup

### 1. Register your Spotify application

1. Go to the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
2. Create an app (or use an existing one)
3. Under **Edit Settings → Redirect URIs**, add:
   ```
   https://chevalier-clement.github.io/spotify-api-for-ios-shortcut/auth/
   ```
4. Copy the **Client ID**

### 2. Build your iOS Shortcuts

Keep auth and sync as **two separate Shortcuts** — tokens are valid for 1 hour, so you can run the sync repeatedly without re-authenticating each time.

**Shortcut 1 — Authenticate**

1. Open URL in Safari:
   ```
   https://…/auth/?client_id=YOUR_CLIENT_ID&shortcut_name=SpotifyAuth&scope=playlist-read-private%20playlist-modify-private
   ```
2. The Shortcut receives the access token as text input
3. Store it (e.g. in a global variable or a text file in iCloud) for use by the sync Shortcut

**Shortcut 2 — Sync**

1. Retrieve the stored token
2. Open URL in Safari:
   ```
   https://…/sync/?token=TOKEN&shortcut_name=SpotifySync
   ```
3. The Shortcut receives a summary: `Sync complete: 0 created, 3 updated.`

---

## Security

- **No client secret** — PKCE is designed for public clients; the Client ID is inherently public
- **Token never stored** — passed directly from the browser to your Shortcut via the `shortcuts://` URL scheme and never written to disk
- **Strict Content-Security-Policy** — each page can only connect to the specific Spotify domains it needs (`accounts.spotify.com` for auth, `api.spotify.com` for sync)
- **CSRF protection** — the auth flow validates a `state` parameter to prevent cross-site request forgery
- **Scope transparency** — requested scopes are always displayed to the user before any redirect to Spotify
