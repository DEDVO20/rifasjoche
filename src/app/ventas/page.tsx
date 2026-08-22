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
          profiles (full_name, phone, email),
          raffles (name),
          payments (provider, payment_method, status, metadata)
        `)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error cargando órdenes de venta:', error);
        setSales([]);
        return;
      }

      if (data && data.length > 0) {
        // Cargar boletos asociados a estas órdenes
        const orderIds = data.map((o: any) => o.id);
        const { data: ticketsData } = await supabase
          .from('raffle_numbers')
          .select('order_id, number')
          .in('order_id', orderIds);

        const ticketsMap = new Map<number, string[]>();
        (ticketsData || []).forEach((t: any) => {
          const list = ticketsMap.get(t.order_id) || [];
          list.push(t.number);
          ticketsMap.set(t.order_id, list);
        });

        // Obtener comprobantes desde audit_logs y metadata
        const orderIdsStr = data.map((o: any) => o.id.toString());
        const { data: auditData } = await supabase
          .from('audit_logs')
          .select('entity_id, details')
          .in('entity_id', orderIdsStr);

        const auditMap = new Map<string, any>();
        (auditData || []).forEach((a: any) => {
          if (a.details) {
            auditMap.set(String(a.entity_id), a.details);
          }
        });

        const formatted: OrderSale[] = data.map((item: any) => {
          const numbersList = ticketsMap.get(item.id) || [];
          const meta = item.payments?.[0]?.metadata;
          const aDetails = auditMap.get(String(item.id));

          const cName = meta?.customer_name || aDetails?.customer_name || item.profiles?.full_name || 'Cliente Registrado';
          const cPhone = meta?.customer_phone || aDetails?.customer_phone || item.profiles?.phone || 'No registrado';
          const cEmail = meta?.customer_email || aDetails?.customer_email || item.profiles?.email || 'No registrado';
          const proof = meta?.proof_url || aDetails?.proof_url;

          return {
            id: item.id.toString(),
            orderNumber: item.order_number || `ORD-${item.id}`,
            customerName: cName,
            customerPhone: cPhone,
            customerEmail: cEmail,
            raffleName: item.raffles?.name || 'Rifa Activa',
            numbers: numbersList.length > 0 ? numbersList : ['Asignado'],
            total: Number(item.total) || 0,
            paymentMethod: item.payments?.[0]?.provider === 'transfiya_nequi' ? 'Transferencia (Llave 3146676688)' : 'Nequi / PSE',
            proofUrl: proof || undefined,
            status: item.payment_status === 'approved' || item.status === 'confirmed' ? 'approved' : item.payment_status === 'rejected' || item.status === 'cancelled' ? 'rejected' : 'pending',
            date: new Date(item.created_at).toLocaleString('es-CO', {
              dateStyle: 'short',
              timeStyle: 'short',
            }),
          };
        });

        setSales(formatted);
      } else {
        setSales([]);
      }
    } catch (err) {
      console.error('Excepción al cargar ventas:', err);
      setSales([]);
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

  const approvedCount = sales.filter((s) => s.status === 'approved').length;
  const pendingCount = sales.filter((s) => s.status === 'pending').length;

  return (
    <div className="space-y-6">
      {/* Header Ejecutivo */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-surface-container-lowest p-6 rounded-2xl border border-outline-variant/30 shadow-sm">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="font-display-lg text-[28px] md:text-[34px] font-extrabold text-primary tracking-tight">
              Ventas y Transacciones
            </h1>
            <span
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-extrabold ${
                isRealtime
                  ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20'
                  : 'bg-amber-500/10 text-amber-600'
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${isRealtime ? 'bg-emerald-500' : 'bg-amber-500 animate-ping'}`}></span>
              {isRealtime ? 'En Vivo Supabase' : 'Conectando'}
            </span>
          </div>
          <p className="font-body-md text-sm text-on-surface-variant mt-1">
            Gestión de pagos, verificación de comprobantes y auditoría de ventas en tiempo real.
          </p>
        </div>
        <button
          onClick={() => loadSalesData()}
          className="bg-primary hover:bg-primary-container text-on-primary px-5 py-2.5 rounded-xl font-bold text-sm shadow-sm hover:shadow transition-all flex items-center gap-2 active:scale-95"
        >
          <span className={`material-symbols-outlined text-[18px] ${isLoading ? 'animate-spin' : ''}`}>
            refresh
          </span>
          Actualizar
        </button>
      </div>

      {/* Tarjetas de Métricas de Ventas */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-surface-container-lowest p-5 rounded-2xl shadow-sm border border-outline-variant/30 space-y-2">
          <div className="flex justify-between items-center text-on-surface-variant text-xs font-bold uppercase tracking-wider">
            <span>Total Recaudado</span>
            <span className="material-symbols-outlined text-emerald-600 text-[20px]">payments</span>
          </div>
          <div className="text-2xl font-extrabold text-primary">
            ${totalRevenueSum.toLocaleString('es-CO')} COP
          </div>
          <div className="text-xs text-emerald-600 font-semibold flex items-center gap-1">
            <span className="material-symbols-outlined text-[14px]">check_circle</span>
            Pagos aprobados en DB
          </div>
        </div>

        <div className="bg-surface-container-lowest p-5 rounded-2xl shadow-sm border border-outline-variant/30 space-y-2">
          <div className="flex justify-between items-center text-on-surface-variant text-xs font-bold uppercase tracking-wider">
            <span>Órdenes Aprobadas</span>
            <span className="material-symbols-outlined text-emerald-600 text-[20px]">verified</span>
          </div>
          <div className="text-2xl font-extrabold text-primary">
            {approvedCount}
          </div>
          <div className="text-xs text-on-surface-variant">
            Boletos confirmados
          </div>
        </div>

        <div className="bg-surface-container-lowest p-5 rounded-2xl shadow-sm border border-amber-500/30 space-y-2 bg-amber-500/[0.02]">
          <div className="flex justify-between items-center text-amber-700 text-xs font-bold uppercase tracking-wider">
            <span>Pendientes de Revisión</span>
            <span className="material-symbols-outlined text-amber-600 text-[20px]">pending_actions</span>
          </div>
          <div className="text-2xl font-extrabold text-amber-700">
            {pendingCount}
          </div>
          <div className="text-xs text-amber-600 font-bold flex items-center gap-1">
            <span className="material-symbols-outlined text-[14px]">warning</span>
            Comprobantes por verificar
          </div>
        </div>

        <div className="bg-surface-container-lowest p-5 rounded-2xl shadow-sm border border-outline-variant/30 space-y-2">
          <div className="flex justify-between items-center text-on-surface-variant text-xs font-bold uppercase tracking-wider">
            <span>Total de Órdenes</span>
            <span className="material-symbols-outlined text-primary text-[20px]">receipt_long</span>
          </div>
          <div className="text-2xl font-extrabold text-primary">
            {sales.length}
          </div>
          <div className="text-xs text-on-surface-variant">
            Transacciones registradas
          </div>
        </div>
      </div>

      {/* Filtros y Buscador */}
      <div className="flex flex-col sm:flex-row gap-3 bg-surface-container-lowest p-4 rounded-2xl shadow-sm border border-outline-variant/30">
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
            className="px-4 py-2 border border-outline-variant rounded-xl bg-surface-container-lowest focus:ring-2 focus:ring-primary text-sm font-bold"
          >
            <option value="all">Todos los estados ({sales.length})</option>
            <option value="pending">⚠️ Pendientes ({pendingCount})</option>
            <option value="approved">✅ Aprobadas ({approvedCount})</option>
            <option value="rejected">❌ Rechazadas</option>
          </select>
        </div>
      </div>

      {/* Tabla de Ventas y Verificación */}
      <div className="bg-surface-container-lowest rounded-2xl shadow-sm border border-outline-variant/30 overflow-hidden">
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
                            className={`px-2 py-0.5 font-raffle-number text-xs rounded-md font-extrabold border ${
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

                    {/* 6. Estado (Badge Limpio y Sin Deformaciones) */}
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

                    {/* 7. Acciones de Verificación */}
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

      {/* MODAL VISOR DE COMPROBANTE DE PAGO */}
      {selectedProof && (
        <div className="fixed inset-0 z-[120] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-surface-container-lowest rounded-2xl max-w-2xl w-full p-6 shadow-2xl border border-outline-variant/30 space-y-4 animate-in zoom-in-95">
            <div className="flex justify-between items-center border-b border-outline-variant/20 pb-3">
              <div>
                <h3 className="font-headline-md text-headline-md font-bold text-primary">
                  Comprobante de Pago
                </h3>
                <p className="text-xs text-on-surface-variant">
                  Orden: <strong>{selectedProof.order}</strong> • Cliente: <strong>{selectedProof.customer}</strong>
                </p>
              </div>
              <button
                onClick={() => setSelectedProof(null)}
                className="p-1 rounded-full text-on-surface-variant hover:text-primary"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <div className="max-h-[60vh] overflow-y-auto rounded-xl border border-outline-variant/30 bg-surface-container-low p-2 flex items-center justify-center">
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

            <div className="flex justify-between items-center pt-2">
              <a
                href={selectedProof.url}
                target="_blank"
                rel="noreferrer"
                className="text-xs font-bold text-primary hover:underline flex items-center gap-1"
              >
                <span className="material-symbols-outlined text-[16px]">open_in_new</span>
                Abrir Archivo en Pantalla Completa
              </a>
              <button
                onClick={() => setSelectedProof(null)}
                className="px-4 py-2 bg-primary text-on-primary rounded-xl font-bold text-xs"
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
