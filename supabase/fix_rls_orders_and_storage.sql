-- ============================================================================
-- SCRIPT PARA HABILITAR POLÍTICAS RLS DE COMPRA Y STORAGE EN SUPABASE
-- Copia y pega este script en el SQL Editor de tu Dashboard de Supabase
-- ============================================================================

-- 1. Políticas para la tabla public.orders
DROP POLICY IF EXISTS "Permitir crear ordenes publicas" ON public.orders;
CREATE POLICY "Permitir crear ordenes publicas" ON public.orders
  FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Permitir ver ordenes publicas" ON public.orders;
CREATE POLICY "Permitir ver ordenes publicas" ON public.orders
  FOR SELECT USING (true);

-- 2. Políticas para la tabla public.payments
DROP POLICY IF EXISTS "Permitir crear y ver pagos" ON public.payments;
CREATE POLICY "Permitir crear y ver pagos" ON public.payments
  FOR ALL USING (true);

-- 3. Políticas para la tabla public.raffle_numbers
DROP POLICY IF EXISTS "Permitir gestionar boletos" ON public.raffle_numbers;
CREATE POLICY "Permitir gestionar boletos" ON public.raffle_numbers
  FOR ALL USING (true);

-- 4. Políticas para la tabla public.profiles
DROP POLICY IF EXISTS "Permitir insertar perfiles clientes" ON public.profiles;
CREATE POLICY "Permitir insertar perfiles clientes" ON public.profiles
  FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Permitir ver perfiles publicos" ON public.profiles;
CREATE POLICY "Permitir ver perfiles publicos" ON public.profiles
  FOR SELECT USING (true);

-- 5. Políticas para la tabla public.audit_logs
DROP POLICY IF EXISTS "Permitir insertar logs de auditoria" ON public.audit_logs;
CREATE POLICY "Permitir insertar logs de auditoria" ON public.audit_logs
  FOR INSERT WITH CHECK (true);

-- 6. Configurar buckets 'comprobantes' y 'rifas' en Storage y permitir subida pública
INSERT INTO storage.buckets (id, name, public)
VALUES 
  ('comprobantes', 'comprobantes', true),
  ('rifas', 'rifas', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DROP POLICY IF EXISTS "Permitir subir comprobantes publicamente" ON storage.objects;
CREATE POLICY "Permitir subir comprobantes publicamente" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id IN ('comprobantes', 'rifas'));

DROP POLICY IF EXISTS "Permitir ver comprobantes publicamente" ON storage.objects;
CREATE POLICY "Permitir ver comprobantes publicamente" ON storage.objects
  FOR SELECT USING (bucket_id IN ('comprobantes', 'rifas'));

DROP POLICY IF EXISTS "Permitir actualizar comprobantes publicamente" ON storage.objects;
CREATE POLICY "Permitir actualizar comprobantes publicamente" ON storage.objects
  FOR UPDATE USING (bucket_id IN ('comprobantes', 'rifas'));

-- 7. Políticas para la tabla public.raffles
DROP POLICY IF EXISTS "Permitir gestionar rifas" ON public.raffles;
CREATE POLICY "Permitir gestionar rifas" ON public.raffles
  FOR ALL USING (true);

-- 8. Políticas para la tabla public.lottery_draws
DROP POLICY IF EXISTS "Permitir gestionar sorteos" ON public.lottery_draws;
CREATE POLICY "Permitir gestionar sorteos" ON public.lottery_draws
  FOR ALL USING (true);
