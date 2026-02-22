import { useState, useEffect, useCallback, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { fetchNewPages, markPageSeen } from '@/lib/api';

/**
 * Hook que gere as tags "NEW" no menu lateral.
 * - Busca páginas com novidades 1x ao montar (quando autenticado)
 * - Marca automaticamente a página actual como vista ao navegar
 * - Retorna isNew(path) → boolean
 */
export function useNewTags() {
  const { user } = useAuth();
  const location = useLocation();
  const [newPages, setNewPages] = useState<Set<string>>(new Set());
  const [isLoaded, setIsLoaded] = useState(false);
  const markedRef = useRef<Set<string>>(new Set());

  // Buscar páginas novas quando o utilizador está autenticado
  useEffect(() => {
    if (!user) {
      setNewPages(new Set());
      setIsLoaded(false);
      markedRef.current = new Set();
      return;
    }

    fetchNewPages()
      .then((pages) => {
        setNewPages(new Set(pages));
        setIsLoaded(true);
      })
      .catch(() => {
        setNewPages(new Set());
        setIsLoaded(true);
      });
  }, [user]);

  // Marcar página actual como vista ao navegar
  useEffect(() => {
    if (!user || !isLoaded) return;

    const currentPath = location.pathname;

    if (newPages.has(currentPath) && !markedRef.current.has(currentPath)) {
      markedRef.current.add(currentPath);

      // Optimistic: remover da UI imediatamente
      setNewPages((prev) => {
        const next = new Set(prev);
        next.delete(currentPath);
        return next;
      });

      // Fire-and-forget ao servidor
      markPageSeen(currentPath).catch((err) => {
        console.error('Failed to mark page as seen:', err);
      });
    }
  }, [location.pathname, user, isLoaded, newPages]);

  const isNew = useCallback(
    (path: string) => newPages.has(path),
    [newPages]
  );

  return { isNew, newPages, isLoaded };
}
