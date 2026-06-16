// get/post/del follow the same Bearer-token pattern and could be extracted to
// utils/http.js if another OAuth API is added later.
import { SPOTIFY_API_BASE } from './config.js';

export async function get(token, url) {
  const fullUrl = url.startsWith('http') ? url : `${SPOTIFY_API_BASE}${url}`;
  const res = await fetch(fullUrl, {
    headers: { 'Authorization': `Bearer ${token}` },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`${res.status}: ${err.error?.message || res.statusText}`);
  }
  return res.json();
}

export async function post(token, path, body) {
  const res = await fetch(`${SPOTIFY_API_BASE}${path}`, {
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

export async function del(token, path, body) {
  const res = await fetch(`${SPOTIFY_API_BASE}${path}`, {
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

// Spotify pagination contract: { items: [], next: "url" | null }
export async function paginate(token, initialUrl) {
  const items = [];
  let next = initialUrl;
  while (next) {
    const data = await get(token, next);
    items.push(...(data.items || []).filter(Boolean));
    next = data.next || null;
  }
  return items;
}
