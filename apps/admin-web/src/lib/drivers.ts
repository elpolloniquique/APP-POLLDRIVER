import { getSupabase } from './supabase';

export interface BranchOption {
  id: string;
  name: string;
  city: string;
  slug: string;
  polldriverEnabled?: boolean;
}

export interface DriverApplicationRow {
  id: string;
  status: string;
  preferredBranchId: string | null;
  notes: string;
  reviewerNote: string;
  reviewedAt: string | null;
  createdAt: string;
  payload: Record<string, unknown>;
  driver: {
    id: string;
    adminStatus: string;
    operationalStatus: string;
    rut: string;
    maxOrders: number;
    profileId: string;
    fullName: string;
    email: string;
    phone: string;
  };
}

export async function listBranches(): Promise<BranchOption[]> {
  const sb = getSupabase();
  if (!sb) return [];
  const { data, error } = await sb
    .from('branches')
    .select('id, name, city, slug, polldriver_enabled, is_active')
    .eq('is_active', true)
    .order('display_order', { ascending: true });
  if (error) throw error;
  return (data || []).map((b) => ({
    id: b.id,
    name: b.name,
    city: b.city || '',
    slug: b.slug,
    polldriverEnabled: b.polldriver_enabled === true,
  }));
}

export async function listDriverApplications(statusFilter?: string): Promise<DriverApplicationRow[]> {
  const sb = getSupabase();
  if (!sb) return [];

  let q = sb
    .from('pd_driver_applications')
    .select(`
      id, status, preferred_branch_id, notes, reviewer_note, reviewed_at, created_at, payload,
      pd_driver_profiles (
        id, admin_status, operational_status, rut, max_orders, profile_id,
        profiles ( id, full_name, email, phone )
      )
    `)
    .order('created_at', { ascending: false })
    .limit(100);

  if (statusFilter && statusFilter !== 'all') {
    q = q.eq('status', statusFilter);
  }

  const { data, error } = await q;
  if (error) {
    if (/does not exist|schema cache/i.test(error.message)) return [];
    throw error;
  }

  return (data || []).map((row) => {
    const dp = row.pd_driver_profiles as unknown as Record<string, unknown> | Record<string, unknown>[] | null;
    const driver = Array.isArray(dp) ? dp[0] : dp;
    const profRaw = driver?.profiles as unknown as Record<string, unknown> | Record<string, unknown>[] | null;
    const prof = Array.isArray(profRaw) ? profRaw[0] : profRaw;

    return {
      id: String(row.id),
      status: String(row.status),
      preferredBranchId: row.preferred_branch_id ? String(row.preferred_branch_id) : null,
      notes: String(row.notes || ''),
      reviewerNote: String(row.reviewer_note || ''),
      reviewedAt: row.reviewed_at ? String(row.reviewed_at) : null,
      createdAt: String(row.created_at),
      payload: (row.payload as Record<string, unknown>) || {},
      driver: {
        id: String(driver?.id || ''),
        adminStatus: String(driver?.admin_status || ''),
        operationalStatus: String(driver?.operational_status || ''),
        rut: String(driver?.rut || ''),
        maxOrders: Number(driver?.max_orders) || 2,
        profileId: String(driver?.profile_id || ''),
        fullName: String(prof?.full_name || ''),
        email: String(prof?.email || ''),
        phone: String(prof?.phone || ''),
      },
    };
  });
}

export async function listApprovedDrivers() {
  const sb = getSupabase();
  if (!sb) return [];
  const { data, error } = await sb
    .from('pd_driver_profiles')
    .select(`
      id, admin_status, operational_status, rut, max_orders, preferred_branch_id, approved_at,
      profiles ( full_name, email, phone, role )
    `)
    .eq('admin_status', 'approved')
    .order('approved_at', { ascending: false });
  if (error) {
    if (/does not exist|schema cache/i.test(error.message)) return [];
    throw error;
  }
  return data || [];
}

export async function reviewApplication(
  applicationId: string,
  decision: 'approved' | 'rejected' | 'needs_correction',
  note: string,
  branchId: string | null,
  maxOrders = 2,
) {
  const sb = getSupabase();
  if (!sb) throw new Error('Supabase no configurado');
  const { data, error } = await sb.rpc('pd_review_driver_application', {
    p_application_id: applicationId,
    p_decision: decision,
    p_reviewer_note: note,
    p_assign_branch_id: branchId,
    p_max_orders: maxOrders,
  });
  if (error) throw new Error(error.message);
  return data;
}

export async function setDriverAdminStatus(driverProfileId: string, status: string) {
  const sb = getSupabase();
  if (!sb) throw new Error('Supabase no configurado');
  const { error } = await sb.rpc('pd_set_driver_admin_status', {
    p_driver_profile_id: driverProfileId,
    p_status: status,
  });
  if (error) throw new Error(error.message);
}

export interface SubmitApplicationInput {
  preferredBranchId: string;
  rut: string;
  phone: string;
  fullName: string;
  vehicleType: string;
  vehicleBrand: string;
  vehicleModel: string;
  vehiclePlate: string;
  vehicleColor: string;
  notes: string;
  emergencyName: string;
  emergencyPhone: string;
}

export async function submitDriverApplication(input: SubmitApplicationInput) {
  const sb = getSupabase();
  if (!sb) throw new Error('Supabase no configurado');
  const { data, error } = await sb.rpc('pd_submit_driver_application', {
    p_preferred_branch_id: input.preferredBranchId,
    p_rut: input.rut,
    p_phone: input.phone,
    p_full_name: input.fullName,
    p_vehicle_type: input.vehicleType,
    p_vehicle_brand: input.vehicleBrand,
    p_vehicle_model: input.vehicleModel,
    p_vehicle_plate: input.vehiclePlate,
    p_vehicle_color: input.vehicleColor,
    p_notes: input.notes,
    p_emergency_name: input.emergencyName,
    p_emergency_phone: input.emergencyPhone,
  });
  if (error) throw new Error(error.message);
  return data as string;
}

/** Registro + postulación (para repartidor nuevo) */
export async function registerAndApply(
  email: string,
  password: string,
  input: SubmitApplicationInput,
) {
  const sb = getSupabase();
  if (!sb) throw new Error('Supabase no configurado');

  const { data: sign, error: signErr } = await sb.auth.signUp({
    email: email.trim(),
    password,
    options: {
      data: {
        full_name: input.fullName,
        phone: input.phone,
        // queda como cliente hasta aprobación; approve pone role=delivery
      },
    },
  });
  if (signErr) throw new Error(signErr.message);
  if (!sign.user) throw new Error('No se pudo crear la cuenta');

  if (!sign.session) {
    const { error: inErr } = await sb.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (inErr) {
      throw new Error(
        'Cuenta creada, pero falta confirmar el correo o iniciar sesión. Usa “Ya tengo cuenta” tras confirmar.',
      );
    }
  }

  // Esperar a que el trigger cree profiles
  await new Promise((r) => setTimeout(r, 700));

  const appId = await submitDriverApplication(input);
  return { userId: sign.user.id, applicationId: appId };
}
