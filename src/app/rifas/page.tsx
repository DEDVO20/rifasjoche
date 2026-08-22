'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { RafflePrize } from '@/types/database.types';
import { useToast } from '@/context/ToastContext';
import { createClient } from '@/lib/supabase/client';

interface RaffleItem {
  id: number;
  name: string;
  slug: string;
  image_url: string;
  price: number;
  sold: number;
  total: number;
  status: 'active' | 'paused' | 'completed' | 'draft';
  endDate: string;
  minOrder: number;
  maxOrder: number;
  prizesCount: number;
}

export default function GestorRifasPage() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [raffles, setRaffles] = useState<RaffleItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [lotteriesList, setLotteriesList] = useState<{ id: string; name: string }[]>([]);

  const { success: toastSuccess, error: toastError, info: toastInfo } = useToast();
  const supabase = createClient();

  // Form states for new raffle
  const [formData, setFormData] = useState({
    name: '',
    price: 10000,
    total_numbers: 1000,
    min_order: 1,
    end_date: '',
    lottery_id: '1',
  });

  // Dynamic prizes state
  const [prizes, setPrizes] = useState<RafflePrize[]>([
    {
      name: '',
      prize_type: 'main',
      prize_value: 0,
      position: 1,
      rule_type: 'exact_match',
    },
  ]);

  // Dynamic Números Premiados (Premios Anticipados/Directos)
  const [instantPrizes, setInstantPrizes] = useState<
    { number: string; prizeName: string; prizeValue: number }[]
  >([]);

  // Cargar loterías y rifas desde Supabase
  const loadRafflesFromSupabase = useCallback(async () => {
    try {
      setIsLoading(true);

      // Cargar loterías activas
      const { data: lotData } = await supabase.from('lotteries').select('id, name');
      if (lotData && lotData.length > 0) {
        setLotteriesList(lotData.map((l) => ({ id: l.id.toString(), name: l.name })));
        setFormData((prev) => ({ ...prev, lottery_id: lotData[0].id.toString() }));
      }

      // Cargar rifas
      const { data: rafflesData, error } = await supabase
        .from('raffles')
        .select(`
          *,
          lottery_draws (id, lotteries (name)),
          raffle_prizes (id)
        `)
        .order('id', { ascending: false });

      if (!error && rafflesData && rafflesData.length > 0) {
        const raffleIds = rafflesData.map((r: any) => r.id);

        // Consultar boletos vendidos reales de cada rifa
        const { data: soldNumbers } = await supabase
          .from('raffle_numbers')
          .select('raffle_id')
          .in('raffle_id', raffleIds)
          .eq('status', 'sold');

        const soldMap = new Map<number, number>();
        (soldNumbers || []).forEach((item: any) => {
          soldMap.set(item.raffle_id, (soldMap.get(item.raffle_id) || 0) + 1);
        });

        const formatted: RaffleItem[] = rafflesData.map((r: any) => ({
          id: r.id,
          name: r.name,
          slug: r.slug || `rifa-${r.id}`,
          image_url: r.image_url || 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=800&q=80',
          price: Number(r.price_per_number) || 10000,
          sold: soldMap.get(r.id) || 0,
          total: r.total_numbers || 10000,
          status: r.status || 'active',
          endDate: r.end_at ? r.end_at.split('T')[0] : '2026-12-31',
          minOrder: r.minimum_numbers_per_order || 2,
          maxOrder: r.maximum_numbers_per_order || 99999,
          prizesCount: r.raffle_prizes?.length || 1,
        }));
        setRaffles(formatted);
      } else {
        setRaffles([]);
      }
    } catch (err) {
      console.error('Error cargando rifas desde Supabase:', err);
    } finally {
      setIsLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    loadRafflesFromSupabase();
  }, [loadRafflesFromSupabase]);

  const handleAddPrize = () => {
    const nextPosition = prizes.length + 1;
    setPrizes([
      ...prizes,
      {
        name: `Premio Secundario #${nextPosition}`,
        prize_type: 'secondary',
        prize_value: 1000000,
        position: nextPosition,
        rule_type: 'exact_match',
      },
    ]);
  };

  const handleRemovePrize = (index: number) => {
    if (prizes.length <= 1) return;
    setPrizes(prizes.filter((_, i) => i !== index));
  };

  const handlePrizeChange = (index: number, field: keyof RafflePrize, value: any) => {
    const updated = [...prizes];
    updated[index] = { ...updated[index], [field]: value };
    setPrizes(updated);
  };

  const handleAddInstantPrize = () => {
    setInstantPrizes([
      ...instantPrizes,
      {
        number: '',
        prizeName: '',
        prizeValue: 500000,
      },
    ]);
  };

  const handleRemoveInstantPrize = (index: number) => {
    setInstantPrizes(instantPrizes.filter((_, i) => i !== index));
  };

  const handleInstantPrizeChange = (index: number, field: string, value: any) => {
    const updated = [...instantPrizes];
    updated[index] = { ...updated[index], [field]: value };
    setInstantPrizes(updated);
  };

  const filteredRaffles = raffles.filter((r) => {
    const matchesSearch = r.name.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === 'all' || r.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  // Guardar Rifa en Supabase
  const handleCreateRaffle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name) return;

    try {
      const slugStr = formData.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') + '-' + Date.now().toString().slice(-4);

      // 1. Obtener o asignar lottery_draw_id
      const selectedLotteryId = parseInt(formData.lottery_id, 10) || 1;
      let targetDrawId = 1;

      const { data: existingDraw } = await supabase
        .from('lottery_draws')
        .select('id')
        .eq('lottery_id', selectedLotteryId)
        .order('id', { ascending: false })
        .limit(1)
        .single();

      if (existingDraw) {
        targetDrawId = existingDraw.id;
      }

      const startDate = new Date();
      let endDate: Date;
      if (formData.end_date) {
        endDate = new Date(formData.end_date + 'T23:59:59');
        if (endDate.getTime() <= startDate.getTime()) {
          endDate = new Date(startDate.getTime() + 30 * 24 * 60 * 60 * 1000);
        }
      } else {
        endDate = new Date(startDate.getTime() + 30 * 24 * 60 * 60 * 1000);
      }

      // 2. Insertar Rifa en public.raffles usando lottery_draw_id
      const { data: newRaffle, error: raffleErr } = await supabase
        .from('raffles')
        .insert({
          name: formData.name,
          slug: slugStr,
          description: `Gran Sorteo ${formData.name}`,
          lottery_draw_id: targetDrawId,
          number_length: 4,
          number_min: 0,
          number_max: formData.total_numbers - 1,
          number_format: '0000',
          total_numbers: formData.total_numbers,
          price_per_number: formData.price,
          minimum_numbers_per_order: formData.min_order,
          maximum_numbers_per_order: 999999,
          start_at: startDate.toISOString(),
          end_at: endDate.toISOString(),
          status: 'active',
          image_url: 'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=800&q=80',
        })
        .select()
        .single();

      if (raffleErr) {
        console.error('Error insertando rifa en Supabase:', raffleErr);
        toastError('Error al Crear Rifa', raffleErr.message);
        return;
      }

      // 3. Insertar Premios de Sorteo y Números Premiados en public.raffle_prizes
      if (newRaffle) {
        const prizesToInsert: any[] = prizes.map((p) => ({
          raffle_id: newRaffle.id,
          name: p.name,
          prize_type: p.prize_type,
          prize_value: p.prize_value,
          position: p.position,
          rule_type: p.rule_type || 'exact_match',
          rule_value: null,
        }));

        // Añadir Números Premiados Directos
        instantPrizes.forEach((ip, idx) => {
          if (ip.number && ip.prizeName) {
            prizesToInsert.push({
              raffle_id: newRaffle.id,
              name: ip.prizeName,
              prize_type: 'secondary',
              prize_value: ip.prizeValue || 0,
              position: prizes.length + idx + 1,
              rule_type: 'specific_number',
              rule_value: ip.number.trim().padStart(4, '0'),
            });
          }
        });

        await supabase.from('raffle_prizes').insert(prizesToInsert);
      }

      setIsModalOpen(false);
      setFormData({ name: '', price: 10000, total_numbers: 1000, min_order: 1, end_date: '', lottery_id: lotteriesList[0]?.id || '1' });
      setPrizes([
        {
          name: '',
          prize_type: 'main',
          prize_value: 0,
          position: 1,
          rule_type: 'exact_match',
        },
      ]);
      setInstantPrizes([]);
      await loadRafflesFromSupabase();
      toastSuccess('¡Rifa Creada con Éxito!', `La rifa "${formData.name}" ya está disponible en la tienda.`);
    } catch (err: any) {
      console.error('Excepción al crear rifa:', err);
      toastError('Error Inesperado', err.message);
    }
  };

  const handleToggleStatus = async (raffleId: number, currentStatus: string) => {
    const nextStatus = currentStatus === 'paused' ? 'active' : 'paused';
    try {
      await supabase.from('raffles').update({ status: nextStatus }).eq('id', raffleId);
      setRaffles(raffles.map((r) => (r.id === raffleId ? { ...r, status: nextStatus as any } : r)));
      toastInfo('Estado Actualizado', `La rifa ahora se encuentra ${nextStatus === 'active' ? 'activa' : 'en pausa'}.`);
    } catch (err: any) {
      console.error('Error actualizando estado:', err);
      toastError('Error al Cambiar Estado', err.message);
    }
  };

  return (
    <div className="space-y-gutter">
      {/* Encabezado de página */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
        <div>
          <h1 className="font-display-lg text-display-lg font-extrabold text-primary">
            Gestión de Rifas (Supabase)
          </h1>
          <p className="font-body-lg text-body-lg text-on-surface-variant">
            Administra las rifas creadas en la base de datos, límites de compra por cliente y configuración de premios.
          </p>
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          className="bg-primary text-on-primary px-6 py-3 rounded-lg font-body-md text-body-md font-semibold shadow-md hover:shadow-lg transition-all flex items-center gap-2"
        >
          <span className="material-symbols-outlined">add</span>
          Crear Rifa en DB
        </button>
      </div>

      {/* Barra de Filtros y Búsqueda */}
      <div className="flex flex-col md:flex-row gap-4 bg-surface-container-lowest p-4 rounded-xl shadow-sm border border-outline-variant/20">
        <div className="relative flex-1">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant">
            search
          </span>
          <input
            type="text"
            placeholder="Buscar por nombre de rifa..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-outline-variant rounded-lg bg-surface-container-lowest focus:ring-2 focus:ring-primary font-body-md text-body-md"
          />
        </div>
        <div className="flex gap-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-4 py-2 border border-outline-variant rounded-lg bg-surface-container-lowest focus:ring-2 focus:ring-primary font-body-md text-body-md"
          >
            <option value="all">Todos los estados</option>
            <option value="active">Activas</option>
            <option value="paused">Pausadas</option>
            <option value="completed">Finalizadas</option>
          </select>
        </div>
      </div>

      {/* Grid de Tarjetas de Rifa */}
      {isLoading ? (
        <div className="text-center py-12 text-primary font-bold">
          Cargando rifas desde la base de datos...
        </div>
      ) : filteredRaffles.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-base md:gap-gutter">
          {filteredRaffles.map((raffle) => {
            const progress = Math.round((raffle.sold / raffle.total) * 100);

            return (
              <div
                key={raffle.id}
                className="bg-surface-container-lowest rounded-xl shadow-[0px_4px_20px_rgba(15,23,42,0.05)] border border-outline-variant/20 overflow-hidden flex flex-col justify-between hover:shadow-lg transition-all"
              >
                <div>
                  {/* Imagen y Badge */}
                  <div className="relative h-48 w-full bg-surface-container-high overflow-hidden">
                    {/* eslint-disable-next-html-element-suppression */}
                    <img
                      src={raffle.image_url}
                      alt={raffle.name}
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute top-3 right-3">
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
                          raffle.status === 'active'
                            ? 'bg-tertiary-fixed-dim/90 text-on-tertiary-container'
                            : raffle.status === 'paused'
                            ? 'bg-secondary-container text-on-secondary-container'
                            : 'bg-surface-tint/20 text-on-surface-variant'
                        }`}
                      >
                        {raffle.status === 'active'
                          ? 'Activa'
                          : raffle.status === 'paused'
                          ? 'Pausada'
                          : 'Finalizada'}
                      </span>
                    </div>
                  </div>

                  {/* Info Rifa */}
                  <div className="p-6 space-y-3">
                    <h3 className="font-headline-md text-headline-md font-bold text-primary mb-1">
                      {raffle.name}
                    </h3>
                    <div className="flex justify-between items-center text-xs font-body-sm text-on-surface-variant">
                      <span>Precio: <strong>${raffle.price.toLocaleString('es-CO')} COP</strong></span>
                      <span className="bg-secondary-container/30 text-on-secondary-container px-2 py-0.5 rounded font-bold">
                        Min: {raffle.minOrder} | Max: {raffle.maxOrder} boletos
                      </span>
                    </div>

                    {/* Barra de Progreso */}
                    <div className="space-y-2 pt-2">
                      <div className="flex justify-between font-body-sm text-body-sm">
                        <span className="text-on-surface-variant font-medium font-bold">Límite por compra</span>
                        <span className="font-bold text-primary">{raffle.minOrder} - {raffle.maxOrder} boletos</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Footer Acciones */}
                <div className="px-6 py-4 bg-surface-container-low border-t border-outline-variant/20 flex flex-wrap gap-2">
                  <Link
                    href={`/rifas/${raffle.id}`}
                    className="flex-1 bg-primary text-on-primary py-2 px-3 rounded-lg text-center font-body-sm text-body-sm font-semibold hover:opacity-90 transition-opacity flex items-center justify-center gap-1"
                  >
                    <span className="material-symbols-outlined text-[16px]">visibility</span>
                    Ver Talonario
                  </Link>
                  <button
                    onClick={() => handleToggleStatus(raffle.id, raffle.status)}
                    className="px-3 py-2 border border-outline-variant rounded-lg font-body-sm text-xs font-semibold hover:bg-surface-container-high transition-colors"
                    title={raffle.status === 'paused' ? 'Reanudar Ventas' : 'Pausar Ventas'}
                  >
                    <span className="material-symbols-outlined text-[18px]">
                      {raffle.status === 'paused' ? 'play_arrow' : 'pause'}
                    </span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="bg-surface-container-lowest p-8 rounded-2xl text-center border border-outline-variant/30 space-y-2">
          <span className="material-symbols-outlined text-[48px] text-on-surface-variant">folder_open</span>
          <h3 className="font-headline-md text-headline-md font-bold text-primary">No hay rifas registradas</h3>
          <p className="font-body-md text-body-md text-on-surface-variant">
            Haz clic en &ldquo;Crear Rifa en DB&rdquo; para registrar tu primera rifa en Supabase.
          </p>
        </div>
      )}

      {/* Modal Crear Rifa */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-surface-container-lowest rounded-2xl max-w-2xl w-full p-6 shadow-2xl border border-outline-variant/30 max-h-[90vh] overflow-y-auto animate-in fade-in zoom-in-95">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h2 className="font-headline-md text-headline-md font-bold text-primary">
                  Crear Nueva Rifa en Supabase
                </h2>
                <p className="font-body-sm text-body-sm text-on-surface-variant">
                  Configura los parámetros generales, la cantidad mínima y máxima de compra y los premios.
                </p>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-on-surface-variant hover:text-primary p-1 rounded-full"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <form onSubmit={handleCreateRaffle} className="space-y-6">
              <div className="space-y-4 bg-surface-container-low p-4 rounded-xl">
                <h3 className="font-body-md text-body-md font-bold text-primary">
                  1. Información General y Límites por Compra
                </h3>

                <div>
                  <label className="block font-body-sm text-body-sm font-medium text-on-surface mb-1">
                    Nombre de la Rifa *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ej. Gran Sorteo Camioneta 0KM"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-4 py-2 border border-outline-variant rounded-lg bg-surface-container-lowest focus:ring-2 focus:ring-primary font-body-md text-body-md"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block font-body-sm text-body-sm font-medium text-on-surface mb-1">
                      Precio por Boleto (COP) *
                    </label>
                    <input
                      type="number"
                      required
                      value={formData.price}
                      onChange={(e) => setFormData({ ...formData, price: Number(e.target.value) })}
                      className="w-full px-4 py-2 border border-outline-variant rounded-lg bg-surface-container-lowest focus:ring-2 focus:ring-primary font-body-md text-body-md"
                    />
                  </div>
                  <div>
                    <label className="block font-body-sm text-body-sm font-medium text-on-surface mb-1">
                      Total de Boletos *
                    </label>
                    <input
                      type="number"
                      required
                      value={formData.total_numbers}
                      onChange={(e) => setFormData({ ...formData, total_numbers: Number(e.target.value) })}
                      className="w-full px-4 py-2 border border-outline-variant rounded-lg bg-surface-container-lowest focus:ring-2 focus:ring-primary font-body-md text-body-md"
                    />
                  </div>
                </div>

                {/* Límites de Compra por Cliente */}
                <div className="bg-surface-container-lowest p-3 rounded-lg border border-outline-variant/30">
                  <div>
                    <label className="block text-xs font-bold text-primary mb-1">
                      Mínimo de Boletos por Orden * (Sin límite máximo)
                    </label>
                    <input
                      type="number"
                      required
                      min={1}
                      value={formData.min_order}
                      onChange={(e) => setFormData({ ...formData, min_order: Number(e.target.value) })}
                      className="w-full px-3 py-1.5 border border-outline-variant rounded-lg font-bold text-sm bg-surface-container-lowest"
                    />
                    <span className="text-[11px] text-on-surface-variant">Ej. Mínimo 1, 2 o 5 boletos por orden</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block font-body-sm text-body-sm font-medium text-on-surface mb-1">
                      Lotería de Referencia *
                    </label>
                    <select
                      value={formData.lottery_id}
                      onChange={(e) => setFormData({ ...formData, lottery_id: e.target.value })}
                      className="w-full px-4 py-2 border border-outline-variant rounded-lg bg-surface-container-lowest focus:ring-2 focus:ring-primary font-body-md text-body-md"
                    >
                      {lotteriesList.map((lot) => (
                        <option key={lot.id} value={lot.id}>
                          {lot.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block font-body-sm text-body-sm font-medium text-on-surface mb-1">
                      Fecha del Sorteo *
                    </label>
                    <input
                      type="date"
                      required
                      value={formData.end_date}
                      onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                      className="w-full px-4 py-2 border border-outline-variant rounded-lg bg-surface-container-lowest focus:ring-2 focus:ring-primary font-body-md text-body-md"
                    />
                  </div>
                </div>
              </div>

              {/* Configuración de Premios */}
              <div className="space-y-4 bg-surface-container-low p-4 rounded-xl">
                <div className="flex justify-between items-center">
                  <h3 className="font-body-md text-body-md font-bold text-primary flex items-center gap-1">
                    <span className="material-symbols-outlined text-secondary-container">emoji_events</span>
                    2. Premios y Configuración
                  </h3>
                  <button
                    type="button"
                    onClick={handleAddPrize}
                    className="px-3 py-1 bg-secondary-container text-on-secondary-container rounded-lg text-xs font-bold hover:bg-secondary-fixed transition-colors flex items-center gap-1"
                  >
                    <span className="material-symbols-outlined text-[15px]">add</span>
                    Agregar Premio Secundario
                  </button>
                </div>

                <div className="space-y-3">
                  {prizes.map((prize, idx) => (
                    <div
                      key={idx}
                      className="p-4 bg-surface-container-lowest rounded-xl border border-outline-variant/30 space-y-3"
                    >
                      <div className="flex justify-between items-center">
                        <span
                          className={`px-2.5 py-0.5 rounded text-xs font-bold uppercase ${
                            prize.prize_type === 'main'
                              ? 'bg-secondary-container text-on-secondary-container'
                              : 'bg-surface-container-high text-primary'
                          }`}
                        >
                          {prize.prize_type === 'main' ? '🏆 Premio Mayor (1er Lugar)' : `🎁 Premio Secundario #${prize.position}`}
                        </span>
                        {prize.prize_type !== 'main' && (
                          <button
                            type="button"
                            onClick={() => handleRemovePrize(idx)}
                            className="text-error hover:underline text-xs font-bold"
                          >
                            Eliminar
                          </button>
                        )}
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-on-surface mb-1">
                            Nombre del Premio *
                          </label>
                          <input
                            type="text"
                            required
                            placeholder="Ej. Camioneta SUV 0KM"
                            value={prize.name}
                            onChange={(e) => handlePrizeChange(idx, 'name', e.target.value)}
                            className="w-full px-3 py-1.5 border border-outline-variant rounded-lg text-sm bg-surface-container-lowest"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-medium text-on-surface mb-1">
                            Valor Estimado (COP)
                          </label>
                          <input
                            type="number"
                            placeholder="15000000"
                            value={prize.prize_value || ''}
                            onChange={(e) => handlePrizeChange(idx, 'prize_value', Number(e.target.value))}
                            className="w-full px-3 py-1.5 border border-outline-variant rounded-lg text-sm bg-surface-container-lowest"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* 3. Números Premiados y Premios Anticipados */}
              <div className="space-y-4 bg-surface-container-low p-4 rounded-xl border border-secondary-container/30">
                <div className="flex justify-between items-center">
                  <div>
                    <h3 className="font-body-md text-body-md font-bold text-primary flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-amber-500">stars</span>
                      3. Números Premiados (Premios Anticipados / Directos)
                    </h3>
                    <p className="text-xs text-on-surface-variant">
                      Asigna números específicos que ganan un premio de inmediato al ser comprados.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleAddInstantPrize}
                    className="px-3 py-1.5 bg-amber-500 text-slate-900 rounded-lg text-xs font-bold hover:bg-amber-400 transition-colors flex items-center gap-1.5 shadow-sm"
                  >
                    <span className="material-symbols-outlined text-[16px]">stars</span>
                    Agregar Número Premiado
                  </button>
                </div>

                {instantPrizes.length === 0 ? (
                  <div className="p-4 bg-surface-container-lowest rounded-xl border border-dashed border-outline-variant/50 text-center text-xs text-on-surface-variant">
                    No has definido números premiados para esta rifa. Haz clic en <strong>+ Agregar Número Premiado</strong> si deseas premios sorpresa.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {instantPrizes.map((ip, idx) => (
                      <div
                        key={idx}
                        className="p-3.5 bg-surface-container-lowest rounded-xl border border-amber-400/30 space-y-2.5 shadow-sm"
                      >
                        <div className="flex justify-between items-center">
                          <span className="px-2 py-0.5 rounded text-[11px] font-bold uppercase bg-amber-100 text-amber-900 flex items-center gap-1">
                            <span className="material-symbols-outlined text-[13px]">award_star</span>
                            Número Premiado #{idx + 1}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleRemoveInstantPrize(idx)}
                            className="text-error hover:underline text-xs font-bold"
                          >
                            Eliminar
                          </button>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                          <div>
                            <label className="block text-[11px] font-bold text-primary mb-1">
                              Número Ganador * (ej. 0777)
                            </label>
                            <input
                              type="text"
                              required
                              maxLength={4}
                              placeholder="0777"
                              value={ip.number}
                              onChange={(e) => handleInstantPrizeChange(idx, 'number', e.target.value)}
                              className="w-full px-3 py-1.5 border border-outline-variant rounded-lg font-mono font-bold text-sm bg-surface-container-lowest text-center text-primary"
                            />
                          </div>

                          <div>
                            <label className="block text-[11px] font-medium text-on-surface mb-1">
                              Premio Directo *
                            </label>
                            <input
                              type="text"
                              required
                              placeholder="Ej. Bono $500.000 COP"
                              value={ip.prizeName}
                              onChange={(e) => handleInstantPrizeChange(idx, 'prizeName', e.target.value)}
                              className="w-full px-3 py-1.5 border border-outline-variant rounded-lg text-xs bg-surface-container-lowest"
                            />
                          </div>

                          <div>
                            <label className="block text-[11px] font-medium text-on-surface mb-1">
                              Valor Estimado (COP)
                            </label>
                            <input
                              type="number"
                              placeholder="500000"
                              value={ip.prizeValue || ''}
                              onChange={(e) =>
                                handleInstantPrizeChange(idx, 'prizeValue', Number(e.target.value))
                              }
                              className="w-full px-3 py-1.5 border border-outline-variant rounded-lg text-xs bg-surface-container-lowest"
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Botones Finales */}
              <div className="flex justify-end gap-3 pt-4 border-t border-outline-variant/20">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-5 py-2.5 border border-outline-variant rounded-xl text-on-surface font-body-md text-body-md hover:bg-surface-container"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 bg-primary text-on-primary rounded-xl font-body-md text-body-md font-bold hover:bg-primary-container shadow-md"
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
