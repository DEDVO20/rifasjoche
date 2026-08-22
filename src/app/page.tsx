'use client';

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

interface DashboardStats {
  totalSales: number;
  activeRaffles: number;
  pendingPrizes: number;
  todayOrders: number;
}

interface ActivityItem {
  id: string;
  title: string;
  time: string;
  description: string;
  amount?: string;
  icon: string;
  iconBg: string;
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats>({
    totalSales: 0,
    activeRaffles: 0,
    pendingPrizes: 0,
    todayOrders: 0,
  });

  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRealtimeConnected, setIsRealtimeConnected] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string>('');

  const supabase = createClient();

  // Cargar métricas dinámicas desde Supabase
  const loadDashboardData = useCallback(async () => {
    try {
      setIsLoading(true);

      // 1. Rifas Activas
      const { count: activeCount } = await supabase
        .from('raffles')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'active');

      // 2. Premios Pendientes
      const { count: prizesCount } = await supabase
        .from('raffle_prizes')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending');

      // 3. Órdenes de Hoy
      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);

      const { count: todayOrdersCount } = await supabase
        .from('orders')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', startOfToday.toISOString());

      // 4. Ventas Totales (Suma de total de órdenes confirmadas/aprobadas)
      const { data: salesData } = await supabase
        .from('orders')
        .select('total')
        .in('payment_status', ['approved', 'confirmed']);

      const totalSalesSum = salesData
        ? salesData.reduce((acc, curr) => acc + (Number(curr.total) || 0), 0)
        : 0;

      setStats({
        totalSales: totalSalesSum,
        activeRaffles: activeCount || 0,
        pendingPrizes: prizesCount || 0,
        todayOrders: todayOrdersCount || 0,
      });

      // 5. Cargar Actividad Reciente desde órdenes y notificaciones
      const { data: recentOrders } = await supabase
        .from('orders')
        .select('id, order_number, total, quantity, status, created_at, raffles(name)')
        .order('created_at', { ascending: false })
        .limit(5);

      if (recentOrders && recentOrders.length > 0) {
        const mappedActivities: ActivityItem[] = recentOrders.map((ord: any) => ({
          id: ord.id.toString(),
          title: `Orden #${ord.order_number || ord.id}`,
          time: new Date(ord.created_at).toLocaleTimeString('es-CO', {
            hour: '2-digit',
            minute: '2-digit',
          }),
          description: `Compra de ${ord.quantity} boleto(s) en '${ord.raffles?.name || 'Rifa'}'.`,
          amount: `+ $${Number(ord.total).toLocaleString('es-CO')} COP`,
          icon: ord.status === 'confirmed' ? 'payments' : 'shopping_cart',
          iconBg: ord.status === 'confirmed'
            ? 'bg-tertiary-fixed-dim/20 text-on-tertiary-container'
            : 'bg-surface-container-highest text-primary',
        }));
        setActivities(mappedActivities);
      } else {
        // Mock inicial amigable si aún no hay órdenes registradas
        setActivities([
          {
            id: 'demo-1',
            title: 'Sistema Conectado a Supabase',
            time: 'Justo ahora',
            description: 'Monitoreo en tiempo real inicializado en la base de datos.',
            icon: 'database',
            iconBg: 'bg-secondary-container text-on-secondary-container',
          },
        ]);
      }

      setLastUpdated(new Date().toLocaleTimeString('es-CO'));
    } catch (error) {
      console.error('Error cargando métricas del dashboard:', error);
    } finally {
      setIsLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    loadDashboardData();

    // 🔴 Suscripción en Tiempo Real con Supabase Realtime
    const channel = supabase
      .channel('schema-db-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders' },
        () => {
          console.log('⚡ Cambios detectados en Órdenes. Recargando métricas...');
          loadDashboardData();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'raffles' },
        () => {
          console.log('⚡ Cambios detectados en Rifas. Recargando métricas...');
          loadDashboardData();
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          setIsRealtimeConnected(true);
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadDashboardData, supabase]);

  const statCards = [
    {
      title: 'VENTAS TOTALES',
      value: `$${stats.totalSales.toLocaleString('es-CO')} COP`,
      subtitle: stats.totalSales > 0 ? 'Ventas acumuladas' : 'Esperando primera orden',
      icon: 'account_balance_wallet',
      iconBg: 'bg-surface-container text-secondary-container',
      subtitleColor: 'text-tertiary-fixed-dim',
    },
    {
      title: 'RIFAS ACTIVAS',
      value: stats.activeRaffles.toString(),
      subtitle: stats.activeRaffles > 0 ? 'Sorteos en curso' : 'No hay rifas activas',
      icon: 'casino',
      iconBg: 'bg-surface-container text-primary',
      subtitleColor: 'text-on-surface-variant',
    },
    {
      title: 'PREMIOS PENDIENTES',
      value: stats.pendingPrizes.toString(),
      subtitle: stats.pendingPrizes > 0 ? 'Requiere entrega' : 'Sin premios pendientes',
      icon: 'redeem',
      iconBg: 'bg-error-container text-on-error-container',
      subtitleColor: stats.pendingPrizes > 0 ? 'text-error' : 'text-on-surface-variant',
      hasWarning: stats.pendingPrizes > 0,
    },
    {
      title: 'ÓRDENES DE HOY',
      value: stats.todayOrders.toString(),
      subtitle: stats.todayOrders > 0 ? 'Transacciones hoy' : 'Sin órdenes hoy',
      icon: 'shopping_cart',
      iconBg: 'bg-surface-container text-tertiary-fixed-dim',
      subtitleColor: 'text-on-surface-variant',
    },
  ];

  return (
    <div className="space-y-gutter">
      {/* Header escritorio */}
      <header className="mb-gutter hidden md:flex justify-between items-end">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="font-display-lg text-display-lg font-extrabold text-primary">
              Resumen
            </h1>
            {/* Badge de Monitoreo en Tiempo Real */}
            <div className="flex items-center gap-1.5 px-3 py-1 bg-surface-container-high rounded-full border border-outline-variant/30 text-xs font-bold text-primary">
              <span
                className={`w-2.5 h-2.5 rounded-full ${
                  isRealtimeConnected ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'
                }`}
              ></span>
              <span>{isRealtimeConnected ? 'Supabase Realtime Activo' : 'Conectando Supabase...'}</span>
            </div>
          </div>
          <p className="font-body-lg text-body-lg text-on-surface-variant">
            Métricas y monitoreo en tiempo real conectados a la base de datos de Supabase.
            {lastUpdated && <span className="text-xs ml-2 text-outline">(Última actualización: {lastUpdated})</span>}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => loadDashboardData()}
            title="Recargar Métricas"
            className="p-3 border border-outline-variant rounded-lg hover:bg-surface-container transition-colors"
          >
            <span className={`material-symbols-outlined ${isLoading ? 'animate-spin' : ''}`}>
              refresh
            </span>
          </button>
          <Link
            href="/rifas?action=create"
            className="bg-primary text-on-primary px-6 py-3 rounded-lg font-body-md text-body-md font-semibold shadow-md hover:shadow-lg transition-shadow flex items-center gap-2"
          >
            <span className="material-symbols-outlined text-[20px]">add_circle</span>
            Nueva Rifa
          </Link>
        </div>
      </header>

      {/* Header móvil */}
      <div className="md:hidden mb-gutter space-y-2">
        <div className="flex justify-between items-center">
          <h1 className="font-display-lg-mobile text-display-lg-mobile font-extrabold text-primary">
            Resumen
          </h1>
          <button
            onClick={() => loadDashboardData()}
            className="p-2 border border-outline-variant rounded-lg"
          >
            <span className={`material-symbols-outlined text-[18px] ${isLoading ? 'animate-spin' : ''}`}>
              refresh
            </span>
          </button>
        </div>
        <div className="flex items-center gap-1.5 text-xs font-bold text-primary">
          <span
            className={`w-2 h-2 rounded-full ${
              isRealtimeConnected ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'
            }`}
          ></span>
          <span>Supabase Realtime {isRealtimeConnected ? 'En línea' : 'Conectando'}</span>
        </div>
      </div>

      {/* Bento Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-base md:gap-gutter mb-gutter">
        {statCards.map((stat, idx) => (
          <div
            key={idx}
            className="bg-surface-container-lowest p-6 rounded-xl shadow-[0px_4px_20px_rgba(15,23,42,0.05)] flex flex-col justify-between h-40 border border-outline-variant/20 hover:border-outline transition-colors relative overflow-hidden"
          >
            <div className="flex justify-between items-start">
              <span className="font-label-caps text-label-caps text-outline uppercase tracking-wider">
                {stat.title}
              </span>
              <span className={`material-symbols-outlined p-2 rounded-full ${stat.iconBg}`}>
                {stat.icon}
              </span>
            </div>
            <div>
              <div className="font-headline-md text-headline-md font-bold text-primary">
                {isLoading ? (
                  <div className="w-24 h-7 bg-surface-container-high animate-pulse rounded"></div>
                ) : (
                  stat.value
                )}
              </div>
              <div className={`font-body-sm text-body-sm flex items-center gap-1 mt-1 ${stat.subtitleColor}`}>
                {stat.hasWarning && <span className="material-symbols-outlined text-[16px]">warning</span>}
                {stat.title === 'VENTAS TOTALES' && <span className="material-symbols-outlined text-[16px]">trending_up</span>}
                {stat.subtitle}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Grid de Actividad y Estado */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-base md:gap-gutter">
        {/* Actividad Reciente */}
        <div className="lg:col-span-2 bg-surface-container-lowest rounded-xl shadow-[0px_4px_20px_rgba(15,23,42,0.05)] p-6 border border-outline-variant/20">
          <div className="flex justify-between items-center mb-6">
            <h3 className="font-headline-md text-headline-md text-primary font-bold flex items-center gap-2">
              <span className="material-symbols-outlined text-secondary-fixed-dim">history</span>
              Actividad Reciente en Vivo
            </h3>
            <span className="text-xs font-bold text-on-surface-variant bg-surface-container-high px-2.5 py-1 rounded-full">
              Suscripción Realtime
            </span>
          </div>

          <div className="space-y-6">
            {isLoading ? (
              <div className="space-y-4 py-4">
                <div className="h-12 bg-surface-container-high animate-pulse rounded-xl"></div>
                <div className="h-12 bg-surface-container-high animate-pulse rounded-xl"></div>
              </div>
            ) : activities.length > 0 ? (
              activities.map((item) => (
                <div key={item.id} className="flex items-start gap-4">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${item.iconBg}`}>
                    <span className="material-symbols-outlined">{item.icon}</span>
                  </div>
                  <div className="flex-1">
                    <div className="flex justify-between items-start">
                      <p className="font-body-md text-body-md font-semibold text-on-surface">
                        {item.title}
                      </p>
                      <span className="font-label-caps text-label-caps text-outline">
                        {item.time}
                      </span>
                    </div>
                    <p className="font-body-sm text-body-sm text-on-surface-variant">
                      {item.description}
                    </p>
                    {item.amount && (
                      <span className="inline-block mt-2 px-2.5 py-1 bg-surface-container text-primary rounded font-label-caps text-[11px] font-extrabold shadow-sm">
                        {item.amount}
                      </span>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <p className="text-body-sm text-on-surface-variant text-center py-6">
                No hay actividad registrada en la base de datos aún.
              </p>
            )}
          </div>

          <Link
            href="/ventas"
            className="w-full block text-center mt-6 py-2.5 font-body-sm text-body-sm text-primary font-bold hover:bg-surface-container transition-colors rounded-lg border border-outline-variant/30"
          >
            Ver Historial Completo de Ventas →
          </Link>
        </div>

        {/* Widgets Lateral: Estado de Supabase & Seguridad */}
        <div className="space-y-base md:space-y-gutter">
          {/* Estado del sistema */}
          <div className="bg-surface-container-lowest rounded-xl shadow-[0px_4px_20px_rgba(15,23,42,0.05)] p-6 border border-outline-variant/20">
            <h3 className="font-headline-md text-headline-md text-primary mb-4 font-bold">
              Estado de la Base de Datos
            </h3>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse"></div>
              <span className="font-body-md text-body-md font-bold text-on-surface">
                Supabase PostgreSQL Conectado
              </span>
            </div>
            <div className="space-y-3">
              <div className="flex justify-between items-center border-b border-surface-container-high pb-2">
                <span className="font-body-sm text-body-sm text-on-surface-variant">Host</span>
                <span className="font-body-sm text-xs font-mono font-bold text-primary">wdbkldhycolphrnsoofp</span>
              </div>
              <div className="flex justify-between items-center border-b border-surface-container-high pb-2">
                <span className="font-body-sm text-body-sm text-on-surface-variant">Suscripción Realtime</span>
                <span className="font-body-sm text-body-sm text-emerald-600 font-semibold">
                  {isRealtimeConnected ? 'Activo' : 'Conectando...'}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="font-body-sm text-body-sm text-on-surface-variant">Seguridad RLS</span>
                <span className="font-body-sm text-body-sm text-tertiary-fixed-dim font-semibold">Habilitada (12 Tablas)</span>
              </div>
            </div>
          </div>

          {/* Auditoría de seguridad */}
          <div className="bg-primary text-on-primary rounded-xl shadow-lg p-6 flex flex-col items-center text-center justify-center relative overflow-hidden">
            <span className="material-symbols-outlined text-[48px] mb-2 text-secondary-container">security</span>
            <h3 className="font-headline-md text-headline-md font-bold mb-2">Auditoría & Seguridad</h3>
            <p className="font-body-sm text-body-sm text-primary-fixed-dim mb-4">
              Políticas Row Level Security (RLS) activadas para la prevención de recursión y aislamiento de datos.
            </p>
            <Link
              href="/auditoria"
              className="bg-secondary-container text-on-secondary-container px-4 py-2.5 rounded-lg font-body-sm text-body-sm font-bold w-full hover:bg-secondary-fixed transition-colors block text-center"
            >
              Ver Logs de Auditoría
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
