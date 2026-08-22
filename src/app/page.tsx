'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import CustomerNavbar from '@/components/layout/CustomerNavbar';
import { createClient } from '@/lib/supabase/client';

interface PublicRaffle {
  id: number;
  name: string;
  slug: string;
  image: string;
  price: number;
  soldCount: number;
  soldPercent: number;
  totalNumbers: number;
  lottery: string;
  drawDate: string;
  prizeDescription: string;
}

export default function HomePage() {
  const [publicRaffles, setPublicRaffles] = useState<PublicRaffle[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const supabase = createClient();

  const loadPublicRaffles = useCallback(async () => {
    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('raffles')
        .select('*, lottery_draws(id, lotteries(name))')
        .in('status', ['active', 'sales_closed'])
        .order('id', { ascending: false });

      if (!error && data && data.length > 0) {
        const raffleIds = data.map((r: any) => r.id);

        // Conteo real de boletos vendidos en public.raffle_numbers
        const { data: soldNumbers } = await supabase
          .from('raffle_numbers')
          .select('raffle_id')
          .in('raffle_id', raffleIds)
          .eq('status', 'sold');

        const soldCountMap = new Map<number, number>();
        (soldNumbers || []).forEach((item: any) => {
          soldCountMap.set(item.raffle_id, (soldCountMap.get(item.raffle_id) || 0) + 1);
        });

        const mapped: PublicRaffle[] = data.map((item: any) => {
          const realSoldCount = soldCountMap.get(item.id) || 0;
          const totalNums = item.total_numbers || 10000;
          const soldPercent = Math.min(100, Math.round((realSoldCount / totalNums) * 100));

          return {
            id: item.id,
            name: item.name,
            slug: item.slug || `sorteo-${item.id}`,
            image: item.image_url || 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=800&q=80',
            price: Number(item.price_per_number) || 10000,
            soldCount: realSoldCount,
            soldPercent,
            totalNumbers: totalNums,
            lottery: item.lottery_draws?.lotteries?.name || 'Lotería Oficial',
            drawDate: item.end_at
              ? new Date(item.end_at).toLocaleDateString('es-CO', {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                })
              : 'Próximamente',
            prizeDescription: item.description || 'Participa y gana fabulosos premios con el sorteo oficial.',
          };
        });
        setPublicRaffles(mapped);
      } else {
        setPublicRaffles([]);
      }
    } catch (err) {
      console.error('Error cargando rifas públicas:', err);
    } finally {
      setIsLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    loadPublicRaffles();

    // 🔴 Suscripción en tiempo real a ventas de boletos
    const channel = supabase
      .channel('realtime-store-numbers')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'raffle_numbers' },
        () => {
          loadPublicRaffles();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadPublicRaffles, supabase]);

  return (
    <div className="min-h-screen bg-surface text-on-surface">
      <CustomerNavbar />

      {/* Hero Banner Comprador */}
      <section className="bg-gradient-to-b from-primary-container to-primary text-on-primary py-16 px-4 text-center relative overflow-hidden">
        <div className="max-w-4xl mx-auto space-y-6 relative z-10">
          <span className="inline-block px-4 py-1.5 bg-secondary-container text-on-secondary-container rounded-full font-label-caps text-xs font-bold uppercase tracking-wider shadow-md">
            🎲 Sorteos 100% Transparentes y Verificados
          </span>
          <h1 className="font-display-lg text-[36px] sm:text-[48px] md:text-[56px] font-extrabold leading-tight tracking-tight text-white">
            ¡Participa y Gana Premios Increíbles!
          </h1>
          <p className="font-body-lg text-body-lg text-primary-fixed-dim max-w-2xl mx-auto">
            Elige la cantidad de boletos, la asignación de números es 100% aleatoria y transparente. Recibe confirmación inmediata en tu celular y correo.
          </p>

          <div className="flex flex-wrap justify-center gap-6 pt-4 text-left">
            <div className="flex items-center gap-2 bg-white/10 px-4 py-2 rounded-xl backdrop-blur-sm">
              <span className="material-symbols-outlined text-tertiary-fixed-dim">verified</span>
              <span className="font-body-sm text-body-sm font-semibold">Números Únicos sin Duplicación</span>
            </div>
            <div className="flex items-center gap-2 bg-white/10 px-4 py-2 rounded-xl backdrop-blur-sm">
              <span className="material-symbols-outlined text-secondary-container">casino</span>
              <span className="font-body-sm text-body-sm font-semibold">Loterías Oficiales de Colombia</span>
            </div>
          </div>
        </div>
      </section>

      {/* Grid de Rifas Activas para Compradores */}
      <section className="max-w-container-max mx-auto px-4 py-12">
        <div className="flex justify-between items-end mb-8">
          <div>
            <h2 className="font-headline-md text-headline-md font-bold text-primary">
              Rifas y Sorteos Activos
            </h2>
            <p className="font-body-md text-body-md text-on-surface-variant">
              Selecciona una rifa para elegir tus boletos y realizar tu compra en línea.
            </p>
          </div>
          <Link
            href="/mis-boletos"
            className="hidden sm:flex items-center gap-1 font-body-md text-body-md font-bold text-primary hover:underline"
          >
            ¿Ya compraste? Consulta tus boletos →
          </Link>
        </div>

        {isLoading ? (
          <div className="text-center py-12 text-primary font-bold">
            Cargando rifas y conteo real de ventas...
          </div>
        ) : publicRaffles.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {publicRaffles.map((raffle) => (
              <div
                key={raffle.id}
                className="bg-surface-container-lowest rounded-2xl shadow-lg border border-outline-variant/30 overflow-hidden flex flex-col justify-between hover:shadow-2xl transition-all group"
              >
                <div>
                  {/* Imagen */}
                  <div className="relative h-56 w-full bg-surface-container-high overflow-hidden">
                    {/* eslint-disable-next-html-element-suppression */}
                    <img
                      src={raffle.image}
                      alt={raffle.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                    <div className="absolute top-3 left-3">
                      <span className="bg-primary text-on-primary px-3 py-1 rounded-full font-label-caps text-xs font-bold shadow">
                        Sortea: {raffle.lottery}
                      </span>
                    </div>
                    <div className="absolute bottom-3 right-3">
                      <span className="bg-secondary-container text-on-secondary-container px-3 py-1 rounded-lg font-headline-md text-headline-md font-bold shadow-md">
                        ${raffle.price.toLocaleString('es-CO')} COP
                      </span>
                    </div>
                  </div>

                  {/* Info */}
                  <div className="p-6 space-y-4">
                    <h3 className="font-headline-md text-headline-md font-bold text-primary group-hover:text-secondary-fixed-dim transition-colors">
                      {raffle.name}
                    </h3>
                    <p className="font-body-sm text-body-sm text-on-surface-variant line-clamp-2">
                      {raffle.prizeDescription}
                    </p>

                    {/* Barra de progreso con conteo real de la base de datos */}
                    <div className="space-y-1.5 pt-2">
                      <div className="flex justify-between font-body-sm text-xs">
                        <span className="text-on-surface-variant font-semibold">
                          {raffle.soldCount} de {raffle.totalNumbers} boletos vendidos
                        </span>
                        <span className="font-bold text-primary">{raffle.soldPercent}%</span>
                      </div>
                      <div className="w-full bg-surface-container-high rounded-full h-3 overflow-hidden">
                        <div
                          className="bg-emerald-500 h-3 rounded-full transition-all duration-500"
                          style={{ width: `${Math.max(1, raffle.soldPercent)}%` }}
                        ></div>
                      </div>
                      <div className="font-label-caps text-label-caps text-outline text-right">
                        Sorteo el {raffle.drawDate}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Botón Comprar */}
                <div className="p-6 pt-0">
                  <Link
                    href={`/tienda/${raffle.slug}`}
                    className="w-full bg-primary text-on-primary py-3.5 rounded-xl text-center font-body-md text-body-md font-extrabold flex items-center justify-center gap-2 hover:bg-primary-container transition-colors shadow-md group-hover:shadow-lg"
                  >
                    <span className="material-symbols-outlined">confirmation_number</span>
                    Comprar Boletos
                  </Link>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-surface-container-lowest p-8 rounded-2xl text-center border border-outline-variant/30 space-y-2">
            <span className="material-symbols-outlined text-[48px] text-on-surface-variant">casino</span>
            <h3 className="font-headline-md text-headline-md font-bold text-primary">No hay rifas activas en este momento</h3>
            <p className="font-body-md text-body-md text-on-surface-variant">
              Vuelve a consultar pronto para nuevos sorteos oficiales.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
