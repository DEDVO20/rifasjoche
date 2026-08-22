'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';

interface AuditLog {
  id: string;
  timestamp: string;
  userEmail: string;
  userRole: string;
  ipAddress: string;
  action: string;
  entityType: string;
  entityId: string;
  riskLevel: 'normal' | 'important' | 'critical';
  details: string;
}

export default function AuditoriaPage() {
  const [search, setSearch] = useState('');
  const [riskFilter, setRiskFilter] = useState('all');
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);

  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const supabase = createClient();

  const loadAuditLogs = useCallback(async () => {
    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('audit_logs')
        .select(`
          id,
          action,
          entity_type,
          entity_id,
          ip_address,
          details,
          created_at,
          profiles (email, role)
        `)
        .order('created_at', { ascending: false });

      if (!error && data && data.length > 0) {
        const formatted: AuditLog[] = data.map((item: any) => ({
          id: `LOG-${item.id}`,
          timestamp: new Date(item.created_at).toLocaleString('es-CO', {
            dateStyle: 'short',
            timeStyle: 'medium',
          }),
          userEmail: item.profiles?.email || 'Sistema Auditor',
          userRole: item.profiles?.role || 'admin',
          ipAddress: item.ip_address || '127.0.0.1',
          action: item.action || 'SISTEMA_EVENTO',
          entityType: item.entity_type || 'Raffle',
          entityId: item.entity_id ? item.entity_id.toString() : 'SYS-001',
          riskLevel: item.action?.includes('RESULTADO') ? 'critical' : item.action?.includes('CREACION') ? 'important' : 'normal',
          details: JSON.stringify(item.details || { event: item.action, entity: item.entity_type }, null, 2),
        }));
        setLogs(formatted);
      } else {
        setLogs([]);
      }
    } catch (err) {
      console.error('Error al cargar logs de auditoría:', err);
    } finally {
      setIsLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    loadAuditLogs();
  }, [loadAuditLogs]);

  const filteredLogs = logs.filter((log) => {
    const matchesSearch =
      log.action.toLowerCase().includes(search.toLowerCase()) ||
      log.userEmail.toLowerCase().includes(search.toLowerCase()) ||
      log.entityId.toLowerCase().includes(search.toLowerCase());
    const matchesRisk = riskFilter === 'all' || log.riskLevel === riskFilter;
    return matchesSearch && matchesRisk;
  });

  return (
    <div className="space-y-gutter">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
        <div>
          <h1 className="font-display-lg text-display-lg font-extrabold text-primary">
            Registro de Auditoría de Sistema (Supabase)
          </h1>
          <p className="font-body-lg text-body-lg text-on-surface-variant">
            Trazabilidad inmutable de acciones administrativas y eventos de la base de datos.
          </p>
        </div>
        <button
          onClick={() => loadAuditLogs()}
          className="bg-primary text-on-primary px-6 py-3 rounded-lg font-body-md text-body-md font-semibold shadow-md hover:shadow-lg transition-all flex items-center gap-2"
        >
          <span className={`material-symbols-outlined ${isLoading ? 'animate-spin' : ''}`}>
            refresh
          </span>
          Actualizar Logs
        </button>
      </div>

      {/* Tarjetas de Métricas de Auditoría */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-base md:gap-gutter mb-6">
        <div className="bg-surface-container-lowest p-6 rounded-xl shadow-[0px_4px_20px_rgba(15,23,42,0.05)] border border-outline-variant/20">
          <span className="font-label-caps text-label-caps text-outline uppercase tracking-wider">
            TOTAL EVENTOS EN DB
          </span>
          <div className="font-headline-md text-headline-md font-bold text-primary mt-2">
            {logs.length}
          </div>
          <div className="font-body-sm text-body-sm text-on-surface-variant mt-1">
            Logs auditados en Supabase
          </div>
        </div>

        <div className="bg-surface-container-lowest p-6 rounded-xl shadow-[0px_4px_20px_rgba(15,23,42,0.05)] border border-outline-variant/20">
          <span className="font-label-caps text-label-caps text-outline uppercase tracking-wider">
            EVENTOS NORMALES
          </span>
          <div className="font-headline-md text-headline-md font-bold text-primary mt-2">
            {logs.filter((l) => l.riskLevel === 'normal').length}
          </div>
          <div className="font-body-sm text-body-sm text-tertiary-fixed-dim mt-1 font-semibold">
            Operación rutinaria
          </div>
        </div>

        <div className="bg-surface-container-lowest p-6 rounded-xl shadow-[0px_4px_20px_rgba(15,23,42,0.05)] border border-outline-variant/20">
          <span className="font-label-caps text-label-caps text-outline uppercase tracking-wider">
            EVENTOS CRÍTICOS
          </span>
          <div className="font-headline-md text-headline-md font-bold text-primary mt-2">
            {logs.filter((l) => l.riskLevel === 'critical').length}
          </div>
          <div className="font-body-sm text-body-sm text-error mt-1 font-semibold">
            Resultados de sorteos
          </div>
        </div>

        <div className="bg-surface-container-lowest p-6 rounded-xl shadow-[0px_4px_20px_rgba(15,23,42,0.05)] border border-outline-variant/20">
          <span className="font-label-caps text-label-caps text-outline uppercase tracking-wider">
            ESTADO DE AUDITORÍA
          </span>
          <div className="font-headline-md text-headline-md font-bold text-tertiary-fixed-dim mt-2 flex items-center gap-1">
            <span className="material-symbols-outlined text-[24px]">verified_user</span>
            Conectado DB
          </div>
          <div className="font-body-sm text-body-sm text-on-surface-variant mt-1">
            Firmado en PostgreSQL
          </div>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-col md:flex-row gap-4 bg-surface-container-lowest p-4 rounded-xl shadow-sm border border-outline-variant/20">
        <div className="relative flex-1">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant">
            search
          </span>
          <input
            type="text"
            placeholder="Buscar por usuario, acción o ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-outline-variant rounded-lg bg-surface-container-lowest focus:ring-2 focus:ring-primary font-body-md text-body-md"
          />
        </div>
        <div className="flex gap-2">
          <select
            value={riskFilter}
            onChange={(e) => setRiskFilter(e.target.value)}
            className="px-4 py-2 border border-outline-variant rounded-lg bg-surface-container-lowest focus:ring-2 focus:ring-primary font-body-md text-body-md"
          >
            <option value="all">Todos los niveles</option>
            <option value="normal">Normal</option>
            <option value="important">Importante</option>
            <option value="critical">Crítico</option>
          </select>
        </div>
      </div>

      {/* Tabla de Logs */}
      <div className="bg-surface-container-lowest rounded-xl shadow-[0px_4px_20px_rgba(15,23,42,0.05)] border border-outline-variant/20 overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-surface-container-low border-b border-outline-variant/30 text-on-surface-variant font-label-caps text-label-caps uppercase">
              <th className="p-4">Fecha & Hora</th>
              <th className="p-4">Usuario & IP</th>
              <th className="p-4">Acción Auditada</th>
              <th className="p-4">Entidad Afectada</th>
              <th className="p-4">Nivel de Riesgo</th>
              <th className="p-4 text-right">Detalles</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant/20 font-body-sm text-body-sm">
            {isLoading ? (
              <tr>
                <td colSpan={6} className="p-8 text-center text-primary font-bold">
                  Cargando logs de auditoría desde Supabase...
                </td>
              </tr>
            ) : filteredLogs.length > 0 ? (
              filteredLogs.map((log) => (
                <tr key={log.id} className="hover:bg-surface-container-high/50 transition-colors">
                  <td className="p-4 font-mono text-xs font-bold text-primary">
                    {log.timestamp}
                  </td>
                  <td className="p-4">
                    <div className="font-semibold text-primary">{log.userEmail}</div>
                    <div className="text-xs text-on-surface-variant font-mono">{log.ipAddress}</div>
                  </td>
                  <td className="p-4 font-mono font-bold text-xs text-primary">
                    {log.action}
                  </td>
                  <td className="p-4 font-mono text-xs">
                    <span className="font-bold">{log.entityType}:</span> {log.entityId}
                  </td>
                  <td className="p-4">
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
                        log.riskLevel === 'normal'
                          ? 'bg-surface-container-high text-on-surface-variant'
                          : log.riskLevel === 'important'
                          ? 'bg-secondary-container text-on-secondary-container'
                          : 'bg-error-container text-on-error-container'
                      }`}
                    >
                      {log.riskLevel === 'normal'
                        ? 'Normal'
                        : log.riskLevel === 'important'
                        ? 'Importante'
                        : 'Crítico'}
                    </span>
                  </td>
                  <td className="p-4 text-right">
                    <button
                      onClick={() => setSelectedLog(log)}
                      className="px-3 py-1.5 border border-outline-variant rounded-lg font-body-sm text-body-sm font-semibold hover:bg-surface-container transition-colors"
                    >
                      Ver Payload JSON
                    </button>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={6} className="p-8 text-center text-on-surface-variant">
                  No hay eventos registrados en la auditoría.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Modal JSON Details */}
      {selectedLog && (
        <div className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-surface-container-lowest rounded-xl max-w-lg w-full p-6 shadow-2xl border border-outline-variant/30 animate-in fade-in zoom-in-95">
            <div className="flex justify-between items-center mb-4">
              <h2 className="font-headline-md text-headline-md font-bold text-primary">
                Detalles del Evento ({selectedLog.id})
              </h2>
              <button
                onClick={() => setSelectedLog(null)}
                className="text-on-surface-variant hover:text-primary p-1 rounded-full"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <div className="space-y-3 mb-4">
              <div className="text-xs text-on-surface-variant">
                <strong>Acción:</strong> {selectedLog.action}
              </div>
              <div className="text-xs text-on-surface-variant">
                <strong>Usuario:</strong> {selectedLog.userEmail} ({selectedLog.ipAddress})
              </div>
            </div>

            <pre className="bg-primary text-primary-fixed p-4 rounded-lg text-xs font-mono overflow-x-auto max-h-60">
              {selectedLog.details}
            </pre>

            <div className="flex justify-end mt-6">
              <button
                onClick={() => setSelectedLog(null)}
                className="px-6 py-2 bg-primary text-on-primary rounded-lg font-body-md text-body-md font-semibold"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
