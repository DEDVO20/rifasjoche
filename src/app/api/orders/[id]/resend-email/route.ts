import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { sendTicketConfirmationEmail } from '@/lib/email';

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const orderId = params.id;
    if (!orderId) {
      return NextResponse.json({ error: 'ID de orden no proporcionado' }, { status: 400 });
    }

    const supabase = await createClient();

    // 1. Obtener la orden, datos del cliente y de la rifa
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select(`
        id,
        order_number,
        total,
        status,
        payment_status,
        profiles (full_name, email, phone),
        payments (metadata),
        raffles (id, name, end_at, lottery_draws (lotteries (name)))
      `)
      .eq('id', orderId)
      .single();

    if (orderError || !order) {
      return NextResponse.json({ error: 'Orden no encontrada' }, { status: 404 });
    }

    // 2. Obtener los boletos asignados
    const { data: tickets } = await supabase
      .from('raffle_numbers')
      .select('number')
      .eq('order_id', orderId);

    const ticketList = (tickets || []).map((t) => t.number);

    if (ticketList.length === 0) {
      return NextResponse.json(
        { error: 'No se encontraron boletos asociados a esta orden.' },
        { status: 400 }
      );
    }

    // 3. Preparar datos para el reenvío
    const payMeta = (order as any)?.payments?.[0]?.metadata;
    const customerEmail =
      payMeta?.customer_email || (order.profiles as any)?.email || 'cliente@email.com';
    const customerName =
      payMeta?.customer_name || (order.profiles as any)?.full_name || 'Cliente';
    const raffleName = (order.raffles as any)?.name || 'Sorteo Oficial';
    const lotteryName =
      (order.raffles as any)?.lottery_draws?.lotteries?.name || 'Lotería Oficial';
    const drawDate = (order.raffles as any)?.end_at
      ? new Date((order.raffles as any).end_at).toLocaleDateString('es-CO', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        })
      : 'Próximamente';

    const raffleId = (order.raffles as any)?.id;

    // 4. Consultar si alguno de los boletos asignados tiene Premio Anticipado
    const { data: instantPrizesData } = await supabase
      .from('raffle_prizes')
      .select('name, prize_value, rule_value')
      .eq('raffle_id', raffleId)
      .eq('rule_type', 'specific_number');

    const matchedInstantPrizes: { number: string; prizeName: string; prizeValue?: number }[] = [];
    (instantPrizesData || []).forEach((ip: any) => {
      const match = ticketList.find(
        (t: string) => t === ip.rule_value || parseInt(t, 10) === parseInt(ip.rule_value, 10)
      );
      if (match) {
        matchedInstantPrizes.push({
          number: match,
          prizeName: ip.name,
          prizeValue: ip.prize_value ? Number(ip.prize_value) : undefined,
        });
      }
    });

    // REGLA CRÍTICA: No se pueden enviar 2 números premiados en una sola compra (máximo 1 premio por compra)
    matchedInstantPrizes.sort((a, b) => (b.prizeValue || 0) - (a.prizeValue || 0));
    const finalInstantWinningPrizes = matchedInstantPrizes.slice(0, 1);

    // 5. Reenviar correo con Resend
    const emailResult = await sendTicketConfirmationEmail({
      to: customerEmail,
      customerName,
      orderNumber: order.order_number,
      raffleName,
      lotteryName,
      drawDate,
      ticketNumbers: ticketList,
      totalAmount: Number(order.total) || 0,
      instantWinningPrizes: finalInstantWinningPrizes,
    });

    if (!emailResult.success) {
      return NextResponse.json(
        {
          error: `Error al enviar correo: ${emailResult.error}`,
          emailStatus: 'error_envio',
        },
        { status: 500 }
      );
    }

    // 6. Registrar en auditoría
    await supabase.from('audit_logs').insert({
      action: 'CORREO_BOLETOS_REENVIADO',
      entity_type: 'Order',
      entity_id: Number(orderId),
      details: {
        order_number: order.order_number,
        customer_name: customerName,
        customer_email: customerEmail,
        raffle_name: raffleName,
        assigned_numbers: ticketList,
        resent_at: new Date().toISOString(),
      },
    });

    return NextResponse.json({
      success: true,
      message: `Correo con boletos (${ticketList.join(', ')}) reenviado con éxito a ${customerEmail}.`,
      orderNumber: order.order_number,
      customerEmail,
      ticketList,
    });
  } catch (err: any) {
    console.error('Error en resend-email route:', err);
    return NextResponse.json(
      { error: 'Error interno al reenviar el correo', message: err.message },
      { status: 500 }
    );
  }
}
