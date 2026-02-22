import { useState, useCallback, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import { uploadFiles, getImportHistory } from '@/lib/api';
import type { ImportResponse, ImportLogEntry } from '@/types';
import { formatDate } from '@/lib/formatters';
import { Upload, FileSpreadsheet, CheckCircle, AlertCircle, Clock, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';

export function UploadPage() {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [result, setResult] = useState<ImportResponse | null>(null);
  const [history, setHistory] = useState<ImportLogEntry[]>([]);

  useEffect(() => {
    getImportHistory().then(setHistory).catch(console.error);
  }, []);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const xlsx = acceptedFiles.filter(
      (f) => f.name.endsWith('.xlsx') || f.name.endsWith('.xls')
    );
    if (xlsx.length !== acceptedFiles.length) {
      toast.warning('Apenas ficheiros .xlsx são aceites');
    }
    setSelectedFiles((prev) => [...prev, ...xlsx]);
    setResult(null);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-excel': ['.xls'],
    },
    multiple: true,
  });

  const handleUpload = async () => {
    if (selectedFiles.length === 0) return;
    setIsUploading(true);
    setResult(null);

    try {
      const res = await uploadFiles(selectedFiles);
      setResult(res);
      setSelectedFiles([]);

      if (res.summary.errors.length === 0) {
        toast.success(
          `Importados ${res.summary.totalInserted} novos registos, ${res.summary.totalUpdated} atualizados`
        );
      } else {
        toast.warning(`Importação concluída com ${res.summary.errors.length} avisos`);
      }

      // Refresh history
      getImportHistory().then(setHistory).catch(console.error);
    } catch (err: any) {
      toast.error(err.message || 'Erro no upload');
    } finally {
      setIsUploading(false);
    }
  };

  const removeFile = (index: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
        <div>
          <h2 className="text-xl font-bold text-foreground">Upload de Dados</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Importa ficheiros .xlsx do backoffice (Apuramento Completo, Zonas, Artigos ou Análise ABC Vendas)
          </p>
        </div>

        {/* Drop zone */}
        <div
          {...getRootProps()}
          className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
            isDragActive
              ? 'border-lupita-amber bg-lupita-amber/5'
              : 'border-border hover:border-lupita-amber/50'
          }`}
        >
          <input {...getInputProps()} />
          <Upload className="h-10 w-10 text-muted-foreground mx-auto mb-4" />
          {isDragActive ? (
            <p className="text-sm text-lupita-amber font-medium">Larga os ficheiros aqui</p>
          ) : (
            <>
              <p className="text-sm text-foreground font-medium mb-1">
                Arrasta ficheiros .xlsx para aqui
              </p>
              <p className="text-xs text-muted-foreground">ou clica para selecionar</p>
            </>
          )}
        </div>

        {/* Selected files */}
        <AnimatePresence>
          {selectedFiles.length > 0 && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="space-y-2"
            >
              <p className="text-sm font-medium text-foreground">
                {selectedFiles.length} ficheiro(s) selecionado(s)
              </p>
              {selectedFiles.map((file, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between px-4 py-2.5 rounded-lg border border-border bg-card"
                >
                  <div className="flex items-center gap-3">
                    <FileSpreadsheet className="h-4 w-4 text-lupita-green" />
                    <div>
                      <p className="text-sm text-foreground">{file.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {(file.size / 1024).toFixed(0)} KB
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => removeFile(idx)}
                    className="text-xs text-muted-foreground hover:text-destructive transition-colors"
                  >
                    Remover
                  </button>
                </div>
              ))}

              <button
                onClick={handleUpload}
                disabled={isUploading}
                className="w-full py-2.5 rounded-lg bg-lupita-amber text-white font-medium hover:bg-amber-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isUploading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    A importar...
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4" />
                    Importar {selectedFiles.length} ficheiro(s)
                  </>
                )}
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Import result */}
        <AnimatePresence>
          {result && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="rounded-xl border border-border bg-card p-4 space-y-3"
            >
              <div className="flex items-center gap-2">
                {result.summary.errors.length === 0 ? (
                  <CheckCircle className="h-5 w-5 text-lupita-green" />
                ) : (
                  <AlertCircle className="h-5 w-5 text-lupita-amber" />
                )}
                <h3 className="text-sm font-semibold text-foreground">Resultado da Importação</h3>
              </div>

              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="p-3 rounded-lg bg-background">
                  <p className="text-lg font-bold text-foreground">{result.summary.filesProcessed}</p>
                  <p className="text-xs text-muted-foreground">Ficheiros</p>
                </div>
                <div className="p-3 rounded-lg bg-background">
                  <p className="text-lg font-bold text-lupita-green">{result.summary.totalInserted}</p>
                  <p className="text-xs text-muted-foreground">Novos</p>
                </div>
                <div className="p-3 rounded-lg bg-background">
                  <p className="text-lg font-bold text-lupita-amber">{result.summary.totalUpdated}</p>
                  <p className="text-xs text-muted-foreground">Atualizados</p>
                </div>
              </div>

              {result.summary.errors.length > 0 && (
                <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20">
                  <p className="text-xs font-medium text-destructive mb-1">Avisos:</p>
                  {result.summary.errors.map((err, i) => (
                    <p key={i} className="text-xs text-destructive/80">{err}</p>
                  ))}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Import history */}
        {history.length > 0 && (
          <div className="rounded-xl border border-border bg-card shadow-sm">
            <div className="p-4 border-b border-border">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Histórico de Importações
              </h3>
            </div>
            <div className="divide-y divide-border">
              {history.slice(0, 20).map((entry) => (
                <div key={entry.id} className="px-4 py-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm text-foreground">{entry.filename}</p>
                    <p className="text-xs text-muted-foreground">
                      {entry.date_from && entry.date_to
                        ? `${formatDate(entry.date_from)} — ${formatDate(entry.date_to)}`
                        : 'Período desconhecido'}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">
                      {entry.records_inserted} novos, {entry.records_updated} atualizados
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(entry.imported_at).toLocaleString('pt-PT')}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
    </div>
  );
}
