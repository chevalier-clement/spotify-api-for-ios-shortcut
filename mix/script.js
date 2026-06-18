import { get, post, del, paginate } from '../api/spotify/client.js';

const MARKER = ' @';

const statusEl = document.getElementById('status');
const logEl = document.getElementById('log');

function setStatus(msg) { statusEl.textContent = msg; }
function log(msg) { logEl.textContent += msg + '\n'; }

async function getPlaylistTracks(token, playlistId) {
  const uris = [];
  let next = `/playlists/${playlistId}/tracks?limit=100`;
  while (next) {
    const data = await get(token, next);
    for (const item of data.items || []) {
      const uri = item?.track?.uri;
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
      setStatus(`Mixing: ${mixedName}…`);
      log(`\n▶ ${mixedName}`);

      const targetSet = new Set();
      for (const p of sources) {
        log(`  • "${p.name}"`);
        try {
          const uris = await getPlaylistTracks(token, p.id);
          uris.forEach(uri => targetSet.add(uri));
        } catch (e) {
          log(`    ✗ Skipped (${e.message}) — playlist id: ${p.id}`);
        }
      }
      log(`  → ${targetSet.size} unique track(s) in group`);

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

      const currentUris = isNew ? [] : await getPlaylistTracks(token, mixedPlaylist.id);
      const currentSet = new Set(currentUris);

      const toAdd = [...targetSet].filter(uri => !currentSet.has(uri));
      const toRemove = currentUris.filter(uri => !targetSet.has(uri));

      log(`  +${toAdd.length} to add, -${toRemove.length} to remove`);

      for (let i = 0; i < toRemove.length; i += 100) {
        const batch = toRemove.slice(i, i + 100).map(uri => ({ uri }));
        await del(token, `/playlists/${mixedPlaylist.id}/tracks`, { tracks: batch });
      }

      for (let i = 0; i < toAdd.length; i += 100) {
        const batch = toAdd.slice(i, i + 100);
        await post(token, `/playlists/${mixedPlaylist.id}/tracks`, { uris: batch });
      }
    }

    const summary = `Mix complete: ${created} created, ${updated} updated.`;
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
