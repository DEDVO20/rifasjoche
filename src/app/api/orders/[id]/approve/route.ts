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

    // 3. Actualizar la orden a 'confirmed' y 'approved'
    const { error: updateOrderError } = await supabase
      .from('orders')
      .update({
        status: 'confirmed',
        payment_status: 'approved',
        updated_at: new Date().toISOString(),
      })
      .eq('id', orderId);

    if (updateOrderError) {
      return NextResponse.json({ error: 'Error actualizando estado de la orden', details: updateOrderError }, { status: 500 });
    }

    // 4. Actualizar el pago a 'approved'
    await supabase
      .from('payments')
      .update({
        status: 'approved',
        paid_at: new Date().toISOString(),
      })
      .eq('order_id', orderId);

    // 5. Cambiar el estado de los boletos de 'reserved' a 'sold' definitivamente
    await supabase
      .from('raffle_numbers')
      .update({
        status: 'sold',
        sold_at: new Date().toISOString(),
      })
      .eq('order_id', orderId);

    // 6. Preparar datos para notificación y correo
    const payMeta = (order as any)?.payments?.[0]?.metadata;
    const customerEmail = payMeta?.customer_email || (order.profiles as any)?.email || 'cliente@email.com';
    const customerName = payMeta?.customer_name || (order.profiles as any)?.full_name || 'Cliente';
    const raffleName = (order.raffles as any)?.name || 'Sorteo Oficial';
    const lotteryName = (order.raffles as any)?.lottery_draws?.lotteries?.name || 'Lotería Oficial';
    const drawDate = (order.raffles as any)?.end_at
      ? new Date((order.raffles as any).end_at).toLocaleDateString('es-CO', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        })
      : 'Próximamente';

    // 7. Enviar correo oficial con Resend
    let emailStatus = 'despachado';
    try {
      const emailResult = await sendTicketConfirmationEmail({
        to: customerEmail,
        customerName,
        orderNumber: order.order_number,
        raffleName,
        lotteryName,
        drawDate,
        ticketNumbers: ticketList,
        totalAmount: Number(order.total) || 0,
      });

      if (!emailResult.success) {
        emailStatus = `advertencia: ${emailResult.error}`;
      }
    } catch (emailErr) {
      console.warn('Error al enviar correo con Resend:', emailErr);
      emailStatus = 'error_envio';
    }

    // 8. Registrar auditoría
    await supabase.from('audit_logs').insert({
      action: 'PAGO_APROBADO_Y_BOLETOS_DESPACHADOS',
      entity_type: 'Order',
      entity_id: Number(orderId),
      details: {
        order_number: order.order_number,
        customer_name: customerName,
        customer_email: customerEmail,
        raffle_name: raffleName,
        assigned_numbers: ticketList,
        email_status: emailStatus,
        notified_at: new Date().toISOString(),
      },
    });

    const isEmailSent = !emailStatus.startsWith('advertencia') && emailStatus !== 'error_envio';
    const finalMessage = isEmailSent
      ? `¡Pago verificado con éxito! Boletos asignados y correo enviado a ${customerEmail}.`
      : `¡Pago verificado y boletos aprobados! (Nota de envío: ${emailStatus})`;

    return NextResponse.json({
      success: true,
      message: finalMessage,
      orderNumber: order.order_number,
      customerEmail,
      ticketList,
      emailStatus,
    });
  } catch (err: any) {
    console.error('Error en approve route:', err);
    return NextResponse.json({ error: 'Error interno al aprobar la orden', message: err.message }, { status: 500 });
  }
}
