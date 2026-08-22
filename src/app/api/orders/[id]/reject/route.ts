import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

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

    // 1. Actualizar orden a cancelled / rejected
    await supabase
      .from('orders')
      .update({
        status: 'cancelled',
        payment_status: 'rejected',
        updated_at: new Date().toISOString(),
      })
      .eq('id', orderId);

    // 2. Actualizar pago a rejected
    await supabase
      .from('payments')
      .update({
        status: 'rejected',
      })
      .eq('order_id', orderId);

    // 3. Liberar los boletos reservados
    await supabase
      .from('raffle_numbers')
      .delete()
      .eq('order_id', orderId);

    // 4. Registrar en auditoría
    await supabase.from('audit_logs').insert({
      action: 'PAGO_RECHAZADO_Y_BOLETOS_LIBERADOS',
      entity_type: 'Order',
      entity_id: Number(orderId),
      details: {
        message: `Orden ${orderId} rechazada por el administrador. Boletos liberados al público.`,
        rejected_at: new Date().toISOString(),
      },
    });

    return NextResponse.json({
      success: true,
      message: 'La orden ha sido rechazada y los boletos han sido liberados.',
    });
  } catch (err: any) {
    console.error('Error en reject route:', err);
    return NextResponse.json({ error: 'Error interno al rechazar la orden', message: err.message }, { status: 500 });
  }
}
