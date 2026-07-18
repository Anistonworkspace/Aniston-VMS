import { useCallback, useEffect, useState } from 'react';
import type { FetchBaseQueryError } from '@reduxjs/toolkit/query/react';
import type { SerializedError } from '@reduxjs/toolkit';
import { getApiErrorMessage } from '@/lib/apiError';
import { useExportReportMutation } from './reports.api';
import type { GeneratedReport, ReportExportQuery } from './reports.types';

const STORAGE_KEY = 'vms.reports.generatedReports.v1';
const MAX_HISTORY = 20;

function loadHistory(): GeneratedReport[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as GeneratedReport[]) : [];
  } catch {
    return [];
  }
}

function saveHistory(reports: GeneratedReport[]): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(reports.slice(0, MAX_HISTORY)));
  } catch {
    // Private browsing / quota exceeded — history just won't persist across reloads.
  }
}

function generateId(): string {
  return `rpt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export interface GenerateReportResult {
  ok: boolean;
  downloadUrl?: string;
  message?: string;
}

/**
 * Client-local history of `GET /reports/export` calls (see reports.types.ts
 * `GeneratedReport` doc comment for why this is client-side only) persisted
 * to localStorage so it survives a page reload within the same browser.
 */
export function useGeneratedReports() {
  const [reports, setReports] = useState<GeneratedReport[]>(() => loadHistory());
  const [triggerExport] = useExportReportMutation();

  useEffect(() => {
    saveHistory(reports);
  }, [reports]);

  const generate = useCallback(
    async (query: ReportExportQuery, filtersSummary: string): Promise<GenerateReportResult> => {
      const id = generateId();
      const requestedAt = new Date().toISOString();
      setReports((prev) => [
        {
          id,
          type: query.type,
          format: query.format,
          filtersSummary,
          requestedAt,
          status: 'PROCESSING',
        },
        ...prev,
      ]);
      try {
        const result = await triggerExport(query).unwrap();
        setReports((prev) =>
          prev.map((r) =>
            r.id === id ? { ...r, status: 'READY', downloadUrl: result.downloadUrl } : r
          )
        );
        return { ok: true, downloadUrl: result.downloadUrl };
      } catch (err) {
        const message = getApiErrorMessage(err as FetchBaseQueryError | SerializedError);
        setReports((prev) =>
          prev.map((r) => (r.id === id ? { ...r, status: 'FAILED', errorMessage: message } : r))
        );
        return { ok: false, message };
      }
    },
    [triggerExport]
  );

  const clear = useCallback(() => setReports([]), []);

  const hasInFlight = reports.some((r) => r.status === 'PROCESSING');

  return { reports, generate, clear, hasInFlight };
}
