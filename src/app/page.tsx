'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import CustomerNavbar from '@/components/layout/CustomerNavbar';
import { createClient } from '@/lib/supabase/client';

interface InstantPrize {
  number: string;
  name: string;
  value: number;
}

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
  status: string;
  rawEndAt?: string;
  winningNumber?: string;
  evidenceUrl?: string;
  instantPrizes: InstantPrize[];
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
        .select(`
          *,
          lottery_draws (id, winning_number, evidence_url, status, lotteries (name)),
          raffle_prizes (*)
        `)
        .in('status', ['active', 'sales_closed', 'completed'])
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
          const isCompleted = item.status === 'completed';
          const winningNum = (isCompleted && item.lottery_draws?.winning_number) ? item.lottery_draws.winning_number : undefined;

          const instantPrizes: InstantPrize[] = (item.raffle_prizes || [])
            .filter((p: any) => p.rule_type === 'specific_number')
            .map((p: any) => ({
              number: p.rule_value || '',
              name: p.name || 'Premio Anticipado',
              value: Number(p.prize_value) || 0,
            }));

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
            status: item.status || 'active',
            rawEndAt: item.end_at,
            winningNumber: winningNum,
            evidenceUrl: item.lottery_draws?.evidence_url || undefined,
            instantPrizes,
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

    // 🔴 Suscripción en tiempo real a ventas y cambios en rifas
    const channel = supabase
      .channel('realtime-home-numbers')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'raffle_numbers' },
        () => {
          loadPublicRaffles();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'lottery_draws' },
        () => {
          loadPublicRaffles();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadPublicRaffles, supabase]);

  const winningRaffles = publicRaffles.filter((r) => Boolean(r.winningNumber));

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

      {/* Banner Destacado de Ganadores Publicados */}
      {winningRaffles.length > 0 && (
        <section className="max-w-container-max mx-auto px-4 pt-8">
          <div className="bg-gradient-to-r from-amber-500 via-amber-400 to-yellow-500 p-6 rounded-3xl shadow-xl border border-amber-300 flex flex-col md:flex-row items-center justify-between gap-6 text-amber-950">
            <div className="flex items-center gap-4 text-left">
              <div className="w-16 h-16 rounded-2xl bg-white/90 text-amber-800 flex items-center justify-center shadow-lg shrink-0">
                <span className="material-symbols-outlined text-[36px]">emoji_events</span>
              </div>
              <div>
                <span className="px-3 py-0.5 rounded-full text-xs font-black bg-amber-900 text-amber-100 uppercase tracking-wider inline-block mb-1">
                  ¡Resultados Publicados!
                </span>
                <h2 className="text-xl sm:text-2xl font-black leading-tight">
                  Últimos Sorteos y Números Ganadores
                </h2>
                <p className="text-xs sm:text-sm font-medium text-amber-900">
                  Verifica tus boletos comprados para comprobar si eres el ganador oficial.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-3 items-center w-full md:w-auto justify-end">
              {winningRaffles.map((w) => (
                <div
                  key={w.id}
                  className="bg-white/95 px-4 py-2.5 rounded-2xl shadow-md border border-amber-200 flex items-center gap-3"
                >
                  <div className="text-left">
                    <span className="text-[11px] font-bold text-amber-900 block truncate max-w-[140px]">
                      {w.name}
                    </span>
                    <span className="text-[10px] text-on-surface-variant block">
                      {w.lottery}
                    </span>
                  </div>
                  <span className="font-raffle-number text-xl font-black bg-amber-500 text-white px-2.5 py-1 rounded-xl shadow-inner">
                    #{w.winningNumber}
                  </span>
                </div>
              ))}
              <Link
                href="/mis-boletos"
                className="px-5 py-3 bg-amber-950 text-white font-extrabold text-xs rounded-xl shadow-md hover:bg-black transition-colors flex items-center gap-1.5 shrink-0"
              >
                <span className="material-symbols-outlined text-[16px]">search</span>
                Consultar Mis Boletos
              </Link>
            </div>
          </div>
        </section>
      )}

      {/* Grid de Rifas Activas para Compradores */}
      <section className="max-w-container-max mx-auto px-4 py-12">
        <div className="flex justify-between items-end mb-8">
          <div>
            <h2 className="font-headline-md text-headline-md font-bold text-primary">
              Rifas y Sorteos
            </h2>
            <p className="font-body-md text-body-md text-on-surface-variant">
              Selecciona una rifa para elegir tus boletos o consulta los números ganadores oficiales.
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
            {publicRaffles.map((raffle) => {
              const hasWinner = raffle.status === 'completed' && Boolean(raffle.winningNumber);
              const isPastDrawDate = Boolean(raffle.rawEndAt && new Date(raffle.rawEndAt).getTime() <= Date.now());

              return (
                <div
                  key={raffle.id}
                  className={`bg-surface-container-lowest rounded-2xl shadow-lg border overflow-hidden flex flex-col justify-between hover:shadow-2xl transition-all group ${
                    hasWinner ? 'border-amber-400 ring-2 ring-amber-300/40' : 'border-outline-variant/30'
                  }`}
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

                      {/* Badge Ganador o Precio */}
                      <div className="absolute top-3 right-3">
                        {hasWinner ? (
                          <span className="bg-gradient-to-r from-amber-500 to-amber-600 text-white px-3 py-1 rounded-full font-label-caps text-xs font-black shadow-lg flex items-center gap-1 border border-amber-300">
                            <span className="material-symbols-outlined text-[14px]">emoji_events</span>
                            Ganador: #{raffle.winningNumber}
                          </span>
                        ) : isPastDrawDate ? (
                          <span className="bg-amber-100 text-amber-900 border border-amber-300 px-3 py-1 rounded-lg font-headline-md text-xs font-bold shadow-md flex items-center gap-1">
                            <span className="material-symbols-outlined text-[13px]">event_busy</span>
                            Ventas Cerradas
                          </span>
                        ) : (
                          <span className="bg-secondary-container text-on-secondary-container px-3 py-1 rounded-lg font-headline-md text-sm font-bold shadow-md">
                            ${raffle.price.toLocaleString('es-CO')} COP
                          </span>
                        )}
                      </div>

                      {!hasWinner && (
                        <div className="absolute bottom-3 right-3">
                          <span className="bg-black/60 text-white px-2.5 py-1 rounded-md text-xs font-bold backdrop-blur-sm">
                            {raffle.drawDate}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Info */}
                    <div className="p-6 space-y-4">
                      <h3 className="font-headline-md text-headline-md font-bold text-primary group-hover:text-secondary-fixed-dim transition-colors">
                        {raffle.name}
                      </h3>
                      <p className="font-body-sm text-body-sm text-on-surface-variant line-clamp-2">
                        {raffle.prizeDescription}
                      </p>

                      {/* Números Premiados (Premios Anticipados/Directos) */}
                      {raffle.instantPrizes && raffle.instantPrizes.length > 0 && (
                        <div className="bg-amber-500/10 border border-amber-400/40 p-3 rounded-xl space-y-1.5">
                          <div className="flex items-center justify-between text-xs font-bold text-amber-900">
                            <span className="flex items-center gap-1">
                              <span className="material-symbols-outlined text-[16px] text-amber-600">stars</span>
                              🎯 Números Premiados ({raffle.instantPrizes.length}):
                            </span>
                            <span className="text-[10px] uppercase font-black px-1.5 py-0.5 rounded bg-amber-200 text-amber-950">
                              Premios Directos
                            </span>
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {raffle.instantPrizes.map((ip, i) => (
                              <span
                                key={i}
                                className="px-2 py-1 bg-amber-100/90 text-amber-950 rounded-lg text-xs font-mono font-black border border-amber-300 shadow-sm flex items-center gap-1"
                              >
                                #{ip.number}
                                <span className="text-[10px] font-semibold text-amber-800 font-sans">
                                  ({ip.name})
                                </span>
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Sección Ganador vs Barra de Progreso */}
                      {hasWinner ? (
                        <div className="bg-gradient-to-r from-amber-500/10 via-amber-400/20 to-amber-500/10 border-2 border-amber-500/40 p-3.5 rounded-2xl flex items-center justify-between shadow-inner">
                          <div className="flex items-center gap-2.5">
                            <div className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center shadow-md shrink-0">
                              <span className="material-symbols-outlined text-[24px]">emoji_events</span>
                            </div>
                            <div>
                              <span className="text-[10px] uppercase font-black tracking-wider text-amber-900 block">
                                Número Ganador Oficial
                              </span>
                              <strong className="text-xs text-amber-950 font-bold block">
                                Sorteo Finalizado
                              </strong>
                            </div>
                          </div>
                          <div className="px-3 py-1 bg-white text-amber-950 rounded-xl font-raffle-number text-2xl font-black shadow border border-amber-300 shrink-0">
                            #{raffle.winningNumber}
                          </div>
                        </div>
                      ) : isPastDrawDate ? (
                        <div className="bg-amber-50/80 border border-amber-300 p-3.5 rounded-2xl flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="material-symbols-outlined text-amber-700 text-[20px]">event_busy</span>
                            <div>
                              <span className="text-[10px] uppercase font-bold text-amber-900 block">Sorteo Cerrado</span>
                              <strong className="text-xs text-amber-950 font-bold">Fecha del sorteo cumplida ({raffle.drawDate})</strong>
                            </div>
                          </div>
                        </div>
                      ) : (
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
                      )}
                    </div>
                  </div>

                  {/* Botón Comprar o Ver Resultados */}
                  <div className="p-6 pt-0">
                    {hasWinner ? (
                      <Link
                        href="/mis-boletos"
                        className="w-full bg-gradient-to-r from-amber-600 to-amber-700 text-white py-3.5 rounded-xl text-center font-body-md text-body-md font-extrabold flex items-center justify-center gap-2 hover:from-amber-700 hover:to-amber-800 transition-all shadow-md"
                      >
                        <span className="material-symbols-outlined">search</span>
                        Consultar Boletos Ganadores
                      </Link>
                    ) : isPastDrawDate ? (
                      <Link
                        href={`/tienda/${raffle.slug}`}
                        className="w-full bg-surface-container-high text-on-surface-variant py-3.5 rounded-xl text-center font-body-md text-body-md font-bold flex items-center justify-center gap-2 hover:bg-surface-container-highest transition-colors shadow-sm"
                      >
                        <span className="material-symbols-outlined text-[18px]">lock</span>
                        Ventas Cerradas por Fecha
                      </Link>
                    ) : (
                      <Link
                        href={`/tienda/${raffle.slug}`}
                        className="w-full bg-primary text-on-primary py-3.5 rounded-xl text-center font-body-md text-body-md font-extrabold flex items-center justify-center gap-2 hover:bg-primary-container transition-colors shadow-md group-hover:shadow-lg"
                      >
                        <span className="material-symbols-outlined">confirmation_number</span>
                        Comprar Boletos
                      </Link>
                    )}
                  </div>
                </div>
              );
            })}
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
