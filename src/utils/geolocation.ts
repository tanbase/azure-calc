// ============================================================
// Azure VM Pricing Calculator - IP-based Geolocation
// Uses ipapi.co to detect user's actual geographic location
// and maps to the closest Azure region via lat/long distance.
// Falls back to browser locale detection if geolocation fails.
// Results are cached in sessionStorage for the session lifetime.
// ============================================================

import { LOCALE_TO_REGION } from '../types';

interface GeolocationResult {
  region: string;
  currency: string;
}

// Azure region coordinates (lat, lng) for all commercial regions.
// Sources: Azure region pages + city coordinates.
// Only includes regions in COMMERCIAL_REGIONS (scripts/refresh-pricing.js).
const AZURE_REGION_COORDS: Record<string, [number, number]> = {
  // Australia (all regions)
  'australiaeast': [-33.8688, 151.2093],    // Sydney
  'australiasoutheast': [-37.8136, 144.9631], // Melbourne
  'australiacentral': [-35.2809, 149.1300],   // Canberra
  'australiacentral2': [-35.2809, 149.1300],  // Canberra
  // Global / US
  'eastus': [37.3719, -79.8164],    // Virginia
  'eastus2': [36.6681, -78.3889],   // Virginia
  'westus2': [47.6062, -122.3321],  // Seattle
  'westus3': [33.4484, -112.0740],  // Phoenix
  'centralus': [41.8781, -93.0977], // Iowa
  // Europe
  'northeurope': [53.3498, -6.2603], // Dublin
  'westeurope': [52.3676, 4.9041],   // Amsterdam
  'uksouth': [51.5074, -0.1278],     // London
  'francecentral': [48.8566, 2.3522], // Paris
  // Asia Pacific
  'southeastasia': [1.3521, 103.8198], // Singapore
  'eastasia': [22.3964, 114.1095],     // Hong Kong
  'japaneast': [35.6762, 139.6503],    // Tokyo
  'koreacentral': [37.5665, 126.9780], // Seoul
  // Americas
  'canadacentral': [43.6532, -79.3832], // Toronto
  'brazilsouth': [-23.5505, -46.6333],  // São Paulo
  // Middle East
  'uaenorth': [25.2048, 55.2708],   // Dubai
  'qatarcentral': [25.3548, 51.1839], // Doha
  // India
  'centralindia': [18.5204, 73.8567],  // Pune
  'southindia': [13.0827, 80.2707],    // Chennai
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
 * Calculate the great-circle distance between two lat/lng points
 * using the Haversine formula. Returns distance in kilometers.
 */
function haversineDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371; // Earth's radius in km
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Find the closest Azure region to the given latitude/longitude.
 */
function findClosestRegion(lat: number, lng: number): string {
  let closest = 'eastus';
  let minDist = Infinity;

  for (const [region, [regionLat, regionLng]] of Object.entries(AZURE_REGION_COORDS)) {
    const dist = haversineDistance(lat, lng, regionLat, regionLng);
    if (dist < minDist) {
      minDist = dist;
      closest = region;
    }
  }

  return closest;
}

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
 * Fetch geolocation from ipapi.co and find the closest Azure region.
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
  const { latitude, longitude, country_code } = data;

  // For Australia, IP geolocation often resolves Melbourne IPs to Sydney.
  // Use latitude threshold instead, which is more reliable.
  if (country_code === 'AU' && latitude != null) {
    const region = latitude < -36 ? 'australiasoutheast' : 'australiaeast';
    const currency = 'AUD';
    return { region, currency };
  }

  // For all other countries, use Haversine distance to find closest region
  const region = (latitude != null && longitude != null)
    ? findClosestRegion(latitude, longitude)
    : 'eastus';

  // Currency is based on country code (not affected by location within country)
  const currency = COUNTRY_TO_CURRENCY[country_code] || 'USD';

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
