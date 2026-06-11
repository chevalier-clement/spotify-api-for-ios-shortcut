const SCOPES_DEFAULT = 'playlist-read-private playlist-read-collaborative playlist-modify-private playlist-modify-public user-library-read user-library-modify';

const generateRandomString = (length) => {
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const values = crypto.getRandomValues(new Uint8Array(length));
  return values.reduce((acc, x) => acc + possible[x % possible.length], "");
};

const sha256 = async (plain) => {
  const encoder = new TextEncoder();
  const data = encoder.encode(plain);
  return window.crypto.subtle.digest('SHA-256', data);
};

const base64encode = (input) => {
  return btoa(String.fromCharCode(...new Uint8Array(input)))
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
};

(async () => {
  const redirectUri = window.location.origin + window.location.pathname;
  const urlParams = new URLSearchParams(window.location.search);
  const code = urlParams.get('code');
  const error = urlParams.get('error');

  if (error) {
    document.getElementById('status').textContent = 'Error: ' + error;
    return;
  }

  if (!code) {
    const clientId = urlParams.get('client_id');
    const shortcutName = urlParams.get('shortcut_name');
    const scope = urlParams.get('scope') || SCOPES_DEFAULT;

    if (!clientId || !shortcutName) {
      document.getElementById('status').textContent = 'Missing required parameters: client_id and shortcut_name.';
      return;
    }

    scope.split(' ').filter(Boolean).forEach(s => {
      const li = document.createElement('li');
      li.textContent = s;
      document.getElementById('scope-list').appendChild(li);
    });

    document.getElementById('status').hidden = true;
    document.getElementById('auth-prompt').hidden = false;

    document.getElementById('authorize-btn').addEventListener('click', async () => {
      const codeVerifier = generateRandomString(64);
      const codeChallenge = base64encode(await sha256(codeVerifier));
      const state = generateRandomString(32);

      window.localStorage.setItem('code_verifier', codeVerifier);
      window.localStorage.setItem('client_id', clientId);
      window.localStorage.setItem('shortcut_name', shortcutName);
      window.localStorage.setItem('oauth_state', state);

      const authUrl = new URL('https://accounts.spotify.com/authorize');
      authUrl.search = new URLSearchParams({
        response_type: 'code',
        client_id: clientId,
        scope,
        code_challenge_method: 'S256',
        code_challenge: codeChallenge,
        redirect_uri: redirectUri,
        state,
      }).toString();

      window.location.href = authUrl.toString();
    });

  } else {
    const returnedState = urlParams.get('state');
    const expectedState = window.localStorage.getItem('oauth_state');

    window.localStorage.removeItem('oauth_state');

    if (!returnedState || returnedState !== expectedState) {
      document.getElementById('status').textContent = 'Error: state mismatch — possible CSRF attack.';
      return;
    }

    const clientId = window.localStorage.getItem('client_id');
    const shortcutName = window.localStorage.getItem('shortcut_name');
    const codeVerifier = window.localStorage.getItem('code_verifier');

    window.localStorage.removeItem('code_verifier');
    window.localStorage.removeItem('client_id');
    window.localStorage.removeItem('shortcut_name');

    let token;
    try {
      const response = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          client_id: clientId,
          code,
          redirect_uri: redirectUri,
          code_verifier: codeVerifier,
        }),
      });
      token = await response.json();
    } catch {
      document.getElementById('status').textContent = 'Error: network request failed.';
      return;
    }

    if (token.error) {
      document.getElementById('status').textContent = 'Error: ' + token.error_description;
      return;
    }

    window.location.href = `shortcuts://run-shortcut?name=${encodeURIComponent(shortcutName)}&input=text&text=${encodeURIComponent(token.access_token)}`;
  }
})();
