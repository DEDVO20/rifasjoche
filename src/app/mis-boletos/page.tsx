'use client';

import { useState } from 'react';
import CustomerNavbar from '@/components/layout/CustomerNavbar';
import { createClient } from '@/lib/supabase/client';

interface TicketLookupResult {
  orderNumber: string;
  customerName: string;
  raffleName: string;
  drawDate: string;
  lotteryName: string;
  numbers: string[];
  totalPaid: number;
  status: string;
}

export default function MisBoletosPage() {
  const [documentInput, setDocumentInput] = useState('');
  const [hasSearched, setHasSearched] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [results, setResults] = useState<TicketLookupResult[]>([]);

  const supabase = createClient();

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const query = documentInput.trim();
    if (!query) return;

    setIsLoading(true);
    setHasSearched(true);

    try {
      // 1. Buscar coincidencia en perfiles por documento, teléfono o email
      const { data: profs } = await supabase
        .from('profiles')
        .select('id')
        .or(`document_number.eq.${query},phone.eq.${query},email.eq.${query}`);

      const userIds = profs ? profs.map((p) => p.id) : [];

      // 2. Consultar órdenes en public.orders
      let queryBuilder = supabase
        .from('orders')
        .select(`
          id,
          order_number,
          total,
          status,
          created_at,
          profiles (full_name),
          raffles (name, end_at, lotteries(name)),
          raffle_numbers (number)
        `)
        .order('created_at', { ascending: false });

      if (userIds.length > 0) {
        queryBuilder = queryBuilder.or(`order_number.eq.${query},user_id.in.(${userIds.join(',')})`);
      } else {
        queryBuilder = queryBuilder.eq('order_number', query);
      }

      const { data: ordersData, error } = await queryBuilder;

      if (!error && ordersData && ordersData.length > 0) {
        const mapped: TicketLookupResult[] = ordersData.map((item: any) => {
          const numbers = item.raffle_numbers
            ? item.raffle_numbers.map((rn: any) => rn.number)
            : [];

          return {
            orderNumber: item.order_number || `ORD-${item.id}`,
            customerName: item.profiles?.full_name || 'Cliente',
            raffleName: item.raffles?.name || 'Rifa Activa',
            drawDate: item.raffles?.end_at
              ? new Date(item.raffles.end_at).toLocaleDateString('es-CO', {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                })
              : 'Fecha Próxima',
            lotteryName: item.raffles?.lotteries?.name || 'Lotería de Medellín',
            numbers: numbers.length > 0 ? numbers : ['Aleatorio'],
            totalPaid: Number(item.total) || 0,
            status: item.status || 'confirmed',
          };
        });

        setResults(mapped);
      } else {
        setResults([]);
      }
    } catch (err) {
      console.error('Error buscando boletos:', err);
      setResults([]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-surface text-on-surface">
      <CustomerNavbar />

      <main className="max-w-4xl mx-auto px-4 py-12 space-y-8">
        {/* Banner Titulo */}
        <div className="text-center space-y-3">
          <div className="w-16 h-16 bg-secondary-container text-on-secondary-container rounded-2xl flex items-center justify-center mx-auto shadow-md">
            <span className="material-symbols-outlined text-[36px]">confirmation_number</span>
          </div>
          <h1 className="font-display-lg text-[32px] sm:text-[40px] font-extrabold text-primary">
            Consulta tus Boletos Comprados
          </h1>
          <p className="font-body-lg text-body-lg text-on-surface-variant max-w-xl mx-auto">
            Ingresa tu número de cédula/documento, celular o número de orden para consultar tus boletos asignados en Supabase.
          </p>
        </div>

        {/* Formulario de Consulta */}
        <div className="bg-surface-container-lowest p-6 sm:p-8 rounded-2xl shadow-lg border border-outline-variant/30 max-w-xl mx-auto">
          <form onSubmit={handleSearch} className="space-y-4">
            <div>
              <label className="block font-body-sm text-body-sm font-bold text-primary mb-1">
                Número de Cédula, Celular u Orden *
              </label>
              <div className="relative">
                <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-on-surface-variant">
                  badge
                </span>
                <input
                  type="text"
                  required
                  placeholder="Ej. 1098765432, 3001234567 o ORD-8821"
                  value={documentInput}
                  onChange={(e) => setDocumentInput(e.target.value)}
                  className="w-full pl-11 pr-4 py-3 border border-outline-variant rounded-xl bg-surface-container-lowest focus:ring-2 focus:ring-primary font-body-md text-body-md shadow-sm"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3.5 bg-primary text-on-primary rounded-xl font-body-md text-body-md font-extrabold shadow-md hover:bg-primary-container transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {isLoading ? (
                <>
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  Buscando en Supabase...
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined">search</span>
                  Buscar mis Boletos
                </>
              )}
            </button>
          </form>
        </div>

        {/* Resultados de la Consulta */}
        {hasSearched && !isLoading && (
          <div className="space-y-6">
            <h2 className="font-headline-md text-headline-md font-bold text-primary border-b border-outline-variant/20 pb-3">
              Resultados para: &ldquo;{documentInput}&rdquo; ({results.length} órdenes encontradas)
            </h2>

            {results.length === 0 ? (
              <div className="bg-surface-container-lowest p-8 rounded-2xl text-center border border-outline-variant/30 space-y-2">
                <span className="material-symbols-outlined text-[48px] text-on-surface-variant mb-2">
                  search_off
                </span>
                <h3 className="font-headline-md text-headline-md font-bold text-primary mb-1">
                  No se encontraron boletos registrados
                </h3>
                <p className="font-body-md text-body-md text-on-surface-variant max-w-md mx-auto">
                  Verifica que el número de cédula, celular o número de orden coincida exactamente con los datos ingresados al momento del pago.
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                {results.map((res, idx) => (
                  <div
                    key={idx}
                    className="bg-surface-container-lowest p-6 sm:p-8 rounded-2xl shadow-lg border border-outline-variant/30 space-y-4"
                  >
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 border-b border-outline-variant/20 pb-4">
                      <div>
                        <span className="font-label-caps text-label-caps text-emerald-600 font-bold uppercase tracking-wider flex items-center gap-1">
                          <span className="material-symbols-outlined text-[16px]">verified</span>
                          PAGO CONFIRMADO • ORDEN #{res.orderNumber}
                        </span>
                        <h3 className="font-headline-md text-headline-md font-extrabold text-primary mt-1">
                          {res.raffleName}
                        </h3>
                      </div>
                      <div className="text-right">
                        <span className="font-body-sm text-body-sm text-on-surface-variant block">
                          Total Pagado:
                        </span>
                        <span className="font-headline-md text-headline-md font-bold text-primary">
                          ${res.totalPaid.toLocaleString('es-CO')} COP
                        </span>
                      </div>
                    </div>

                    {/* Boletos */}
                    <div>
                      <span className="font-label-caps text-label-caps text-outline uppercase font-bold block mb-2">
                        TUS BOLETOS REGISTRADOS ({res.numbers.length})
                      </span>
                      <div className="flex flex-wrap gap-2">
                        {res.numbers.map((num) => (
                          <span
                            key={num}
                            className="px-4 py-2 bg-secondary-container text-on-secondary-container rounded-xl font-raffle-number text-lg font-extrabold shadow-sm border border-secondary-fixed-dim"
                          >
                            #{num}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Info Sorteo */}
                    <div className="bg-surface-container-low p-4 rounded-xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 font-body-sm text-body-sm">
                      <div>
                        <span className="text-on-surface-variant font-medium">Sorteo oficial con: </span>
                        <strong className="text-primary">{res.lotteryName}</strong>
                      </div>
                      <div className="font-bold text-primary">
                        Fecha: {res.drawDate}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
