import type { PageMeta, PaginationQuery } from '@jobportal/shared';

export const skipFor = ({ page, limit }: PaginationQuery): number => (page - 1) * limit;

/** Page-number paging metadata. */
export function offsetMeta({ page, limit }: PaginationQuery, total: number): PageMeta {
  const totalPages = Math.ceil(total / limit);
  return { page, limit, total, totalPages, hasNextPage: page < totalPages };
}

export interface Paged<T> {
  items: T[];
  meta: PageMeta;
}
