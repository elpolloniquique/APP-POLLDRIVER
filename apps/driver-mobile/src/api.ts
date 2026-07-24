import { getSupabase } from './supabase';
import * as Location from 'expo-location';
import { sendLocationNow } from './locationTracking';

export async function signIn(email: string, password: string) {
  const sb = getSupabase();
  if (!sb) throw new Error('Configura EXPO_PUBLIC_SUPABASE_URL / ANON_KEY');
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw new Error(error.message);
  return data;
}

export async function signOut() {
  const sb = getSupabase();
  if (sb) await sb.auth.signOut();
}

export async function listPendingOffers() {
  const sb = getSupabase();
  if (!sb) return [];
  const { data, error } = await sb
    .from('pd_delivery_offers')
    .select(`
      id, status, expires_at,
      pd_delivery_jobs ( id, ticket_code, customer_name, customer_address, customer_phone, order_total, status )
    `)
    .eq('status', 'pending')
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data || [];
}

export async function listActiveAssignments() {
  const sb = getSupabase();
  if (!sb) return [];
  const { data, error } = await sb
    .from('pd_delivery_assignments')
    .select(`
      id, assigned_at, picked_up_at, status,
      pd_delivery_jobs ( id, ticket_code, customer_name, customer_address, customer_phone, order_total, status )
    `)
    .eq('status', 'active')
    .order('assigned_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data || [];
}

export async function acceptOffer(offerId: string) {
  const sb = getSupabase();
  if (!sb) throw new Error('Sin Supabase');
  const { data, error } = await sb.rpc('pd_accept_delivery_offer', { p_offer_id: offerId });
  if (error) throw new Error(error.message);
  return data;
}

export async function rejectOffer(offerId: string) {
  const sb = getSupabase();
  if (!sb) throw new Error('Sin Supabase');
  const { error } = await sb.rpc('pd_reject_delivery_offer', { p_offer_id: offerId });
  if (error) throw new Error(error.message);
}

export async function confirmPickup(assignmentId: string, lat?: number, lng?: number) {
  const sb = getSupabase();
  if (!sb) throw new Error('Sin Supabase');
  const { data, error } = await sb.rpc('pd_confirm_pickup', {
    p_assignment_id: assignmentId,
    p_lat: lat ?? null,
    p_lng: lng ?? null,
  });
  if (error) throw new Error(error.message);
  return data;
}

export async function confirmDelivery(assignmentId: string, lat?: number, lng?: number) {
  const sb = getSupabase();
  if (!sb) throw new Error('Sin Supabase');
  const { data, error } = await sb.rpc('pd_confirm_delivery', {
    p_assignment_id: assignmentId,
    p_lat: lat ?? null,
    p_lng: lng ?? null,
  });
  if (error) throw new Error(error.message);
  return data;
}

export async function setAvailable(on: boolean) {
  const sb = getSupabase();
  if (!sb) throw new Error('Sin Supabase');
  const { error } = await sb.rpc('pd_set_my_operational_status', {
    p_status: on ? 'available' : 'offline',
  });
  if (error) throw new Error(error.message);
}

export async function upsertLocation(assignmentId?: string | null) {
  return sendLocationNow({ assignmentId, appState: 'foreground' });
}

export async function currentCoords(): Promise<{ lat: number; lng: number } | null> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return null;
    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    return { lat: pos.coords.latitude, lng: pos.coords.longitude };
  } catch {
    return null;
  }
}
