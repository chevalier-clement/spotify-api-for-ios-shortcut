const MARKER = ' @';
const API = 'https://api.spotify.com/v1';

const statusEl = document.getElementById('status');
const logEl = document.getElementById('log');

function setStatus(msg) { statusEl.textContent = msg; }
function log(msg) { logEl.textContent += msg + '\n'; }

async function get(token, url) {
  const fullUrl = url.startsWith('http') ? url : `${API}${url}`;
  const res = await fetch(fullUrl, {
    headers: { 'Authorization': `Bearer ${token}` },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`${res.status}: ${err.error?.message || res.statusText}`);
  }
  return res.json();
}

async function post(token, path, body) {
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`${res.status}: ${err.error?.message || res.statusText}`);
  }
  return res.json().catch(() => null);
}

async function del(token, path, body) {
  const res = await fetch(`${API}${path}`, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`${res.status}: ${err.error?.message || res.statusText}`);
  }
}

async function paginate(token, initialUrl) {
  const items = [];
  let next = initialUrl.startsWith('http') ? initialUrl : `${API}${initialUrl}`;
  while (next) {
    const data = await get(token, next);
    items.push(...(data.items || []).filter(Boolean));
    next = data.next || null;
  }
  return items;
}

async function getPlaylistTracks(token, playlistId) {
  const uris = [];
  let next = `${API}/playlists/${playlistId}/items?limit=100`;
  while (next) {
    const data = await get(token, next);
    for (const item of data.items || []) {
      const uri = item?.item?.uri;
      if (uri && uri.startsWith('spotify:track:')) uris.push(uri);
    }
    next = data.next || null;
  }
  return uris;
}

(async () => {
  const params = new URLSearchParams(window.location.search);
  const token = params.get('token');
  const shortcutName = params.get('shortcut_name');

  if (!token) {
    setStatus('Error: missing token parameter.');
    return;
  }

  try {
    setStatus('Fetching user profile…');
    const me = await get(token, '/me');
    const userId = me.id;
    log(`User: ${me.display_name || userId}`);

    setStatus('Loading playlists…');
    const allPlaylists = await paginate(token, '/me/playlists?limit=50');
    log(`${allPlaylists.length} playlists found`);

    // Separate marked playlists from existing Mixed playlists
    const markedPlaylists = [];
    const mixedByName = {};

    for (const p of allPlaylists) {
      if (p.owner?.id !== userId) continue;
      if (p.name.endsWith(' - Mixed')) {
        mixedByName[p.name] = p;
      } else if (p.name.endsWith(MARKER)) {
        markedPlaylists.push(p);
      }
    }
    log(`${markedPlaylists.length} marked playlist(s) (@)`);

    // Group by prefix — everything before the last " - " (without the marker)
    const groups = new Map();
    for (const p of markedPlaylists) {
      const baseName = p.name.slice(0, -MARKER.length);
      const lastDash = baseName.lastIndexOf(' - ');
      if (lastDash === -1) continue;
      const prefix = baseName.slice(0, lastDash);
      if (!groups.has(prefix)) groups.set(prefix, []);
      groups.get(prefix).push(p);
    }

    if (groups.size === 0) {
      const msg = 'No groups found. Make sure your playlists end with @ and follow the "<Prefix> - <Name> @" format.';
      setStatus(msg);
      log(msg);
      return;
    }

    log(`${groups.size} group(s): ${[...groups.keys()].join(', ')}`);

    let created = 0, updated = 0;

    for (const [prefix, sources] of groups) {
      const mixedName = `${prefix} - Mixed`;
      setStatus(`Syncing: ${mixedName}…`);
      log(`\n▶ ${mixedName}`);

      // Collect all unique track URIs from source playlists
      const targetSet = new Set();
      for (const p of sources) {
        log(`  • "${p.name}"`);
        const uris = await getPlaylistTracks(token, p.id);
        uris.forEach(uri => targetSet.add(uri));
      }
      log(`  → ${targetSet.size} unique track(s) in group`);

      // Find or create the Mixed playlist
      let mixedPlaylist = mixedByName[mixedName];
      const isNew = !mixedPlaylist;

      if (isNew) {
        log(`  Creating "${mixedName}"…`);
        mixedPlaylist = await post(token, `/me/playlists`, {
          name: mixedName,
          public: false,
          description: 'Auto-generated. Do not edit manually.',
        });
        created++;
      } else {
        updated++;
      }

      // Compute diff against current Mixed content
      const currentUris = isNew ? [] : await getPlaylistTracks(token, mixedPlaylist.id);
      const currentSet = new Set(currentUris);

      const toAdd = [...targetSet].filter(uri => !currentSet.has(uri));
      const toRemove = currentUris.filter(uri => !targetSet.has(uri));

      log(`  +${toAdd.length} to add, -${toRemove.length} to remove`);

      for (let i = 0; i < toRemove.length; i += 100) {
        const batch = toRemove.slice(i, i + 100).map(uri => ({ uri }));
        await del(token, `/playlists/${mixedPlaylist.id}/items`, { items: batch });
      }

      for (let i = 0; i < toAdd.length; i += 100) {
        const batch = toAdd.slice(i, i + 100);
        await post(token, `/playlists/${mixedPlaylist.id}/items`, { uris: batch });
      }
    }

    const summary = `Sync complete: ${created} created, ${updated} updated.`;
    setStatus(summary);
    log(`\n✓ ${summary}`);

    if (shortcutName) {
      window.location.href = `shortcuts://run-shortcut?name=${encodeURIComponent(shortcutName)}&input=text&text=${encodeURIComponent(summary)}`;
    }

  } catch (err) {
    setStatus(`Error: ${err.message}`);
    log(`✗ ${err.message}`);
  }
})();
