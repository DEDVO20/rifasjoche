-- ============================================================================
-- SISTEMA DE VENTA DE RIFAS - SCRIPT COMPLETO DE BASE DE DATOS SUPABASE
-- Ejecutar en el SQL Editor de Supabase (https://supabase.com/dashboard)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- PARTE 1: ESQUEMA Y TABLAS (schema.sql)
-- ----------------------------------------------------------------------------

-- Habilitar extensión UUID
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- TIPOS Y ENUMS
CREATE TYPE user_role AS ENUM ('customer', 'admin', 'super_admin', 'operator', 'finance');
CREATE TYPE profile_status AS ENUM ('active', 'inactive', 'blocked');

CREATE TYPE lottery_draw_status AS ENUM ('scheduled', 'pending_result', 'result_registered', 'verified', 'cancelled');

CREATE TYPE raffle_status AS ENUM (
  'draft',
  'scheduled',
  'active',
  'paused',
  'sales_closed',
  'waiting_result',
  'completed',
  'cancelled'
);

CREATE TYPE raffle_number_status AS ENUM ('available', 'reserved', 'sold', 'blocked');
CREATE TYPE reservation_status AS ENUM ('active', 'expired', 'released', 'converted', 'cancelled');

CREATE TYPE order_status AS ENUM ('pending', 'confirmed', 'cancelled', 'expired', 'refunded');
CREATE TYPE payment_status AS ENUM ('pending', 'processing', 'approved', 'rejected', 'cancelled', 'refunded');
CREATE TYPE payment_method AS ENUM ('credit_card', 'debit_card', 'pse', 'nequi', 'daviplata', 'bank_transfer', 'cash');

CREATE TYPE prize_type AS ENUM ('main', 'secondary');
CREATE TYPE prize_rule_type AS ENUM ('exact_match', 'last_digits', 'first_digits', 'specific_number', 'derived_number');
CREATE TYPE prize_status AS ENUM ('pending', 'won', 'claimed', 'delivered', 'forfeited');

CREATE TYPE notification_type AS ENUM (
  'order_created',
  'payment_confirmed',
  'numbers_assigned',
  'prize_won',
  'prize_delivered',
  'raffle_result_published'
);

-- TABLAS BASE

-- Perfiles de usuario (Vinculado a auth.users de Supabase)
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  phone VARCHAR(50),
  document_type VARCHAR(20) DEFAULT 'CC',
  document_number VARCHAR(50),
  role user_role DEFAULT 'customer',
  status profile_status DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Catálogo de Loterías externas
CREATE TABLE public.lotteries (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(150) NOT NULL UNIQUE,
  description TEXT,
  website_url TEXT,
  country VARCHAR(100) DEFAULT 'Colombia',
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Sorteos oficiales de Loterías
CREATE TABLE public.lottery_draws (
  id BIGSERIAL PRIMARY KEY,
  lottery_id BIGINT NOT NULL REFERENCES public.lotteries(id) ON DELETE RESTRICT,
  draw_number VARCHAR(50) NOT NULL,
  draw_date DATE NOT NULL,
  winning_number VARCHAR(20),
  winning_series VARCHAR(20),
  official_source_url TEXT,
  evidence_url TEXT,
  status lottery_draw_status DEFAULT 'scheduled',
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(lottery_id, draw_number)
);

-- Tabla Principal de Rifas
CREATE TABLE public.raffles (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) NOT NULL UNIQUE,
  description TEXT,
  image_url TEXT,
  price_per_number NUMERIC(12, 2) NOT NULL CHECK (price_per_number > 0),
  number_min INT NOT NULL DEFAULT 0,
  number_max INT NOT NULL DEFAULT 9999,
  number_format VARCHAR(20) NOT NULL DEFAULT '0000',
  number_length INT NOT NULL DEFAULT 4,
  total_numbers INT NOT NULL CHECK (total_numbers > 0),
  minimum_numbers_per_order INT NOT NULL DEFAULT 1 CHECK (minimum_numbers_per_order >= 1),
  maximum_numbers_per_order INT NOT NULL DEFAULT 100 CHECK (maximum_numbers_per_order >= minimum_numbers_per_order),
  number_generation_type VARCHAR(50) DEFAULT 'random',
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ NOT NULL CHECK (end_at > start_at),
  lottery_draw_id BIGINT REFERENCES public.lottery_draws(id) ON DELETE SET NULL,
  status raffle_status DEFAULT 'draft',
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabla de Números de la Rifa
CREATE TABLE public.raffle_numbers (
  id BIGSERIAL PRIMARY KEY,
  raffle_id BIGINT NOT NULL REFERENCES public.raffles(id) ON DELETE CASCADE,
  number VARCHAR(20) NOT NULL,
  numeric_value INT NOT NULL,
  status raffle_number_status DEFAULT 'available',
  order_id BIGINT,
  reserved_until TIMESTAMPTZ,
  sold_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_raffle_number UNIQUE (raffle_id, number)
);

-- Reservas de números durante el Checkout
CREATE TABLE public.reservations (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  raffle_id BIGINT NOT NULL REFERENCES public.raffles(id) ON DELETE CASCADE,
  status reservation_status DEFAULT 'active',
  expires_at TIMESTAMPTZ NOT NULL,
  released_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE public.reservation_numbers (
  id BIGSERIAL PRIMARY KEY,
  reservation_id BIGINT NOT NULL REFERENCES public.reservations(id) ON DELETE CASCADE,
  raffle_number_id BIGINT NOT NULL REFERENCES public.raffle_numbers(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (reservation_id, raffle_number_id)
);

-- Órdenes / Compras
CREATE TABLE public.orders (
  id BIGSERIAL PRIMARY KEY,
  order_number VARCHAR(50) NOT NULL UNIQUE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  raffle_id BIGINT NOT NULL REFERENCES public.raffles(id) ON DELETE RESTRICT,
  quantity INT NOT NULL CHECK (quantity > 0),
  subtotal NUMERIC(12, 2) NOT NULL,
  discount NUMERIC(12, 2) DEFAULT 0,
  total NUMERIC(12, 2) NOT NULL,
  status order_status DEFAULT 'pending',
  payment_status payment_status DEFAULT 'pending',
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Items de Orden (Boletos asignados)
CREATE TABLE public.order_items (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  raffle_number_id BIGINT NOT NULL REFERENCES public.raffle_numbers(id) ON DELETE RESTRICT,
  unit_price NUMERIC(12, 2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (order_id, raffle_number_id)
);

-- Pagos
CREATE TABLE public.payments (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  provider VARCHAR(100) NOT NULL DEFAULT 'wompi',
  provider_transaction_id VARCHAR(255),
  amount NUMERIC(12, 2) NOT NULL,
  currency VARCHAR(10) DEFAULT 'COP',
  status payment_status DEFAULT 'pending',
  payment_method payment_method DEFAULT 'pse',
  paid_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Premios de la Rifa
CREATE TABLE public.raffle_prizes (
  id BIGSERIAL PRIMARY KEY,
  raffle_id BIGINT NOT NULL REFERENCES public.raffles(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  prize_type prize_type DEFAULT 'main',
  prize_value NUMERIC(12, 2) DEFAULT 0,
  position INT NOT NULL DEFAULT 1,
  rule_type prize_rule_type DEFAULT 'exact_match',
  rule_value VARCHAR(50),
  status prize_status DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ganadores
CREATE TABLE public.prize_winners (
  id BIGSERIAL PRIMARY KEY,
  raffle_prize_id BIGINT NOT NULL REFERENCES public.raffle_prizes(id) ON DELETE RESTRICT,
  raffle_number_id BIGINT NOT NULL REFERENCES public.raffle_numbers(id) ON DELETE RESTRICT,
  order_id BIGINT REFERENCES public.orders(id) ON DELETE SET NULL,
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  winning_value VARCHAR(50) NOT NULL,
  status prize_status DEFAULT 'won',
  claimed_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Auditoría
CREATE TABLE public.audit_logs (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(100) NOT NULL,
  entity_id VARCHAR(100),
  details JSONB DEFAULT '{}'::jsonb,
  ip_address VARCHAR(50),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Notificaciones
CREATE TABLE public.notifications (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  order_id BIGINT REFERENCES public.orders(id) ON DELETE SET NULL,
  raffle_id BIGINT REFERENCES public.raffles(id) ON DELETE SET NULL,
  type notification_type NOT NULL,
  recipient VARCHAR(255) NOT NULL,
  subject VARCHAR(255) NOT NULL,
  status VARCHAR(50) DEFAULT 'sent',
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ÍNDICES DE RENDIMIENTO
CREATE INDEX idx_raffle_numbers_raffle_status ON public.raffle_numbers(raffle_id, status);
CREATE INDEX idx_raffle_numbers_number ON public.raffle_numbers(raffle_id, number);
CREATE INDEX idx_orders_user ON public.orders(user_id);
CREATE INDEX idx_orders_raffle ON public.orders(raffle_id);
CREATE INDEX idx_payments_order ON public.payments(order_id);
CREATE INDEX idx_raffles_status ON public.raffles(status);

-- ROW LEVEL SECURITY (RLS)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.raffles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.raffle_numbers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- PARTE 2: FUNCIONES Y TRIGGERS (functions.sql)
-- ----------------------------------------------------------------------------

-- Función helper para validar si un usuario es administrador sin recursión RLS
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

-- Políticas RLS
CREATE POLICY "Usuarios leen su propio perfil" ON public.profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Usuarios actualizan su propio perfil" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Admins leen todos los perfiles" ON public.profiles
  FOR ALL USING (public.is_admin(auth.uid()));

-- Políticas de rifas (Públicas para lectura de activas)
CREATE POLICY "Cualquiera lee rifas activas" ON public.raffles
  FOR SELECT USING (status IN ('active', 'sales_closed', 'waiting_result', 'completed'));

CREATE POLICY "Admins gestionan rifas" ON public.raffles
  FOR ALL USING (public.is_admin(auth.uid()));

-- Políticas de números de rifa
CREATE POLICY "Lectura pública de números de rifa" ON public.raffle_numbers
  FOR SELECT USING (true);

-- Políticas de órdenes
CREATE POLICY "Usuarios ven sus propias ordenes" ON public.orders
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Admins ven todas las ordenes" ON public.orders
  FOR ALL USING (public.is_admin(auth.uid()));

-- Trigger para sincronizar auth.users con public.profiles
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

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Función para pre-generar números de una rifa
CREATE OR REPLACE FUNCTION public.generate_raffle_numbers(p_raffle_id BIGINT)
RETURNS INT AS $$
DECLARE
  v_min INT;
  v_max INT;
  v_format VARCHAR(20);
  v_count INT := 0;
BEGIN
  SELECT number_min, number_max, number_format
  INTO v_min, v_max, v_format
  FROM public.raffles
  WHERE id = p_raffle_id;

  IF v_min IS NULL OR v_max IS NULL THEN
    RAISE EXCEPTION 'Rifa no encontrada %', p_raffle_id;
  END IF;

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

-- Función para reservar números aleatorios de forma atómica
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

  INSERT INTO public.reservations (user_id, raffle_id, status, expires_at)
  VALUES (p_user_id, p_raffle_id, 'active', v_expires)
  RETURNING id INTO v_res_id;

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

-- Liberación de reservas vencidas
CREATE OR REPLACE FUNCTION public.release_expired_reservations()
RETURNS INT AS $$
DECLARE
  v_released_count INT := 0;
BEGIN
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


-- ----------------------------------------------------------------------------
-- PARTE 3: DATOS INICIALES / SEED DATA (seed.sql)
-- ----------------------------------------------------------------------------

-- Loterías Principales
INSERT INTO public.lotteries (name, description, website_url, country, active) VALUES
('Lotería de Medellín', 'Juega los viernes por la noche', 'https://loteriademedellin.com.co', 'Colombia', true),
('Lotería de Boyacá', 'Juega los sábados por la noche', 'https://loteriadeboyaca.gov.co', 'Colombia', true),
('Lotería de Bogotá', 'Juega los jueves por la noche', 'https://loteriadebogota.com', 'Colombia', true),
('Sorteo Baloto', 'Sorteos de cobertura nacional', 'https://baloto.com', 'Colombia', true)
ON CONFLICT (name) DO NOTHING;

-- Sorteos Oficiales
INSERT INTO public.lottery_draws (lottery_id, draw_number, draw_date, winning_number, winning_series, status) VALUES
(1, '4857', CURRENT_DATE + INTERVAL '7 days', NULL, NULL, 'scheduled'),
(2, '4210', CURRENT_DATE + INTERVAL '14 days', NULL, NULL, 'scheduled');

-- Rifas de Ejemplo
INSERT INTO public.raffles (
  name, slug, description, image_url, price_per_number,
  number_min, number_max, number_format, number_length, total_numbers,
  minimum_numbers_per_order, maximum_numbers_per_order,
  start_at, end_at, lottery_draw_id, status
) VALUES
(
  'Gran Sorteo de Verano',
  'gran-sorteo-de-verano-2026',
  'Participa por el gran premio de temporada. ¡10,000 números disponibles!',
  'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=800&q=80',
  10000.00,
  0, 9999, '0000', 4, 10000,
  1, 20,
  NOW(), NOW() + INTERVAL '14 days', 1, 'active'
),
(
  'Especial Tecnológico iPhone 17',
  'especial-tecnologico-iphone-17',
  'Gana el nuevo iPhone 17 Pro Max de 512GB sellado con garantía oficial.',
  'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=800&q=80',
  25000.00,
  0, 999, '000', 3, 1000,
  1, 10,
  NOW(), NOW() + INTERVAL '30 days', 2, 'active'
),
(
  'Moto Yamaha MT-09',
  'moto-yamaha-mt-09',
  'Rifa de espectacular motocicleta 0KM con papeles al día.',
  'https://images.unsplash.com/photo-1558981806-ec527fa84c39?w=800&q=80',
  50000.00,
  0, 499, '000', 3, 500,
  1, 5,
  NOW(), NOW() + INTERVAL '45 days', NULL, 'paused'
);

-- Generar Secuencia de Números para Rifas #1 y #2
SELECT public.generate_raffle_numbers(1);
SELECT public.generate_raffle_numbers(2);

-- Premios Configurados
INSERT INTO public.raffle_prizes (raffle_id, name, description, prize_type, prize_value, position, rule_type) VALUES
(1, '1er Premio - Automóvil 0KM', 'Camioneta SUV 2026 cero kilómetros', 'main', 80000000.00, 1, 'exact_match'),
(1, '2do Premio - Bono de Viaje', 'Viaje a Cancún para 2 personas todo incluido', 'secondary', 15000000.00, 2, 'exact_match'),
(2, 'iPhone 17 Pro Max 512GB', 'Smartphone de última generación sellado', 'main', 7500000.00, 1, 'exact_match');

-- Simulación de Números Vendidos y Reservados
UPDATE public.raffle_numbers SET status = 'sold', sold_at = NOW() WHERE raffle_id = 1 AND numeric_value IN (2, 5, 8, 12, 18, 25, 33, 42, 55, 67, 89);
UPDATE public.raffle_numbers SET status = 'reserved', reserved_until = NOW() + INTERVAL '10 minutes' WHERE raffle_id = 1 AND numeric_value IN (4, 15, 29, 48);
