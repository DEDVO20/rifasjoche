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

    // Validar estado de la rifa
    if (raffle.status !== 'active') {
      return NextResponse.json(
        { error: 'Este sorteo no se encuentra disponible para la venta de boletos.' },
        { status: 400 }
      );
    }

    // Validar si la fecha del sorteo ya pasó
    if (raffle.end_at && new Date(raffle.end_at).getTime() <= Date.now()) {
      return NextResponse.json(
        { error: 'No es posible comprar boletos: la fecha de este sorteo ya ha transcurrido y las ventas están oficialmente cerradas.' },
        { status: 400 }
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
    // Consultar números ya reservados/vendidos y números premiados de la rifa
    const [soldRes, prizesRes] = await Promise.all([
      supabase.from('raffle_numbers').select('number').eq('raffle_id', raffleId),
      supabase
        .from('raffle_prizes')
        .select('rule_value')
        .eq('raffle_id', raffleId)
        .eq('rule_type', 'specific_number'),
    ]);

    const takenSet = new Set((soldRes.data || []).map((r: any) => r.number));
    const totalPossible = raffle.total_numbers || 10000;
    const numberLength = raffle.number_length || 4;
    const availableCount = Math.max(0, totalPossible - takenSet.size);

    if (availableCount <= 0) {
      return NextResponse.json(
        { error: 'Lo sentimos, este sorteo ya se encuentra completamente agotado.', availableCount: 0 },
        { status: 400 }
      );
    }

    if (quantity > availableCount) {
      return NextResponse.json(
        {
          error: `Solo quedan ${availableCount} boletos disponibles para este sorteo. El máximo que puedes comprar es ${availableCount}.`,
          availableCount,
        },
        { status: 400 }
      );
    }

    // Identificar todos los números premiados configurados para este sorteo
    const winningNumbersSet = new Set<string>();
    (prizesRes.data || []).forEach((p: any) => {
      if (p.rule_value) {
        const cleanVal = p.rule_value.trim();
        const padded = cleanVal.padStart(numberLength, '0');
        winningNumbersSet.add(padded);
        winningNumbersSet.add(cleanVal);
        const parsed = parseInt(cleanVal, 10);
        if (!isNaN(parsed)) {
          winningNumbersSet.add(parsed.toString());
        }
      }
    });

    const isWinningNumber = (num: string): boolean => {
      if (winningNumbersSet.has(num)) return true;
      const parsed = parseInt(num, 10);
      if (!isNaN(parsed) && winningNumbersSet.has(parsed.toString())) return true;
      return false;
    };

    // Asignar números aleatorios asegurando MÁXIMO 1 NÚMERO PREMIADO en toda la compra
    const assignedNumbers: string[] = [];
    let assignedWinningCount = 0;

    let attempts = 0;
    while (assignedNumbers.length < quantity && attempts < 50000) {
      attempts++;
      const randomInt = Math.floor(Math.random() * totalPossible);
      const numStr = randomInt.toString().padStart(numberLength, '0');
      if (!takenSet.has(numStr) && !assignedNumbers.includes(numStr)) {
        const isWinning = isWinningNumber(numStr);

        // REGLA CRÍTICA: En una sola compra NO se pueden enviar/asignar 2 números premiados (máximo 1)
        if (isWinning && assignedWinningCount >= 1) {
          continue; // Ya tiene un número premiado asignado en esta compra; omitir este y buscar otro
        }

        assignedNumbers.push(numStr);
        if (isWinning) {
          assignedWinningCount++;
        }
      }
    }

    // Búsqueda secuencial de respaldo si se agotaron los intentos aleatorios
    if (assignedNumbers.length < quantity) {
      for (let i = 0; i < totalPossible && assignedNumbers.length < quantity; i++) {
        const numStr = i.toString().padStart(numberLength, '0');
        if (!takenSet.has(numStr) && !assignedNumbers.includes(numStr)) {
          const isWinning = isWinningNumber(numStr);
          if (isWinning && assignedWinningCount >= 1) {
            continue;
          }
          assignedNumbers.push(numStr);
          if (isWinning) {
            assignedWinningCount++;
          }
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
