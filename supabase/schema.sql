-- ============================================================================
-- SISTEMA DE VENTA DE RIFAS - ESQUEMA BASE DE DATOS SUPABASE (POSTGRESQL)
-- ============================================================================

-- Habilitar extensión UUID
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ----------------------------------------------------------------------------
-- 1. TIPOS Y ENUMS
-- ----------------------------------------------------------------------------
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

-- ----------------------------------------------------------------------------
-- 2. TABLAS BASE
-- ----------------------------------------------------------------------------

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

-- Tabla de Números de la Rifa (RESTRICCIÓN CRÍTICA DE UNICIDAD)
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

-- ----------------------------------------------------------------------------
-- 3. ÍNDICES DE RENDIMIENTO
-- ----------------------------------------------------------------------------
CREATE INDEX idx_raffle_numbers_raffle_status ON public.raffle_numbers(raffle_id, status);
CREATE INDEX idx_raffle_numbers_number ON public.raffle_numbers(raffle_id, number);
CREATE INDEX idx_orders_user ON public.orders(user_id);
CREATE INDEX idx_orders_raffle ON public.orders(raffle_id);
CREATE INDEX idx_payments_order ON public.payments(order_id);
CREATE INDEX idx_raffles_status ON public.raffles(status);

-- ----------------------------------------------------------------------------
-- 4. ROW LEVEL SECURITY (RLS)
-- ----------------------------------------------------------------------------
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.raffles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.raffle_numbers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

-- Políticas de perfiles
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
