-- 0. Función helper para validar si un usuario es administrador sin recursión RLS
CREATE OR REPLACE FUNCTION public.is_admin(p_user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  IF p_user_id IS NULL THEN
    RETURN FALSE;
  END IF;
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = p_user_id AND role IN ('admin', 'super_admin')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- 1. Trigger para sincronizar auth.users con public.profiles automáticamente
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (
    id,
    full_name,
    email,
    phone,
    document_type,
    document_number,
    role,
    status
  )
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', 'Usuario'),
    NEW.email,
    NEW.raw_user_meta_data->>'phone',
    COALESCE(NEW.raw_user_meta_data->>'document_type', 'CC'),
    NEW.raw_user_meta_data->>'document_number',
    COALESCE((NEW.raw_user_meta_data->>'role')::public.user_role, 'customer'),
    'active'
  )
  ON CONFLICT (id) DO UPDATE SET
    full_name = EXCLUDED.full_name,
    email = EXCLUDED.email,
    phone = EXCLUDED.phone,
    document_type = EXCLUDED.document_type,
    document_number = EXCLUDED.document_number,
    updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Registrar trigger en auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- 2. Función para pre-generar todos los números de una rifa masivamente
CREATE OR REPLACE FUNCTION public.generate_raffle_numbers(p_raffle_id BIGINT)
RETURNS INT AS $$
DECLARE
  v_min INT;
  v_max INT;
  v_format VARCHAR(20);
  v_count INT := 0;
BEGIN
  -- Obtener parámetros de la rifa
  SELECT number_min, number_max, number_format
  INTO v_min, v_max, v_format
  FROM public.raffles
  WHERE id = p_raffle_id;

  IF v_min IS NULL OR v_max IS NULL THEN
    RAISE EXCEPTION 'Rifa no encontrada %', p_raffle_id;
  END IF;

  -- Generar e insertar masivamente la secuencia
  INSERT INTO public.raffle_numbers (raffle_id, number, numeric_value, status)
  SELECT
    p_raffle_id,
    TO_CHAR(i, v_format),
    i,
    'available'
  FROM generate_series(v_min, v_max) AS i
  ON CONFLICT (raffle_id, number) DO NOTHING;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 3. Función para reservar números aleatorios de forma atómica y segura
CREATE OR REPLACE FUNCTION public.reserve_random_numbers(
  p_raffle_id BIGINT,
  p_quantity INT,
  p_user_id UUID,
  p_hold_minutes INT DEFAULT 10
)
RETURNS TABLE (
  reservation_id BIGINT,
  number_id BIGINT,
  number_val VARCHAR(20)
) AS $$
DECLARE
  v_res_id BIGINT;
  v_expires TIMESTAMPTZ;
BEGIN
  v_expires := NOW() + (p_hold_minutes || ' minutes')::INTERVAL;

  -- Crear registro de reserva
  INSERT INTO public.reservations (user_id, raffle_id, status, expires_at)
  VALUES (p_user_id, p_raffle_id, 'active', v_expires)
  RETURNING id INTO v_res_id;

  -- Seleccionar y bloquear atómicamente números disponibles de forma aleatoria
  RETURN QUERY
  WITH selected AS (
    SELECT rn.id, rn.number
    FROM public.raffle_numbers rn
    WHERE rn.raffle_id = p_raffle_id AND rn.status = 'available'
    ORDER BY RANDOM()
    LIMIT p_quantity
    FOR UPDATE SKIP LOCKED
  ),
  updated AS (
    UPDATE public.raffle_numbers rn
    SET status = 'reserved',
        reserved_until = v_expires,
        updated_at = NOW()
    FROM selected s
    WHERE rn.id = s.id
    RETURNING rn.id, rn.number
  ),
  ins_items AS (
    INSERT INTO public.reservation_numbers (reservation_id, raffle_number_id)
    SELECT v_res_id, u.id FROM updated u
  )
  SELECT v_res_id, u.id, u.number FROM updated u;

END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 4. Proceso de liberación de reservas vencidas
CREATE OR REPLACE FUNCTION public.release_expired_reservations()
RETURNS INT AS $$
DECLARE
  v_released_count INT := 0;
BEGIN
  -- Liberar números de reservas vencidas
  WITH expired_res AS (
    UPDATE public.reservations
    SET status = 'expired', released_at = NOW()
    WHERE status = 'active' AND expires_at < NOW()
    RETURNING id
  ),
  expired_nums AS (
    SELECT rn.raffle_number_id
    FROM public.reservation_numbers rn
    JOIN expired_res er ON er.id = rn.reservation_id
  ),
  updated_numbers AS (
    UPDATE public.raffle_numbers
    SET status = 'available', reserved_until = NULL, updated_at = NOW()
    WHERE id IN (SELECT raffle_number_id FROM expired_nums) AND status = 'reserved'
    RETURNING id
  )
  SELECT COUNT(*) INTO v_released_count FROM updated_numbers;

  RETURN v_released_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
