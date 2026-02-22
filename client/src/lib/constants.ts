export const STORE_NAMES: Record<string, string> = {
  cais_do_sodre: 'Cais do Sodré',
  alvalade: 'Alvalade',
};

export const STORE_COLORS: Record<string, string> = {
  cais_do_sodre: '#f59e0b',  // amber
  alvalade: '#10b981',       // green
  total: '#8b5cf6',          // purple
};

export const DAY_ORDER = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];

export const COMPARISON_LABELS: Record<string, string> = {
  wow: 'WoW (Semanal)',
  mom: 'MoM (Mensal)',
  yoy: 'YoY (Anual)',
};

export const ZONE_NAMES: Record<string, string> = {
  Delivery: 'Delivery',
  Sala: 'Sala',
  Takeaway: 'Takeaway',
  Espera: 'Espera',
  Eventos: 'Eventos',
  Outros: 'Outros',
};

export const ZONE_COLORS: Record<string, string> = {
  Delivery: '#f59e0b',   // amber
  Sala: '#10b981',       // emerald
  Takeaway: '#3b82f6',   // blue
  Espera: '#8b5cf6',     // violet
  Eventos: '#ef4444',    // red
  Outros: '#6b7280',     // gray
};

// Family colors for article charts (cycle through for unknown families)
export const FAMILY_COLORS: Record<string, string> = {
  PIZZAS: '#f59e0b',       // amber
  VINHOS: '#8b5cf6',       // violet
  CERVEJA: '#f97316',      // orange
  COCKTAILS: '#ec4899',    // pink
  ENTRADAS: '#10b981',     // emerald
  SOBREMESAS: '#f43f5e',   // rose
  'SOFT DRINKS': '#3b82f6', // blue
  DELIVERY: '#06b6d4',     // cyan
  'PIZZAS EXTRA': '#d97706', // amber-600
  MERCHANDISING: '#6366f1', // indigo
  SALADAS: '#22c55e',      // green
  TAXA: '#6b7280',         // gray
  INATIVOS: '#9ca3af',     // gray-400
  KOMBUCHA: '#14b8a6',     // teal
  VOUCHERS: '#a855f7',     // purple
  'Hidden Delivery': '#78716c', // stone
};

export const FAMILY_COLOR_PALETTE = [
  '#f59e0b', '#8b5cf6', '#10b981', '#3b82f6', '#ef4444',
  '#ec4899', '#f97316', '#06b6d4', '#6366f1', '#22c55e',
  '#d97706', '#14b8a6', '#a855f7', '#f43f5e', '#78716c',
];

export const ARTICLE_TREND_COLORS = [
  '#ef4444', // vermelho
  '#3b82f6', // azul
  '#10b981', // verde
  '#f59e0b', // amarelo/amber
  '#8b5cf6', // roxo
  '#ec4899', // rosa
  '#06b6d4', // ciano
  '#f97316', // laranja
  '#6d28d9', // violeta escuro
  '#65a30d', // verde lima
];

export const QUICK_FILTER_LABELS: Record<string, string> = {
  last_week: 'Semana passada',
  this_month: 'Este mês',
  last_month: 'Mês passado',
  this_year: 'Este ano',
  last_year: 'Ano passado',
};
