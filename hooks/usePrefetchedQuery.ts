"use client";

import {
  useQuery,
  useQueryClient,
  UseQueryOptions,
  QueryKey,
} from "@tanstack/react-query";

export function usePrefetchedQuery<
  TQueryFnData = unknown,
  TError = Error,
  TData = TQueryFnData,
  TQueryKey extends QueryKey = QueryKey,
>(
  options: Omit<
    UseQueryOptions<TQueryFnData, TError, TData, TQueryKey>,
    "enabled"
  >,
) {
  const queryClient = useQueryClient();
  const isAlreadyCached =
    queryClient.getQueryData(options.queryKey) !== undefined;

  const queryResult = useQuery({
    ...options,
    // If data is already in cache, the query will resolve immediately
    enabled: true,
  });

  // If we have cached data, it's instantly available without loading state
  const isInstantlyAvailable = isAlreadyCached || !!queryResult.data;

  return {
    ...queryResult, // This spreads all properties from useQuery including isLoading, isFetching, etc.
    isInstantlyAvailable,
    // When data is prefetched, it will always be available on first render
    guaranteedData: (queryResult.data ??
      queryClient.getQueryData(options.queryKey)) as TData,
  };
}
