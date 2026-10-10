/**
 * Helper to fetch all rows by paginating through Supabase / PostgREST 1000-row limit.
 * PostgREST servers enforce a default max_rows limit (typically 1,000 rows).
 * This utility iterates through ranges (0-999, 1000-1999, etc.) until all matching rows are retrieved.
 */
export async function fetchAllRows<T = any>(
  fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: any }>
): Promise<T[]> {
  const PAGE_SIZE = 1000;
  let allData: T[] = [];
  let from = 0;

  while (true) {
    const to = from + PAGE_SIZE - 1;
    const { data, error } = await fetchPage(from, to);
    if (error) {
      console.error('Error en fetchAllRows al consultar página de datos:', error);
      throw error;
    }
    if (!data || data.length === 0) break;
    allData = allData.concat(data);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return allData;
}
