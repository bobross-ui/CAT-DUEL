import { QueryClient } from '@tanstack/react-query';

function getResponseStatus(error: unknown) {
  return typeof error === 'object'
    && error !== null
    && 'response' in error
    && typeof error.response === 'object'
    && error.response !== null
    && 'status' in error.response
    && typeof error.response.status === 'number'
    ? error.response.status
    : null;
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30 * 1000,
      gcTime: 5 * 60 * 1000,
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
      retry: (failureCount, error) => {
        const status = getResponseStatus(error);
        return status !== null && status >= 500 && failureCount < 2;
      },
    },
    mutations: {
      retry: false,
    },
  },
});
