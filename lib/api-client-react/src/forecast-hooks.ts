/**
 * Manual additions for new DAWAI-SETU forecast/analytics endpoints.
 * These supplement the Orval-generated types and hooks.
 */

// ─── Types ──────────────────────────────────────────────────────────────

export interface ForecastResult {
  currentStock: number;
  projectedDailyStock: Array<{ date: string; stock: number }>;
  daysToStockout: number | null;
  projectedStockoutDate: string | null;
  shortageRisk: 'critical' | 'high' | 'watch' | 'stable';
  replenishmentImpact: {
    quantity: number;
    arrivalDate: string;
    arrivesBeforeStockout: boolean;
  } | null;
  confidence: {
    level: 'high' | 'moderate' | 'low';
    percentage: number;
    evidence: string[];
  };
  demand: {
    dailyForecasts: number[];
    projectedTotalDemand: number;
    averageDailyDemand: number;
    trend: 'increasing' | 'decreasing' | 'stable';
  };
}

export interface RegionalRiskResult {
  facilitiesAffected: number;
  averageStockCover: number;
  regionalAvailableStock: number;
  projectedRegionalDemand: number;
  projectedRegionalDeficit: number;
  incomingReplenishment: number;
  classification: 'isolated_shortage' | 'emerging_regional' | 'regional_shortage' | 'stable';
  propagationChain: Array<{
    facilityId: number;
    facilityName: string;
    daysToStockout: number | null;
    risk: string;
  }>;
}

export interface AlertHistoryRecord {
  id: number;
  facilityId: number;
  medicineId: number;
  alertType: string;
  severity: string;
  title: string;
  detail: string;
  projectedStockoutDate: string | null;
  forecastConfidence: number | null;
  recommendedAction: string | null;
  status: string;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ReplenishmentRecord {
  id: number;
  facilityId: number;
  facilityName: string;
  medicineId: number;
  medicineName: string;
  incomingQuantity: number;
  supplier: string | null;
  expectedDate: string;
  actualDate: string | null;
  leadTimeDays: number | null;
  orderStatus: string;
  reliability: number | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

// ─── Fetch helpers ──────────────────────────────────────────────────────

function buildUrl(path: string, params: Record<string, string | number | boolean | undefined | null>) {
  const url = new URL(`/api${path}`, window.location.origin);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

async function patchJson<T>(url: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

// ─── React Query hooks ──────────────────────────────────────────────────

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { UseQueryOptions } from '@tanstack/react-query';

// Forecast
export const getForecastQueryKey = (params: { facilityId: number; medicineId: number; horizon?: number }) =>
  ['/api/forecast', params] as const;

export function useForecast(
  params: { facilityId: number; medicineId: number; horizon?: number },
  options?: { query?: Partial<UseQueryOptions<ForecastResult>> },
) {
  return useQuery<ForecastResult>({
    queryKey: getForecastQueryKey(params),
    queryFn: () => fetchJson<ForecastResult>(buildUrl('/forecast', params)),
    enabled: params.medicineId > 0,
    ...options?.query,
  });
}

// Regional Risk
export const getRegionalRiskQueryKey = (params: { medicineId: number }) =>
  ['/api/regional-risk', params] as const;

export function useRegionalRisk(
  params: { medicineId: number },
  options?: { query?: Partial<UseQueryOptions<RegionalRiskResult>> },
) {
  return useQuery<RegionalRiskResult>({
    queryKey: getRegionalRiskQueryKey(params),
    queryFn: () => fetchJson<RegionalRiskResult>(buildUrl('/regional-risk', params)),
    enabled: params.medicineId > 0,
    ...options?.query,
  });
}

// Alert History
export const getAlertHistoryQueryKey = (params?: {
  facilityId?: number;
  medicineId?: number;
  alertType?: string;
  severity?: string;
  status?: string;
  limit?: number;
}) => ['/api/alert-history', params ?? {}] as const;

export function useAlertHistory(
  params?: {
    facilityId?: number;
    medicineId?: number;
    alertType?: string;
    severity?: string;
    status?: string;
    limit?: number;
  },
  options?: { query?: Partial<UseQueryOptions<AlertHistoryRecord[]>> },
) {
  return useQuery<AlertHistoryRecord[]>({
    queryKey: getAlertHistoryQueryKey(params),
    queryFn: () => fetchJson<AlertHistoryRecord[]>(buildUrl('/alert-history', params ?? {})),
    ...options?.query,
  });
}

// Update Alert History
export function useUpdateAlertHistory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: number; status: 'acknowledged' | 'resolved' }) =>
      patchJson<AlertHistoryRecord>(`/api/alert-history/${id}`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/alert-history'] });
    },
  });
}

// Replenishments
export const getReplenishmentsQueryKey = (params?: {
  facilityId?: number;
  medicineId?: number;
  status?: string;
}) => ['/api/replenishments', params ?? {}] as const;

export function useReplenishments(
  params?: {
    facilityId?: number;
    medicineId?: number;
    status?: string;
  },
  options?: { query?: Partial<UseQueryOptions<ReplenishmentRecord[]>> },
) {
  return useQuery<ReplenishmentRecord[]>({
    queryKey: getReplenishmentsQueryKey(params),
    queryFn: () => fetchJson<ReplenishmentRecord[]>(buildUrl('/replenishments', params ?? {})),
    ...options?.query,
  });
}
