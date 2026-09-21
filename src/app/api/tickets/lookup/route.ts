import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

function maskName(name: string): string {
  if (!name || name.trim() === '' || name === 'Cliente' || name === 'Comprador') {
    return 'Cliente';
  }
  const parts = name.trim().split(/\s+/);
  return parts
    .map((p) => {
      if (p.length <= 2) return p.charAt(0) + '*';
      return p.charAt(0) + '***' + p.charAt(p.length - 1);
    })
    .join(' ');
}

function maskPhone(phone: string): string {
  if (!phone || phone.trim() === '' || phone.includes('Sin')) return '••• ••• •••';
  const digits = phone.replace(/\D/g, '');
  if (digits.length >= 10) {
    return `${digits.slice(0, 3)} ••• ••${digits.slice(-2)}`;
  }
  if (digits.length >= 7) {
    return `${digits.slice(0, 2)} ••• •${digits.slice(-2)}`;
  }
  return `${phone.slice(0, 2)}••••`;
}

function maskEmail(email: string): string {
  if (!email || !email.includes('@') || email.includes('Sin')) return '••••@••••.com';
  const [local, domain] = email.split('@');
  if (local.length <= 2) {
    return `${local.charAt(0)}***@${domain}`;
  }
  return `${local.charAt(0)}***${local.charAt(local.length - 1)}@${domain}`;
}

