export interface HookResult<T> {
  data: T | null;
  loading: boolean;
  error: boolean;
  refetch: () => void;
}
