import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { LayoutDashboard, Upload, LogOut, Menu, X, Sun, Moon, ShoppingBag, BarChart3, BookOpen, ChevronDown, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { LupitaLogo } from './LupitaLogo';

export function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isDark, setIsDark] = useState(true);
  const [instructionsOpen, setInstructionsOpen] = useState(false);

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
    { to: '/artigos', icon: ShoppingBag, label: 'Artigos' },
    { to: '/abc', icon: BarChart3, label: 'Análise ABC' },
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
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-lupita-amber/10 text-lupita-amber'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent'
              }`
            }
          >
            <item.icon className="h-4 w-4" />
            {item.label}
          </NavLink>
        ))}
      </nav>

      {/* Instruções */}
      <div className="px-3 pb-2 border-t border-border pt-3">
        <button
          onClick={() => setInstructionsOpen(!instructionsOpen)}
          className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
        >
          <BookOpen className="h-4 w-4" />
          <span className="flex-1 text-left">Instruções</span>
          {instructionsOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </button>
        <AnimatePresence>
          {instructionsOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="mt-1 px-2 pb-2 max-h-[50vh] overflow-y-auto text-[11px] text-muted-foreground space-y-3 scrollbar-thin">
                <div>
                  <p className="font-semibold text-foreground text-xs mb-1">Conceito</p>
                  <ul className="space-y-0.5 list-disc list-inside">
                    <li>Criação: CLAUDE CODE</li>
                    <li>Dados: Importar todas as segundas-feiras</li>
                    <li>Responsável: Bruna (Financeiro)</li>
                  </ul>
                </div>

                <div>
                  <p className="font-semibold text-foreground text-xs mb-1">Input Dados</p>

                  <div className="space-y-2">
                    <div>
                      <p className="font-medium text-foreground/80 mb-0.5">1. Vendas Completo</p>
                      <p className="italic">Relatórios &gt; Vendas &gt; Apuramentos &gt; Completo</p>
                      <ul className="mt-0.5 space-y-0.5 ml-3">
                        <li>☐ Ano Completo Anterior</li>
                        <li>☐ Este Ano</li>
                      </ul>
                      <p className="mt-0.5 ml-3 text-[10px]">Agrupar p/ Data + Loja · Retirar LUPITA SEDE · <span className="font-semibold">Todas as colunas selecionadas</span></p>
                    </div>

                    <div>
                      <p className="font-medium text-foreground/80 mb-0.5">2. Zonas (Canais de Venda)</p>
                      <p className="italic">Relatórios &gt; Vendas &gt; Apuramentos &gt; Zonas</p>
                      <ul className="mt-0.5 space-y-0.5 ml-3">
                        <li>☐ Ano Completo Anterior</li>
                        <li>☐ Este Ano</li>
                      </ul>
                      <p className="mt-0.5 ml-3 text-[10px]">Agrupar p/ Data + Loja · Retirar LUPITA SEDE · <span className="font-semibold">Todas as colunas selecionadas</span></p>
                    </div>

                    <div>
                      <p className="font-medium text-foreground/80 mb-0.5">3. Artigos</p>
                      <p className="italic">Relatórios &gt; Vendas &gt; Apuramentos &gt; Artigos</p>
                      <ul className="mt-0.5 space-y-0.5 ml-3">
                        <li>☐ Ano Completo Anterior</li>
                        <li>☐ Este Ano</li>
                      </ul>
                      <p className="mt-0.5 ml-3 text-[10px]">Agrupar p/ Data + Loja · Retirar LUPITA SEDE · <span className="font-semibold">Todas as colunas selecionadas</span></p>
                    </div>

                    <div>
                      <p className="font-medium text-foreground/80 mb-0.5">4. Análise ABC</p>
                      <p className="italic">Relatórios &gt; Vendas &gt; Rankings &gt; Análise ABC Vendas</p>
                      <ul className="mt-0.5 space-y-0.5 ml-3">
                        <li>☐ Ano Completo Anterior</li>
                        <li>☐ Este Ano</li>
                      </ul>
                      <p className="mt-0.5 ml-3 text-[10px]">Agrupar p/ Data + Loja · Retirar LUPITA SEDE · <span className="font-semibold">Todas as colunas selecionadas (exceto: Cód. Externo)</span></p>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
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
      <aside className="hidden md:fixed md:inset-y-0 md:flex md:w-56 md:flex-col border-r border-border bg-card">
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
              initial={{ x: -256 }}
              animate={{ x: 0 }}
              exit={{ x: -256 }}
              transition={{ type: 'spring', damping: 25, stiffness: 250 }}
              className="fixed inset-y-0 left-0 z-50 w-56 bg-card border-r border-border md:hidden"
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
      <main className="md:pl-56">
        <div className="p-4 md:p-6 lg:p-8 max-w-[1600px] mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
