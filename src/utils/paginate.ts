export type PaginationResult<T> = {
  slice: T[];
  page: number;
  totalPages: number;
  total: number;
};

export function paginate<T>(
  items: T[],
  page: number,
  pageSize: number,
): PaginationResult<T> {
  const total = items.length;

  if (total === 0) {
    return {
      slice: [],
      page: 1,
      totalPages: 1,
      total: 0,
    };
  }

  const safePageSize = Math.max(1, Math.trunc(pageSize));
  const totalPages = Math.max(1, Math.ceil(total / safePageSize));
  const normalizedPage = Math.min(
    Math.max(1, Math.trunc(page)),
    totalPages,
  );
  const start = (normalizedPage - 1) * safePageSize;
  const end = start + safePageSize;

  return {
    slice: items.slice(start, end),
    page: normalizedPage,
    totalPages,
    total,
  };
}
