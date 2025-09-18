
// Minimal stub for /netlify/functions/store.mjs
// Purpose: stop Netlify build from failing due to syntax error.
// Returns 501 so callers know the function is disabled.
export async function handler(event, context) {
  return new Response(
    JSON.stringify({ ok:false, error:"store function disabled in Netlify build" }),
    { status: 501, headers: { "content-type": "application/json" } }
  );
}
