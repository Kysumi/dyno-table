import { ConfigurationErrors } from "./error-factory";

/**
 * Generator function to create chunks of an array on-demand
 * This is more memory-efficient than creating all chunks at once
 *
 * @param array The array to chunk
 * @param size The size of each chunk
 * @returns A generator that yields chunks of the array
 */

export function* chunkArray<T>(array: T[], size: number): Generator<T[], void, unknown> {
  if (size <= 0) {
    throw ConfigurationErrors.invalidChunkSize(size);
  }
  for (let i = 0; i < array.length; i += size) {
    yield array.slice(i, i + size);
  }
}
