import type {
  LoginResponse,
  KPIResponse,
  MTDResponse,
  YTDResponse,
  ImportResponse,
  ImportLogEntry,
  DailySaleRow,
  ComparisonType,
  ABCArticle,
  ABCDistributionResponse,
  ABCConcentration,
  ABCEvolutionPoint,
  ABCStoreComparisonPoint,
  ABCInsightsResponse,
  ProjectionResponse,
} from '@/types';

const API_BASE = '/api';

function getToken(): string | null {
  return localStorage.getItem('lupita_token');
}

async function request<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Erro desconhecido' }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }

  // Handle CSV downloads
  const contentType = response.headers.get('Content-Type');
  if (contentType?.includes('text/csv')) {
    return response.blob() as any;
  }

  return response.json();
}

// Auth
export async function login(username: string, password: string): Promise<LoginResponse> {
  return request<LoginResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
}

export async function getMe() {
  return request<{ user: LoginResponse['user'] }>('/auth/me');
}

// KPIs
export async function fetchKPIs(params: {
  dateFrom: string;
  dateTo: string;
  storeId?: string;
  comparison?: ComparisonType;
}): Promise<KPIResponse> {
  const query = new URLSearchParams({
    dateFrom: params.dateFrom,
    dateTo: params.dateTo,
    ...(params.storeId && { storeId: params.storeId }),
    ...(params.comparison && { comparison: params.comparison }),
  });
  return request<KPIResponse>(`/kpis?${query}`);
}

export async function fetchMTD(storeId?: string): Promise<MTDResponse> {
  const query = storeId ? `?storeId=${storeId}` : '';
  return request<MTDResponse>(`/kpis/mtd${query}`);
}

export async function fetchYTD(storeId?: string): Promise<YTDResponse> {
  const query = storeId ? `?storeId=${storeId}` : '';
  return request<YTDResponse>(`/kpis/ytd${query}`);
}

export async function fetchProjection(storeId?: string): Promise<ProjectionResponse> {
  const query = storeId ? `?storeId=${storeId}` : '';
  return request<ProjectionResponse>(`/kpis/projection${query}`);
}

// Charts
export async function fetchChartData(
  type: string,
  params: { dateFrom: string; dateTo: string; storeId?: string; channel?: string }
) {
  const query = new URLSearchParams({
    dateFrom: params.dateFrom,
    dateTo: params.dateTo,
    ...(params.storeId && { storeId: params.storeId }),
    ...(params.channel && { channel: params.channel }),
  });
  return request<any[]>(`/charts/${type}?${query}`);
}

// Daily detail
export async function fetchDailyData(params: {
  dateFrom: string;
  dateTo: string;
  storeId?: string;
}): Promise<DailySaleRow[]> {
  const query = new URLSearchParams({
    dateFrom: params.dateFrom,
    dateTo: params.dateTo,
    ...(params.storeId && { storeId: params.storeId }),
  });
  return request<DailySaleRow[]>(`/export/daily?${query}`);
}

// Export CSV
export async function exportCSV(params: {
  dateFrom: string;
  dateTo: string;
  storeId?: string;
}): Promise<void> {
  const query = new URLSearchParams({
    dateFrom: params.dateFrom,
    dateTo: params.dateTo,
    ...(params.storeId && { storeId: params.storeId }),
  });

  const token = getToken();
  const response = await fetch(`${API_BASE}/export/csv?${query}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) throw new Error('Erro ao exportar CSV');

  const blob = await response.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `lupita_${params.dateFrom}_${params.dateTo}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);
}

// Upload
export async function uploadFiles(files: File[]): Promise<ImportResponse> {
  const formData = new FormData();
  files.forEach((file) => formData.append('files', file));
  return request<ImportResponse>('/upload/import', {
    method: 'POST',
    body: formData,
  });
}

export async function getImportHistory(): Promise<ImportLogEntry[]> {
  return request<ImportLogEntry[]>('/upload/history');
}

// ABC Analysis
export async function fetchABCDateRange(): Promise<{ min_date: string | null; max_date: string | null }> {
  return request('/abc/date-range');
}

export async function fetchABCRanking(params: {
  dateFrom: string;
  dateTo: string;
  storeId?: string;
}): Promise<ABCArticle[]> {
  const query = new URLSearchParams({
    dateFrom: params.dateFrom,
    dateTo: params.dateTo,
    ...(params.storeId && { storeId: params.storeId }),
  });
  return request<ABCArticle[]>(`/abc/ranking?${query}`);
}

export async function fetchABCDistribution(params: {
  dateFrom: string;
  dateTo: string;
  storeId?: string;
}): Promise<ABCDistributionResponse> {
  const query = new URLSearchParams({
    dateFrom: params.dateFrom,
    dateTo: params.dateTo,
    ...(params.storeId && { storeId: params.storeId }),
  });
  return request<ABCDistributionResponse>(`/abc/distribution?${query}`);
}

export async function fetchABCPareto(params: {
  dateFrom: string;
  dateTo: string;
  storeId?: string;
}): Promise<ABCArticle[]> {
  const query = new URLSearchParams({
    dateFrom: params.dateFrom,
    dateTo: params.dateTo,
    ...(params.storeId && { storeId: params.storeId }),
  });
  return request<ABCArticle[]>(`/abc/pareto?${query}`);
}

export async function fetchABCEvolution(params: {
  dateFrom: string;
  dateTo: string;
  storeId?: string;
}): Promise<ABCEvolutionPoint[]> {
  const query = new URLSearchParams({
    dateFrom: params.dateFrom,
    dateTo: params.dateTo,
    ...(params.storeId && { storeId: params.storeId }),
  });
  return request<ABCEvolutionPoint[]>(`/abc/evolution?${query}`);
}

export async function fetchABCStoreComparison(params: {
  dateFrom: string;
  dateTo: string;
}): Promise<ABCStoreComparisonPoint[]> {
  const query = new URLSearchParams({
    dateFrom: params.dateFrom,
    dateTo: params.dateTo,
  });
  return request<ABCStoreComparisonPoint[]>(`/abc/store-comparison?${query}`);
}

export async function fetchABCConcentration(params: {
  dateFrom: string;
  dateTo: string;
  storeId?: string;
}): Promise<ABCConcentration> {
  const query = new URLSearchParams({
    dateFrom: params.dateFrom,
    dateTo: params.dateTo,
    ...(params.storeId && { storeId: params.storeId }),
  });
  return request<ABCConcentration>(`/abc/concentration?${query}`);
}

export async function fetchABCInsights(params: {
  dateFrom: string;
  dateTo: string;
  storeId?: string;
}): Promise<ABCInsightsResponse> {
  return request<ABCInsightsResponse>('/abc/insights', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}
