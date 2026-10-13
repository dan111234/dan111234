import { ApiError } from './errors';

/**
 * fetch() that turns network failures into an UPSTREAM error naming the service. The original
 * error text is dropped on purpose: Keepa URLs carry the API key.
 */
export async function upstreamFetch(
  service: string,
  input: string | URL,
  init?: RequestInit,
): Promise<Response> {
  try {
    return await fetch(input, init);
  } catch {
    const host = new URL(input).host;
    throw new ApiError('UPSTREAM', `Cannot reach ${service} (${host})`);
  }
}
