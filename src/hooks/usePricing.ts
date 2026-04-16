// ============================================================
// Azure VM Pricing Calculator - usePricing Hook
// Fetches per-region pricing.json files directly (static, no backend)
// ============================================================

import { useState, useCallback, useEffect, useRef } from 'react';
import type { OptimizedPricingRecord } from '../types';

interface PricingIndex {
  exchangeRates: Record<string, number>;
  lastUpdated: string;
  regions: string[];
}

interface UsePricingReturn {
  pricingData: OptimizedPricingRecord[] | null;
  isLoading: boolean;
  lastUpdated: string | null;
  exchangeRates: Record<string, number>;
  fetchPricing: (region: string) => Promise<void>;
  error: string | null;
}


export function usePricing(): UsePricingReturn {
  const [pricingData, setPricingData] = useState<OptimizedPricingRecord[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [exchangeRates, setExchangeRates] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);
  const indexRef = useRef<PricingIndex | null>(null);
  const currentRegionRef = useRef<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  // Fetch index.json once on mount (tiny file with exchange rates + region list)
  const loadIndex = useCallback(async (): Promise<PricingIndex | null> => {
    if (indexRef.current) return indexRef.current;
    try {
      const baseUrl = import.meta.env.BASE_URL;
      const res = await fetch(`${baseUrl}pricing/index.json`);
      if (!res.ok) throw new Error(`Failed to load pricing index (${res.status})`);
      const index: PricingIndex = await res.json();
      indexRef.current = index;
      if (mountedRef.current) {
        setExchangeRates(index.exchangeRates || {});
        setLastUpdated(index.lastUpdated || null);
      }
      return index;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load pricing data';
      console.error(message);
      if (mountedRef.current) setError(message);
      return null;
    }
  }, []);

  // Fetch a specific region file on demand (~38KB vs 855KB monolithic)
  const fetchRegion = useCallback(async (region: string, signal?: AbortSignal): Promise<OptimizedPricingRecord[] | null> => {
    try {
      const baseUrl = import.meta.env.BASE_URL;
      const res = await fetch(`${baseUrl}pricing/${region}.json`, { signal });
      if (!res.ok) throw new Error(`Failed to load pricing for ${region} (${res.status})`);
      const data = await res.json();
      return data.records || [];
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return null;
      const message = err instanceof Error ? err.message : `Failed to load pricing for ${region}`;
      console.error(message);
      return null;
    }
  }, []);

  // Load index on mount
  useEffect(() => {
    loadIndex();
  }, [loadIndex]);

  // Select region data — with abort controller to prevent stale overwrites
  const fetchPricing = useCallback(async (region: string) => {
    // Abort any in-flight region fetch
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;
    currentRegionRef.current = region;

    setIsLoading(true);
    setError(null);

    // Ensure index is loaded
    const index = indexRef.current || await loadIndex();
    if (!index || !mountedRef.current) {
      if (mountedRef.current) {
        setPricingData(null);
        setIsLoading(false);
      }
      return;
    }

    // Check if region exists in index
    if (!index.regions.includes(region)) {
      if (mountedRef.current) {
        setPricingData(null);
        setError(`No data available for region: ${region}`);
        setIsLoading(false);
      }
      return;
    }

    // Fetch region file (may be aborted if user switches regions)
    const records = await fetchRegion(region, controller.signal);

    // Only update state if this is still the current region and component is mounted
    if (mountedRef.current && currentRegionRef.current === region) {
      setPricingData(records);
      setLastUpdated(index.lastUpdated);
      setError(records === null ? `Failed to load data for ${region}` : null);
      setIsLoading(false);
    }
  }, [loadIndex, fetchRegion]);

  return { pricingData, isLoading, lastUpdated, exchangeRates, fetchPricing, error };
}
