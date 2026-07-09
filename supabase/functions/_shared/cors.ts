/**
 * Shared CORS helpers for Supabase Edge Functions.
 *
 * Edge Functions are invoked from the browser via supabase.functions.invoke(),
 * which sends an OPTIONS preflight before the real request. We return permissive
 * CORS headers so the frontend (hosted on GitHub Pages) can call the function
 * regardless of origin.
 *
 * Usage:
 *   import { corsHeaders, handleCors } from '../_shared/cors.ts';
 *
 *   Deno.serve(async (req) => {
 *     const cors = handleCors(req);
 *     if (cors) return cors;
 *     // ... handle real request, include corsHeaders in the Response.
 *   });
 */

export const corsHeaders: Record<string, string> = {
  // Permissive: the API key never leaves the server, and the JWT in the
  // Authorization header is verified per-function. GitHub Pages demos hit
  // these functions from arbitrary subdomains, so * is the pragmatic choice.
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

/**
 * If `req` is an OPTIONS preflight, return a Response that satisfies the
 * preflight and signals the caller can proceed. Otherwise return null so the
 * caller can continue normal handling.
 */
export function handleCors(req: Request): Response | null {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  return null;
}