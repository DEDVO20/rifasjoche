'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';

interface Lottery {
  id: number;
  name: string;
  schedule: string;
  country: string;
  website: string;
  active: boolean;
}

interface LotteryDraw {
  id: number;
  lotteryName: string;
  drawNumber: string;
  drawDate: string;
  winningNumber?: string;
  winningSeries?: string;
  officialSourceUrl?: string;
  status: 'scheduled' | 'pending_result' | 'registered' | 'verified';
}

export default function LoteriasPage() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedDraw, setSelectedDraw] = useState<LotteryDraw | null>(null);
  const [inputWinningNumber, setInputWinningNumber] = useState('');
  const [inputWinningSeries, setInputWinningSeries] = useState('');
  const [inputSourceUrl, setInputSourceUrl] = useState('');

  const [lotteries, setLotteries] = useState<Lottery[]>([]);
  const [draws, setDraws] = useState<LotteryDraw[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const supabase = createClient();

  const loadLoteriasData = useCallback(async () => {
    try {
      setIsLoading(true);
      // 1. Cargar Loterías Autorizadas
      const { data: lotData } = await supabase.from('lotteries').select('*');
      if (lotData && lotData.length > 0) {
        setLotteries(
          lotData.map((l: any) => ({
            id: l.id,
            name: l.name,
            schedule: l.schedule_description || 'Sorteo semanal oficial',
            country: 'Colombia',
            website: l.official_website || 'https://coljuegos.gov.co',
            active: l.active ?? true,
          }))
        );
      }

      // 2. Cargar Sorteos de Loterías desde lottery_draws
      const { data: drawsData } = await supabase
        .from('lottery_draws')
        .select('*, lotteries(name)')
        .order('draw_date', { ascending: false });

      if (drawsData && drawsData.length > 0) {
        setDraws(
          drawsData.map((d: any) => ({
            id: d.id,
            lotteryName: d.lotteries?.name || 'Lotería Oficial',
            drawNumber: d.draw_number || `SRT-${d.id}`,
            drawDate: d.draw_date ? d.draw_date.split('T')[0] : '2026-08-28',
            winningNumber: d.winning_number,
            winningSeries: d.winning_series,
            officialSourceUrl: d.official_source_url,
            status: d.winning_number ? 'verified' : 'scheduled',
          }))
        );
      } else {
        setDraws([]);
      }
    } catch (err) {
      console.error('Error cargando loterías desde Supabase:', err);
    } finally {
      setIsLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    loadLoteriasData();
  }, [loadLoteriasData]);

  const handleOpenResultModal = (draw: LotteryDraw) => {
    setSelectedDraw(draw);
    setInputWinningNumber(draw.winningNumber || '');
    setInputWinningSeries(draw.winningSeries || '');
    setInputSourceUrl(draw.officialSourceUrl || '');
    setIsModalOpen(true);
  };

  const handleSaveResult = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDraw || !inputWinningNumber) return;

    try {
      await supabase
        .from('lottery_draws')
        .update({
          winning_number: inputWinningNumber,
          winning_series: inputWinningSeries,
          official_source_url: inputSourceUrl,
          status: 'verified',
        })
        .eq('id', selectedDraw.id);

      setDraws((prev) =>
        prev.map((d) =>
          d.id === selectedDraw.id
            ? {
                ...d,
                winningNumber: inputWinningNumber,
                winningSeries: inputWinningSeries,
                officialSourceUrl: inputSourceUrl,
                status: 'verified',
              }
            : d
        )
      );
    } catch (err) {
      console.error('Error actualizando resultado:', err);
    } finally {
      setIsModalOpen(false);
    }
  };

  return (
    <div className="space-y-gutter">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
        <div>
          <h1 className="font-display-lg text-display-lg font-extrabold text-primary">
            Gestión de Loterías (Supabase)
          </h1>
          <p className="font-body-lg text-body-lg text-on-surface-variant">
            Catálogo de loterías asociadas, programación de sorteos y registro de resultados oficiales.
          </p>
        </div>
      </div>

      {/* Grid de Loterías Registradas */}
      <div>
        <h2 className="font-headline-md text-headline-md font-bold text-primary mb-4">
          Loterías Autorizadas en DB
        </h2>
        {isLoading ? (
          <div className="text-center py-8 text-primary font-bold">Cargando loterías desde Supabase...</div>
        ) : lotteries.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-base md:gap-gutter mb-8">
            {lotteries.map((lottery) => (
              <div
                key={lottery.id}
                className="bg-surface-container-lowest p-6 rounded-xl shadow-[0px_4px_20px_rgba(15,23,42,0.05)] border border-outline-variant/20 flex flex-col justify-between"
              >
                <div>
                  <div className="flex justify-between items-start mb-2">
                    <span className="material-symbols-outlined text-[32px] text-primary bg-surface-container p-2 rounded-xl">
                      casino
                    </span>
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-tertiary-fixed-dim/20 text-on-tertiary-container">
                      Activa
                    </span>
                  </div>
                  <h3 className="font-headline-md text-headline-md font-bold text-primary mt-2">
                    {lottery.name}
                  </h3>
                  <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">
                    {lottery.schedule}
                  </p>
                </div>
                <div className="mt-4 pt-4 border-t border-outline-variant/20 flex justify-between items-center">
                  <span className="font-label-caps text-label-caps text-outline">
                    {lottery.country}
                  </span>
                  <a
                    href={lottery.website}
                    target="_blank"
                    rel="noreferrer"
                    className="font-body-sm text-body-sm font-semibold text-primary hover:underline flex items-center gap-1"
                  >
                    Sitio Web
                    <span className="material-symbols-outlined text-[14px]">open_in_new</span>
                  </a>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-6 bg-surface-container-lowest rounded-xl text-center text-on-surface-variant mb-8">
            No se encontraron loterías en la base de datos.
          </div>
        )}
      </div>

      {/* Tabla de Sorteos Oficiales */}
      <div>
        <h2 className="font-headline-md text-headline-md font-bold text-primary mb-4">
          Sorteos Programados y Resultados
        </h2>
        <div className="bg-surface-container-lowest rounded-xl shadow-[0px_4px_20px_rgba(15,23,42,0.05)] border border-outline-variant/20 overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-surface-container-low border-b border-outline-variant/30 text-on-surface-variant font-label-caps text-label-caps uppercase">
                <th className="p-4">Lotería</th>
                <th className="p-4">Número de Sorteo</th>
                <th className="p-4">Fecha del Sorteo</th>
                <th className="p-4">Número Ganador Oficial</th>
                <th className="p-4">Serie</th>
                <th className="p-4">Estado</th>
                <th className="p-4 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/20 font-body-sm text-body-sm">
              {draws.length > 0 ? (
                draws.map((draw) => (
                  <tr key={draw.id} className="hover:bg-surface-container-high/50 transition-colors">
                    <td className="p-4 font-bold text-primary">{draw.lotteryName}</td>
                    <td className="p-4 font-mono font-bold text-on-surface">#{draw.drawNumber}</td>
                    <td className="p-4">{draw.drawDate}</td>
                    <td className="p-4">
                      {draw.winningNumber ? (
                        <span className="px-3 py-1 bg-secondary-container text-on-secondary-container font-raffle-number text-base font-extrabold rounded">
                          {draw.winningNumber}
                        </span>
                      ) : (
                        <span className="text-on-surface-variant italic">Pendiente de sorteo</span>
                      )}
                    </td>
                    <td className="p-4 font-mono font-semibold">
                      {draw.winningSeries || '-'}
                    </td>
                    <td className="p-4">
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
                          draw.status === 'verified'
                            ? 'bg-tertiary-fixed-dim/20 text-on-tertiary-container'
                            : 'bg-surface-container-high text-on-surface-variant'
                        }`}
                      >
                        {draw.status === 'verified' ? 'Verificado' : 'Programado'}
                      </span>
                    </td>
                    <td className="p-4 text-right">
                      <button
                        onClick={() => handleOpenResultModal(draw)}
                        className="px-3 py-1.5 bg-primary text-on-primary rounded-lg font-body-sm text-body-sm font-semibold hover:opacity-90 transition-opacity"
                      >
                        {draw.winningNumber ? 'Editar Resultado' : 'Registrar Resultado'}
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-on-surface-variant">
                    No hay sorteos registrados en la base de datos.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Registrar Resultado */}
      {isModalOpen && selectedDraw && (
        <div className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-surface-container-lowest rounded-xl max-w-lg w-full p-6 shadow-2xl border border-outline-variant/30 animate-in fade-in zoom-in-95">
            <div className="flex justify-between items-center mb-4">
              <h2 className="font-headline-md text-headline-md font-bold text-primary">
                Registrar Resultado Oficial
              </h2>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-on-surface-variant hover:text-primary p-1 rounded-full"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <p className="font-body-sm text-body-sm text-on-surface-variant mb-6">
              Lotería: <strong className="text-primary">{selectedDraw.lotteryName}</strong> (Sorteo #{selectedDraw.drawNumber})
            </p>

            <form onSubmit={handleSaveResult} className="space-y-4">
              <div>
                <label className="block font-body-sm text-body-sm font-medium text-on-surface mb-1">
                  Número Ganador Oficial (Ej. 5832)
                </label>
                <input
                  type="text"
                  required
                  placeholder="5832"
                  value={inputWinningNumber}
                  onChange={(e) => setInputWinningNumber(e.target.value)}
                  className="w-full px-4 py-2 border border-outline-variant rounded-lg font-raffle-number text-lg font-bold bg-surface-container-lowest focus:ring-2 focus:ring-primary"
                />
              </div>

              <div>
                <label className="block font-body-sm text-body-sm font-medium text-on-surface mb-1">
                  Serie (Opcional)
                </label>
                <input
                  type="text"
                  placeholder="147"
                  value={inputWinningSeries}
                  onChange={(e) => setInputWinningSeries(e.target.value)}
                  className="w-full px-4 py-2 border border-outline-variant rounded-lg font-body-md text-body-md bg-surface-container-lowest focus:ring-2 focus:ring-primary"
                />
              </div>

              <div>
                <label className="block font-body-sm text-body-sm font-medium text-on-surface mb-1">
                  URL de Evidencia / Fuente Oficial
                </label>
                <input
                  type="url"
                  placeholder="https://loteriademedellin.com.co/resultados"
                  value={inputSourceUrl}
                  onChange={(e) => setInputSourceUrl(e.target.value)}
                  className="w-full px-4 py-2 border border-outline-variant rounded-lg font-body-md text-body-md bg-surface-container-lowest focus:ring-2 focus:ring-primary"
                />
              </div>

              <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-outline-variant/20">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 border border-outline-variant rounded-lg text-on-surface font-body-md text-body-md hover:bg-surface-container"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-6 py-2 bg-primary text-on-primary rounded-lg font-body-md text-body-md font-semibold hover:opacity-90 transition-opacity"
                >
                  Guardar en Supabase
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
