-- PollDriver 010 — Registro y aprobación de repartidores (Fase 3)

-- Asegura pd_driver_profiles para el usuario autenticado (postulación)
CREATE OR REPLACE FUNCTION public.pd_ensure_driver_profile()
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile_id UUID;
  v_driver_id UUID;
BEGIN
  v_profile_id := public.auth_user_profile_id();
  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'Debes iniciar sesión';
  END IF;

  SELECT id INTO v_driver_id
  FROM public.pd_driver_profiles
  WHERE profile_id = v_profile_id;

  IF v_driver_id IS NULL THEN
    INSERT INTO public.pd_driver_profiles (profile_id, admin_status, operational_status)
    VALUES (v_profile_id, 'pending', 'offline')
    RETURNING id INTO v_driver_id;
  END IF;

  RETURN v_driver_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.pd_ensure_driver_profile() TO authenticated;

-- Enviar / actualizar solicitud
CREATE OR REPLACE FUNCTION public.pd_submit_driver_application(
  p_preferred_branch_id UUID,
  p_rut TEXT DEFAULT '',
  p_phone TEXT DEFAULT '',
  p_full_name TEXT DEFAULT '',
  p_vehicle_type TEXT DEFAULT 'motocicleta',
  p_vehicle_brand TEXT DEFAULT '',
  p_vehicle_model TEXT DEFAULT '',
  p_vehicle_plate TEXT DEFAULT '',
  p_vehicle_color TEXT DEFAULT '',
  p_notes TEXT DEFAULT '',
  p_emergency_name TEXT DEFAULT '',
  p_emergency_phone TEXT DEFAULT ''
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile_id UUID;
  v_driver_id UUID;
  v_app_id UUID;
  v_vehicle_id UUID;
BEGIN
  v_profile_id := public.auth_user_profile_id();
  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'Debes iniciar sesión para postular';
  END IF;

  -- Actualizar datos del perfil (nombre/teléfono)
  IF COALESCE(trim(p_full_name), '') <> '' OR COALESCE(trim(p_phone), '') <> '' THEN
    UPDATE public.profiles
    SET
      full_name = CASE WHEN trim(COALESCE(p_full_name, '')) <> '' THEN trim(p_full_name) ELSE full_name END,
      phone = CASE WHEN trim(COALESCE(p_phone, '')) <> '' THEN trim(p_phone) ELSE phone END,
      updated_at = now()
    WHERE id = v_profile_id;
  END IF;

  v_driver_id := public.pd_ensure_driver_profile();

  UPDATE public.pd_driver_profiles
  SET
    rut = COALESCE(NULLIF(trim(p_rut), ''), rut),
    preferred_branch_id = COALESCE(p_preferred_branch_id, preferred_branch_id),
    emergency_contact_name = COALESCE(NULLIF(trim(p_emergency_name), ''), emergency_contact_name),
    emergency_contact_phone = COALESCE(NULLIF(trim(p_emergency_phone), ''), emergency_contact_phone),
    admin_status = CASE WHEN admin_status = 'approved' THEN admin_status ELSE 'pending' END,
    updated_at = now()
  WHERE id = v_driver_id;

  -- Vehículo activo (uno por defecto)
  SELECT id INTO v_vehicle_id
  FROM public.pd_driver_vehicles
  WHERE driver_profile_id = v_driver_id AND is_active = true
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_vehicle_id IS NULL THEN
    INSERT INTO public.pd_driver_vehicles (
      driver_profile_id, vehicle_type, brand, model, plate, color
    ) VALUES (
      v_driver_id,
      COALESCE(NULLIF(p_vehicle_type, ''), 'motocicleta'),
      COALESCE(p_vehicle_brand, ''),
      COALESCE(p_vehicle_model, ''),
      COALESCE(p_vehicle_plate, ''),
      COALESCE(p_vehicle_color, '')
    );
  ELSE
    UPDATE public.pd_driver_vehicles
    SET
      vehicle_type = COALESCE(NULLIF(p_vehicle_type, ''), vehicle_type),
      brand = COALESCE(NULLIF(p_vehicle_brand, ''), brand),
      model = COALESCE(NULLIF(p_vehicle_model, ''), model),
      plate = COALESCE(NULLIF(p_vehicle_plate, ''), plate),
      color = COALESCE(NULLIF(p_vehicle_color, ''), color),
      updated_at = now()
    WHERE id = v_vehicle_id;
  END IF;

  -- Cerrar borradores previos y crear submitted
  UPDATE public.pd_driver_applications
  SET status = 'under_review', updated_at = now()
  WHERE driver_profile_id = v_driver_id
    AND status IN ('draft', 'submitted', 'needs_correction');

  INSERT INTO public.pd_driver_applications (
    driver_profile_id,
    status,
    preferred_branch_id,
    notes,
    payload
  ) VALUES (
    v_driver_id,
    'submitted',
    p_preferred_branch_id,
    COALESCE(p_notes, ''),
    jsonb_build_object(
      'rut', p_rut,
      'vehicle_type', p_vehicle_type,
      'vehicle_brand', p_vehicle_brand,
      'vehicle_model', p_vehicle_model,
      'vehicle_plate', p_vehicle_plate,
      'submitted_at', now()
    )
  )
  RETURNING id INTO v_app_id;

  INSERT INTO public.pd_audit_logs (actor_profile_id, action, entity_type, entity_id, payload)
  VALUES (
    v_profile_id,
    'submit_application',
    'pd_driver_application',
    v_app_id::text,
    jsonb_build_object('branch_id', p_preferred_branch_id)
  );

  RETURN v_app_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.pd_submit_driver_application(
  UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
) TO authenticated;

-- Revisar solicitud (aprobar / rechazar / corrección)
CREATE OR REPLACE FUNCTION public.pd_review_driver_application(
  p_application_id UUID,
  p_decision TEXT, -- approved | rejected | needs_correction
  p_reviewer_note TEXT DEFAULT '',
  p_assign_branch_id UUID DEFAULT NULL,
  p_max_orders INTEGER DEFAULT 2
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_app public.pd_driver_applications%ROWTYPE;
  v_driver public.pd_driver_profiles%ROWTYPE;
  v_role TEXT;
  v_branch UUID;
BEGIN
  v_role := public.auth_user_role();
  IF v_role NOT IN ('super_admin', 'admin_sucursal', 'administrador', 'cajera', 'cajero') THEN
    RAISE EXCEPTION 'No autorizado para revisar solicitudes';
  END IF;

  IF p_decision NOT IN ('approved', 'rejected', 'needs_correction') THEN
    RAISE EXCEPTION 'Decisión inválida';
  END IF;

  SELECT * INTO v_app
  FROM public.pd_driver_applications
  WHERE id = p_application_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Solicitud no encontrada';
  END IF;

  SELECT * INTO v_driver
  FROM public.pd_driver_profiles
  WHERE id = v_app.driver_profile_id
  FOR UPDATE;

  v_branch := COALESCE(p_assign_branch_id, v_app.preferred_branch_id, v_driver.preferred_branch_id);

  -- Admin de sucursal solo su branch
  IF v_role IN ('admin_sucursal', 'administrador', 'cajera', 'cajero') THEN
    IF public.auth_user_branch_id() IS NOT NULL
       AND v_branch IS NOT NULL
       AND v_branch <> public.auth_user_branch_id() THEN
      RAISE EXCEPTION 'No puedes aprobar repartidores de otra sucursal';
    END IF;
    IF v_branch IS NULL THEN
      v_branch := public.auth_user_branch_id();
    END IF;
  END IF;

  UPDATE public.pd_driver_applications
  SET
    status = p_decision,
    reviewer_note = COALESCE(p_reviewer_note, ''),
    reviewed_by = public.auth_user_profile_id(),
    reviewed_at = now(),
    preferred_branch_id = COALESCE(v_branch, preferred_branch_id),
    updated_at = now()
  WHERE id = p_application_id;

  IF p_decision = 'approved' THEN
    UPDATE public.pd_driver_profiles
    SET
      admin_status = 'approved',
      preferred_branch_id = v_branch,
      max_orders = GREATEST(1, LEAST(COALESCE(p_max_orders, 2), 5)),
      approved_at = now(),
      operational_status = 'offline',
      updated_at = now()
    WHERE id = v_driver.id;

    -- Rol delivery en profiles (El Pollón)
    UPDATE public.profiles
    SET
      role = 'delivery',
      branch_id = COALESCE(v_branch, branch_id),
      updated_at = now()
    WHERE id = v_driver.profile_id;

  ELSIF p_decision = 'rejected' THEN
    UPDATE public.pd_driver_profiles
    SET admin_status = 'rejected', updated_at = now()
    WHERE id = v_driver.id;

  ELSIF p_decision = 'needs_correction' THEN
    UPDATE public.pd_driver_profiles
    SET admin_status = 'pending', updated_at = now()
    WHERE id = v_driver.id;
  END IF;

  INSERT INTO public.pd_audit_logs (actor_profile_id, action, entity_type, entity_id, payload)
  VALUES (
    public.auth_user_profile_id(),
    'review_application_' || p_decision,
    'pd_driver_application',
    p_application_id::text,
    jsonb_build_object(
      'driver_profile_id', v_driver.id,
      'branch_id', v_branch,
      'note', p_reviewer_note
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'decision', p_decision,
    'driver_profile_id', v_driver.id,
    'profile_id', v_driver.profile_id,
    'branch_id', v_branch
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.pd_review_driver_application(UUID, TEXT, TEXT, UUID, INTEGER) TO authenticated;

-- Suspender / reactivar repartidor ya aprobado
CREATE OR REPLACE FUNCTION public.pd_set_driver_admin_status(
  p_driver_profile_id UUID,
  p_status TEXT -- approved | suspended | blocked | rejected
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.auth_user_role() NOT IN ('super_admin', 'admin_sucursal', 'administrador') THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  IF p_status NOT IN ('approved', 'suspended', 'blocked', 'rejected', 'pending') THEN
    RAISE EXCEPTION 'Estado inválido';
  END IF;

  UPDATE public.pd_driver_profiles
  SET
    admin_status = p_status,
    operational_status = CASE WHEN p_status = 'approved' THEN operational_status ELSE 'offline' END,
    updated_at = now()
  WHERE id = p_driver_profile_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.pd_set_driver_admin_status(UUID, TEXT) TO authenticated;
