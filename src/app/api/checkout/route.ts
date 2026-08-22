import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      raffleId,
      quantity,
      customerName,
      customerPhone,
      customerDocument,
      customerEmail,
      paymentMethod,
      paymentKey,
      proofUrl,
      transactionReference,
      userId,
    } = body;

    if (!raffleId || !quantity || !customerName || !customerPhone || !customerEmail) {
      return NextResponse.json(
        { error: 'Faltan datos obligatorios para procesar la orden' },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // 1. Obtener la rifa
    const { data: raffle, error: raffleError } = await supabase
      .from('raffles')
      .select('*')
      .eq('id', raffleId)
      .single();

    if (raffleError || !raffle) {
      return NextResponse.json(
        { error: 'Rifa no encontrada en el sistema' },
        { status: 404 }
      );
    }

    const pricePerTicket = Number(raffle.price_per_number) || 10000;
    const totalAmount = quantity * pricePerTicket;

    // 2. Gestionar el ID del comprador (soporta usuarios registrados y compradores invitados)
    let targetUserId = userId;

    if (!targetUserId) {
      // Buscar si ya existe un perfil con ese correo
      const { data: existingProfile } = await supabase
        .from('profiles')
        .select('id')
        .eq('email', customerEmail)
        .maybeSingle();

      if (existingProfile) {
        targetUserId = existingProfile.id;
      } else {
        // Fallback seguro: Usar el perfil del sistema para cumplir la clave foránea en PostgreSQL
        const { data: fallbackUser } = await supabase
          .from('profiles')
          .select('id')
          .limit(1)
          .single();

        targetUserId = fallbackUser?.id || null;
      }
    }

    // 3. Generar números aleatorios únicos disponibles
    const { data: soldRows } = await supabase
      .from('raffle_numbers')
      .select('number')
      .eq('raffle_id', raffleId);

    const takenSet = new Set((soldRows || []).map((r) => r.number));
    const totalPossible = raffle.total_numbers || 10000;
    const assignedNumbers: string[] = [];

    let attempts = 0;
    while (assignedNumbers.length < quantity && attempts < 50000) {
      attempts++;
      const randomInt = Math.floor(Math.random() * totalPossible);
      const numStr = randomInt.toString().padStart(raffle.number_length || 4, '0');
      if (!takenSet.has(numStr) && !assignedNumbers.includes(numStr)) {
        assignedNumbers.push(numStr);
      }
    }

    if (assignedNumbers.length < quantity) {
      for (let i = 0; i < totalPossible && assignedNumbers.length < quantity; i++) {
        const numStr = i.toString().padStart(raffle.number_length || 4, '0');
        if (!takenSet.has(numStr) && !assignedNumbers.includes(numStr)) {
          assignedNumbers.push(numStr);
        }
      }
    }

    // 4. Crear Orden en public.orders con estado PENDIENTE DE VERIFICACIÓN
    const orderNumber = `ORD-${Math.floor(100000 + Math.random() * 900000)}`;

    const { data: orderData, error: orderError } = await supabase
      .from('orders')
      .insert({
        order_number: orderNumber,
        user_id: targetUserId,
        raffle_id: raffleId,
        quantity: quantity,
        subtotal: totalAmount,
        total: totalAmount,
        status: 'pending',
        payment_status: 'pending',
      })
      .select()
      .single();

    if (orderError || !orderData) {
      console.error('Error creando orden en Supabase:', orderError);
      return NextResponse.json(
        { error: 'Error al registrar la orden en la base de datos', details: orderError },
        { status: 500 }
      );
    }

    // 5. Registrar el Pago en public.payments con todos los datos del comprador y comprobante
    await supabase.from('payments').insert({
      order_id: orderData.id,
      provider: paymentMethod || 'transfiya_nequi',
      amount: totalAmount,
      currency: 'COP',
      status: 'pending',
      payment_method: paymentMethod === 'pse' ? 'pse' : 'nequi',
      paid_at: new Date().toISOString(),
      metadata: {
        customer_name: customerName,
        customer_email: customerEmail,
        customer_phone: customerPhone,
        customer_document: customerDocument || '',
        proof_url: proofUrl || null,
        transaction_ref: transactionReference || null,
        payment_key: paymentKey || '3146676688',
      },
    });

    // 6. Registrar los boletos en public.raffle_numbers en estado RESERVADO
    const numbersToInsert = assignedNumbers.map((numStr) => ({
      raffle_id: raffleId,
      number: numStr,
      numeric_value: parseInt(numStr, 10),
      status: 'reserved',
      order_id: orderData.id,
      reserved_until: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    }));

    await supabase.from('raffle_numbers').upsert(numbersToInsert, {
      onConflict: 'raffle_id, number',
    });

    // 7. Registrar auditoría completa
    await supabase.from('audit_logs').insert({
      action: 'NUEVO_COMPROBANTE_PENDIENTE_VERIFICACION',
      entity_type: 'Order',
      entity_id: orderData.id.toString(),
      details: {
        order_number: orderNumber,
        raffle_name: raffle.name,
        quantity: quantity,
        total: totalAmount,
        assigned_numbers: assignedNumbers,
        customer_name: customerName,
        customer_phone: customerPhone,
        customer_email: customerEmail,
        customer_document: customerDocument || '',
        payment_key: paymentKey || '3146676688',
        transaction_reference: transactionReference || 'Comprobante Adjunto',
        proof_url: proofUrl || null,
      },
    });

    return NextResponse.json({
      success: true,
      orderNumber,
      totalAmount,
      customerName,
      customerEmail,
      quantity,
      raffleName: raffle.name,
      isPendingVerification: true,
    });
  } catch (err: any) {
    console.error('Excepción en /api/checkout:', err);
    return NextResponse.json(
      { error: 'Error interno procesando el checkout', message: err.message },
      { status: 500 }
    );
  }
}
