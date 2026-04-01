import type {
  POSConnectionInfo,
  POSInsightsResponse,
  POSStoreLocation,
  POSTransactionData,
  SigningCredentials,
} from "./types";
import { signRequest, generateIdempotencyKey } from "./crypto";
import { getApiBaseUrl } from "./api";

// ───────────────────────── Helper ────────────────────────────────────────

async function posRequest<T>(
  endpoint: string,
  body: Record<string, unknown>,
  sign: SigningCredentials
): Promise<T> {
  const method = "POST";
  const bodyStr = JSON.stringify(body);

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  const sigHeaders = await signRequest(
    sign.deviceId,
    sign.password,
    method,
    endpoint,
    bodyStr
  );
  Object.assign(headers, sigHeaders);

  const url = `${getApiBaseUrl()}${endpoint}`;
  const response = await fetch(url, { method, body: bodyStr, headers });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.error || `POS API error: ${response.status}`);
  }

  return response.json();
}

// ───────────────────────── API Functions ──────────────────────────────────

export async function startPOSOAuth(
  provider: string,
  locationId: string,
  credentials: Array<{ device_id: string; password: string }>,
  sign: SigningCredentials
): Promise<{ oauth_url: string }> {
  return posRequest("/pos/start_oauth", {
    provider,
    location_id: locationId,
    credentials,
  }, sign);
}

export async function getPOSStatus(
  locationId: string,
  credentials: Array<{ device_id: string; password: string }>,
  sign: SigningCredentials
): Promise<POSConnectionInfo> {
  const resp = await posRequest<Record<string, unknown>>("/pos/status", {
    location_id: locationId,
    credentials,
  }, sign);

  return {
    connected: !!resp.connected,
    provider: resp.provider as POSConnectionInfo["provider"],
    posLocationName: (resp.pos_location_name as string) || undefined,
    posLocationId: (resp.pos_location_id as string) || undefined,
    merchantId: (resp.merchant_id as string) || undefined,
    posAccountId: (resp.pos_account_id as string) || undefined,
    connectedAt: (resp.connected_at as string) || undefined,
  };
}

export async function listPOSLocations(
  posAccountId: string,
  sign: SigningCredentials
): Promise<POSStoreLocation[]> {
  const resp = await posRequest<{ locations: POSStoreLocation[] }>(
    "/pos/list_locations",
    {
      pos_account_id: posAccountId,
      device_id: sign.deviceId,
      password: sign.password,
    },
    sign
  );
  return resp.locations;
}

export async function connectPOS(
  locationId: string,
  posAccountId: string,
  posLocationId: string,
  posLocationName: string,
  credentials: Array<{ device_id: string; password: string }>,
  sign: SigningCredentials
): Promise<{ success: boolean }> {
  return posRequest("/pos/connect", {
    location_id: locationId,
    pos_account_id: posAccountId,
    pos_location_id: posLocationId,
    pos_location_name: posLocationName,
    credentials,
  }, sign);
}

export async function disconnectPOS(
  locationId: string,
  credentials: Array<{ device_id: string; password: string }>,
  sign: SigningCredentials
): Promise<{ success: boolean }> {
  return posRequest("/pos/disconnect", {
    location_id: locationId,
    credentials,
  }, sign);
}

export async function checkExistingPOSAccount(
  sign: SigningCredentials
): Promise<{
  has_account: boolean;
  pos_account_id?: string;
  merchant_id?: string;
  provider?: string;
}> {
  return posRequest("/pos/check_existing_account", {
    device_id: sign.deviceId,
    password: sign.password,
  }, sign);
}

export async function fetchPOSInsights(
  locationId: string,
  credentials: Array<{ device_id: string; password: string }>,
  sign: SigningCredentials
): Promise<POSInsightsResponse> {
  return posRequest<POSInsightsResponse>("/pos/insights", {
    location_id: locationId,
    credentials,
  }, sign);
}

export async function fetchPOSTransactions(
  locationId: string,
  startDate: string,
  endDate: string,
  credentials: Array<{ device_id: string; password: string }>,
  sign: SigningCredentials
): Promise<POSTransactionData> {
  const resp = await posRequest<{
    total_transactions: number;
    total_revenue: number;
    currency: string;
    hourly_breakdown: Record<string, { transactions: number; revenue: number }>;
  }>("/pos/transactions", {
    location_id: locationId,
    start_date: startDate,
    end_date: endDate,
    credentials,
  }, sign);

  return {
    totalTransactions: resp.total_transactions,
    totalRevenue: resp.total_revenue,
    currency: resp.currency,
    hourlyBreakdown: resp.hourly_breakdown,
  };
}

