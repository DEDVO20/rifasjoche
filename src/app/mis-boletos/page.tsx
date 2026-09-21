'use client';

import { useState } from 'react';
import CustomerNavbar from '@/components/layout/CustomerNavbar';

interface InstantPrize {
  number: string;
  prizeName: string;
  prizeValue?: number;
}

interface WinningTicketDetail {
  prizeName: string;
  prizeValue?: number;
  isMainPrize: boolean;
}

interface TicketLookupResult {
  id: number;
  orderNumber: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  customerDocument: string;
  raffleName: string;
  drawDate: string;
  lotteryName: string;
  numbers: string[];
  totalPaid: number;
  status: 'confirmed' | 'pending' | 'rejected' | string;
  createdAt: string;
  officialWinningNumber?: string;
  instantPrizes?: InstantPrize[];
  winningTickets?: { [num: string]: WinningTicketDetail };
}

export default function MisBoletosPage() {
  const [searchInput, setSearchInput] = useState('');
  const [hasSearched, setHasSearched] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [results, setResults] = useState<TicketLookupResult[]>([]);
  const [searchedTerm, setSearchedTerm] = useState('');

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const query = searchInput.trim();
    if (!query) return;

    setIsLoading(true);
    setHasSearched(true);
    setSearchedTerm(query);

    try {
      const res = await fetch('/api/tickets/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      });

      if (!res.ok) {
        throw new Error('Error en la respuesta del servidor');
      }

      const data = await res.json();
      setResults(data.tickets || []);
    } catch (err) {
      console.error('Error buscando boletos:', err);
      setResults([]);
    } finally {
      setIsLoading(false);
    }
  };

  const isMatchedTicket = (num: string) => {
    if (!searchedTerm) return false;
    const clean = searchedTerm.trim();
    return (
      num === clean ||
      num === clean.padStart(2, '0') ||
      num === clean.padStart(3, '0') ||
      num === clean.padStart(4, '0') ||
      num === clean.padStart(5, '0') ||
      parseInt(num, 10) === parseInt(clean, 10)
    );
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
            Ingresa tu cédula/documento, celular, correo electrónico, número de orden o número de boleto para consultar tus números asignados.
          </p>
        </div>

        {/* Formulario de Consulta */}
        <div className="bg-surface-container-lowest p-6 sm:p-8 rounded-2xl shadow-lg border border-outline-variant/30 max-w-xl mx-auto">
          <form onSubmit={handleSearch} className="space-y-4">
            <div>
              <label className="block font-body-sm text-body-sm font-bold text-primary mb-1.5">
                Criterio de Búsqueda *
              </label>
              <div className="relative">
                <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-on-surface-variant">
                  search
                </span>
                <input
                  type="text"
                  required
                  placeholder="Cédula, Celular, Correo, Orden (ej. ORD-1002) o Boleto (ej. 0075)"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  className="w-full pl-11 pr-4 py-3 border border-outline-variant rounded-xl bg-surface-container-lowest focus:ring-2 focus:ring-primary font-body-md text-body-md shadow-sm"
                />
              </div>
              <p className="text-xs text-on-surface-variant/80 mt-1.5 flex items-center gap-1">
                <span className="material-symbols-outlined text-[14px]">info</span>
                Puedes buscar por cédula, número de celular, email, código de orden o número de boleto.
              </p>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3.5 bg-primary text-on-primary rounded-xl font-body-md text-body-md font-extrabold shadow-md hover:bg-primary-container hover:text-on-primary-container transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {isLoading ? (
                <>
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  Consultando Boletos...
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
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 border-b border-outline-variant/20 pb-3">
              <h2 className="font-headline-md text-headline-md font-bold text-primary">
                Resultados para: &ldquo;{searchedTerm}&rdquo;
              </h2>
              <span className="px-3 py-1 bg-surface-container-high rounded-full text-xs font-bold text-on-surface-variant">
                {results.length} {results.length === 1 ? 'orden encontrada' : 'órdenes encontradas'}
              </span>
            </div>

            {results.length === 0 ? (
              <div className="bg-surface-container-lowest p-8 rounded-2xl text-center border border-outline-variant/30 space-y-3">
                <span className="material-symbols-outlined text-[48px] text-on-surface-variant">
                  search_off
                </span>
                <h3 className="font-headline-md text-headline-md font-bold text-primary">
                  No se encontraron boletos registrados
                </h3>
                <p className="font-body-md text-body-md text-on-surface-variant max-w-md mx-auto">
                  No encontramos boletos asociados a <strong>&ldquo;{searchedTerm}&rdquo;</strong>. Verifica que el dato coincida exactamente con el registrado durante la compra (cédula, celular, correo, orden o número de boleto).
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                {results.map((res) => {
                  const isApproved = res.status === 'confirmed';
                  const isPending = res.status === 'pending';
                  const isRejected = res.status === 'rejected';

                  // Verificar si tiene boletos premiados
                  const winningTicketsMap = res.winningTickets || {};
                  const userWinningTickets = Object.keys(winningTicketsMap);
                  const hasWinnerTicket = userWinningTickets.length > 0;

                  return (
                    <div
                      key={res.id}
                      className={`bg-surface-container-lowest p-6 sm:p-8 rounded-2xl shadow-lg border space-y-5 transition-all ${
                        hasWinnerTicket
                          ? 'border-amber-400 ring-2 ring-amber-300 shadow-amber-500/10'
                          : 'border-outline-variant/30'
                      }`}
                    >
                      {/* Banner de Felicitación si tiene boleto premiado */}
                      {hasWinnerTicket && (
                        <div className="bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-500 text-amber-950 p-4 rounded-xl shadow-md border border-amber-300 flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center text-amber-800 shadow shrink-0">
                              <span className="material-symbols-outlined text-[24px]">emoji_events</span>
                            </div>
                            <div>
                              <strong className="block text-xs uppercase font-black tracking-wider text-amber-900">
                                🎉 ¡FELICITACIONES! TIENES UN BOLETO GANADOR
                              </strong>
                              <p className="text-xs sm:text-sm font-extrabold text-amber-950">
                                {userWinningTickets.map((num) => {
                                  const win = winningTicketsMap[num];
                                  return (
                                    <span key={num} className="mr-2">
                                      Boleto #{num}: <u>{win.prizeName}</u>
                                      {win.prizeValue ? ` ($${win.prizeValue.toLocaleString('es-CO')} COP)` : ''}
                                    </span>
                                  );
                                })}
                              </p>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Cabecera de la Orden */}
                      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-outline-variant/20 pb-4">
                        <div>
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            {isApproved && (
                              <span className="px-2.5 py-0.5 rounded-full text-xs font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center gap-1">
                                <span className="material-symbols-outlined text-[14px]">check_circle</span>
                                PAGO CONFIRMADO
                              </span>
                            )}
                            {isPending && (
                              <span className="px-2.5 py-0.5 rounded-full text-xs font-extrabold bg-amber-100 text-amber-800 border border-amber-300 flex items-center gap-1">
                                <span className="material-symbols-outlined text-[14px]">hourglass_top</span>
                                PENDIENTE DE VERIFICACIÓN
                              </span>
                            )}
                            {isRejected && (
                              <span className="px-2.5 py-0.5 rounded-full text-xs font-extrabold bg-rose-100 text-rose-800 border border-rose-300 flex items-center gap-1">
                                <span className="material-symbols-outlined text-[14px]">cancel</span>
                                RECHAZADO / CANCELADO
                              </span>
                            )}
                            <span className="text-xs font-bold text-on-surface-variant">
                              ORDEN #{res.orderNumber}
                            </span>
                          </div>
                          <h3 className="font-headline-md text-headline-md font-extrabold text-primary">
                            {res.raffleName}
                          </h3>
                        </div>

                        <div className="text-left sm:text-right">
                          <span className="font-body-sm text-body-sm text-on-surface-variant block">
                            Total Pagado:
                          </span>
                          <span className="font-headline-md text-headline-md font-extrabold text-primary">
                            ${res.totalPaid.toLocaleString('es-CO')} COP
                          </span>
                        </div>
                      </div>

                      {/* Datos del Comprador (Protegidos por Privacidad) */}
                      <div className="bg-surface-container-low p-3.5 rounded-xl text-xs sm:text-sm border border-outline-variant/10 space-y-2">
                        <div className="flex items-center justify-between border-b border-outline-variant/10 pb-1.5 text-[11px] text-on-surface-variant font-medium">
                          <span className="flex items-center gap-1">
                            <span className="material-symbols-outlined text-[14px] text-emerald-600">lock</span>
                            Datos del Comprador (Protegidos)
                          </span>
                          <span className="text-[10px] uppercase font-bold text-outline">Privacidad Activa</span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3">
                          <div>
                            <span className="text-on-surface-variant block text-xs">Titular:</span>
                            <strong className="text-primary truncate block font-mono text-xs sm:text-sm">{res.customerName}</strong>
                          </div>
                          <div>
                            <span className="text-on-surface-variant block text-xs">Celular / Tel:</span>
                            <strong className="text-primary truncate block font-mono text-xs sm:text-sm">{res.customerPhone}</strong>
                          </div>
                          <div>
                            <span className="text-on-surface-variant block text-xs">Correo:</span>
                            <strong className="text-primary truncate block font-mono text-xs sm:text-sm">{res.customerEmail}</strong>
                          </div>
                        </div>
                      </div>

                      {/* Números Premiados Configurados en la Rifa */}
                      {res.instantPrizes && res.instantPrizes.length > 0 && (
                        <div className="bg-amber-500/10 border border-amber-300/60 p-3.5 rounded-xl space-y-2">
                          <div className="flex items-center justify-between text-xs font-bold text-amber-900">
                            <span className="flex items-center gap-1">
                              <span className="material-symbols-outlined text-[16px] text-amber-600">stars</span>
                              🎯 Números Premiados Configurados en este Sorteo ({res.instantPrizes.length}):
                            </span>
                            <span className="text-[10px] uppercase font-black px-2 py-0.5 rounded bg-amber-200 text-amber-950">
                              Premios Directos
                            </span>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {res.instantPrizes.map((ip, idx) => (
                              <div
                                key={idx}
                                className="px-2.5 py-1 bg-white text-amber-950 rounded-lg text-xs font-bold border border-amber-300 shadow-sm flex items-center gap-1.5"
                              >
                                <span className="font-mono font-black text-amber-700">#{ip.number}</span>
                                <span>- {ip.prizeName}</span>
                                {ip.prizeValue ? (
                                  <span className="text-emerald-700 text-[11px] font-extrabold">
                                    (${ip.prizeValue.toLocaleString('es-CO')})
                                  </span>
                                ) : null}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Boletos */}
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-label-caps text-label-caps text-primary uppercase font-extrabold">
                            Tus Boletos Asignados ({res.numbers.length})
                          </span>
                        </div>

                        {res.numbers.length === 0 ? (
                          <p className="text-xs text-on-surface-variant italic">
                            No se encontraron números generados para esta orden.
                          </p>
                        ) : (
                          <div className="flex flex-wrap gap-2.5">
                            {res.numbers.map((num) => {
                              const isMatched = isMatchedTicket(num);
                              const winDetail = winningTicketsMap[num];

                              return (
                                <div
                                  key={num}
                                  className={`px-4 py-2 rounded-xl font-raffle-number text-lg font-black shadow-sm flex items-center gap-1.5 transition-all ${
                                    winDetail
                                      ? 'bg-amber-400 text-amber-950 border-2 border-amber-600 scale-110 shadow-lg ring-4 ring-amber-300 animate-pulse'
                                      : isMatched
                                      ? 'bg-amber-300 text-amber-950 border-2 border-amber-500 scale-105 shadow-md ring-2 ring-amber-400'
                                      : 'bg-secondary-container text-on-secondary-container border border-secondary-fixed-dim'
                                  }`}
                                >
                                  {winDetail ? (
                                    <span className="material-symbols-outlined text-[20px] text-amber-950">
                                      emoji_events
                                    </span>
                                  ) : isMatched ? (
                                    <span className="material-symbols-outlined text-[18px] text-amber-700">
                                      star
                                    </span>
                                  ) : null}
                                  #{num}
                                  {winDetail && (
                                    <span className="text-[10px] font-sans font-extrabold bg-white/90 text-amber-900 px-1.5 py-0.5 rounded shadow-sm">
                                      ¡Ganador!
                                    </span>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      {/* Info Sorteo */}
                      <div className="bg-surface-container-low p-4 rounded-xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 font-body-sm text-body-sm border border-outline-variant/10">
                        <div>
                          <span className="text-on-surface-variant font-medium">Sorteo oficial con: </span>
                          <strong className="text-primary">{res.lotteryName}</strong>
                        </div>
                        <div className="font-bold text-primary">
                          Fecha: {res.drawDate}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
