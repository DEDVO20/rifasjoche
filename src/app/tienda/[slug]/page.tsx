'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import CustomerNavbar from '@/components/layout/CustomerNavbar';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { createClient } from '@/lib/supabase/client';

interface PublicPrize {
  name: string;
  type: 'main' | 'secondary';
  valueText: string;
  ruleText: string;
}

interface PublicRaffleDetail {
  id: number;
  name: string;
  slug: string;
  image: string;
  pricePerTicket: number;
  minOrder: number;
  lotteryName: string;
  drawDate: string;
  description: string;
  prizes: PublicPrize[];
}

export default function PublicTicketSelectionPage({ params }: { params: { slug: string } }) {
  const [raffle, setRaffle] = useState<PublicRaffleDetail | null>(null);
  const [ticketQuantity, setTicketQuantity] = useState<number>(2);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [checkoutStep, setCheckoutStep] = useState<1 | 2 | 3>(1); // 1: Datos, 2: Llave de Pago, 3: Comprobante
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isPaymentSuccess, setIsPaymentSuccess] = useState(false);
  const [assignedNumbers, setAssignedNumbers] = useState<string[]>([]);
  const [confirmedOrderNumber, setConfirmedOrderNumber] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [copiedKey, setCopiedKey] = useState(false);

  // Datos de comprobante de pago
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [proofPreview, setProofPreview] = useState<string | null>(null);
  const [transactionRef, setTransactionRef] = useState('');
  const [selectedMethod, setSelectedMethod] = useState<'nequi' | 'daviplata' | 'bancolombia'>('nequi');

  const { user, profile } = useAuth();
  const { success: toastSuccess, error: toastError, info: toastInfo } = useToast();
  const supabase = createClient();

  // Llave única oficial designada (recibe de cualquier entidad / banco)
  const DESIGNATED_PAYMENT_KEY = '3146676688';

  // Form checkout pre-llenado si está logueado
  const [customerForm, setCustomerForm] = useState({
    fullName: '',
    documentNumber: '',
    phone: '',
    email: '',
  });

  // Cargar Rifa y sus Premios reales desde Supabase por slug o ID
  const loadRaffleDetail = useCallback(async () => {
    try {
      setIsLoading(true);

      let query = supabase
        .from('raffles')
        .select(`
          *,
          lottery_draws (id, lotteries (name)),
          raffle_prizes (*)
        `);

      if (!isNaN(Number(params.slug))) {
        query = query.eq('id', Number(params.slug));
      } else {
        query = query.eq('slug', params.slug);
      }

      const { data, error } = await query.single();

      if (!error && data) {
        const formattedPrizes: PublicPrize[] = (data.raffle_prizes || []).map((p: any) => ({
          name: p.name || 'Premio de Sorteo',
          type: p.prize_type === 'main' ? 'main' : 'secondary',
          valueText: p.prize_value ? `$${Number(p.prize_value).toLocaleString('es-CO')} COP` : 'Premio Especial',
          ruleText: p.rule_type === 'exact_match'
            ? `Gana con Coincidencia Exacta del premio de ${data.lottery_draws?.lotteries?.name || 'Lotería Oficial'}`
            : `Gana con regla especial ${p.rule_type || 'asociada'}`,
        }));

        const minQty = data.minimum_numbers_per_order || 1;

        const formattedRaffle: PublicRaffleDetail = {
          id: data.id,
          name: data.name,
          slug: data.slug || `sorteo-${data.id}`,
          image: data.image_url || 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=800&q=80',
          pricePerTicket: Number(data.price_per_number) || 10000,
          minOrder: minQty,
          lotteryName: data.lottery_draws?.lotteries?.name || 'Lotería Oficial',
          drawDate: data.end_at
            ? new Date(data.end_at).toLocaleDateString('es-CO', {
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })
            : 'Próximamente',
          description: data.description || 'Participa y gana fabulosos premios con este sorteo verificado.',
          prizes: formattedPrizes.length > 0 ? formattedPrizes : [
            {
              name: '🏆 Premio Mayor',
              type: 'main',
              valueText: 'Premio Principal',
              ruleText: `Coincidencia exacta con ${data.lottery_draws?.lotteries?.name || 'Lotería Oficial'}`,
            }
          ],
        };

        setRaffle(formattedRaffle);
        setTicketQuantity(minQty);
      }
    } catch (err) {
      console.error('Error cargando detalle de rifa:', err);
    } finally {
      setIsLoading(false);
    }
  }, [params.slug, supabase]);

  useEffect(() => {
    loadRaffleDetail();
  }, [loadRaffleDetail]);

  useEffect(() => {
    if (profile || user) {
      setCustomerForm((prev) => ({
        ...prev,
        fullName: profile?.full_name || '',
        documentNumber: profile?.document_number || '',
        phone: profile?.phone || '',
        email: user?.email || '',
      }));
    }
  }, [profile, user]);

  const pricePerTicket = raffle?.pricePerTicket || 10000;
  const minNumbersPerOrder = raffle?.minOrder || 1;
  const totalAmount = ticketQuantity * pricePerTicket;
  const isMinMet = ticketQuantity >= minNumbersPerOrder;

  const handleQuantityChange = (newQty: number) => {
    const clamped = Math.max(minNumbersPerOrder, newQty);
    setTicketQuantity(clamped);
  };

  const handleCopyKey = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(true);
    toastSuccess('¡Llave Copiada!', `${text} copiado al portapapeles.`);
    setTimeout(() => setCopiedKey(false), 2000);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setProofFile(file);
      setProofPreview(URL.createObjectURL(file));
      toastInfo('Comprobante Seleccionado', `${file.name} listo para subir.`);
    }
  };

  const fileToDataUrl = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  // Enviar y Guardar Compra a través de /api/checkout y subir comprobante
  const handleFinalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerForm.fullName || !customerForm.phone || !raffle) return;

    try {
      setIsSubmitting(true);
      let uploadedProofUrl = '';

      // 1. Convertir a Data URL permanente o subir al bucket 'comprobantes'
      if (proofFile) {
        try {
          const clientDataUrl = await fileToDataUrl(proofFile);
          uploadedProofUrl = clientDataUrl;

          const uploadFormData = new FormData();
          uploadFormData.append('file', proofFile);

          const uploadRes = await fetch('/api/upload-proof', {
            method: 'POST',
            body: uploadFormData,
          });

          if (uploadRes.ok) {
            const uploadJson = await uploadRes.json();
            if (uploadJson.publicUrl) {
              uploadedProofUrl = uploadJson.publicUrl;
            }
          }
        } catch (uploadErr) {
          console.warn('Fallback en subida de comprobante:', uploadErr);
        }
      }

      // 2. Procesar el checkout con la URL del comprobante
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          raffleId: raffle.id,
          quantity: ticketQuantity,
          customerName: customerForm.fullName,
          customerPhone: customerForm.phone,
          customerDocument: customerForm.documentNumber,
          customerEmail: customerForm.email,
          paymentMethod: 'transfiya_nequi',
          paymentKey: DESIGNATED_PAYMENT_KEY,
          proofUrl: uploadedProofUrl,
          transactionReference: transactionRef || 'Comprobante Adjunto',
          userId: user?.id || null,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'No se pudo procesar la compra.');
      }

      setConfirmedOrderNumber(data.orderNumber);
      setAssignedNumbers(data.assignedNumbers);
      setIsPaymentSuccess(true);
      toastSuccess('¡Orden Registrada!', `Comprobante de orden #${data.orderNumber} enviado a verificación.`);
    } catch (err: any) {
      console.error('Error procesando la compra:', err);
      toastError('Error al Procesar Compra', err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-surface text-on-surface">
        <CustomerNavbar />
        <div className="py-24 text-center text-primary font-bold text-lg">
          Cargando detalles del sorteo desde Supabase...
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface text-on-surface">
      <CustomerNavbar />

      {/* Header Rifa */}
      <section className="bg-surface-container-lowest border-b border-outline-variant/30 py-8 px-4">
        <div className="max-w-container-max mx-auto flex flex-col md:flex-row gap-6 items-center">
          <div className="w-full md:w-48 h-36 rounded-xl overflow-hidden bg-surface-container-high shrink-0 shadow-md">
            {/* eslint-disable-next-html-element-suppression */}
            <img
              src={raffle?.image}
              alt={raffle?.name}
              className="w-full h-full object-cover"
            />
          </div>
          <div className="flex-1 space-y-2 text-center md:text-left">
            <div className="flex flex-wrap items-center justify-center md:justify-start gap-2">
              <span className="px-3 py-1 bg-tertiary-fixed-dim/20 text-on-tertiary-container rounded-full text-xs font-bold uppercase">
                Sortea con {raffle?.lotteryName}
              </span>
              <span className="px-3 py-1 bg-secondary-container/50 text-on-secondary-container rounded-full text-xs font-bold">
                ⚠️ Compra Mínima: {minNumbersPerOrder} Boletos
              </span>
            </div>
            <h1 className="font-display-lg text-[28px] md:text-[36px] font-extrabold text-primary">
              {raffle?.name}
            </h1>
            <p className="font-body-md text-body-md text-on-surface-variant">
              {raffle?.description}
            </p>
            <div className="font-headline-md text-headline-md font-extrabold text-secondary-fixed-variant">
              ${pricePerTicket.toLocaleString('es-CO')} COP <span className="font-body-sm font-normal text-on-surface-variant">por boleto</span>
            </div>
          </div>
        </div>
      </section>

      {/* Premios Configurados en la Rifa */}
      <section className="max-w-container-max mx-auto px-4 pt-6">
        <div className="bg-surface-container-low p-6 rounded-2xl border border-outline-variant/30 space-y-4">
          <h3 className="font-headline-md text-headline-md font-bold text-primary flex items-center gap-2">
            <span className="material-symbols-outlined text-secondary-container text-[24px]">emoji_events</span>
            Premios Configurados en este Sorteo
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {raffle?.prizes.map((p, idx) => (
              <div
                key={idx}
                className="bg-surface-container-lowest p-4 rounded-xl shadow-sm border border-outline-variant/20 space-y-1"
              >
                <span
                  className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${p.type === 'main'
                      ? 'bg-secondary-container text-on-secondary-container'
                      : 'bg-surface-container-high text-primary'
                    }`}
                >
                  {p.type === 'main' ? 'Premio Mayor' : 'Premio Secundario'}
                </span>
                <h4 className="font-body-md text-body-md font-bold text-primary mt-1">
                  {p.name}
                </h4>
                <div className="font-headline-md text-headline-md font-extrabold text-tertiary-fixed-dim">
                  {p.valueText}
                </div>
                <p className="font-body-sm text-xs text-on-surface-variant">
                  {p.ruleText}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Selector de Cantidad */}
      <main className="max-w-container-max mx-auto px-4 py-8 grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-surface-container-lowest p-8 rounded-2xl shadow-sm border border-outline-variant/30 space-y-6">
            <div className="flex justify-between items-center border-b border-outline-variant/20 pb-4">
              <div>
                <h3 className="font-headline-md text-headline-md font-bold text-primary">
                  Selecciona la Cantidad de Boletos
                </h3>
                <p className="font-body-sm text-body-sm text-on-surface-variant">
                  Los números de tus boletos serán asignados automáticamente de forma aleatoria.
                </p>
              </div>
              <span className="text-xs font-bold text-on-secondary-container bg-secondary-container px-3 py-1 rounded-full">
                Asignación Aleatoria
              </span>
            </div>

            {/* Paquetes de Selección Rápida */}
            <div className="space-y-2">
              <label className="font-body-sm text-body-sm font-bold text-primary block">
                Paquetes Rápidos:
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { qty: minNumbersPerOrder, label: `${minNumbersPerOrder} Boletos`, badge: 'Mínimo' },
                  { qty: minNumbersPerOrder + 3, label: `${minNumbersPerOrder + 3} Boletos`, badge: 'Popular ⭐' },
                  { qty: minNumbersPerOrder + 8, label: `${minNumbersPerOrder + 8} Boletos`, badge: 'Más Oportunidad' },
                  { qty: minNumbersPerOrder + 18, label: `${minNumbersPerOrder + 18} Boletos`, badge: 'Mega Combo' },
                ].map((pack) => (
                  <button
                    key={pack.qty}
                    type="button"
                    onClick={() => setTicketQuantity(pack.qty)}
                    className={`p-4 rounded-xl text-center border transition-all ${ticketQuantity === pack.qty
                        ? 'border-2 border-primary bg-secondary-container text-on-secondary-container shadow-md scale-105 font-bold'
                        : 'border-outline-variant hover:border-primary hover:bg-surface-container'
                      }`}
                  >
                    <div className="font-headline-md text-headline-md font-extrabold">{pack.label}</div>
                    <span className="text-[10px] font-bold uppercase opacity-80">{pack.badge}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Selector Manual (- y +) */}
            <div className="p-6 bg-surface-container-low rounded-xl border border-outline-variant/30 space-y-3 text-center">
              <label className="font-body-sm text-body-sm font-bold text-primary block">
                O ajusta libremente la cantidad deseada:
              </label>
              <div className="flex items-center justify-center gap-4">
                <button
                  type="button"
                  onClick={() => handleQuantityChange(ticketQuantity - 1)}
                  disabled={ticketQuantity <= minNumbersPerOrder}
                  className="w-12 h-12 rounded-xl bg-surface-container-high text-primary font-extrabold text-2xl hover:bg-surface-container-highest transition-colors disabled:opacity-30"
                >
                  -
                </button>
                <div className="px-6 py-2 bg-surface-container-lowest border border-outline-variant rounded-xl text-center min-w-[120px]">
                  <span className="font-display-lg text-display-lg font-extrabold text-primary block">
                    {ticketQuantity}
                  </span>
                  <span className="text-xs text-on-surface-variant font-medium">boletos</span>
                </div>
                <button
                  type="button"
                  onClick={() => handleQuantityChange(ticketQuantity + 1)}
                  className="w-12 h-12 rounded-xl bg-primary text-on-primary font-extrabold text-2xl hover:bg-primary-container transition-colors"
                >
                  +
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Resumen */}
        <div className="space-y-6">
          <div className="bg-surface-container-lowest p-6 rounded-2xl shadow-lg border border-outline-variant/30 sticky top-24 space-y-6">
            <h3 className="font-headline-md text-headline-md font-bold text-primary flex items-center gap-2 border-b border-outline-variant/20 pb-4">
              <span className="material-symbols-outlined">shopping_bag</span>
              Resumen de la Compra
            </h3>

            <div className="space-y-3 font-body-md text-body-md">
              <div className="flex justify-between text-on-surface-variant">
                <span>Cantidad de Boletos</span>
                <span className="font-bold text-primary">{ticketQuantity} boletos</span>
              </div>
              <div className="flex justify-between text-on-surface-variant">
                <span>Precio por Boleto</span>
                <span>${pricePerTicket.toLocaleString('es-CO')} COP</span>
              </div>
              <div className="flex justify-between text-on-surface-variant">
                <span>Asignación</span>
                <span className="text-xs font-bold text-emerald-600">Aleatoria Automática</span>
              </div>
            </div>

            <div className="pt-4 border-t border-outline-variant/20 space-y-2">
              <div className="flex justify-between font-headline-md text-headline-md font-extrabold text-primary">
                <span>Total a Pagar</span>
                <span>${totalAmount.toLocaleString('es-CO')} COP</span>
              </div>
            </div>

            <button
              disabled={!isMinMet}
              onClick={() => {
                setCheckoutStep(1);
                setIsCheckoutOpen(true);
              }}
              className="w-full py-4 bg-primary text-on-primary rounded-xl font-body-md text-body-md font-extrabold shadow-lg hover:bg-primary-container disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
            >
              <span className="material-symbols-outlined">payments</span>
              Comprar y Transferir (${totalAmount.toLocaleString('es-CO')})
            </button>
          </div>
        </div>
      </main>

      {/* MODAL CHECKOUT EN 3 PASOS: 1. DATOS, 2. LLAVE DE PAGO, 3. COMPROBANTE */}
      {isCheckoutOpen && !isPaymentSuccess && (
        <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-surface-container-lowest rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-outline-variant/30 animate-in fade-in zoom-in-95 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <div>
                <h2 className="font-headline-md text-headline-md font-bold text-primary">
                  Proceso de Pago y Compra
                </h2>
                <div className="flex items-center gap-2 mt-1">
                  <span className={`px-2 py-0.5 rounded text-xs font-bold ${checkoutStep === 1 ? 'bg-primary text-on-primary' : 'bg-surface-container text-on-surface-variant'}`}>
                    1. Datos
                  </span>
                  <span>→</span>
                  <span className={`px-2 py-0.5 rounded text-xs font-bold ${checkoutStep === 2 ? 'bg-primary text-on-primary' : 'bg-surface-container text-on-surface-variant'}`}>
                    2. Llave de Pago
                  </span>
                  <span>→</span>
                  <span className={`px-2 py-0.5 rounded text-xs font-bold ${checkoutStep === 3 ? 'bg-primary text-on-primary' : 'bg-surface-container text-on-surface-variant'}`}>
                    3. Comprobante
                  </span>
                </div>
              </div>
              <button
                onClick={() => setIsCheckoutOpen(false)}
                className="text-on-surface-variant hover:text-primary p-1 rounded-full"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            {/* PASO 1: FORMULARIO DE DATOS DEL CLIENTE */}
            {checkoutStep === 1 && (
              <div className="space-y-4 pt-2">
                <div className="bg-secondary-container/30 p-3 rounded-xl flex items-center gap-2 text-on-secondary-container font-body-sm text-xs font-semibold">
                  <span className="material-symbols-outlined text-secondary-fixed-dim">info</span>
                  Ingresa tus datos para registrar y asignar tus {ticketQuantity} boletos oficiales.
                </div>

                <div>
                  <label className="block font-body-sm text-body-sm font-bold text-primary mb-1">
                    Nombre Completo *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ej. Carlos Mendoza"
                    value={customerForm.fullName}
                    onChange={(e) => setCustomerForm({ ...customerForm, fullName: e.target.value })}
                    className="w-full px-4 py-2.5 border border-outline-variant rounded-xl bg-surface-container-lowest focus:ring-2 focus:ring-primary font-body-md text-body-md"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block font-body-sm text-body-sm font-bold text-primary mb-1">
                      Cédula / Documento *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="1098765432"
                      value={customerForm.documentNumber}
                      onChange={(e) => setCustomerForm({ ...customerForm, documentNumber: e.target.value })}
                      className="w-full px-4 py-2.5 border border-outline-variant rounded-xl bg-surface-container-lowest focus:ring-2 focus:ring-primary font-body-md text-body-md"
                    />
                  </div>
                  <div>
                    <label className="block font-body-sm text-body-sm font-bold text-primary mb-1">
                      Celular WhatsApp *
                    </label>
                    <input
                      type="tel"
                      required
                      placeholder="3001234567"
                      value={customerForm.phone}
                      onChange={(e) => setCustomerForm({ ...customerForm, phone: e.target.value })}
                      className="w-full px-4 py-2.5 border border-outline-variant rounded-xl bg-surface-container-lowest focus:ring-2 focus:ring-primary font-body-md text-body-md"
                    />
                  </div>
                </div>

                <div>
                  <label className="block font-body-sm text-body-sm font-bold text-primary mb-1">
                    Correo Electrónico *
                  </label>
                  <input
                    type="email"
                    required
                    placeholder="carlos.mendoza@email.com"
                    value={customerForm.email}
                    onChange={(e) => setCustomerForm({ ...customerForm, email: e.target.value })}
                    className="w-full px-4 py-2.5 border border-outline-variant rounded-xl bg-surface-container-lowest focus:ring-2 focus:ring-primary font-body-md text-body-md"
                  />
                </div>

                <div className="pt-4 border-t border-outline-variant/20 flex justify-between items-center">
                  <span className="font-headline-md text-headline-md font-bold text-primary">
                    ${totalAmount.toLocaleString('es-CO')} COP
                  </span>
                  <button
                    type="button"
                    disabled={!customerForm.fullName || !customerForm.phone || !customerForm.email}
                    onClick={() => setCheckoutStep(2)}
                    className="px-6 py-3 bg-primary text-on-primary rounded-xl font-body-md text-body-md font-bold hover:bg-primary-container shadow-md disabled:opacity-50 flex items-center gap-2"
                  >
                    Ver Llave de Pago
                    <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
                  </button>
                </div>
              </div>
            )}

            {/* PASO 2: LLAVE DE TRANSFERENCIA Y DATOS DE PAGO */}
            {checkoutStep === 2 && (
              <div className="space-y-4 pt-2">
                <div className="bg-amber-500/10 p-3 rounded-xl flex items-center gap-2 text-amber-700 font-body-sm text-xs font-semibold border border-amber-500/20">
                  <span className="material-symbols-outlined text-[20px]">timer</span>
                  Transfiere el valor exacto a la siguiente llave y luego carga tu comprobante.
                </div>

                {/* Tarjeta de la Llave Oficial Única */}
                <div className="p-5 bg-surface-container-low rounded-2xl border-2 border-primary/30 space-y-4 shadow-sm">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-extrabold uppercase tracking-wider text-primary">
                      LLAVE OFICIAL DE PAGO Y TRANSFERENCIA
                    </span>
                    <span className="text-[11px] font-bold bg-primary text-on-primary px-2.5 py-0.5 rounded-full">
                      Cualquier Entidad
                    </span>
                  </div>

                  <div className="flex items-center justify-between bg-surface-container-lowest p-4 rounded-xl border-2 border-primary/20 shadow-inner">
                    <div>
                      <span className="text-[11px] font-bold uppercase text-on-surface-variant block">Número de Llave:</span>
                      <span className="font-mono text-2xl sm:text-3xl font-extrabold text-primary tracking-wider">
                        {DESIGNATED_PAYMENT_KEY}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleCopyKey(DESIGNATED_PAYMENT_KEY)}
                      className="px-4 py-2.5 bg-primary text-on-primary rounded-xl text-sm font-bold flex items-center gap-1.5 hover:bg-primary-container shadow-md transition-all active:scale-95"
                    >
                      <span className="material-symbols-outlined text-[16px]">content_copy</span>
                      {copiedKey ? '¡Copiado!' : 'Copiar Llave'}
                    </button>
                  </div>

                  <div className="p-3 bg-surface-container-lowest rounded-xl border border-outline-variant/30 space-y-2 text-xs">
                    <div className="flex justify-between text-on-surface-variant">
                      <span>Acepta pagos desde:</span>
                      <strong className="text-primary text-right">Nequi, Daviplata, Bancolombia, Transfiya y Todos los Bancos</strong>
                    </div>
                    <div className="flex justify-between text-on-surface-variant border-t border-outline-variant/20 pt-2">
                      <span>Titular:</span>
                      <strong className="text-primary">Rifas Oficiales Colombia</strong>
                    </div>
                    <div className="flex justify-between text-on-surface-variant border-t border-outline-variant/20 pt-2">
                      <span className="font-bold text-sm text-primary">Total a Transferir:</span>
                      <span className="font-extrabold text-lg text-primary">${totalAmount.toLocaleString('es-CO')} COP</span>
                    </div>
                  </div>
                </div>

                <div className="flex justify-between items-center pt-3 border-t border-outline-variant/20">
                  <button
                    type="button"
                    onClick={() => setCheckoutStep(1)}
                    className="px-4 py-2.5 border border-outline-variant rounded-xl font-bold text-sm hover:bg-surface-container"
                  >
                    ← Volver a Datos
                  </button>
                  <button
                    type="button"
                    onClick={() => setCheckoutStep(3)}
                    className="px-6 py-3 bg-primary text-on-primary rounded-xl font-bold text-sm hover:bg-primary-container shadow-md flex items-center gap-2"
                  >
                    Ya transferí, Cargar Comprobante
                    <span className="material-symbols-outlined text-[18px]">upload_file</span>
                  </button>
                </div>
              </div>
            )}

            {/* PASO 3: CARGA DE COMPROBANTE DE PAGO */}
            {checkoutStep === 3 && (
              <form onSubmit={handleFinalSubmit} className="space-y-4 pt-2">
                <div className="bg-emerald-500/10 p-3 rounded-xl flex items-center gap-2 text-emerald-700 font-body-sm text-xs font-semibold border border-emerald-500/20">
                  <span className="material-symbols-outlined text-[20px]">verified</span>
                  Adjunta la captura o foto del comprobante de transferencia para validar tu orden.
                </div>

                {/* Zona de Subida de Archivo */}
                <div>
                  <label className="block font-body-sm text-body-sm font-bold text-primary mb-2">
                    Foto o Captura del Comprobante *
                  </label>
                  <label className="border-2 border-dashed border-outline-variant hover:border-primary rounded-2xl p-6 flex flex-col items-center justify-center cursor-pointer bg-surface-container-low/50 hover:bg-surface-container-low transition-colors">
                    <span className="material-symbols-outlined text-[40px] text-primary mb-2">
                      cloud_upload
                    </span>
                    <span className="font-body-sm text-sm font-bold text-primary">
                      {proofFile ? proofFile.name : 'Haz clic para seleccionar comprobante'}
                    </span>
                    <span className="text-xs text-on-surface-variant mt-1">
                      Formatos soportados: JPG, PNG, PDF (Máx. 10MB)
                    </span>
                    <input
                      type="file"
                      accept="image/*,.pdf"
                      onChange={handleFileChange}
                      className="hidden"
                    />
                  </label>
                </div>

                {/* Vista Previa de Imagen o PDF */}
                {proofFile && (
                  <div className="p-3 bg-surface-container-lowest rounded-xl border border-emerald-500/30 bg-emerald-500/[0.03] flex items-center gap-3">
                    {proofFile.type === 'application/pdf' || proofFile.name.toLowerCase().endsWith('.pdf') ? (
                      <div className="w-12 h-12 rounded-lg bg-rose-500/10 text-rose-600 border border-rose-500/20 flex items-center justify-center flex-shrink-0">
                        <span className="material-symbols-outlined text-[28px]">picture_as_pdf</span>
                      </div>
                    ) : proofPreview ? (
                      /* eslint-disable-next-html-element-suppression */
                      <img
                        src={proofPreview}
                        alt="Vista Previa"
                        className="w-12 h-12 object-cover rounded-lg border border-outline-variant flex-shrink-0"
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-lg bg-primary/10 text-primary flex items-center justify-center flex-shrink-0">
                        <span className="material-symbols-outlined text-[28px]">description</span>
                      </div>
                    )}
                    <div className="flex-1 text-xs min-w-0">
                      <strong className="text-primary block truncate">{proofFile.name}</strong>
                      <span className="text-on-surface-variant">
                        {(proofFile.size / (1024 * 1024)).toFixed(2)} MB • Comprobante Listo
                      </span>
                    </div>
                    <span className="material-symbols-outlined text-emerald-600 flex-shrink-0">check_circle</span>
                  </div>
                )}

                {/* Referencia de Transferencia */}
                <div>
                  <label className="block font-body-sm text-body-sm font-bold text-primary mb-1">
                    Número de Aprobación / Referencia (Opcional)
                  </label>
                  <input
                    type="text"
                    placeholder="Ej. M184920"
                    value={transactionRef}
                    onChange={(e) => setTransactionRef(e.target.value)}
                    className="w-full px-4 py-2 border border-outline-variant rounded-xl text-sm bg-surface-container-lowest"
                  />
                </div>

                <div className="pt-4 border-t border-outline-variant/20 flex justify-between items-center">
                  <button
                    type="button"
                    onClick={() => setCheckoutStep(2)}
                    className="px-4 py-2.5 border border-outline-variant rounded-xl font-bold text-sm hover:bg-surface-container"
                  >
                    ← Ver Llave
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="px-6 py-3 bg-primary text-on-primary rounded-xl font-bold text-sm hover:bg-primary-container shadow-md flex items-center gap-2 disabled:opacity-50"
                  >
                    {isSubmitting ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                        Validando Compra...
                      </>
                    ) : (
                      <>Confirmar y Enviar Comprobante</>
                    )}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* PANTALLA DE ÉXITO CON BOLETOS ASIGNADOS */}
      {isPaymentSuccess && (
        <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-surface-container-lowest rounded-2xl max-w-lg w-full p-8 shadow-2xl border border-outline-variant/30 text-center space-y-6 animate-in zoom-in-95">
            <div className="w-16 h-16 bg-tertiary-fixed-dim/20 text-on-tertiary-container rounded-full flex items-center justify-center mx-auto">
              <span className="material-symbols-outlined text-[40px]">check_circle</span>
            </div>

            <div>
              <span className="font-label-caps text-label-caps text-tertiary-fixed-dim font-bold uppercase">
                ¡COMPROBANTE ENVIADO A VERIFICACIÓN!
              </span>
              <h2 className="font-headline-md text-headline-md font-extrabold text-primary mt-1">
                Orden #{confirmedOrderNumber || 'ORD-PENDIENTE'}
              </h2>
              <p className="font-body-md text-body-md text-on-surface-variant mt-3">
                Hemos recibido tu comprobante de pago para <strong>{customerForm.fullName}</strong>.
              </p>
            </div>

            {/* Aviso de Verificación y Notificación al Correo */}
            <div className="bg-amber-500/10 p-5 rounded-2xl border border-amber-500/20 text-left space-y-2">
              <div className="flex items-center gap-2 text-amber-700 font-bold text-sm">
                <span className="material-symbols-outlined text-[20px]">mark_email_read</span>
                Verificación en Curso
              </div>
              <p className="text-xs text-on-surface-variant leading-relaxed">
                El administrador validará tu transferencia. Una vez aprobado el pago, tus <strong>{ticketQuantity} boletos oficiales</strong> serán despachados automáticamente a tu correo <strong>{customerForm.email}</strong> y podrás consultarlos en la sección de boletos.
              </p>
            </div>

            <div className="flex flex-col gap-3">
              <Link
                href="/mis-boletos"
                className="w-full py-3.5 bg-primary text-on-primary rounded-xl font-body-md text-body-md font-bold shadow-md hover:bg-primary-container flex items-center justify-center gap-2"
              >
                <span className="material-symbols-outlined text-[18px]">confirmation_number</span>
                Consultar Estado en Mis Boletos
              </Link>
              <button
                onClick={() => {
                  setIsPaymentSuccess(false);
                  setIsCheckoutOpen(false);
                }}
                className="w-full py-2 text-on-surface-variant font-body-sm text-body-sm font-semibold hover:text-primary"
              >
                Volver a la Tienda
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
