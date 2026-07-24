import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = (process.env.EXPO_PUBLIC_SUPABASE_URL || '').trim();
const keyRaw = (process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '').trim();
const key = keyRaw.startsWith('yJhbGciOiJIUzI1NiIsInR5cCI6') ? `e${keyRaw}` : keyRaw;

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  if (!url || !key) return null;
  if (!client) {
    client = createClient(url, key, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      },
    });
  }
  return client;
}

export function isConfigured(): boolean {
  return Boolean(url && key);
}
