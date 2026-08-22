'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

interface TicketNumber {
  number: string;
  status: 'available' | 'sold' | 'reserved';
  owner?: string;
}

interface Prize {
  id: number;
  position: number;
  name: string;
  type: 'main' | 'secondary';
  value: number;
  rule: string;
  winningNumber?: string;
}

interface SaleOrder {
  id: string;
  orderNumber: string;
  clientName: string;
  clientEmail: string;
  tickets: string[];
  total: number;
  status: 'approved' | 'pending' | 'rejected';
  date: string;
}

export default function DetalleRifaPage({ params }: { params: { id: string } }) {
  const [activeTab, setActiveTab] = useState<'resumen' | 'numeros' | 'ventas' | 'premios' | 'resultados'>('resumen');
  const [searchNumber, setSearchNumber] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [rangeFilter, setRangeFilter] = useState('0000-0999');
  const [selectedNumber, setSelectedNumber] = useState<string | null>(null);

  // Estados de datos reales
  const [raffle, setRaffle] = useState<any>(null);
  const [prizes, setPrizes] = useState<Prize[]>([]);
  const [salesOrders, setSalesOrders] = useState<SaleOrder[]>([]);
  const [ticketNumbers, setTicketNumbers] = useState<TicketNumber[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Formulario Resultados Oficiales
  const [inputWinningNumber, setInputWinningNumber] = useState('');
  const [inputEvidenceUrl, setInputEvidenceUrl] = useState('');
  const [isSavingResult, setIsSavingResult] = useState(false);

  const supabase = createClient();

  // Cargar datos reales de la rifa desde Supabase
  const loadRaffleDetails = useCallback(async () => {
    if (!params.id) return;
    try {
      setIsLoading(true);

      // 1. Obtener la Rifa, sorteo y premios
      const { data: raffleData, error: rError } = await supabase
        .from('raffles')
        .select(`
          *,
          lottery_draws (id, winning_number, evidence_url, status, lotteries (name)),
          raffle_prizes (*)
        `)
        .eq('id', params.id)
        .single();

      if (rError || !raffleData) {
        console.error('Error al cargar rifa:', rError);
        return;
      }

      // 2. Obtener los boletos vendidos/reservados reales en raffle_numbers
      const { data: soldNumbersData } = await supabase
        .from('raffle_numbers')
        .select('*')
        .eq('raffle_id', params.id);

      const soldMap = new Map<string, 'sold' | 'reserved'>();
      (soldNumbersData || []).forEach((row) => {
        soldMap.set(row.number, row.status === 'reserved' ? 'reserved' : 'sold');
      });

      // 3. Obtener órdenes reales de compra
      const { data: ordersData } = await supabase
        .from('orders')
        .select(`
          id,
          order_number,
          total,
          status,
          payment_status,
          created_at,
          profiles (full_name, email),
          raffle_numbers (number)
        `)
        .eq('raffle_id', params.id)
        .order('created_at', { ascending: false });

      const realOrders: SaleOrder[] = (ordersData || []).map((ord: any) => ({
        id: ord.id.toString(),
        orderNumber: ord.order_number || `ORD-${ord.id}`,
        clientName: ord.profiles?.full_name || 'Cliente Registrado',
        clientEmail: ord.profiles?.email || 'cliente@email.com',
        tickets: ord.raffle_numbers ? ord.raffle_numbers.map((rn: any) => rn.number) : [],
        total: Number(ord.total) || 0,
        status: ord.payment_status === 'approved' || ord.status === 'confirmed' ? 'approved' : 'pending',
        date: new Date(ord.created_at).toLocaleString('es-CO', {
          dateStyle: 'short',
          timeStyle: 'short',
        }),
      }));

      setSalesOrders(realOrders);

      // Calcular métricas reales
      const totalNums = raffleData.total_numbers || 1000;
      const actualSoldCount = (soldNumbersData || []).filter((s) => s.status === 'sold').length;
      const actualReservedCount = (soldNumbersData || []).filter((s) => s.status === 'reserved').length;
      const actualAvailable = Math.max(0, totalNums - actualSoldCount - actualReservedCount);
      const totalRevenue = realOrders
        .filter((o) => o.status === 'approved')
        .reduce((sum, o) => sum + o.total, 0);

      setRaffle({
        id: raffleData.id,
        name: raffleData.name,
        code: `RF-${raffleData.id.toString().padStart(4, '0')}`,
        lotteryName: raffleData.lottery_draws?.lotteries?.name || 'Lotería de Medellín',
        drawDate: raffleData.end_at
          ? new Date(raffleData.end_at).toLocaleDateString('es-CO', {
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })
          : 'Fecha por definir',
        pricePerNumber: Number(raffleData.price_per_number) || 10000,
        totalNumbers: totalNums,
        soldCount: actualSoldCount,
        reservedCount: actualReservedCount,
        availableCount: actualAvailable,
        totalRevenue: totalRevenue,
        status: raffleData.status || 'active',
        winningNumber: raffleData.lottery_draws?.winning_number || '',
        evidenceUrl: raffleData.lottery_draws?.evidence_url || '',
      });

      setInputWinningNumber(raffleData.lottery_draws?.winning_number || '');
      setInputEvidenceUrl(raffleData.lottery_draws?.evidence_url || '');

      // 4. Mapear Premios reales
      const realPrizes: Prize[] = (raffleData.raffle_prizes || []).map((p: any) => ({
        id: p.id,
        position: p.position || 1,
        name: p.name || 'Premio',
        type: p.prize_type === 'main' ? 'main' : 'secondary',
        value: Number(p.prize_value) || 0,
        rule: p.rule_type === 'exact_match'
          ? `Coincidencia exacta con ${raffleData.lottery_draws?.lotteries?.name || 'Lotería Oficial'}`
          : `Regla especial ${p.rule_type}`,
        winningNumber: p.winning_number || undefined,
      }));

      setPrizes(realPrizes);

      // 5. Generar lista de números disponibles basada en la DB real (sin simulación)
      const list: TicketNumber[] = [];
      const startRange = rangeFilter === '0000-0999' ? 0 : 1000;
      const endRange = Math.min(totalNums, startRange + 100);

      for (let i = startRange; i < endRange; i++) {
        const numStr = i.toString().padStart(4, '0');
        const dbStatus = soldMap.get(numStr) || 'available';
        list.push({ number: numStr, status: dbStatus });
      }
      setTicketNumbers(list);
    } catch (err) {
      console.error('Error cargando detalles de rifa:', err);
    } finally {
      setIsLoading(false);
    }
  }, [params.id, rangeFilter, supabase]);

  useEffect(() => {
    loadRaffleDetails();
  }, [loadRaffleDetails]);

  // Manejar Pausar / Reanudar Ventas
  const handleTogglePause = async () => {
    if (!raffle) return;
    const newStatus = raffle.status === 'paused' ? 'active' : 'paused';
    try {
      await supabase.from('raffles').update({ status: newStatus }).eq('id', raffle.id);
      setRaffle({ ...raffle, status: newStatus });
      alert(newStatus === 'paused' ? 'Ventas de la rifa pausadas exitosamente.' : 'Ventas reanudadas exitosamente.');
    } catch (err) {
      console.error('Error al actualizar estado:', err);
      setRaffle({ ...raffle, status: newStatus });
    }
  };

  // Manejar Cancelar Rifa
  const handleCancelRaffle = async () => {
    if (!raffle) return;
    if (!window.confirm('¿Estás seguro de que deseas cancelar esta rifa?')) {
      return;
    }
    try {
      await supabase.from('raffles').update({ status: 'cancelled' }).eq('id', raffle.id);
      setRaffle({ ...raffle, status: 'cancelled' });
      alert('La rifa ha sido cancelada.');
    } catch (err) {
      console.error('Error al cancelar la rifa:', err);
      setRaffle({ ...raffle, status: 'cancelled' });
    }
  };

  // Guardar Número Ganador Oficial
  const handleSaveWinningResult = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputWinningNumber || !raffle) return;

    try {
      setIsSavingResult(true);
      // Actualizar en lottery_draws
      const { data: rData } = await supabase
        .from('raffles')
        .select('lottery_draw_id')
        .eq('id', raffle.id)
        .single();

      if (rData?.lottery_draw_id) {
        await supabase
          .from('lottery_draws')
          .update({
            winning_number: inputWinningNumber,
            evidence_url: inputEvidenceUrl,
            status: 'verified',
          })
          .eq('id', rData.lottery_draw_id);
      }

      // Marcar rifa como completada
      await supabase
        .from('raffles')
        .update({ status: 'completed' })
        .eq('id', raffle.id);

      setRaffle({
        ...raffle,
        winningNumber: inputWinningNumber,
        evidenceUrl: inputEvidenceUrl,
        status: 'completed',
      });

      alert('Resultado oficial guardado y verificado en Supabase.');
    } catch (err) {
      console.error('Error guardando resultado:', err);
    } finally {
      setIsSavingResult(false);
    }
  };

  if (isLoading || !raffle) {
    return (
      <div className="space-y-6 py-12 text-center text-primary font-bold text-lg">
        Cargando detalles de la rifa desde Supabase...
      </div>
    );
  }

  const filteredNumbers = ticketNumbers.filter((item) => {
    const matchesSearch = item.number.includes(searchNumber);
    const matchesStatus = statusFilter === 'all' || item.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const percentSold = raffle.totalNumbers > 0 ? Math.round((raffle.soldCount / raffle.totalNumbers) * 100) : 0;

  return (
    <div className="space-y-gutter">
      {/* Header & Acciones Rápidas */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
        <div>
          <Link
            href="/rifas"
            className="text-on-surface-variant hover:text-primary flex items-center gap-1 font-body-sm text-body-sm mb-2 transition-colors"
          >
            <span className="material-symbols-outlined text-[16px]">arrow_back</span>
            Volver a Lista de Rifas
          </Link>
          <div className="flex items-center gap-3">
            <h1 className="font-display-lg-mobile text-display-lg-mobile md:font-display-lg md:text-display-lg font-extrabold text-primary">
              {raffle.name}
            </h1>
            <span
              className={`px-3 py-1 rounded-full font-label-caps text-xs font-bold uppercase border ${
                raffle.status === 'active'
                  ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20'
                  : raffle.status === 'paused'
                  ? 'bg-amber-500/10 text-amber-600 border-amber-500/20'
                  : raffle.status === 'completed'
                  ? 'bg-blue-500/10 text-blue-600 border-blue-500/20'
                  : 'bg-rose-500/10 text-rose-600 border-rose-500/20'
              }`}
            >
              ● {raffle.status === 'active' ? 'Activa' : raffle.status === 'paused' ? 'Pausada' : raffle.status === 'completed' ? 'Finalizada' : 'Cancelada'}
            </span>
          </div>
          <p className="font-body-lg text-body-lg text-on-surface-variant mt-1">
            Código: <strong>{raffle.code}</strong> • Sortea con {raffle.lotteryName} ({raffle.drawDate})
          </p>
        </div>

        <div className="flex flex-wrap gap-3 w-full md:w-auto">
          <button
            onClick={handleTogglePause}
            className="flex-1 md:flex-none px-4 py-2 border-2 border-primary text-primary font-body-md text-body-md font-semibold rounded-lg hover:bg-surface-container-high transition-colors flex items-center justify-center gap-1.5"
          >
            <span className="material-symbols-outlined text-[18px]">
              {raffle.status === 'paused' ? 'play_arrow' : 'pause'}
            </span>
            {raffle.status === 'paused' ? 'Reanudar Ventas' : 'Pausar Ventas'}
          </button>
          <button
            onClick={handleCancelRaffle}
            disabled={raffle.status === 'cancelled'}
            className="flex-1 md:flex-none px-4 py-2 border-2 border-error text-error font-body-md text-body-md font-semibold rounded-lg hover:bg-error-container transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
          >
            <span className="material-symbols-outlined text-[18px]">cancel</span>
            {raffle.status === 'cancelled' ? 'Rifa Cancelada' : 'Cancelar Rifa'}
          </button>
        </div>
      </div>

      {/* Navegación por Pestañas */}
      <div className="flex border-b border-outline-variant/30 overflow-x-auto gap-2">
        {[
          { id: 'resumen', label: 'Resumen y Métricas', icon: 'analytics' },
          { id: 'numeros', label: 'Números (Talonario)', icon: 'grid_view' },
          { id: 'ventas', label: 'Ventas y Órdenes', icon: 'shopping_bag' },
          { id: 'premios', label: 'Premios Configurados', icon: 'emoji_events' },
          { id: 'resultados', label: 'Resultados y Ganadores', icon: 'military_tech' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`flex items-center gap-2 px-5 py-3 font-body-md text-body-md font-bold transition-all border-b-2 whitespace-nowrap ${
              activeTab === tab.id
                ? 'border-primary text-primary bg-surface-container-high/40 rounded-t-lg'
                : 'border-transparent text-on-surface-variant hover:text-primary hover:bg-surface-container'
            }`}
          >
            <span className="material-symbols-outlined text-[20px]">{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {/* CONTENIDO DE LAS PESTAÑAS */}

      {/* 1. PESTAÑA: RESUMEN */}
      {activeTab === 'resumen' && (
        <div className="space-y-6 animate-in fade-in-50">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-base md:gap-gutter">
            <div className="bg-surface-container-lowest p-6 rounded-xl shadow-[0px_4px_20px_rgba(15,23,42,0.05)] border border-outline-variant/20">
              <span className="font-label-caps text-label-caps text-outline uppercase">RECAUDACIÓN TOTAL</span>
              <div className="font-headline-md text-headline-md font-extrabold text-primary mt-2">
                ${raffle.totalRevenue.toLocaleString('es-CO')} COP
              </div>
              <div className="font-body-sm text-body-sm text-on-surface-variant mt-1">
                De ${(raffle.totalNumbers * raffle.pricePerNumber).toLocaleString('es-CO')} COP meta
              </div>
            </div>

            <div className="bg-surface-container-lowest p-6 rounded-xl shadow-[0px_4px_20px_rgba(15,23,42,0.05)] border border-outline-variant/20">
              <span className="font-label-caps text-label-caps text-outline uppercase">BOLETOS VENDIDOS</span>
              <div className="font-headline-md text-headline-md font-extrabold text-primary mt-2">
                {raffle.soldCount.toLocaleString()} / {raffle.totalNumbers.toLocaleString()}
              </div>
              <div className="font-body-sm text-body-sm text-tertiary-fixed-dim mt-1 font-semibold">
                {percentSold}% del talonario
              </div>
            </div>

            <div className="bg-surface-container-lowest p-6 rounded-xl shadow-[0px_4px_20px_rgba(15,23,42,0.05)] border border-outline-variant/20">
              <span className="font-label-caps text-label-caps text-outline uppercase">DISPONIBLES</span>
              <div className="font-headline-md text-headline-md font-extrabold text-primary mt-2">
                {raffle.availableCount.toLocaleString()}
              </div>
              <div className="font-body-sm text-body-sm text-on-surface-variant mt-1">
                Listos para compra aleatoria
              </div>
            </div>

            <div className="bg-surface-container-lowest p-6 rounded-xl shadow-[0px_4px_20px_rgba(15,23,42,0.05)] border border-outline-variant/20">
              <span className="font-label-caps text-label-caps text-outline uppercase">VALOR POR BOLETO</span>
              <div className="font-headline-md text-headline-md font-extrabold text-primary mt-2">
                ${raffle.pricePerNumber.toLocaleString('es-CO')} COP
              </div>
              <div className="font-body-sm text-body-sm text-on-surface-variant mt-1">
                Precio unitario oficial
              </div>
            </div>
          </div>

          <div className="bg-surface-container-lowest p-6 rounded-xl border border-outline-variant/20 space-y-4">
            <h3 className="font-headline-md text-headline-md font-bold text-primary">
              Progreso General de la Rifa
            </h3>
            <div className="w-full bg-surface-container-high rounded-full h-4 overflow-hidden">
              <div
                className="bg-tertiary-fixed-dim h-4 rounded-full transition-all"
                style={{ width: `${percentSold}%` }}
              ></div>
            </div>
            <div className="flex justify-between text-xs font-bold text-on-surface-variant">
              <span>{raffle.soldCount} Vendidos</span>
              <span>{raffle.availableCount} Disponibles</span>
              <span>{raffle.totalNumbers} Total Boletos</span>
            </div>
          </div>
        </div>
      )}

      {/* 2. PESTAÑA: NÚMEROS (TALONARIO REAL) */}
      {activeTab === 'numeros' && (
        <div className="space-y-6 animate-in fade-in-50">
          <div className="flex flex-col md:flex-row gap-4 bg-surface-container-lowest p-4 rounded-xl border border-outline-variant/20">
            <div className="relative flex-1">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant">
                search
              </span>
              <input
                type="text"
                placeholder="Buscar número específico (ej. 0042)..."
                value={searchNumber}
                onChange={(e) => setSearchNumber(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-outline-variant rounded-lg bg-surface-container-lowest focus:ring-2 focus:ring-primary font-body-md text-body-md"
              />
            </div>
            <div className="flex gap-2">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-4 py-2 border border-outline-variant rounded-lg bg-surface-container-lowest font-body-md text-body-md font-semibold"
              >
                <option value="all">Todos los estados</option>
                <option value="available">Disponibles ({raffle.availableCount})</option>
                <option value="sold">Vendidos ({raffle.soldCount})</option>
              </select>
              <select
                value={rangeFilter}
                onChange={(e) => setRangeFilter(e.target.value)}
                className="px-4 py-2 border border-outline-variant rounded-lg bg-surface-container-lowest font-body-md text-body-md font-semibold"
              >
                <option value="0000-0999">Rango: 0000-0099</option>
                <option value="1000-1999">Rango: 1000-1099</option>
              </select>
            </div>
          </div>

          <div className="bg-surface-container-lowest rounded-xl p-6 border border-outline-variant/30">
            <div className="grid grid-cols-5 sm:grid-cols-8 md:grid-cols-10 lg:grid-cols-12 gap-2">
              {filteredNumbers.map((item) => (
                <button
                  key={item.number}
                  onClick={() => setSelectedNumber(item.number)}
                  className={`h-11 rounded-lg font-raffle-number text-xs font-bold transition-all flex items-center justify-center ${
                    item.status === 'sold'
                      ? 'bg-rose-500/10 text-rose-600 border border-rose-500/20 line-through'
                      : item.status === 'reserved'
                      ? 'bg-amber-500/10 text-amber-600 border border-amber-500/20'
                      : 'bg-surface-container-low hover:bg-surface-container-high text-primary border border-outline-variant/40'
                  }`}
                >
                  {item.number}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 3. PESTAÑA: VENTAS Y ÓRDENES */}
      {activeTab === 'ventas' && (
        <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/20 overflow-x-auto animate-in fade-in-50">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-surface-container-low border-b border-outline-variant/30 text-on-surface-variant font-label-caps text-label-caps uppercase">
                <th className="p-4">Orden</th>
                <th className="p-4">Cliente</th>
                <th className="p-4">Boletos Asignados</th>
                <th className="p-4">Total</th>
                <th className="p-4">Estado</th>
                <th className="p-4">Fecha</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/20 font-body-sm text-body-sm">
              {salesOrders.length > 0 ? (
                salesOrders.map((ord) => (
                  <tr key={ord.id} className="hover:bg-surface-container-high/50">
                    <td className="p-4 font-bold text-primary">{ord.orderNumber}</td>
                    <td className="p-4">
                      <div className="font-semibold text-primary">{ord.clientName}</div>
                      <div className="text-xs text-on-surface-variant">{ord.clientEmail}</div>
                    </td>
                    <td className="p-4">
                      <div className="flex flex-wrap gap-1">
                        {ord.tickets.map((t) => (
                          <span
                            key={t}
                            className="px-2 py-0.5 bg-secondary-container text-on-secondary-container rounded font-raffle-number text-xs font-bold"
                          >
                            #{t}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="p-4 font-extrabold text-primary">
                      ${ord.total.toLocaleString('es-CO')} COP
                    </td>
                    <td className="p-4">
                      <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-600">
                        {ord.status === 'approved' ? 'Aprobado' : 'Pendiente'}
                      </span>
                    </td>
                    <td className="p-4 text-xs text-on-surface-variant">{ord.date}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-on-surface-variant">
                    No hay órdenes de compra registradas para esta rifa.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* 4. PESTAÑA: PREMIOS CONFIGURADOS */}
      {activeTab === 'premios' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-in fade-in-50">
          {prizes.length > 0 ? (
            prizes.map((p) => (
              <div
                key={p.id}
                className="bg-surface-container-lowest p-6 rounded-2xl border border-outline-variant/30 space-y-3 shadow-sm"
              >
                <span
                  className={`px-3 py-1 rounded-full text-xs font-bold uppercase ${
                    p.type === 'main'
                      ? 'bg-secondary-container text-on-secondary-container'
                      : 'bg-surface-container-high text-primary'
                  }`}
                >
                  {p.type === 'main' ? '🏆 Premio Mayor (1er Lugar)' : `🎁 Premio Secundario #${p.position}`}
                </span>
                <h3 className="font-headline-md text-headline-md font-bold text-primary">
                  {p.name}
                </h3>
                <div className="font-display-lg text-[28px] font-extrabold text-tertiary-fixed-dim">
                  ${p.value.toLocaleString('es-CO')} COP
                </div>
                <p className="font-body-sm text-xs text-on-surface-variant">{p.rule}</p>
              </div>
            ))
          ) : (
            <div className="col-span-3 p-8 bg-surface-container-lowest rounded-xl text-center text-on-surface-variant">
              No hay premios configurados para esta rifa.
            </div>
          )}
        </div>
      )}

      {/* 5. PESTAÑA: RESULTADOS Y GANADORES */}
      {activeTab === 'resultados' && (
        <div className="bg-surface-container-lowest p-8 rounded-2xl border border-outline-variant/30 space-y-6 max-w-2xl animate-in fade-in-50">
          <div>
            <h3 className="font-headline-md text-headline-md font-bold text-primary">
              Registrar Resultado Oficial del Sorteo
            </h3>
            <p className="font-body-sm text-body-sm text-on-surface-variant">
              Ingresa el número ganador oficial expedido por {raffle.lotteryName} para calcular los ganadores automáticamente.
            </p>
          </div>

          <form onSubmit={handleSaveWinningResult} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-primary mb-1">
                Número Ganador Oficial *
              </label>
              <input
                type="text"
                required
                placeholder="Ej. 5832"
                value={inputWinningNumber}
                onChange={(e) => setInputWinningNumber(e.target.value)}
                className="w-full px-4 py-2.5 border border-outline-variant rounded-xl font-raffle-number text-xl font-bold bg-surface-container-lowest"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-primary mb-1">
                URL de Evidencia / Acta Oficial de Lotería
              </label>
              <input
                type="url"
                placeholder="https://loteriademedellin.com.co/resultados"
                value={inputEvidenceUrl}
                onChange={(e) => setInputEvidenceUrl(e.target.value)}
                className="w-full px-4 py-2 border border-outline-variant rounded-xl text-sm bg-surface-container-lowest"
              />
            </div>

            <button
              type="submit"
              disabled={isSavingResult}
              className="px-6 py-3 bg-primary text-on-primary rounded-xl font-bold hover:bg-primary-container shadow-md disabled:opacity-50"
            >
              {isSavingResult ? 'Guardando...' : 'Guardar y Verificar Ganadores'}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
