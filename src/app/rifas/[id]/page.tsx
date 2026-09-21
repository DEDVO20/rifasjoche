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
  ruleType?: string;
  ruleValue?: string;
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

interface WinnerInfo {
  name: string;
  email: string;
  phone: string;
  number: string;
  orderNumber?: string;
  prizeName: string;
  prizeValue?: number;
  notifiedAt?: string;
  isNotified: boolean;
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

  // Formulario Resultados Oficiales & Bloqueo
  const [inputWinningNumber, setInputWinningNumber] = useState('');
  const [inputEvidenceUrl, setInputEvidenceUrl] = useState('');
  const [isSavingResult, setIsSavingResult] = useState(false);
  const [isResultLocked, setIsResultLocked] = useState(false);

  // Estados de Ganador y Notificación
  const [winnerInfo, setWinnerInfo] = useState<WinnerInfo | null>(null);
  const [isWinnerNotFound, setIsWinnerNotFound] = useState(false);
  const [isNotifyingWinner, setIsNotifyingWinner] = useState(false);
  const [resendingOrderId, setResendingOrderId] = useState<string | null>(null);

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

      // Si la rifa está activa pero tiene por error un sorteo con número ganador de otra rifa, auto-desacoplarla
      if (raffleData.status === 'active' && raffleData.lottery_draws?.winning_number) {
        try {
          const drawDateStr = raffleData.end_at ? raffleData.end_at.split('T')[0] : new Date().toISOString().split('T')[0];
          const uniqueDrawNumber = `SRT-${raffleData.id}-${Date.now().toString().slice(-4)}`;
          const { data: cleanDraw } = await supabase
            .from('lottery_draws')
            .insert({
              lottery_id: raffleData.lottery_draws?.lottery_id || 1,
              draw_number: uniqueDrawNumber,
              draw_date: drawDateStr,
              status: 'scheduled',
              winning_number: null,
            })
            .select('id')
            .single();

          if (cleanDraw) {
            await supabase
              .from('raffles')
              .update({ lottery_draw_id: cleanDraw.id })
              .eq('id', raffleData.id);

            raffleData.lottery_draw_id = cleanDraw.id;
            raffleData.lottery_draws = {
              ...raffleData.lottery_draws,
              id: cleanDraw.id,
              winning_number: null,
              status: 'scheduled',
            };
          }
        } catch (repairErr) {
          console.warn('Error reparando sorteo de rifa:', repairErr);
        }
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

      // 3. Obtener órdenes reales de compra de esta rifa (soporta clientes registrados e invitados)
      const { data: rawOrdersData, error: ordersErr } = await supabase
        .from('orders')
        .select('id, order_number, user_id, raffle_id, total, status, payment_status, created_at')
        .eq('raffle_id', params.id)
        .order('id', { ascending: false });

      if (ordersErr) {
        console.error('Error cargando órdenes de la rifa:', ordersErr);
      }

      let realOrders: SaleOrder[] = [];

      if (rawOrdersData && rawOrdersData.length > 0) {
        const orderIds = rawOrdersData.map((o) => o.id);
        const userIds = Array.from(
          new Set(rawOrdersData.map((o) => o.user_id).filter(Boolean))
        ) as string[];

        const [profilesResult, paymentsResult, numbersResult] = await Promise.all([
          userIds.length
            ? supabase.from('profiles').select('id, full_name, email, phone').in('id', userIds)
            : Promise.resolve({ data: [], error: null }),
          supabase.from('payments').select('order_id, provider, metadata, status').in('order_id', orderIds),
          supabase.from('raffle_numbers').select('order_id, number').in('order_id', orderIds).order('number', { ascending: true }),
        ]);

        const profilesById = new Map((profilesResult.data || []).map((p: any) => [p.id, p]));
        const paymentsByOrderId = new Map<number, any>();
        (paymentsResult.data || []).forEach((p: any) => {
          if (!paymentsByOrderId.has(p.order_id)) {
            paymentsByOrderId.set(p.order_id, p);
          }
        });

        const numbersByOrderId = new Map<number, string[]>();
        (numbersResult.data || []).forEach((row: any) => {
          const cur = numbersByOrderId.get(row.order_id) || [];
          cur.push(row.number);
          numbersByOrderId.set(row.order_id, cur);
        });

        realOrders = rawOrdersData.map((ord: any) => {
          const profile = ord.user_id ? profilesById.get(ord.user_id) : null;
          const payment = paymentsByOrderId.get(ord.id);
          const payMeta = payment?.metadata || {};

          const clientName = payMeta?.customer_name || profile?.full_name || 'Comprador';
          const clientEmail = payMeta?.customer_email || profile?.email || 'Sin correo';
          const tickets = numbersByOrderId.get(ord.id) || [];

          let computedStatus: 'approved' | 'pending' | 'rejected' = 'pending';
          if (ord.status === 'confirmed' || ord.payment_status === 'approved') {
            computedStatus = 'approved';
          } else if (ord.status === 'cancelled' || ord.status === 'rejected') {
            computedStatus = 'rejected';
          }

          return {
            id: ord.id.toString(),
            orderNumber: ord.order_number || `ORD-${ord.id}`,
            clientName,
            clientEmail,
            tickets,
            total: Number(ord.total) || 0,
            status: computedStatus,
            date: new Date(ord.created_at).toLocaleString('es-CO', {
              dateStyle: 'short',
              timeStyle: 'short',
            }),
          };
        });
      }

      setSalesOrders(realOrders);

      // Calcular métricas reales
      const totalNums = raffleData.total_numbers || 1000;
      const actualSoldCount = (soldNumbersData || []).filter((s) => s.status === 'sold').length;
      const actualReservedCount = (soldNumbersData || []).filter((s) => s.status === 'reserved').length;
      const actualAvailable = Math.max(0, totalNums - actualSoldCount - actualReservedCount);
      const totalRevenue = realOrders
        .filter((o) => o.status === 'approved')
        .reduce((sum, o) => sum + o.total, 0);

      const isCompleted = raffleData.status === 'completed';
      const currentWinningNumber = isCompleted ? (raffleData.lottery_draws?.winning_number || '') : '';
      const currentEvidenceUrl = isCompleted ? (raffleData.lottery_draws?.evidence_url || '') : '';

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
        rawEndAt: raffleData.end_at,
        pricePerNumber: Number(raffleData.price_per_number) || 10000,
        totalNumbers: totalNums,
        soldCount: actualSoldCount,
        reservedCount: actualReservedCount,
        availableCount: actualAvailable,
        totalRevenue: totalRevenue,
        status: raffleData.status || 'active',
        winningNumber: currentWinningNumber,
        evidenceUrl: currentEvidenceUrl,
      });

      setInputWinningNumber(currentWinningNumber);
      setInputEvidenceUrl(currentEvidenceUrl);

      // Validar si ya tiene número ganador oficial para buscar ganador y bloquearlo
      if (currentWinningNumber && isCompleted) {
        setIsResultLocked(true);

        const numLength =
          raffleData.number_length ||
          (raffleData.total_numbers ? (raffleData.total_numbers - 1).toString().length : 4);
        const cleanNum = currentWinningNumber.trim();
        const paddedWinningNumber = cleanNum.padStart(numLength, '0');
        const numVal = parseInt(cleanNum, 10);

        // Buscar el boleto ganador en raffle_numbers (por formato exacto, con ceros o valor numérico)
        let ticketQuery = supabase
          .from('raffle_numbers')
          .select('id, number, status, order_id')
          .eq('raffle_id', params.id);

        if (!isNaN(numVal)) {
          ticketQuery = ticketQuery.or(
            `number.eq.${cleanNum},number.eq.${paddedWinningNumber},numeric_value.eq.${numVal}`
          );
        } else {
          ticketQuery = ticketQuery.or(`number.eq.${cleanNum},number.eq.${paddedWinningNumber}`);
        }

        const { data: winTicketList } = await ticketQuery.limit(1);
        const winTicket = winTicketList && winTicketList.length > 0 ? winTicketList[0] : null;

        if (winTicket && winTicket.status === 'sold' && winTicket.order_id) {
          const { data: winOrder } = await supabase
            .from('orders')
            .select(`
              id,
              order_number,
              profiles (full_name, email, phone),
              payments (metadata)
            `)
            .eq('id', winTicket.order_id)
            .maybeSingle();

          const { data: auditLog } = await supabase
            .from('audit_logs')
            .select('created_at')
            .eq('entity_type', 'Raffle')
            .eq('entity_id', params.id)
            .eq('action', 'GANADOR_NOTIFICADO_POR_CORREO')
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          const mainPrize =
            (raffleData.raffle_prizes || []).find((p: any) => p.prize_type === 'main') ||
            (raffleData.raffle_prizes || [])[0] || {
              name: 'Premio Mayor',
              prize_value: 0,
            };

          const payMeta = (winOrder as any)?.payments?.[0]?.metadata;
          const name =
            payMeta?.customer_name ||
            (winOrder?.profiles as any)?.full_name ||
            'Comprador Registrado';
          const email =
            payMeta?.customer_email ||
            (winOrder?.profiles as any)?.email ||
            '';
          const phone =
            payMeta?.customer_phone ||
            (winOrder?.profiles as any)?.phone ||
            'Sin teléfono';

          setWinnerInfo({
            name,
            email,
            phone,
            number: winTicket.number || paddedWinningNumber,
            orderNumber: winOrder?.order_number,
            prizeName: mainPrize.name || 'Gran Premio',
            prizeValue: mainPrize.prize_value ? Number(mainPrize.prize_value) : undefined,
            notifiedAt: auditLog?.created_at,
            isNotified: Boolean(auditLog),
          });
          setIsWinnerNotFound(false);
        } else {
          setWinnerInfo(null);
          setIsWinnerNotFound(true);
        }
      } else {
        setIsResultLocked(false);
        setWinnerInfo(null);
        setIsWinnerNotFound(false);
      }

      // 4. Mapear Premios reales
      const realPrizes: Prize[] = (raffleData.raffle_prizes || []).map((p: any) => ({
        id: p.id,
        position: p.position || 1,
        name: p.name || 'Premio',
        type: p.prize_type === 'main' ? 'main' : 'secondary',
        value: Number(p.prize_value) || 0,
        ruleType: p.rule_type,
        ruleValue: p.rule_value,
        rule: p.rule_type === 'exact_match'
          ? `Coincidencia exacta con ${raffleData.lottery_draws?.lotteries?.name || 'Lotería Oficial'}`
          : p.rule_type === 'specific_number'
          ? `🎯 Número Premiado: #${p.rule_value || '0000'} (Premio Anticipado / Directo)`
          : `Regla especial ${p.rule_type}`,
        winningNumber: p.rule_type === 'specific_number' ? p.rule_value : (p.winning_number || undefined),
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
    if (raffle.winningNumber || raffle.status === 'completed') {
      alert('Esta rifa ya cuenta con un número ganador oficial y está finalizada. No se pueden modificar sus ventas.');
      return;
    }
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
    if (raffle.winningNumber || raffle.status === 'completed') {
      alert('Esta rifa ya cuenta con un número ganador oficial y está finalizada. No se puede cancelar.');
      return;
    }
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

  // Guardar y Bloquear Número Ganador Oficial
  const handleSaveWinningResult = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputWinningNumber || !raffle) return;

    try {
      setIsSavingResult(true);

      const numLength =
        raffle.number_length ||
        (raffle.totalNumbers ? (raffle.totalNumbers - 1).toString().length : 4);
      const cleanNum = inputWinningNumber.trim();
      const formattedWinningNumber = cleanNum.padStart(numLength, '0');

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
            winning_number: formattedWinningNumber,
            evidence_url: inputEvidenceUrl,
            status: 'verified',
          })
          .eq('id', rData.lottery_draw_id);
      } else {
        // Si no tenía sorteo asignado, crear uno nuevo verificado
        const { data: createdDraw } = await supabase
          .from('lottery_draws')
          .insert({
            lottery_id: 1,
            draw_number: `SRT-${raffle.id}-${Date.now().toString().slice(-4)}`,
            draw_date: new Date().toISOString().split('T')[0],
            winning_number: formattedWinningNumber,
            evidence_url: inputEvidenceUrl,
            status: 'verified',
          })
          .select('id')
          .single();

        if (createdDraw) {
          await supabase
            .from('raffles')
            .update({ lottery_draw_id: createdDraw.id })
            .eq('id', raffle.id);
        }
      }

      // Marcar rifa como completada
      await supabase
        .from('raffles')
        .update({ status: 'completed' })
        .eq('id', raffle.id);

      setRaffle({
        ...raffle,
        winningNumber: formattedWinningNumber,
        evidenceUrl: inputEvidenceUrl,
        status: 'completed',
      });

      setInputWinningNumber(formattedWinningNumber);
      setIsResultLocked(true);
      await loadRaffleDetails();
      alert(`🔒 ¡Resultado oficial guardado (#${formattedWinningNumber}) y verificado! El número ganador ha quedado bloqueado.`);
    } catch (err) {
      console.error('Error guardando resultado:', err);
    } finally {
      setIsSavingResult(false);
    }
  };

  // Desbloquear Número Ganador con Confirmación
  const handleUnlockResult = () => {
    if (window.confirm('⚠️ ¿Estás seguro de que deseas desbloquear y editar el número ganador oficial?')) {
      setIsResultLocked(false);
    }
  };

  // Notificar / Reenviar Notificación al Ganador Oficial
  const handleNotifyWinner = async () => {
    if (!raffle?.id) return;
    try {
      setIsNotifyingWinner(true);
      const res = await fetch(`/api/raffles/${raffle.id}/notify-winner`, {
        method: 'POST',
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        if (json.notSold) {
          alert(json.message);
          return;
        }
        throw new Error(json.error || 'Error al notificar al ganador');
      }

      if (json.winner) {
        setWinnerInfo((prev) => ({
          ...(prev || json.winner),
          isNotified: true,
          notifiedAt: json.winner.notifiedAt || new Date().toISOString(),
        }));
      }

      alert(`🎉 ¡Éxito! Notificación oficial enviada al correo ${json.winner?.email || ''}.`);
    } catch (err: any) {
      console.error('Error enviando notificación al ganador:', err);
      alert(err.message || 'Ocurrió un error al enviar la notificación.');
    } finally {
      setIsNotifyingWinner(false);
    }
  };

  // Reenviar Boletos de una Orden
  const handleResendOrderEmail = async (orderId: string) => {
    try {
      setResendingOrderId(orderId);
      const res = await fetch(`/api/orders/${orderId}/resend-email`, {
        method: 'POST',
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'No se pudo reenviar el correo.');
      }
      alert(json.message || 'Correo reenviado con éxito al cliente.');
    } catch (err: any) {
      console.error('Error al reenviar correo de orden:', err);
      alert(err.message || 'Error al reenviar correo.');
    } finally {
      setResendingOrderId(null);
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
            {raffle.rawEndAt && new Date(raffle.rawEndAt).getTime() <= Date.now() && raffle.status !== 'completed' && (
              <span className="px-3 py-1 rounded-full font-label-caps text-xs font-bold uppercase border bg-amber-500/10 text-amber-800 border-amber-500/30 flex items-center gap-1">
                <span className="material-symbols-outlined text-[14px]">event_busy</span>
                Fecha de Sorteo Vencida ({raffle.drawDate})
              </span>
            )}
          </div>
          <p className="font-body-lg text-body-lg text-on-surface-variant mt-1">
            Código: <strong>{raffle.code}</strong> • Sortea con {raffle.lotteryName} ({raffle.drawDate})
          </p>
        </div>

        <div className="flex flex-wrap gap-3 w-full md:w-auto">
          {raffle.winningNumber || raffle.status === 'completed' ? (
            <button
              disabled
              className="flex-1 md:flex-none px-4 py-2 bg-amber-500/10 text-amber-800 font-body-md text-body-md font-bold rounded-lg border border-amber-500/30 flex items-center justify-center gap-1.5 cursor-not-allowed shadow-none"
              title={`Sorteo finalizado con número ganador #${raffle.winningNumber}`}
            >
              <span className="material-symbols-outlined text-[18px] text-amber-600">emoji_events</span>
              Sorteo Finalizado (#{raffle.winningNumber})
            </button>
          ) : (
            <button
              onClick={handleTogglePause}
              className="flex-1 md:flex-none px-4 py-2 border-2 border-primary text-primary font-body-md text-body-md font-semibold rounded-lg hover:bg-surface-container-high transition-colors flex items-center justify-center gap-1.5"
            >
              <span className="material-symbols-outlined text-[18px]">
                {raffle.status === 'paused' ? 'play_arrow' : 'pause'}
              </span>
              {raffle.status === 'paused' ? 'Reanudar Ventas' : 'Pausar Ventas'}
            </button>
          )}
          <button
            onClick={handleCancelRaffle}
            disabled={raffle.status === 'cancelled' || Boolean(raffle.winningNumber) || raffle.status === 'completed'}
            className="flex-1 md:flex-none px-4 py-2 border-2 border-error text-error font-body-md text-body-md font-semibold rounded-lg hover:bg-error-container transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
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
                <th className="p-4">Estado & Despacho</th>
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
                      <div className="flex items-center gap-2">
                        <span
                          className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                            ord.status === 'approved'
                              ? 'bg-emerald-500/10 text-emerald-600'
                              : 'bg-amber-500/10 text-amber-600'
                          }`}
                        >
                          {ord.status === 'approved' ? 'Aprobado' : 'Pendiente'}
                        </span>
                        {ord.status === 'approved' && (
                          <button
                            disabled={resendingOrderId === ord.id}
                            onClick={() => handleResendOrderEmail(ord.id)}
                            className="px-2.5 py-1 bg-primary/10 hover:bg-primary text-primary hover:text-on-primary rounded-lg text-xs font-bold transition-all flex items-center gap-1 border border-primary/20 shadow-sm disabled:opacity-50"
                            title="Reenviar boletos por correo"
                          >
                            <span className="material-symbols-outlined text-[14px]">forward_to_inbox</span>
                            {resendingOrderId === ord.id ? 'Enviando...' : 'Reenviar'}
                          </button>
                        )}
                      </div>
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
        <div className="space-y-6 animate-in fade-in-50">
          {/* A. Premios de Sorteo Regular */}
          <div className="space-y-3">
            <h3 className="font-headline-md text-base font-bold text-primary flex items-center gap-2">
              <span className="material-symbols-outlined text-secondary-container">emoji_events</span>
              Premios de Sorteo Regular (Mayor y Secundarios)
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {prizes.filter((p) => p.ruleType !== 'specific_number').length > 0 ? (
                prizes
                  .filter((p) => p.ruleType !== 'specific_number')
                  .map((p) => (
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
                <div className="col-span-3 p-6 bg-surface-container-lowest rounded-xl text-center text-on-surface-variant">
                  No hay premios regulares configurados.
                </div>
              )}
            </div>
          </div>

          {/* B. Números Premiados (Premios Anticipados / Directos) */}
          <div className="space-y-3 pt-4 border-t border-outline-variant/20">
            <div className="flex items-center justify-between">
              <h3 className="font-headline-md text-base font-bold text-primary flex items-center gap-2">
                <span className="material-symbols-outlined text-amber-500">stars</span>
                🎯 Números Premiados (Premios Anticipados / Directos)
              </h3>
              <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300">
                {prizes.filter((p) => p.ruleType === 'specific_number').length} Números Asignados
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {prizes.filter((p) => p.ruleType === 'specific_number').length > 0 ? (
                prizes
                  .filter((p) => p.ruleType === 'specific_number')
                  .map((p) => (
                    <div
                      key={p.id}
                      className="p-4 bg-gradient-to-br from-amber-500/10 via-surface-container-lowest to-amber-500/5 rounded-2xl border border-amber-400/50 shadow-sm space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] uppercase font-black tracking-wider text-amber-800">
                          Premio Directo
                        </span>
                        <div className="font-mono font-black text-amber-900 text-base bg-amber-200 px-2 py-0.5 rounded-lg">
                          #{p.ruleValue || p.winningNumber || '0000'}
                        </div>
                      </div>
                      <h4 className="font-bold text-sm text-primary line-clamp-1">{p.name}</h4>
                      <div className="font-extrabold text-sm text-emerald-700">
                        ${p.value.toLocaleString('es-CO')} COP
                      </div>
                    </div>
                  ))
              ) : (
                <div className="col-span-4 p-6 bg-surface-container-lowest rounded-xl text-center text-on-surface-variant text-xs">
                  No se han asignado números premiados directos a esta rifa.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 5. PESTAÑA: RESULTADOS Y GANADORES */}
      {activeTab === 'resultados' && (
        <div className="space-y-6 animate-in fade-in-50">
          {/* A. Tarjeta de Ganador Identificado */}
          {winnerInfo && (
            <div className="bg-gradient-to-br from-amber-500/10 via-surface-container-lowest to-surface-container-low p-6 sm:p-8 rounded-2xl border-2 border-amber-500/40 shadow-lg space-y-6">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-amber-500/20 pb-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-amber-600 to-amber-400 text-white flex items-center justify-center text-2xl shadow-md">
                    🏆
                  </div>
                  <div>
                    <span className="text-[11px] font-black uppercase tracking-widest text-amber-700 block">
                      ¡GANADOR OFICIAL IDENTIFICADO!
                    </span>
                    <h3 className="font-headline-md text-xl sm:text-2xl font-black text-primary">
                      {winnerInfo.name}
                    </h3>
                  </div>
                </div>

                {/* Badge de Estado de Notificación */}
                <div>
                  {winnerInfo.isNotified ? (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 shadow-sm">
                      <span className="material-symbols-outlined text-[15px] text-emerald-600">mark_email_read</span>
                      Notificado por Correo
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-900 border border-amber-300 shadow-sm">
                      <span className="material-symbols-outlined text-[15px] text-amber-600">notification_important</span>
                      Pendiente de Notificación
                    </span>
                  )}
                </div>
              </div>

              {/* Grid de Detalles del Ganador */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <div className="bg-surface-container-lowest p-4 rounded-xl border border-outline-variant/30 space-y-1 shadow-sm">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">Boleto Ganador</span>
                  <div className="font-mono text-2xl font-black text-amber-600 tracking-wider">
                    #{winnerInfo.number}
                  </div>
                  {winnerInfo.orderNumber && (
                    <div className="text-xs text-on-surface-variant">Orden: <strong>{winnerInfo.orderNumber}</strong></div>
                  )}
                </div>

                <div className="bg-surface-container-lowest p-4 rounded-xl border border-outline-variant/30 space-y-1 shadow-sm">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">Premio Correspondiente</span>
                  <div className="font-bold text-primary text-base">
                    {winnerInfo.prizeName}
                  </div>
                  {winnerInfo.prizeValue && (
                    <div className="text-sm font-extrabold text-emerald-600">
                      ${winnerInfo.prizeValue.toLocaleString('es-CO')} COP
                    </div>
                  )}
                </div>

                <div className="bg-surface-container-lowest p-4 rounded-xl border border-outline-variant/30 space-y-1 shadow-sm sm:col-span-2 lg:col-span-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">Contacto del Ganador</span>
                  <div className="text-xs font-semibold text-primary truncate">{winnerInfo.email}</div>
                  <a
                    href={`https://wa.me/57${winnerInfo.phone.replace(/\D/g, '')}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-bold text-emerald-600 hover:underline pt-1"
                  >
                    <span className="material-symbols-outlined text-[14px]">chat</span>
                    WhatsApp: {winnerInfo.phone}
                  </a>
                </div>
              </div>

              {/* Botones de Acción de Notificación & Reenvío */}
              <div className="flex flex-col sm:flex-row items-center gap-3 pt-2 border-t border-amber-500/20">
                <button
                  type="button"
                  disabled={isNotifyingWinner}
                  onClick={handleNotifyWinner}
                  className="w-full sm:w-auto px-6 py-3 bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-700 hover:to-amber-600 text-white rounded-xl font-extrabold text-sm shadow-md transition-all flex items-center justify-center gap-2 disabled:opacity-50 active:scale-95"
                >
                  {isNotifyingWinner ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      Enviando Notificación...
                    </>
                  ) : winnerInfo.isNotified ? (
                    <>
                      <span className="material-symbols-outlined text-[18px]">forward_to_inbox</span>
                      Reenviar Notificación al Ganador
                    </>
                  ) : (
                    <>
                      <span className="material-symbols-outlined text-[18px]">campaign</span>
                      🎉 Notificar al Ganador por Correo
                    </>
                  )}
                </button>

                {winnerInfo.notifiedAt && (
                  <span className="text-xs text-on-surface-variant">
                    Último envío: {new Date(winnerInfo.notifiedAt).toLocaleString('es-CO')}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* B. Caso: Número Ganador Registrado pero no vendido */}
          {isWinnerNotFound && (raffle.winningNumber || inputWinningNumber) && (
            <div className="bg-amber-500/10 border border-amber-500/30 p-5 rounded-2xl text-amber-900 space-y-1">
              <div className="font-bold flex items-center gap-1.5 text-sm">
                <span className="material-symbols-outlined text-[18px] text-amber-600">info</span>
                El boleto #{raffle.winningNumber || inputWinningNumber} no fue comprado
              </div>
              <p className="text-xs text-amber-800">
                Ningún participante adquirió este número oficial en este sorteo.
              </p>
            </div>
          )}

          {/* C. Formulario de Registro y Bloqueo */}
          <div className="bg-surface-container-lowest p-8 rounded-2xl border border-outline-variant/30 space-y-6 max-w-2xl">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 border-b border-outline-variant/20 pb-4">
              <div>
                <h3 className="font-headline-md text-headline-md font-bold text-primary flex items-center gap-2">
                  <span>Resultado Oficial del Sorteo</span>
                  {isResultLocked && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-300">
                      🔒 Bloqueado
                    </span>
                  )}
                </h3>
                <p className="font-body-sm text-body-sm text-on-surface-variant mt-0.5">
                  Número ganador expedido por {raffle.lotteryName} ({raffle.drawDate}).
                </p>
              </div>

              {isResultLocked && (
                <button
                  type="button"
                  onClick={handleUnlockResult}
                  className="px-3 py-1.5 bg-surface-container hover:bg-surface-container-high text-primary rounded-xl text-xs font-bold border border-outline-variant flex items-center gap-1 transition-all"
                  title="Desbloquear para corregir número ganador"
                >
                  <span className="material-symbols-outlined text-[15px]">lock_open</span>
                  Desbloquear
                </button>
              )}
            </div>

            {isResultLocked && (
              <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-3.5 flex items-center gap-3">
                <span className="text-2xl">🔒</span>
                <div className="text-xs text-emerald-900">
                  <strong>Número Ganador Protegido:</strong> Este sorteo ya tiene registrado y verificado el número ganador oficial. Los campos están bloqueados para evitar cambios accidentales.
                </div>
              </div>
            )}

            <form onSubmit={handleSaveWinningResult} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-primary mb-1">
                  Número Ganador Oficial *
                </label>
                <input
                  type="text"
                  required
                  disabled={isResultLocked}
                  placeholder="Ej. 5832"
                  value={inputWinningNumber}
                  onChange={(e) => setInputWinningNumber(e.target.value)}
                  className={`w-full px-4 py-2.5 border rounded-xl font-raffle-number text-xl font-bold transition-all ${
                    isResultLocked
                      ? 'bg-surface-container-low/80 text-primary/70 border-outline-variant/40 cursor-not-allowed'
                      : 'bg-surface-container-lowest border-outline-variant focus:ring-2 focus:ring-primary'
                  }`}
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-primary mb-1">
                  URL de Evidencia / Acta Oficial de Lotería
                </label>
                <input
                  type="url"
                  disabled={isResultLocked}
                  placeholder="https://loteriademedellin.com.co/resultados"
                  value={inputEvidenceUrl}
                  onChange={(e) => setInputEvidenceUrl(e.target.value)}
                  className={`w-full px-4 py-2 border rounded-xl text-sm transition-all ${
                    isResultLocked
                      ? 'bg-surface-container-low/80 text-primary/70 border-outline-variant/40 cursor-not-allowed'
                      : 'bg-surface-container-lowest border-outline-variant focus:ring-2 focus:ring-primary'
                  }`}
                />
              </div>

              {!isResultLocked ? (
                <button
                  type="submit"
                  disabled={isSavingResult}
                  className="px-6 py-3 bg-primary text-on-primary rounded-xl font-bold hover:bg-primary-container shadow-md disabled:opacity-50 flex items-center gap-2"
                >
                  {isSavingResult ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      Guardando...
                    </>
                  ) : (
                    <>
                      <span className="material-symbols-outlined text-[18px]">verified</span>
                      Guardar y Bloquear Número Ganador
                    </>
                  )}
                </button>
              ) : (
                <div className="pt-1">
                  <span className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-emerald-800 bg-emerald-100 border border-emerald-300">
                    <span className="material-symbols-outlined text-[16px] text-emerald-700">lock</span>
                    Número Ganador Guardado y Bloqueado
                  </span>
                </div>
              )}
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

