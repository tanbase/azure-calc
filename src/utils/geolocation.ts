// ============================================================
// Azure VM Pricing Calculator - IP-based Geolocation
// Uses ipapi.co to detect user's actual geographic location
// and maps it to the closest Azure region and currency.
// Falls back to browser locale detection if IP geolocation fails.
// Results are cached in sessionStorage for the session lifetime.
// ============================================================

import { LOCALE_TO_REGION } from '../types';

interface GeolocationResult {
  region: string;
  currency: string;
}

// Map ISO 3166-1 alpha-2 country codes to closest Azure region
// Only includes regions that exist in COMMERCIAL_REGIONS (scripts/refresh-pricing.js)
const COUNTRY_TO_REGION: Record<string, string> = {
  // Australia
  AU: 'australiaeast',
  // Americas
  US: 'eastus',
  CA: 'canadacentral',
  BR: 'brazilsouth',
  MX: 'eastus',
  // Europe
  GB: 'uksouth',
  DE: 'westeurope',
  FR: 'francecentral',
  ES: 'westeurope',
  IT: 'westeurope',
  NL: 'westeurope',
  IE: 'northeurope',
  SE: 'northeurope',
  NO: 'northeurope',
  DK: 'northeurope',
  FI: 'northeurope',
  PL: 'northeurope',
  CH: 'westeurope',
  AT: 'westeurope',
  BE: 'westeurope',
  PT: 'westeurope',
  // Asia Pacific
  JP: 'japaneast',
  KR: 'koreacentral',
  IN: 'centralindia',
  SG: 'southeastasia',
  MY: 'southeastasia',
  TH: 'southeastasia',
  VN: 'southeastasia',
  PH: 'southeastasia',
  ID: 'southeastasia',
  HK: 'eastasia',
  TW: 'eastasia',
  CN: 'eastasia',
  NZ: 'australiaeast',
  // Middle East
  AE: 'uaenorth',
  QA: 'qatarcentral',
  SA: 'uaenorth',
  IL: 'uaenorth',
  // India
  // (already covered above)
};

// Map country codes to currency codes
const COUNTRY_TO_CURRENCY: Record<string, string> = {
  AU: 'AUD',
  US: 'USD',
  CA: 'CAD',
  BR: 'BRL',
  MX: 'MXN',
  GB: 'GBP',
  DE: 'EUR',
  FR: 'EUR',
  ES: 'EUR',
  IT: 'EUR',
  NL: 'EUR',
  IE: 'EUR',
  SE: 'SEK',
  NO: 'NOK',
  DK: 'DKK',
  FI: 'EUR',
  PL: 'PLN',
  CH: 'CHF',
  AT: 'EUR',
  BE: 'EUR',
  PT: 'EUR',
  JP: 'JPY',
  KR: 'KRW',
  IN: 'INR',
  SG: 'SGD',
  MY: 'MYR',
  TH: 'THB',
  VN: 'VND',
  PH: 'PHP',
  ID: 'IDR',
  HK: 'HKD',
  TW: 'TWD',
  CN: 'CNY',
  NZ: 'NZD',
  AE: 'AED',
  QA: 'QAR',
  SA: 'SAR',
  IL: 'ILS',
};

// Locale-based fallbacks (used when IP geolocation fails)
const LOCALE_TO_CURRENCY: Record<string, string> = {
  'en-AU': 'AUD',
  'en-US': 'USD',
  'en-GB': 'GBP',
  'en-CA': 'CAD',
  'en-IN': 'INR',
  'ja-JP': 'JPY',
  'ko-KR': 'KRW',
  'de-DE': 'EUR',
  'fr-FR': 'EUR',
  'es-ES': 'EUR',
  'it-IT': 'EUR',
  'nl-NL': 'EUR',
  'pt-BR': 'BRL',
  'zh-CN': 'CNY',
  'zh-TW': 'TWD',
  'hi-IN': 'INR',
};

const STORAGE_KEY = 'azure-calc-geo';

/**
 * Detect default region using IP geolocation (async).
 * Falls back to browser locale if geolocation fails.
 * Caches result in sessionStorage.
 */
export async function detectDefaultRegion(): Promise<string> {
  const cached = sessionStorage.getItem(STORAGE_KEY);
  if (cached) {
    try {
      const result: GeolocationResult = JSON.parse(cached);
      return result.region;
    } catch {
      sessionStorage.removeItem(STORAGE_KEY);
    }
  }

  try {
    const result = await detectFromIP();
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(result));
    return result.region;
  } catch {
    // Fallback to locale-based detection
    return detectFromLocale().region;
  }
}

/**
 * Detect default currency using IP geolocation (async).
 * Falls back to browser locale if geolocation fails.
 * Caches result in sessionStorage.
 */
export async function detectDefaultCurrency(): Promise<string> {
  const cached = sessionStorage.getItem(STORAGE_KEY);
  if (cached) {
    try {
      const result: GeolocationResult = JSON.parse(cached);
      return result.currency;
    } catch {
      sessionStorage.removeItem(STORAGE_KEY);
    }
  }

  try {
    const result = await detectFromIP();
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(result));
    return result.currency;
  } catch {
    return detectFromLocale().currency;
  }
}

/**
 * Fetch geolocation from ipapi.co and map to Azure region/currency.
 * Throws if the request fails.
 */
async function detectFromIP(): Promise<GeolocationResult> {
  const response = await fetch('https://ipapi.co/json/', {
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) {
    throw new Error(`Geolocation API returned ${response.status}`);
  }
  const data = await response.json();
  const countryCode = data.country_code;

  const region = COUNTRY_TO_REGION[countryCode] || 'eastus';
  const currency = COUNTRY_TO_CURRENCY[countryCode] || 'USD';

  return { region, currency };
}

/**
 * Fallback: detect from browser locale.
 * Used only when IP geolocation is unavailable.
 */
function detectFromLocale(): GeolocationResult {
  const locale = navigator.language || 'en-US';
  const region = LOCALE_TO_REGION[locale] || 'eastus';
  const currency = LOCALE_TO_CURRENCY[locale] || 'USD';
  return { region, currency };
}
