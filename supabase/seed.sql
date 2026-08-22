-- ============================================================================
-- SISTEMA DE VENTA DE RIFAS - DATOS DE PRUEBA / SEED DATA (SUPABASE)
-- ============================================================================

-- 1. Loterías Principales de Colombia
INSERT INTO public.lotteries (name, description, website_url, country, active) VALUES
('Lotería de Medellín', 'Juega los viernes por la noche', 'https://loteriademedellin.com.co', 'Colombia', true),
('Lotería de Boyacá', 'Juega los sábados por la noche', 'https://loteriadeboyaca.gov.co', 'Colombia', true),
('Lotería de Bogotá', 'Juega los jueves por la noche', 'https://loteriadebogota.com', 'Colombia', true),
('Sorteo Baloto', 'Sorteos de cobertura nacional', 'https://baloto.com', 'Colombia', true)
ON CONFLICT (name) DO NOTHING;

-- 2. Sorteos Oficiales
INSERT INTO public.lottery_draws (lottery_id, draw_number, draw_date, winning_number, winning_series, status) VALUES
(1, '4857', CURRENT_DATE + INTERVAL '7 days', NULL, NULL, 'scheduled'),
(2, '4210', CURRENT_DATE + INTERVAL '14 days', NULL, NULL, 'scheduled');

-- 3. Rifas de Ejemplo (Matching the HTML Mockups)
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

-- 4. Generar Secuencia de Números para la Rifa #1 (Primeros 100 números de prueba inmediatos)
SELECT public.generate_raffle_numbers(1);
SELECT public.generate_raffle_numbers(2);

-- 5. Premios Configurados
INSERT INTO public.raffle_prizes (raffle_id, name, description, prize_type, prize_value, position, rule_type) VALUES
(1, '1er Premio - Automóvil 0KM', 'Camioneta SUV 2026 cero kilómetros', 'main', 80000000.00, 1, 'exact_match'),
(1, '2do Premio - Bono de Viaje', 'Viaje a Cancún para 2 personas todo incluido', 'secondary', 15000000.00, 2, 'exact_match'),
(2, 'iPhone 17 Pro Max 512GB', 'Smartphone de última generación sellado', 'main', 7500000.00, 1, 'exact_match');

-- 6. Simulación de Números Vendidos y Reservados para el Talonario (Rifa #1)
UPDATE public.raffle_numbers SET status = 'sold', sold_at = NOW() WHERE raffle_id = 1 AND numeric_value IN (2, 5, 8, 12, 18, 25, 33, 42, 55, 67, 89);
UPDATE public.raffle_numbers SET status = 'reserved', reserved_until = NOW() + INTERVAL '10 minutes' WHERE raffle_id = 1 AND numeric_value IN (4, 15, 29, 48);
