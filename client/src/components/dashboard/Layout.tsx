import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useNewTags } from '@/hooks/useNewTags';
import { LayoutDashboard, Upload, LogOut, Menu, X, Sun, Moon, ShoppingBag, BarChart3, Sparkles, Clock, BookOpen, RefreshCw } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { LupitaLogo } from './LupitaLogo';

export function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isDark, setIsDark] = useState(true);
  const { isNew } = useNewTags();
  const toggleTheme = () => {
    document.documentElement.classList.toggle('dark');
    setIsDark(!isDark);
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const navItems = [
    { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    { to: '/hourly', icon: Clock, label: 'Faturação / Horário' },
    { to: '/artigos', icon: ShoppingBag, label: 'Artigos' },
    { to: '/abc', icon: BarChart3, label: 'Análise ABC' },
    { to: '/insights', icon: Sparkles, label: 'Insights AI' },
    { to: '/upload', icon: Upload, label: 'Upload' },
  ];

  const NavContent = () => (
    <div className="flex flex-col h-full">
      <div className="px-3 pt-5 pb-3">
        <LupitaLogo className="w-full h-auto object-contain" />
      </div>

      <nav className="flex-1 px-3 space-y-1">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            onClick={() => setSidebarOpen(false)}
            className={({ isActive }) =>
              `flex items-center gap-1.5 px-2.5 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-lupita-amber/10 text-lupita-amber'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent'
              }`
            }
          >
            <item.icon className="h-4 w-4 flex-shrink-0" />
            <span className="flex-1 min-w-0 whitespace-nowrap">
              {item.label}
              {isNew(item.to) && (
                <span className="inline-flex align-middle ml-1 text-[6px] font-bold uppercase text-lupita-amber bg-lupita-amber/10 border border-lupita-amber/25 rounded-sm px-[3px] py-[1px] leading-none">new</span>
              )}
            </span>
          </NavLink>
        ))}
      </nav>

      {/* Instruções + Sync (admin) */}
      <div className="px-3 pb-2 border-t border-border pt-3 space-y-1">
        <NavLink
          to="/instrucoes"
          onClick={() => setSidebarOpen(false)}
          className={({ isActive }) =>
            `flex items-center gap-1.5 px-2.5 py-2.5 rounded-lg text-sm font-medium transition-colors ${
              isActive
                ? 'bg-lupita-amber/10 text-lupita-amber'
                : 'text-muted-foreground hover:text-foreground hover:bg-accent'
            }`
          }
        >
          <BookOpen className="h-4 w-4 flex-shrink-0" />
          <span className="flex-1 min-w-0 whitespace-nowrap">
            Informações
            {isNew('/instrucoes') && (
              <span className="inline-flex align-middle ml-1 text-[6px] font-bold uppercase text-lupita-amber bg-lupita-amber/10 border border-lupita-amber/25 rounded-sm px-[3px] py-[1px] leading-none">new</span>
            )}
          </span>
        </NavLink>

        {user?.role === 'admin' && (
          <NavLink
            to="/sync"
            onClick={() => setSidebarOpen(false)}
            className={({ isActive }) =>
              `flex items-center gap-1.5 px-2.5 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-lupita-amber/10 text-lupita-amber'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent'
              }`
            }
          >
            <RefreshCw className="h-4 w-4 flex-shrink-0" />
            <span className="flex-1 min-w-0 whitespace-nowrap">
              Sincronização
              {isNew('/sync') && (
                <span className="inline-flex align-middle ml-1 text-[6px] font-bold uppercase text-lupita-amber bg-lupita-amber/10 border border-lupita-amber/25 rounded-sm px-[3px] py-[1px] leading-none">new</span>
              )}
            </span>
          </NavLink>
        )}
      </div>

      <div className="p-4 border-t border-border">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-sm font-medium">{user?.username}</p>
            <p className="text-xs text-muted-foreground capitalize">{user?.role}</p>
          </div>
          <button
            onClick={toggleTheme}
            className="p-2 rounded-lg hover:bg-accent transition-colors text-muted-foreground"
          >
            {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
        </div>
        <button
          onClick={handleLogout}
          className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
        >
          <LogOut className="h-4 w-4" />
          Sair
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background">
      {/* Desktop sidebar */}
      <aside className="hidden md:fixed md:inset-y-0 md:flex md:w-60 md:flex-col border-r border-border bg-card">
        <NavContent />
      </aside>

      {/* Mobile header */}
      <div className="sticky top-0 z-40 md:hidden flex items-center justify-between h-14 px-4 border-b border-border bg-card/80 backdrop-blur-sm">
        <button
          onClick={() => setSidebarOpen(true)}
          className="p-2 rounded-lg hover:bg-accent"
        >
          <Menu className="h-5 w-5" />
        </button>
        <LupitaLogo className="w-32 h-auto object-contain" />
        <div className="w-9" />
      </div>

      {/* Mobile sidebar overlay */}
      <AnimatePresence>
        {sidebarOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 bg-black/50 md:hidden"
              onClick={() => setSidebarOpen(false)}
            />
            <motion.aside
              initial={{ x: -260 }}
              animate={{ x: 0 }}
              exit={{ x: -260 }}
              transition={{ type: 'spring', damping: 25, stiffness: 250 }}
              className="fixed inset-y-0 left-0 z-50 w-60 bg-card border-r border-border md:hidden"
            >
              <button
                onClick={() => setSidebarOpen(false)}
                className="absolute top-4 right-4 p-1 rounded hover:bg-accent"
              >
                <X className="h-4 w-4" />
              </button>
              <NavContent />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Main content */}
      <main className="md:pl-60">
        <div className="p-4 md:p-6 lg:p-8 max-w-[1600px] mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
