import { useState, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import {
  fetchSyncSettings,
  saveSyncSettings,
  triggerSync,
  fetchSyncStatus,
  fetchSyncHistory,
} from '@/lib/api';
import type { SyncSettings, SyncLogEntry, SyncStatusResponse } from '@/types';
import {
  RefreshCw,
  Save,
  Play,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Loader2,
  Clock,
  Eye,
  EyeOff,
} from 'lucide-react';

export function SyncPage() {
  // Settings state
  const [settings, setSettings] = useState<SyncSettings | null>(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [autoSync, setAutoSync] = useState(false);
  const [cronExpression, setCronExpression] = useState('0 7 * * 1');
  const [showPassword, setShowPassword] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);

  // Sync state
  const [syncing, setSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatusResponse | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // History state
  const [history, setHistory] = useState<SyncLogEntry[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);

  // Load settings + history on mount
  useEffect(() => {
    loadSettings();
    loadHistory();
    loadStatus();
  }, []);

  // Start/stop polling when syncing
  useEffect(() => {
    if (syncing) {
      pollRef.current = setInterval(async () => {
        try {
          const status = await fetchSyncStatus();
          setSyncStatus(status);
          if (!status.running) {
            setSyncing(false);
            loadHistory();
          }
        } catch {
          // ignore
        }
      }, 3000);
    } else if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [syncing]);

  async function loadSettings() {
    try {
      const s = await fetchSyncSettings();
      setSettings(s);
      setUsername(s.zsbms_username || '');
      setAutoSync(s.auto_sync_enabled);
      setCronExpression(s.cron_expression || '0 7 * * 1');
    } catch {
      // Settings may not exist yet
    }
  }

  async function loadHistory() {
    setLoadingHistory(true);
    try {
      const h = await fetchSyncHistory(15);
      setHistory(h);
    } catch {
      // ignore
    } finally {
      setLoadingHistory(false);
    }
  }

  async function loadStatus() {
    try {
      const status = await fetchSyncStatus();
      setSyncStatus(status);
      if (status.running) {
        setSyncing(true);
      }
    } catch {
      // ignore
    }
  }

  async function handleSaveSettings() {
    setSavingSettings(true);
    try {
      await saveSyncSettings({
        username,
        ...(password ? { password } : {}),
        auto_sync_enabled: autoSync,
        cron_expression: cronExpression,
      });
      setPassword('');
      toast.success('Definições guardadas com sucesso');
      loadSettings();
    } catch (err: any) {
      toast.error(err.message || 'Erro ao guardar definições');
    } finally {
      setSavingSettings(false);
    }
  }

  async function handleTriggerSync() {
    try {
      setSyncing(true);
      const result = await triggerSync();
      toast.info(`Sincronização iniciada (ID: ${result.syncId})`);
    } catch (err: any) {
      setSyncing(false);
      toast.error(err.message || 'Erro ao iniciar sincronização');
    }
  }

  function formatDate(dateStr: string | null) {
    if (!dateStr) return '—';
    const d = new Date(dateStr.includes('T') ? dateStr : dateStr.replace(' ', 'T'));
    return d.toLocaleString('pt-PT', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  function statusBadge(status: string) {
    switch (status) {
      case 'running':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400">
            <Loader2 className="h-3 w-3 animate-spin" /> Em curso
          </span>
        );
      case 'success':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400">
            <CheckCircle2 className="h-3 w-3" /> Sucesso
          </span>
        );
      case 'partial':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400">
            <AlertTriangle className="h-3 w-3" /> Parcial
          </span>
        );
      case 'failed':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400">
            <XCircle className="h-3 w-3" /> Falhou
          </span>
        );
      default:
        return <span className="text-xs text-muted-foreground">{status}</span>;
    }
  }

  const cronLabels: Record<string, string> = {
    '0 7 * * 1': 'Segunda-feira às 7:00',
    '0 7 * * 1-5': 'Dias úteis às 7:00',
    '0 7 * * *': 'Todos os dias às 7:00',
    '0 6 * * 1': 'Segunda-feira às 6:00',
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Sincronização ZSBMS</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Importa automaticamente os 5 relatórios do ZSBMS PRO para o dashboard
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Settings Card */}
        <div className="rounded-xl border border-border bg-card p-6 space-y-4">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <RefreshCw className="h-5 w-5 text-lupita-amber" />
            Definições
          </h2>

          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium mb-1">Utilizador ZSBMS</label>
              <input
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="username"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-lupita-amber/50"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                Password ZSBMS
                {settings?.has_password && !password && (
                  <span className="ml-2 text-xs text-muted-foreground">(guardada)</span>
                )}
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder={settings?.has_password ? '••••••••' : 'password'}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm pr-10 focus:outline-none focus:ring-2 focus:ring-lupita-amber/50"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div className="flex items-center gap-3 pt-1">
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoSync}
                  onChange={e => setAutoSync(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-muted rounded-full peer peer-checked:bg-lupita-amber transition-colors after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-full" />
              </label>
              <span className="text-sm">Sincronização automática</span>
            </div>

            {autoSync && (
              <div>
                <label className="block text-sm font-medium mb-1">Agendamento</label>
                <select
                  value={cronExpression}
                  onChange={e => setCronExpression(e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-lupita-amber/50"
                >
                  {Object.entries(cronLabels).map(([val, label]) => (
                    <option key={val} value={val}>{label}</option>
                  ))}
                </select>
              </div>
            )}

            <button
              onClick={handleSaveSettings}
              disabled={savingSettings || !username}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-lupita-amber text-white text-sm font-medium hover:bg-lupita-amber/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {savingSettings ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              Guardar
            </button>
          </div>
        </div>

        {/* Sync Card */}
        <div className="rounded-xl border border-border bg-card p-6 space-y-4">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Play className="h-5 w-5 text-lupita-amber" />
            Sincronizar Agora
          </h2>

          <p className="text-sm text-muted-foreground">
            Descarrega os 5 relatórios (Vendas, Zonas, Artigos, ABC, Horário) do ZSBMS PRO
            e importa os dados para o dashboard.
          </p>

          <button
            onClick={handleTriggerSync}
            disabled={syncing || !settings?.has_password}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-lupita-amber text-white text-sm font-medium hover:bg-lupita-amber/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {syncing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Sincronizando...
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4" />
                Sincronizar
              </>
            )}
          </button>

          {!settings?.has_password && (
            <p className="text-xs text-amber-500">
              Configure as credenciais ZSBMS antes de sincronizar.
            </p>
          )}

          {/* Latest sync result */}
          {syncStatus?.latest && (
            <div className="mt-4 rounded-lg border border-border p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Última sincronização</span>
                {statusBadge(syncStatus.latest.status)}
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="text-muted-foreground">Início:</span>{' '}
                  {formatDate(syncStatus.latest.started_at)}
                </div>
                {syncStatus.latest.finished_at && (
                  <div>
                    <span className="text-muted-foreground">Fim:</span>{' '}
                    {formatDate(syncStatus.latest.finished_at)}
                  </div>
                )}
                <div>
                  <span className="text-muted-foreground">Relatórios:</span>{' '}
                  <span className="text-emerald-500">{syncStatus.latest.reports_succeeded}</span>
                  {syncStatus.latest.reports_failed > 0 && (
                    <span className="text-red-500"> / {syncStatus.latest.reports_failed} falhou</span>
                  )}
                </div>
                <div>
                  <span className="text-muted-foreground">Registos:</span>{' '}
                  +{syncStatus.latest.total_inserted} ins, +{syncStatus.latest.total_updated} upd
                </div>
              </div>
              {syncStatus.latest.error && (
                <p className="text-xs text-red-500 mt-1">{syncStatus.latest.error}</p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* History */}
      <div className="rounded-xl border border-border bg-card p-6">
        <h2 className="text-lg font-semibold flex items-center gap-2 mb-4">
          <Clock className="h-5 w-5 text-lupita-amber" />
          Histórico de Sincronizações
        </h2>

        {loadingHistory ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : history.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            Nenhuma sincronização realizada ainda.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-muted-foreground">
                  <th className="text-left py-2 px-3 font-medium">Data</th>
                  <th className="text-left py-2 px-3 font-medium">Estado</th>
                  <th className="text-left py-2 px-3 font-medium">Trigger</th>
                  <th className="text-right py-2 px-3 font-medium">Relatórios</th>
                  <th className="text-right py-2 px-3 font-medium">Inseridos</th>
                  <th className="text-right py-2 px-3 font-medium">Atualizados</th>
                </tr>
              </thead>
              <tbody>
                {history.map(entry => (
                  <tr key={entry.id} className="border-b border-border/50 hover:bg-accent/30">
                    <td className="py-2 px-3">{formatDate(entry.started_at)}</td>
                    <td className="py-2 px-3">
                      {statusBadge(entry.status)}
                      {entry.error && (
                        <p className="text-xs text-red-500 mt-0.5 max-w-[200px] truncate" title={entry.error}>
                          {entry.error}
                        </p>
                      )}
                    </td>
                    <td className="py-2 px-3 capitalize">{entry.trigger_type}</td>
                    <td className="py-2 px-3 text-right">
                      {entry.reports_succeeded}/{entry.reports_succeeded + entry.reports_failed}
                    </td>
                    <td className="py-2 px-3 text-right">{entry.total_inserted.toLocaleString('pt-PT')}</td>
                    <td className="py-2 px-3 text-right">{entry.total_updated.toLocaleString('pt-PT')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
