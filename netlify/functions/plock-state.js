// netlify/functions/plock-state.js
import { getStore } from '@netlify/blobs';

export default async () => {
  try {
    const store = getStore('plock');
    const data = await store.get('state', { type: 'json' });
    return new Response(JSON.stringify(data || {}), {
      headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
    });
  }
};

export const config = { path: '/plock/state' };
