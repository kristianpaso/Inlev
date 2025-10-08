// netlify/functions/plock-push.js
import { getStore } from '@netlify/blobs';

export default async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Max-Age': '86400',
      },
    });
  }
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });

  try {
    const store = getStore('plock');
    const body = await req.json();
    await store.set('state', JSON.stringify(body), { contentType: 'application/json' });
    return new Response('ok', {
      headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' },
    });
  } catch (e) {
    return new Response(`error: ${e.message}`, { status: 500, headers: { 'Access-Control-Allow-Origin': '*' } });
  }
};

export const config = { path: '/plock/push' };
