export function useRealtimeData(
  tableName: string,
  options?: {
    orderBy?: string;
    ascending?: boolean;
    limit?: number;
  }
): {
  data: any[];
  loading: boolean;
  error: string | null;
  isSubscribed: boolean;
};