function maskDocument(doc: string): string {
  if (!doc || doc.trim() === '') return '';
  const clean = doc.trim();
  if (clean.length > 5) {
    return `${clean.slice(0, 3)}•••••${clean.slice(-2)}`;
  }
  return `${clean.slice(0, 1)}••••`;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const rawQuery = body?.query;

    if (!rawQuery || typeof rawQuery !== 'string' || !rawQuery.trim()) {
      return NextResponse.json({ tickets: [] });
    }

    const cleanQuery = rawQuery.trim();
    const lowerQuery = cleanQuery.toLowerCase();
    const supabase = await createClient();

    const matchingOrderIds = new Set<number>();

    // 1. Búsqueda por número de orden directo (ej. "ORD-1234", "1234")
    const { data: ordersByNum } = await supabase
      .from('orders')
      .select('id')
      .or(`order_number.ilike.%${cleanQuery}%,order_number.eq.${cleanQuery}`);

    (ordersByNum || []).forEach((o: any) => matchingOrderIds.add(o.id));

    // Si es numérico, probar también por id de orden
    const numericVal = parseInt(cleanQuery, 10);
    if (!isNaN(numericVal)) {
      const { data: orderById } = await supabase
        .from('orders')
        .select('id')
        .eq('id', numericVal);

      (orderById || []).forEach((o: any) => matchingOrderIds.add(o.id));
    }

    // 2. Búsqueda por número de boleto (ej. "0075", "75", "123")
    const ticketVariations = [
      cleanQuery,
      cleanQuery.padStart(2, '0'),
      cleanQuery.padStart(3, '0'),
      cleanQuery.padStart(4, '0'),
      cleanQuery.padStart(5, '0'),
    ];
    const uniqueTicketVariations = Array.from(new Set(ticketVariations));

    const { data: ticketsByNumber } = await supabase
      .from('raffle_numbers')
      .select('order_id')
      .in('number', uniqueTicketVariations)
      .not('order_id', 'is', null);

    (ticketsByNumber || []).forEach((t: any) => {
      if (t.order_id) matchingOrderIds.add(t.order_id);
    });

    if (!isNaN(numericVal)) {
      const { data: ticketsByNumeric } = await supabase
        .from('raffle_numbers')
        .select('order_id')
        .eq('numeric_value', numericVal)
        .not('order_id', 'is', null);

      (ticketsByNumeric || []).forEach((t: any) => {
        if (t.order_id) matchingOrderIds.add(t.order_id);
      });
    }

    // 3. Búsqueda en perfiles registrados (cédula, celular, email, nombre)
    const { data: matchingProfiles } = await supabase
      .from('profiles')
      .select('id')
      .or(
        `document_number.ilike.%${cleanQuery}%,phone.ilike.%${cleanQuery}%,email.ilike.%${cleanQuery}%,full_name.ilike.%${cleanQuery}%`
      );

    if (matchingProfiles && matchingProfiles.length > 0) {
      const userIds = matchingProfiles.map((p: any) => p.id);
      const { data: ordersByUser } = await supabase
        .from('orders')
        .select('id')
        .in('user_id', userIds);

      (ordersByUser || []).forEach((o: any) => matchingOrderIds.add(o.id));
    }

    // 4. Búsqueda en pagos (metadata de clientes invitados: documento, teléfono, email, nombre)
    const { data: allPayments } = await supabase
      .from('payments')
      .select('order_id, metadata');

    if (allPayments && allPayments.length > 0) {
      allPayments.forEach((p: any) => {
        if (!p.order_id) return;
        const meta = p.metadata || {};
        const doc = (meta.customer_document || '').toString().toLowerCase();
        const phone = (meta.customer_phone || '').toString().toLowerCase();
        const email = (meta.customer_email || '').toString().toLowerCase();
        const name = (meta.customer_name || '').toString().toLowerCase();

        if (
          doc.includes(lowerQuery) ||
          phone.includes(lowerQuery) ||
          email.includes(lowerQuery) ||
          name.includes(lowerQuery)
        ) {
          matchingOrderIds.add(p.order_id);
        }
      });
    }

    const finalOrderIds = Array.from(matchingOrderIds);
    if (finalOrderIds.length === 0) {
      return NextResponse.json({ tickets: [] });
    }

    // 5. Cargar órdenes completas con datos de rifas, premios y perfiles
    const { data: ordersData, error: ordersError } = await supabase
      .from('orders')
      .select(`
        id,
        order_number,
        total,
        status,
        payment_status,
        created_at,
        profiles (full_name, email, phone, document_number),
        payments (provider, metadata, status),
        raffles (
          id,
          name,
          end_at,
          lottery_draws (winning_number, lotteries (name)),
          raffle_prizes (*)
        )
      `)
      .in('id', finalOrderIds)
      .order('id', { ascending: false });

    if (ordersError || !ordersData) {
      console.error('Error cargando detalles de órdenes:', ordersError);
      return NextResponse.json({ tickets: [] });
    }

    // 6. Cargar todos los boletos asociados a estas órdenes
    const { data: ticketsData } = await supabase
      .from('raffle_numbers')
      .select('order_id, number')
      .in('order_id', finalOrderIds)
      .order('number', { ascending: true });

    const ticketsByOrder = new Map<number, string[]>();
    (ticketsData || []).forEach((row: any) => {
      const current = ticketsByOrder.get(row.order_id) || [];
      current.push(row.number);
      ticketsByOrder.set(row.order_id, current);
    });

    // 7. Formatear y construir resultado con detección de Números Premiados
    const formattedResults = ordersData.map((order: any) => {
      const numbers = ticketsByOrder.get(order.id) || [];
      const payment = Array.isArray(order.payments) ? order.payments[0] : order.payments;
      const payMeta = payment?.metadata || {};
      const profile = order.profiles || {};

      const rawCustomerName =
        payMeta.customer_name || profile.full_name || 'Cliente';
      const rawCustomerEmail =
        payMeta.customer_email || profile.email || '';
      const rawCustomerPhone =
        payMeta.customer_phone || profile.phone || '';
      const rawCustomerDocument =
        payMeta.customer_document || profile.document_number || '';

      const raffle = order.raffles || {};
      const raffleName = raffle.name || 'Sorteo Oficial';
      const lotteryName =
        raffle.lottery_draws?.lotteries?.name || 'Lotería Oficial';
      const officialWinningNumber = raffle.lottery_draws?.winning_number || '';
      const prizes = raffle.raffle_prizes || [];

      // Mapear números premiados / premios directos
      const instantPrizes = prizes
        .filter((p: any) => p.rule_type === 'specific_number')
        .map((p: any) => ({
          number: p.rule_value || '',
          prizeName: p.name || 'Premio Anticipado',
          prizeValue: Number(p.prize_value) || 0,
        }));

      // Identificar si alguno de los boletos del usuario es ganador
      const winningTickets: { [ticketNum: string]: { prizeName: string; prizeValue?: number; isMainPrize: boolean } } = {};

      numbers.forEach((numStr) => {
        // A. Coincidencia con número ganador de lotería (Premio Mayor)
        if (officialWinningNumber && (numStr === officialWinningNumber || parseInt(numStr, 10) === parseInt(officialWinningNumber, 10))) {
          const mainPrize = prizes.find((p: any) => p.prize_type === 'main') || prizes[0];
          winningTickets[numStr] = {
            prizeName: mainPrize?.name || 'Premio Mayor',
            prizeValue: mainPrize?.prize_value ? Number(mainPrize.prize_value) : undefined,
            isMainPrize: true,
          };
        }

        // B. Coincidencia con Número Premiado Directo / Anticipado
        const instantMatch = instantPrizes.find((ip: any) => ip.number === numStr || parseInt(ip.number, 10) === parseInt(numStr, 10));
        if (instantMatch) {
          winningTickets[numStr] = {
            prizeName: instantMatch.prizeName,
            prizeValue: instantMatch.prizeValue,
            isMainPrize: false,
          };
        }
      });

      const drawDate = raffle.end_at
        ? new Date(raffle.end_at).toLocaleDateString('es-CO', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          })
        : 'Fecha Próxima';

      let status = 'pending';
      if (order.status === 'confirmed' || order.payment_status === 'approved') {
        status = 'confirmed';
      } else if (order.status === 'cancelled' || order.status === 'rejected') {
        status = 'rejected';
      }

      return {
        id: order.id,
        orderNumber: order.order_number || `ORD-${order.id}`,
        customerName: maskName(rawCustomerName),
        customerEmail: maskEmail(rawCustomerEmail),
        customerPhone: maskPhone(rawCustomerPhone),
        customerDocument: maskDocument(rawCustomerDocument),
        raffleName,
        drawDate,
        lotteryName,
        numbers,
        totalPaid: Number(order.total) || 0,
        status,
        officialWinningNumber,
        instantPrizes,
        winningTickets,
        createdAt: order.created_at,
      };
    });

    return NextResponse.json({ tickets: formattedResults });
  } catch (err: any) {
    console.error('Error en /api/tickets/lookup:', err);
    return NextResponse.json(
      { error: 'Error interno consultando boletos', details: err.message },
      { status: 500 }
    );
  }
}
