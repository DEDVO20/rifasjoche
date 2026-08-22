'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/context/ToastContext';

interface OrderSale {
  id: string;
  orderNumber: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  raffleName: string;
  numbers: string[];
  total: number;
  paymentMethod: string;
  proofUrl?: string;
  status: 'approved' | 'pending' | 'rejected';
  date: string;
}

export default function VentasPage() {
  const [sales, setSales] = useState<OrderSale[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [isRealtime, setIsRealtime] = useState(false);
  const [selectedProof, setSelectedProof] = useState<{ url: string; order: string; customer: string } | null>(null);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  const { success: toastSuccess, error: toastError, warning: toastWarning, info: toastInfo } = useToast();
  const supabase = createClient();

  // Cargar ventas reales desde Supabase
  const loadSalesData = useCallback(async () => {
    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('orders')
        .select(`
          id,
          order_number,
          total,
          status,
          payment_status,
          created_at,
          profiles (
            full_name,
            email,
            phone
          ),
          raffles (
            name
          ),
          payments (
            provider,
            metadata,
            status
          ),
          raffle_numbers (
            number
          )
        `)
        .order('id', { ascending: false });

      if (error) {
        console.error('Error cargando órdenes de Supabase:', error);
        return;
      }

      if (data && data.length > 0) {
        const formattedSales: OrderSale[] = data.map((order: any) => {
          const rawNumbers = (order.raffle_numbers || []).map((n: any) => n.number);

          // Extraer datos del perfil o de la metadata del pago (para compras de invitados)
          const payMeta = order.payments?.[0]?.metadata;
          const customerName =
            payMeta?.customer_name ||
            (order.profiles as any)?.full_name ||
            'Comprador';
          const customerPhone =
            payMeta?.customer_phone ||
            (order.profiles as any)?.phone ||
            'Sin teléfono';
          const customerEmail =
            payMeta?.customer_email ||
            (order.profiles as any)?.email ||
            'Sin correo';

          const proofUrl =
            payMeta?.proof_url ||
            undefined;

          const paymentMethod =
            payMeta?.payment_method === 'pse'
              ? 'PSE'
              : payMeta?.payment_key
              ? `Transferencia (Llave ${payMeta.payment_key})`
              : order.payments?.[0]?.provider || 'Transferencia';

          let computedStatus: 'approved' | 'pending' | 'rejected' = 'pending';
          if (order.status === 'confirmed' || order.payment_status === 'approved') {
            computedStatus = 'approved';
          } else if (order.status === 'cancelled' || order.status === 'rejected') {
            computedStatus = 'rejected';
          }

          const formattedDate = new Date(order.created_at).toLocaleString('es-CO', {
            day: 'numeric',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit',
          });

          return {
            id: order.id.toString(),
            orderNumber: order.order_number,
            customerName,
            customerPhone,
            customerEmail,
            raffleName: (order.raffles as any)?.name || 'Sorteo',
            numbers: rawNumbers,
            total: Number(order.total) || 0,
            paymentMethod,
            proofUrl,
            status: computedStatus,
            date: formattedDate,
          };
        });

        setSales(formattedSales);
      } else {
        setSales([]);
      }
    } catch (err) {
      console.error('Excepción cargando ventas:', err);
    } finally {
      setIsLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    loadSalesData();

    // 🔴 Suscripción en Tiempo Real para detectar nuevas órdenes y comprobantes
    const channel = supabase
      .channel('realtime-ventas')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders' },
        () => {
          console.log('⚡ Cambio en órdenes detectado en vivo. Actualizando...');
          loadSalesData();
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          setIsRealtime(true);
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadSalesData, supabase]);

  const filteredSales = sales.filter((item) => {
    const matchesSearch =
      item.orderNumber.toLowerCase().includes(search.toLowerCase()) ||
      item.customerName.toLowerCase().includes(search.toLowerCase()) ||
      item.customerPhone.toLowerCase().includes(search.toLowerCase()) ||
      item.raffleName.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === 'all' || item.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  // APROBAR PAGO Y ENVIAR NÚMEROS AL CORREO
  const handleApproveOrder = async (orderId: string) => {
    try {
      setActionLoadingId(orderId);
      toastInfo('Procesando Aprobación', 'Validando pago y despachando boletos con Resend...');

      const res = await fetch(`/api/orders/${orderId}/approve`, {
        method: 'POST',
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'No se pudo aprobar la orden.');
      }

      toastSuccess(
        '¡Pago Aprobado y Boletos Enviados!',
        json.message || `Boletos despachados exitosamente al correo ${json.customerEmail || ''}.`
      );
      await loadSalesData();
    } catch (err: any) {
      console.error('Error aprobando orden:', err);
      toastError('Error al Aprobar Orden', err.message);
    } finally {
      setActionLoadingId(null);
    }
  };

  // RECHAZAR PAGO Y LIBERAR BOLETOS
  const handleRejectOrder = async (orderId: string) => {
    try {
      setActionLoadingId(orderId);
      const res = await fetch(`/api/orders/${orderId}/reject`, {
        method: 'POST',
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'No se pudo rechazar la orden.');
      }

      toastWarning('Orden Rechazada', 'Los boletos han sido liberados nuevamente al público.');
      await loadSalesData();
    } catch (err: any) {
      console.error('Error rechazando orden:', err);
      toastError('Error al Rechazar Orden', err.message);
    } finally {
      setActionLoadingId(null);
    }
  };

  const totalRevenueSum = sales
    .filter((s) => s.status === 'approved')
    .reduce((acc, s) => acc + s.total, 0);

  const pendingCount = sales.filter((s) => s.status === 'pending').length;
  const approvedCount = sales.filter((s) => s.status === 'approved').length;

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Encabezado */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-display-lg text-2xl sm:text-3xl font-extrabold text-primary">
              Ventas y Transacciones
            </h1>
            {isRealtime && (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 shadow-sm animate-pulse">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-600"></span>
                En Vivo
              </span>
            )}
          </div>
          <p className="font-body-sm text-xs sm:text-sm text-on-surface-variant mt-0.5">
            Verifica comprobantes y aprueba compras para despachar boletos oficiales al correo.
          </p>
        </div>

        <button
          onClick={loadSalesData}
          className="px-3.5 py-2 bg-surface-container-lowest hover:bg-surface-container border border-outline-variant/30 rounded-xl text-primary font-bold text-xs sm:text-sm flex items-center gap-1.5 shadow-sm transition-all"
        >
          <span className="material-symbols-outlined text-[16px]">sync</span>
          Actualizar
        </button>
      </div>

      {/* Tarjetas de Métricas de Ventas */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-surface-container-lowest p-4 sm:p-5 rounded-2xl shadow-sm border border-outline-variant/30 space-y-1.5">
          <div className="flex justify-between items-center text-on-surface-variant text-[11px] sm:text-xs font-bold uppercase tracking-wider">
            <span>Total Recaudado</span>
            <span className="material-symbols-outlined text-emerald-600 text-[18px]">payments</span>
          </div>
          <div className="text-lg sm:text-2xl font-extrabold text-primary">
            ${totalRevenueSum.toLocaleString('es-CO')}
          </div>
          <div className="text-[10px] sm:text-xs text-emerald-600 font-semibold flex items-center gap-1">
            <span className="material-symbols-outlined text-[12px]">check_circle</span>
            Pagos aprobados
          </div>
        </div>

        <div className="bg-surface-container-lowest p-4 sm:p-5 rounded-2xl shadow-sm border border-outline-variant/30 space-y-1.5">
          <div className="flex justify-between items-center text-on-surface-variant text-[11px] sm:text-xs font-bold uppercase tracking-wider">
            <span>Aprobadas</span>
            <span className="material-symbols-outlined text-emerald-600 text-[18px]">verified</span>
          </div>
          <div className="text-lg sm:text-2xl font-extrabold text-primary">
            {approvedCount}
          </div>
          <div className="text-[10px] sm:text-xs text-on-surface-variant">
            Boletos confirmados
          </div>
        </div>

        <div className="bg-surface-container-lowest p-4 sm:p-5 rounded-2xl shadow-sm border border-amber-500/30 space-y-1.5 bg-amber-500/[0.02]">
          <div className="flex justify-between items-center text-amber-700 text-[11px] sm:text-xs font-bold uppercase tracking-wider">
            <span>Por Verificar</span>
            <span className="material-symbols-outlined text-amber-600 text-[18px]">pending_actions</span>
          </div>
          <div className="text-lg sm:text-2xl font-extrabold text-amber-700">
            {pendingCount}
          </div>
          <div className="text-[10px] sm:text-xs text-amber-600 font-bold flex items-center gap-1">
            <span className="material-symbols-outlined text-[12px]">warning</span>
            Requieren revisión
          </div>
        </div>

        <div className="bg-surface-container-lowest p-4 sm:p-5 rounded-2xl shadow-sm border border-outline-variant/30 space-y-1.5">
          <div className="flex justify-between items-center text-on-surface-variant text-[11px] sm:text-xs font-bold uppercase tracking-wider">
            <span>Total Órdenes</span>
            <span className="material-symbols-outlined text-primary text-[18px]">receipt_long</span>
          </div>
          <div className="text-lg sm:text-2xl font-extrabold text-primary">
            {sales.length}
          </div>
          <div className="text-[10px] sm:text-xs text-on-surface-variant">
            Registradas
          </div>
        </div>
      </div>

      {/* Filtros y Buscador */}
      <div className="flex flex-col sm:flex-row gap-2.5 bg-surface-container-lowest p-3 sm:p-4 rounded-2xl shadow-sm border border-outline-variant/30">
        <div className="relative flex-1">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-[18px]">
            search
          </span>
          <input
            type="text"
            placeholder="Buscar por orden, cliente, teléfono o rifa..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 border border-outline-variant rounded-xl bg-surface-container-lowest focus:ring-2 focus:ring-primary font-body-md text-sm"
          />
        </div>
        <div className="flex gap-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-full sm:w-auto px-3 sm:px-4 py-2 border border-outline-variant rounded-xl bg-surface-container-lowest focus:ring-2 focus:ring-primary text-xs sm:text-sm font-bold"
          >
            <option value="all">Todos los estados ({sales.length})</option>
            <option value="pending">⚠️ Pendientes ({pendingCount})</option>
            <option value="approved">✅ Aprobadas ({approvedCount})</option>
            <option value="rejected">❌ Rechazadas</option>
          </select>
        </div>
      </div>

      {/* 📱 1. VISTA MÓVIL: TARJETAS RESPONSIVAS TÁCTILES (md:hidden) */}
      <div className="block md:hidden space-y-3.5">
        {isLoading ? (
          <div className="bg-surface-container-lowest p-8 rounded-2xl text-center text-primary font-bold shadow-sm border border-outline-variant/30">
            Cargando órdenes...
          </div>
        ) : filteredSales.length > 0 ? (
          filteredSales.map((sale) => (
            <div
              key={sale.id}
              className={`bg-surface-container-lowest p-4 rounded-2xl shadow-sm border space-y-3.5 transition-all ${
                sale.status === 'pending'
                  ? 'border-amber-400/60 bg-amber-500/[0.015]'
                  : sale.status === 'approved'
                  ? 'border-emerald-400/40'
                  : 'border-outline-variant/30'
              }`}
            >
              {/* Encabezado de la Tarjeta Móvil */}
              <div className="flex justify-between items-start gap-2 border-b border-outline-variant/20 pb-2.5">
                <div>
                  <span className="font-mono font-black text-sm text-primary tracking-wide block">
                    {sale.orderNumber}
                  </span>
                  <span className="text-[11px] text-on-surface-variant">{sale.date}</span>
                </div>

                {/* Badge de Estado Móvil */}
                <div>
                  {sale.status === 'approved' ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-extrabold bg-emerald-50 text-emerald-700 border border-emerald-300 shadow-sm">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                      Aprobado
                    </span>
                  ) : sale.status === 'pending' ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-extrabold bg-amber-50 text-amber-800 border border-amber-300 shadow-sm">
                      <span className="relative flex h-1.5 w-1.5">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-amber-500"></span>
                      </span>
                      Pendiente
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-extrabold bg-rose-50 text-rose-700 border border-rose-300 shadow-sm">
                      <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
                      Rechazado
                    </span>
                  )}
                </div>
              </div>

              {/* Datos del Cliente y Sorteo */}
              <div className="space-y-1.5 text-xs">
                <div className="flex justify-between items-center">
                  <span className="font-bold text-primary text-sm">{sale.customerName}</span>
                  <a
                    href={`https://wa.me/57${sale.customerPhone.replace(/\D/g, '')}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-emerald-600 font-bold hover:underline inline-flex items-center gap-1 bg-emerald-50 px-2 py-0.5 rounded-lg border border-emerald-200"
                  >
                    <span className="material-symbols-outlined text-[13px]">chat</span>
                    {sale.customerPhone}
                  </a>
                </div>
                <div className="text-on-surface-variant truncate">{sale.customerEmail}</div>
                <div className="text-primary font-semibold pt-1">
                  🎟️ <span className="font-bold">{sale.raffleName}</span>
                </div>
              </div>

              {/* Boletos Asignados */}
              <div className="space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant block">
                  Boletos Asignados ({sale.numbers.length})
                </span>
                <div className="flex flex-wrap gap-1">
                  {sale.numbers.map((num) => (
                    <span
                      key={num}
                      className={`px-2 py-0.5 font-mono text-xs rounded-md font-extrabold border ${
                        sale.status === 'approved'
                          ? 'bg-secondary-container text-on-secondary-container border-secondary-fixed-dim/30'
                          : 'bg-amber-500/10 text-amber-800 border-amber-500/30'
                      }`}
                    >
                      #{num}
                    </span>
                  ))}
                </div>
              </div>

              {/* Monto y Botón Ver Comprobante */}
              <div className="flex justify-between items-center pt-2 border-t border-outline-variant/20">
                <div>
                  <span className="text-[10px] text-on-surface-variant block">Total Pagado</span>
                  <span className="text-base font-black text-primary">
                    ${sale.total.toLocaleString('es-CO')} COP
                  </span>
                </div>

                {sale.proofUrl ? (
                  <button
                    type="button"
                    onClick={() =>
                      setSelectedProof({
                        url: sale.proofUrl!,
                        order: sale.orderNumber,
                        customer: sale.customerName,
                      })
                    }
                    className="px-3 py-1.5 bg-primary/10 hover:bg-primary text-primary hover:text-on-primary rounded-xl text-xs font-bold transition-all inline-flex items-center gap-1 border border-primary/20 shadow-sm"
                  >
                    <span className="material-symbols-outlined text-[15px]">receipt_long</span>
                    Ver Comprobante
                  </button>
                ) : (
                  <span className="text-xs text-on-surface-variant/70 italic">Sin comprobante</span>
                )}
              </div>

              {/* Botones de Acción Móviles Grandes */}
              {sale.status === 'pending' ? (
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <button
                    disabled={actionLoadingId === sale.id}
                    onClick={() => handleApproveOrder(sale.id)}
                    className="py-2.5 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-extrabold text-xs shadow-md transition-all flex items-center justify-center gap-1.5 disabled:opacity-50 active:scale-95"
                  >
                    {actionLoadingId === sale.id ? (
                      <>
                        <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                        Enviando...
                      </>
                    ) : (
                      <>
                        <span className="material-symbols-outlined text-[16px]">check_circle</span>
                        Aprobar Pago
                      </>
                    )}
                  </button>
                  <button
                    disabled={actionLoadingId === sale.id}
                    onClick={() => handleRejectOrder(sale.id)}
                    className="py-2.5 px-3 bg-white text-rose-600 border border-rose-300 hover:bg-rose-50 rounded-xl font-bold text-xs shadow-sm transition-all flex items-center justify-center gap-1 disabled:opacity-50"
                  >
                    <span className="material-symbols-outlined text-[16px]">cancel</span>
                    Rechazar
                  </button>
                </div>
              ) : sale.status === 'approved' ? (
                <div className="w-full py-2 rounded-xl text-xs font-bold text-emerald-800 bg-emerald-500/10 border border-emerald-300/80 flex items-center justify-center gap-1.5">
                  <span className="material-symbols-outlined text-[16px] text-emerald-600">
                    mark_email_read
                  </span>
                  Despachado al Correo
                </div>
              ) : (
                <div className="w-full py-1.5 rounded-xl text-xs font-bold text-rose-600 bg-rose-50 border border-rose-200 text-center">
                  Boletos Liberados
                </div>
              )}
            </div>
          ))
        ) : (
          <div className="bg-surface-container-lowest p-8 rounded-2xl text-center text-on-surface-variant shadow-sm border border-outline-variant/30">
            No se encontraron órdenes registradas.
          </div>
        )}
      </div>

      {/* 🖥️ 2. VISTA ESCRITORIO: TABLA COMPLETA (hidden md:block) */}
      <div className="hidden md:block bg-surface-container-lowest rounded-2xl shadow-sm border border-outline-variant/30 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[900px]">
            <thead>
              <tr className="bg-surface-container-low border-b border-outline-variant/30 text-on-surface-variant text-[11px] font-extrabold uppercase tracking-wider">
                <th className="py-3.5 px-4">Orden & Fecha</th>
                <th className="py-3.5 px-4">Cliente Registrado</th>
                <th className="py-3.5 px-4">Rifa</th>
                <th className="py-3.5 px-4">Boletos Asignados</th>
                <th className="py-3.5 px-4">Comprobante & Pago</th>
                <th className="py-3.5 px-4 text-center">Estado</th>
                <th className="py-3.5 px-4 text-center">Acciones de Verificación</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/20 text-sm">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-primary font-bold">
                    Cargando ventas y comprobantes desde Supabase...
                  </td>
                </tr>
              ) : filteredSales.length > 0 ? (
                filteredSales.map((sale) => (
                  <tr key={sale.id} className="hover:bg-surface-container/60 transition-colors">
                    {/* 1. Orden y Fecha */}
                    <td className="py-4 px-4 font-medium text-primary">
                      <div className="font-extrabold text-sm text-primary tracking-wide">{sale.orderNumber}</div>
                      <div className="text-[11px] text-on-surface-variant mt-0.5">{sale.date}</div>
                    </td>

                    {/* 2. Cliente */}
                    <td className="py-4 px-4">
                      <div className="font-bold text-primary">{sale.customerName}</div>
                      <div className="text-xs text-on-surface-variant font-mono mt-0.5">{sale.customerPhone}</div>
                      <div className="text-xs text-primary/80 truncate max-w-[180px]">{sale.customerEmail}</div>
                    </td>

                    {/* 3. Rifa */}
                    <td className="py-4 px-4 font-semibold text-primary">
                      <span className="line-clamp-2 max-w-[160px]">{sale.raffleName}</span>
                    </td>

                    {/* 4. Boletos */}
                    <td className="py-4 px-4">
                      <div className="flex flex-wrap gap-1 max-w-[200px]">
                        {sale.numbers.map((num) => (
                          <span
                            key={num}
                            className={`px-2 py-0.5 font-mono text-xs rounded-md font-extrabold border ${
                              sale.status === 'approved'
                                ? 'bg-secondary-container text-on-secondary-container border-secondary-fixed-dim/30'
                                : 'bg-amber-500/10 text-amber-700 border-amber-500/30'
                            }`}
                          >
                            #{num}
                          </span>
                        ))}
                      </div>
                    </td>

                    {/* 5. Comprobante & Pago */}
                    <td className="py-4 px-4">
                      <div className="font-extrabold text-primary text-sm">${sale.total.toLocaleString('es-CO')} COP</div>
                      <div className="text-[11px] text-on-surface-variant mb-1.5">{sale.paymentMethod}</div>
                      {sale.proofUrl ? (
                        <button
                          type="button"
                          onClick={() => setSelectedProof({ url: sale.proofUrl!, order: sale.orderNumber, customer: sale.customerName })}
                          className="px-2.5 py-1 bg-primary/10 hover:bg-primary text-primary hover:text-on-primary rounded-lg text-xs font-bold transition-all inline-flex items-center gap-1 shadow-sm border border-primary/20"
                        >
                          <span className="material-symbols-outlined text-[14px]">receipt_long</span>
                          Ver Comprobante
                        </button>
                      ) : (
                        <span className="text-[11px] text-on-surface-variant/70 italic">Sin comprobante</span>
                      )}
                    </td>

                    {/* 6. Estado */}
                    <td className="py-4 px-4 text-center">
                      {sale.status === 'approved' ? (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-extrabold bg-emerald-50 text-emerald-700 border border-emerald-300 shadow-sm whitespace-nowrap">
                          <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                          Aprobado
                        </span>
                      ) : sale.status === 'pending' ? (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-extrabold bg-amber-50 text-amber-800 border border-amber-300 shadow-sm whitespace-nowrap">
                          <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                          </span>
                          Pendiente
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-extrabold bg-rose-50 text-rose-700 border border-rose-300 shadow-sm whitespace-nowrap">
                          <span className="w-2 h-2 rounded-full bg-rose-500"></span>
                          Rechazado
                        </span>
                      )}
                    </td>

                    {/* 7. Acciones */}
                    <td className="py-4 px-4 text-center">
                      {sale.status === 'pending' ? (
                        <div className="flex items-center justify-center gap-2 whitespace-nowrap">
                          <button
                            disabled={actionLoadingId === sale.id}
                            onClick={() => handleApproveOrder(sale.id)}
                            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold text-xs shadow hover:shadow-md transition-all flex items-center gap-1 disabled:opacity-50 active:scale-95"
                          >
                            <span className="material-symbols-outlined text-[15px]">check_circle</span>
                            Aprobar
                          </button>
                          <button
                            disabled={actionLoadingId === sale.id}
                            onClick={() => handleRejectOrder(sale.id)}
                            className="px-2.5 py-1.5 bg-white text-rose-600 border border-rose-300 hover:bg-rose-50 rounded-lg font-bold text-xs shadow-sm transition-all flex items-center gap-1 disabled:opacity-50"
                          >
                            <span className="material-symbols-outlined text-[15px]">cancel</span>
                            Rechazar
                          </button>
                        </div>
                      ) : sale.status === 'approved' ? (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-emerald-800 bg-emerald-500/10 border border-emerald-300/80 shadow-sm whitespace-nowrap">
                          <span className="material-symbols-outlined text-[15px] text-emerald-600">mark_email_read</span>
                          Despachado al Correo
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold text-rose-600 bg-rose-50 border border-rose-200 whitespace-nowrap">
                          Boletos Liberados
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-on-surface-variant">
                    No se encontraron órdenes registradas.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL VISOR DE COMPROBANTE DE PAGO (100% RESPONSIVE PARA MÓVILES) */}
      {selectedProof && (
        <div className="fixed inset-0 z-[120] bg-black/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
          <div className="bg-surface-container-lowest rounded-2xl max-w-2xl w-full p-4 sm:p-6 shadow-2xl border border-outline-variant/30 space-y-4 animate-in zoom-in-95 max-h-[92vh] flex flex-col">
            <div className="flex justify-between items-center border-b border-outline-variant/20 pb-3 flex-shrink-0">
              <div>
                <h3 className="font-headline-md text-base sm:text-lg font-bold text-primary">
                  Comprobante de Pago
                </h3>
                <p className="text-xs text-on-surface-variant">
                  Orden: <strong>{selectedProof.order}</strong> • Cliente: <strong>{selectedProof.customer}</strong>
                </p>
              </div>
              <button
                onClick={() => setSelectedProof(null)}
                className="p-1.5 rounded-full text-on-surface-variant hover:text-primary hover:bg-surface-container"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto rounded-xl border border-outline-variant/30 bg-surface-container-low p-2 flex items-center justify-center min-h-[300px]">
              {selectedProof.url.toLowerCase().includes('.pdf') || selectedProof.url.startsWith('data:application/pdf') ? (
                <iframe
                  src={selectedProof.url}
                  title="Comprobante PDF"
                  className="w-full h-[55vh] rounded-lg border border-outline-variant/40 bg-white"
                />
              ) : (
                /* eslint-disable-next-html-element-suppression */
                <img
                  src={selectedProof.url}
                  alt="Comprobante de Transferencia"
                  className="max-h-[55vh] w-auto object-contain rounded-lg shadow-sm"
                />
              )}
            </div>

            <div className="flex flex-col sm:flex-row justify-between items-center gap-2 pt-2 border-t border-outline-variant/20 flex-shrink-0">
              <a
                href={selectedProof.url}
                target="_blank"
                rel="noreferrer"
                className="text-xs font-bold text-primary hover:underline flex items-center gap-1"
              >
                <span className="material-symbols-outlined text-[16px]">open_in_new</span>
                Abrir en Pantalla Completa
              </a>
              <button
                onClick={() => setSelectedProof(null)}
                className="w-full sm:w-auto px-5 py-2 bg-primary text-on-primary rounded-xl font-bold text-xs"
              >
                Cerrar Visor
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
