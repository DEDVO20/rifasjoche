import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { sendWinnerNotificationEmail } from '@/lib/email';

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const raffleId = params.id;
    if (!raffleId) {
      return NextResponse.json({ error: 'ID de rifa no proporcionado' }, { status: 400 });
    }

    const supabase = await createClient();

    // 1. Obtener la rifa, el sorteo de lotería asociado y premios
    const { data: raffle, error: raffleError } = await supabase
      .from('raffles')
      .select(`
        id,
        name,
        end_at,
        lottery_draws (
          id,
          winning_number,
          evidence_url,
          lotteries (name)
        ),
        raffle_prizes (*)
      `)
      .eq('id', raffleId)
      .single();

    if (raffleError || !raffle) {
      return NextResponse.json({ error: 'Rifa no encontrada' }, { status: 404 });
    }

    const winningNumber = (raffle as any)?.lottery_draws?.winning_number;
    if (!winningNumber) {
      return NextResponse.json(
        { error: 'No se ha registrado un número ganador oficial para esta rifa.' },
        { status: 400 }
      );
    }

    const lotteryName = (raffle as any)?.lottery_draws?.lotteries?.name || 'Lotería Oficial';
    const evidenceUrl = (raffle as any)?.lottery_draws?.evidence_url || undefined;
    const drawDate = (raffle as any)?.end_at
      ? new Date((raffle as any).end_at).toLocaleDateString('es-CO', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        })
      : 'Fecha oficial';

    // 2. Buscar el boleto ganador en raffle_numbers
    const { data: winningTicket, error: ticketError } = await supabase
      .from('raffle_numbers')
      .select('id, number, status, order_id')
      .eq('raffle_id', raffleId)
      .eq('number', winningNumber)
      .maybeSingle();

    if (ticketError) {
      return NextResponse.json({ error: 'Error al consultar boletos de la rifa', details: ticketError }, { status: 500 });
    }

    if (!winningTicket || winningTicket.status !== 'sold' || !winningTicket.order_id) {
      return NextResponse.json({
        success: false,
        notSold: true,
        winningNumber,
        message: `El número ganador oficial #${winningNumber} no fue comprado por ningún participante.`,
      });
    }

    // 3. Obtener la orden de compra y datos del comprador
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select(`
        id,
        order_number,
        profiles (full_name, email, phone),
        payments (metadata)
      `)
      .eq('id', winningTicket.order_id)
      .single();

    if (orderError || !order) {
      return NextResponse.json({ error: 'Orden de compra del ganador no encontrada.' }, { status: 404 });
    }

    const payMeta = (order as any)?.payments?.[0]?.metadata;
    const customerName =
      payMeta?.customer_name || (order.profiles as any)?.full_name || 'Comprador Ganador';
    const customerEmail =
      payMeta?.customer_email || (order.profiles as any)?.email;
    const customerPhone =
      payMeta?.customer_phone || (order.profiles as any)?.phone || 'Sin teléfono';

    if (!customerEmail) {
      return NextResponse.json(
        { error: 'El ganador no tiene una dirección de correo electrónico registrada.' },
        { status: 400 }
      );
    }

    // 4. Determinar el premio principal
    const mainPrize =
      (raffle as any)?.raffle_prizes?.find((p: any) => p.prize_type === 'main') ||
      (raffle as any)?.raffle_prizes?.[0] || {
        name: 'Premio Mayor',
        prize_value: 0,
      };

    const prizeName = mainPrize.name || 'Gran Premio';
    const prizeValue = mainPrize.prize_value ? Number(mainPrize.prize_value) : undefined;

    // 5. Enviar Correo de Notificación de Ganador vía Resend
    const emailResult = await sendWinnerNotificationEmail({
      to: customerEmail,
      customerName,
      raffleName: raffle.name,
      lotteryName,
      drawDate,
      winningNumber,
      prizeName,
      prizeValue,
      orderNumber: order.order_number,
      evidenceUrl,
    });

    if (!emailResult.success) {
      return NextResponse.json(
        {
          error: `Error al enviar correo al ganador: ${emailResult.error}`,
          emailStatus: 'error_envio',
        },
        { status: 500 }
      );
    }

    // 6. Registrar / Actualizar en prize_winners si existe la tabla
    try {
      if (mainPrize.id) {
        await supabase
          .from('prize_winners')
          .upsert(
            {
              raffle_prize_id: mainPrize.id,
              raffle_number_id: winningTicket.id,
              order_id: Number(winningTicket.order_id),
              winning_value: winningNumber,
              status: 'won',
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'id' }
          );
      }
    } catch (pwErr) {
      console.warn('Nota prize_winners:', pwErr);
    }

    // 7. Registrar en auditoría
    await supabase.from('audit_logs').insert({
      action: 'GANADOR_NOTIFICADO_POR_CORREO',
      entity_type: 'Raffle',
      entity_id: Number(raffleId),
      details: {
        winning_number: winningNumber,
        customer_name: customerName,
        customer_email: customerEmail,
        customer_phone: customerPhone,
        order_number: order.order_number,
        prize_name: prizeName,
        prize_value: prizeValue,
        notified_at: new Date().toISOString(),
      },
    });

    return NextResponse.json({
      success: true,
      message: `¡Notificación enviada exitosamente al ganador ${customerName} (${customerEmail})!`,
      winner: {
        name: customerName,
        email: customerEmail,
        phone: customerPhone,
        orderNumber: order.order_number,
        number: winningNumber,
        prizeName,
        prizeValue,
        notifiedAt: new Date().toISOString(),
      },
    });
  } catch (err: any) {
    console.error('Error en notify-winner route:', err);
    return NextResponse.json(
      { error: 'Error interno al notificar al ganador', message: err.message },
      { status: 500 }
    );
  }
}
