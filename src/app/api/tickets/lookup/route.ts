import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

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
    // Probar número exacto y variantes con relleno de ceros
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

    // 5. Cargar órdenes completas con datos de rifas y perfiles
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
        raffles (id, name, end_at, lottery_draws (lotteries (name)))
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

    // 7. Formatear y construir resultado
    const formattedResults = ordersData.map((order: any) => {
      const numbers = ticketsByOrder.get(order.id) || [];
      const payment = Array.isArray(order.payments) ? order.payments[0] : order.payments;
      const payMeta = payment?.metadata || {};
      const profile = order.profiles || {};

      const customerName =
        payMeta.customer_name || profile.full_name || 'Cliente';
      const customerEmail =
        payMeta.customer_email || profile.email || 'Sin correo registrado';
      const customerPhone =
        payMeta.customer_phone || profile.phone || 'Sin teléfono registrado';
      const customerDocument =
        payMeta.customer_document || profile.document_number || '';

      const raffle = order.raffles || {};
      const raffleName = raffle.name || 'Sorteo Oficial';
      const lotteryName =
        raffle.lottery_draws?.lotteries?.name || 'Lotería Oficial';
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
        customerName,
        customerEmail,
        customerPhone,
        customerDocument,
        raffleName,
        drawDate,
        lotteryName,
        numbers,
        totalPaid: Number(order.total) || 0,
        status,
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
