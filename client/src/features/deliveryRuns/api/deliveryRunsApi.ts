// Delivery Runs API Layer
// This file provides the API interface. Currently uses mock data.
// To connect to a real backend, replace the mock imports with actual API calls.

import { 
  DeliveryRun, 
  DeliveryRunListItem, 
  ListRunsParams,
  CreateRunPayload
} from '../types';

import {
  mockListRuns,
  mockGetRun,
  mockCreateRun,
  mockLockRun,
  mockOptimizeRun,
  mockDispatchRun,
  mockUnlockRun
} from './deliveryRunsApi.mock';

// ============================================
// API Functions
// To wire to real endpoints, replace mock calls with fetch/axios calls:
//
// Example:
// export const listRuns = async (params?: ListRunsParams): Promise<DeliveryRunListItem[]> => {
//   const response = await fetch('/api/delivery-runs?' + new URLSearchParams(params as any));
//   if (!response.ok) throw new Error('Failed to fetch runs');
//   return response.json();
// };
// ============================================

/**
 * List all delivery runs with optional filters
 * GET /api/delivery-runs?fromDate=&toDate=&status=
 */
export const listRuns = async (params?: ListRunsParams): Promise<DeliveryRunListItem[]> => {
  // TODO: Replace with real API call
  return mockListRuns(params);
};

/**
 * Get a single delivery run by ID
 * GET /api/delivery-runs/:id
 */
export const getRun = async (id: string): Promise<DeliveryRun | null> => {
  // TODO: Replace with real API call
  return mockGetRun(id);
};

/**
 * Create a new delivery run
 * POST /api/delivery-runs
 */
export const createRun = async (payload: CreateRunPayload): Promise<DeliveryRun> => {
  // TODO: Replace with real API call
  return mockCreateRun(payload.deliveryDate);
};

/**
 * Lock a delivery run (prevent automatic changes)
 * PATCH /api/delivery-runs/:id/lock
 */
export const lockRun = async (id: string): Promise<DeliveryRun | null> => {
  // TODO: Replace with real API call
  return mockLockRun(id);
};

/**
 * Unlock a delivery run
 * PATCH /api/delivery-runs/:id/unlock
 */
export const unlockRun = async (id: string): Promise<DeliveryRun | null> => {
  // TODO: Replace with real API call
  return mockUnlockRun(id);
};

/**
 * Optimize routes for a delivery run
 * POST /api/delivery-runs/:id/optimize
 */
export const optimizeRun = async (id: string): Promise<DeliveryRun | null> => {
  // TODO: Replace with real API call
  return mockOptimizeRun(id);
};

/**
 * Dispatch a delivery run
 * PATCH /api/delivery-runs/:id/dispatch
 */
export const dispatchRun = async (id: string): Promise<DeliveryRun | null> => {
  // TODO: Replace with real API call
  return mockDispatchRun(id);
};

/**
 * Get printable data for a van
 * GET /api/delivery-runs/:runId/vans/:vanId/print
 */
export const getVanPrintData = async (runId: string, vanId: string) => {
  // TODO: Replace with real API call
  const run = await mockGetRun(runId);
  if (!run) return null;
  
  const van = run.vans.find(v => v.vanId === vanId);
  return van || null;
};
