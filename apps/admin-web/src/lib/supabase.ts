import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonRaw = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** Recupera JWT anon truncado (falta la "e" de eyJ...) por un copy/paste malo en Vercel. */
function normalizeAnonKey(key: string | undefined): string | undefined {
  if (!key) return key;
  const trimmed = key.trim();
  if (trimmed.startsWith('yJhbGciOiJIUzI1NiIsInR5cCI6')) {
    return `e${trimmed}`;
  }
  return trimmed;
}

const anon = normalizeAnonKey(anonRaw);

export function isSupabaseConfigured(): boolean {
  return Boolean(url && anon && !url.includes('TU_PROYECTO'));
}

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  if (!isSupabaseConfigured()) return null;
  if (!client) {
    client = createClient(url!, anon!);
  }
  return client;
}
