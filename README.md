# Spotify Auth — iOS Shortcut Bridge

A static GitHub Pages page that handles the **Spotify OAuth 2.0 PKCE flow** and passes the resulting access token back to an iOS Shortcut.

No server, no secret — all parameters are supplied by the caller at runtime.

---

## How it works

1. You open the page with your `client_id`, `shortcut_name`, and optionally `scope` as query parameters.
2. The page displays the list of requested Spotify permissions and asks you to confirm.
3. After confirmation, the page redirects you to Spotify's authorization screen.
4. After you approve, Spotify redirects back to this page with a `code`.
5. The page exchanges that code for an access token (PKCE — no client secret needed).
6. The page opens `shortcuts://run-shortcut?name=<shortcut_name>&input=text&text=<access_token>`, passing the token to your Shortcut.

---

## Usage

```
GET https://chevalier-clement.github.io/spotify-auth-ios-shortcut/?client_id=<CLIENT_ID>&shortcut_name=<SHORTCUT_NAME>
```

### Required parameters

| Parameter       | Type   | Description                                               |
|----------------|--------|-----------------------------------------------------------|
| `client_id`     | string | Your Spotify application Client ID                        |
| `shortcut_name` | string | The exact name of the iOS Shortcut to call with the token |

### Optional parameters

| Parameter | Type   | Default                                                                                     | Description                              |
|-----------|--------|---------------------------------------------------------------------------------------------|------------------------------------------|
| `scope`   | string | `playlist-read-private playlist-read-collaborative playlist-modify-private playlist-modify-public user-library-read user-library-modify` | Space-separated list of [Spotify scopes](https://developer.spotify.com/documentation/web-api/concepts/scopes). The page displays the full list to the user before redirecting. |

---

## Example

```
https://johndoe.github.io/spotify-auth-ios-shortcut/?client_id=908dc84ecc934f38b698a23f2dda73c8&shortcut_name=SpotifyCallback
```

With a custom scope:

```
https://johndoe.github.io/spotify-auth-ios-shortcut/?client_id=908dc84ecc934f38b698a23f2dda73c8&shortcut_name=SpotifyCallback&scope=user-read-playback-state%20user-modify-playback-state
```

---

## Setup

### 1. Deploy to GitHub Pages

Fork or clone this repo, then enable GitHub Pages on the `main` branch from **Settings → Pages**.

Your page URL will be `https://<username>.github.io/<repo>/`.

### 2. Register your Spotify application

1. Go to the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard).
2. Create an application (or use an existing one).
3. Under **Edit Settings → Redirect URIs**, add your GitHub Pages URL exactly as it appears, e.g.:
   ```
   https://johndoe.github.io/spotify-auth-ios-shortcut/
   ```
4. Copy the **Client ID** — this is the value you pass as `client_id`.

> No Client Secret is required. This page uses the PKCE flow, which is designed for public clients.

### 3. Configure your iOS Shortcut

Create a Shortcut named exactly as the value you pass in `shortcut_name`. Its input will be the raw Spotify access token as plain text.

---

## Security note

The `client_id` is inherently public in a PKCE flow — it appears in the Spotify authorization URL in the browser. There is no `client_secret` involved. What stays private is the short-lived access token, which is passed directly to your Shortcut and never stored.

Because `scope` is a caller-supplied parameter, anyone can construct a URL requesting arbitrary Spotify permissions. The confirmation screen is your safeguard: always review the listed scopes before clicking **Authorize with Spotify**. Spotify also displays the same list on its own consent page.
