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
  winningNumber?: string;
}

export default function GestorRifasPage() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [raffles, setRaffles] = useState<RaffleItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [lotteriesList, setLotteriesList] = useState<{ id: string; name: string }[]>([]);

  const { success: toastSuccess, error: toastError, warning: toastWarning, info: toastInfo } = useToast();
  const supabase = createClient();

  // Form states for new raffle
  const [formData, setFormData] = useState({
    name: '',
    price: 10000,
    total_numbers: 1000,
    min_order: 1,
    end_date: '',
    lottery_id: '1',
    image_url: '',
  });

  // Estado de archivo y vista previa de imagen
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);

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
          lottery_draws (id, winning_number, evidence_url, status, lotteries (name)),
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

        // Reparar automáticamente rifas activas que tengan por error un sorteo finalizado vinculado
        for (const r of rafflesData) {
          if (r.status === 'active' && r.lottery_draws?.winning_number) {
            try {
              const drawDateStr = r.end_at ? r.end_at.split('T')[0] : new Date().toISOString().split('T')[0];
              const uniqueDrawNumber = `SRT-${r.id}-${Date.now().toString().slice(-4)}`;
              const { data: cleanDraw } = await supabase
                .from('lottery_draws')
                .insert({
                  lottery_id: r.lottery_draws?.lottery_id || 1,
                  draw_number: uniqueDrawNumber,
                  draw_date: drawDateStr,
                  status: 'scheduled',
                  winning_number: null,
                })
                .select('id')
                .single();

              if (cleanDraw) {
                await supabase
                  .from('raffles')
                  .update({ lottery_draw_id: cleanDraw.id })
                  .eq('id', r.id);
                r.lottery_draw_id = cleanDraw.id;
                r.lottery_draws = {
                  ...r.lottery_draws,
                  id: cleanDraw.id,
                  winning_number: null,
                  status: 'scheduled',
                };
              }
            } catch (repairErr) {
              console.warn('No se pudo auto-reparar sorteo vinculado para rifa', r.id, repairErr);
            }
          }
        }

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
          winningNumber: (r.status === 'completed' && r.lottery_draws?.winning_number) ? r.lottery_draws.winning_number : undefined,
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

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (file.size > 10 * 1024 * 1024) {
        toastError('Imagen muy pesada', 'La imagen no debe superar los 10 MB.');
        return;
      }
      setImageFile(file);
      setImagePreview(URL.createObjectURL(file));
      toastInfo('Imagen Seleccionada', `${file.name} lista para el sorteo.`);
    }
  };

  const handleRemoveImage = () => {
    setImageFile(null);
    setImagePreview(null);
    setFormData((prev) => ({ ...prev, image_url: '' }));
  };

  // Guardar Rifa en Supabase
  const handleCreateRaffle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name) return;

    try {
      setIsUploadingImage(true);
      let finalImageUrl = formData.image_url.trim();

      // Subir archivo de imagen si fue seleccionado
      if (imageFile) {
        try {
          const uploadData = new FormData();
          uploadData.append('file', imageFile);

          const uploadRes = await fetch('/api/upload-raffle-image', {
            method: 'POST',
            body: uploadData,
          });
          const uploadJson = await uploadRes.json();

          if (uploadRes.ok && uploadJson.publicUrl) {
            finalImageUrl = uploadJson.publicUrl;
          } else {
            console.warn('Error en upload-raffle-image:', uploadJson.error);
          }
        } catch (uploadErr) {
          console.warn('Fallo al subir imagen:', uploadErr);
        }
      }

      if (!finalImageUrl) {
        finalImageUrl = 'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=800&q=80';
      }
      const slugStr = formData.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') + '-' + Date.now().toString().slice(-4);

      const selectedLotteryId = parseInt(formData.lottery_id, 10) || 1;

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

      // 1. Crear nuevo sorteo oficial programado e independiente para esta rifa en public.lottery_draws
      const drawDateStr = formData.end_date || endDate.toISOString().split('T')[0];
      const uniqueDrawNum = `SRT-${selectedLotteryId}-${Date.now().toString().slice(-6)}`;

      let targetDrawId: number | null = null;
      const { data: newDraw, error: drawErr } = await supabase
        .from('lottery_draws')
        .insert({
          lottery_id: selectedLotteryId,
          draw_number: uniqueDrawNum,
          draw_date: drawDateStr,
          status: 'scheduled',
          winning_number: null,
        })
        .select('id')
        .single();

      if (drawErr) {
        console.error('Error creando sorteo de lotería individual:', drawErr);
      } else if (newDraw) {
        targetDrawId = newDraw.id;
      }

      // 2. Insertar Rifa en public.raffles usando su sorteo independiente
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
          image_url: finalImageUrl,
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
      setFormData({ name: '', price: 10000, total_numbers: 1000, min_order: 1, end_date: '', lottery_id: lotteriesList[0]?.id || '1', image_url: '' });
      setImageFile(null);
      setImagePreview(null);
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
    } finally {
      setIsUploadingImage(false);
    }
  };

  const handleToggleStatus = async (raffleId: number, currentStatus: string) => {
    const targetRaffle = raffles.find((r) => r.id === raffleId);
    if (targetRaffle?.winningNumber || targetRaffle?.status === 'completed') {
      toastWarning('Sorteo Finalizado', 'Esta rifa ya cuenta con un número ganador y no se pueden modificar sus ventas.');
      return;
    }
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
            const hasWinner = raffle.status === 'completed' && Boolean(raffle.winningNumber);

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
                    <div className="absolute top-3 right-3 flex flex-col items-end gap-1.5">
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
                          hasWinner
                            ? 'bg-amber-500 text-white shadow-md'
                            : raffle.status === 'active'
                            ? 'bg-tertiary-fixed-dim/90 text-on-tertiary-container'
                            : raffle.status === 'paused'
                            ? 'bg-secondary-container text-on-secondary-container'
                            : 'bg-surface-tint/20 text-on-surface-variant'
                        }`}
                      >
                        {hasWinner
                          ? 'Finalizada'
                          : raffle.status === 'active'
                          ? 'Activa'
                          : raffle.status === 'paused'
                          ? 'Pausada'
                          : 'Finalizada'}
                      </span>
                      {raffle.endDate && new Date(raffle.endDate + 'T23:59:59').getTime() <= Date.now() && !hasWinner && (
                        <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-900 border border-amber-300 shadow-sm flex items-center gap-1">
                          <span className="material-symbols-outlined text-[13px]">event_busy</span>
                          Fecha Vencida
                        </span>
                      )}
                      {raffle.winningNumber && (
                        <span className="px-2.5 py-1 rounded-full text-xs font-black bg-amber-100 text-amber-950 border border-amber-300 shadow-sm flex items-center gap-1">
                          <span className="material-symbols-outlined text-[14px] text-amber-700">emoji_events</span>
                          Ganador: #{raffle.winningNumber}
                        </span>
                      )}
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
                  {hasWinner ? (
                    <button
                      disabled
                      className="px-3 py-2 border border-outline-variant/40 bg-surface-container-high text-on-surface-variant/50 rounded-lg font-body-sm text-xs font-semibold cursor-not-allowed"
                      title={`Sorteo finalizado con número ganador #${raffle.winningNumber || ''}`}
                    >
                      <span className="material-symbols-outlined text-[18px] text-amber-600">
                        emoji_events
                      </span>
                    </button>
                  ) : (
                    <button
                      onClick={() => handleToggleStatus(raffle.id, raffle.status)}
                      className="px-3 py-2 border border-outline-variant rounded-lg font-body-sm text-xs font-semibold hover:bg-surface-container-high transition-colors"
                      title={raffle.status === 'paused' ? 'Reanudar Ventas' : 'Pausar Ventas'}
                    >
                      <span className="material-symbols-outlined text-[18px]">
                        {raffle.status === 'paused' ? 'play_arrow' : 'pause'}
                      </span>
                    </button>
                  )}
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

                {/* Carga de Imagen de la Rifa */}
                <div className="bg-surface-container-lowest p-4 rounded-xl border border-outline-variant/30 space-y-3">
                  <label className="block text-xs font-bold text-primary flex items-center justify-between">
                    <span>Imagen de la Rifa (Portada Oficial)</span>
                    <span className="text-[11px] font-normal text-on-surface-variant">PNG, JPG, WEBP</span>
                  </label>

                  {/* Vista Previa */}
                  {imagePreview || formData.image_url ? (
                    <div className="relative rounded-xl overflow-hidden border border-outline-variant/40 bg-surface-container-high h-48 group">
                      <img
                        src={imagePreview || formData.image_url}
                        alt="Vista previa de la rifa"
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                        <label className="px-3 py-1.5 bg-white text-slate-900 hover:bg-slate-100 rounded-lg text-xs font-bold shadow cursor-pointer flex items-center gap-1 transition-transform hover:scale-105">
                          <span className="material-symbols-outlined text-[16px]">photo_camera</span>
                          Cambiar Foto
                          <input
                            type="file"
                            accept="image/*"
                            onChange={handleImageChange}
                            className="hidden"
                          />
                        </label>
                        <button
                          type="button"
                          onClick={handleRemoveImage}
                          className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold shadow flex items-center gap-1 transition-transform hover:scale-105"
                        >
                          <span className="material-symbols-outlined text-[16px]">delete</span>
                          Quitar
                        </button>
                      </div>
                      <div className="absolute bottom-2 left-2 bg-black/60 text-white text-[11px] px-2.5 py-0.5 rounded-md backdrop-blur-sm font-medium">
                        {imageFile ? `Archivo: ${imageFile.name}` : 'Imagen web seleccionada'}
                      </div>
                    </div>
                  ) : (
                    <label className="border-2 border-dashed border-outline-variant/60 hover:border-primary rounded-xl p-6 flex flex-col items-center justify-center gap-2 bg-surface-container-low/40 hover:bg-surface-container-low transition-colors cursor-pointer group">
                      <div className="w-12 h-12 rounded-full bg-primary/10 text-primary flex items-center justify-center group-hover:scale-110 transition-transform shadow-sm">
                        <span className="material-symbols-outlined text-[26px]">add_photo_alternate</span>
                      </div>
                      <div className="text-center">
                        <p className="text-xs font-bold text-primary">
                          Haz clic o arrastra una imagen para el sorteo
                        </p>
                        <p className="text-[11px] text-on-surface-variant mt-0.5">
                          Dimensiones recomendadas: 800x600 px (Máx. 10 MB)
                        </p>
                      </div>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleImageChange}
                        className="hidden"
                      />
                    </label>
                  )}

                  {/* Campo opcional de URL directa */}
                  <div>
                    <label className="block text-[11px] font-medium text-on-surface-variant mb-1">
                      O ingresa la URL de una imagen en internet:
                    </label>
                    <input
                      type="url"
                      placeholder="https://ejemplo.com/foto-del-premio.jpg"
                      value={formData.image_url}
                      onChange={(e) => {
                        setFormData({ ...formData, image_url: e.target.value });
                        if (e.target.value) {
                          setImageFile(null);
                          setImagePreview(null);
                        }
                      }}
                      className="w-full px-3 py-1.5 text-xs border border-outline-variant rounded-lg bg-surface-container-lowest focus:ring-2 focus:ring-primary"
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
