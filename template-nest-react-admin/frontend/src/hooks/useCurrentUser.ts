import { useQuery } from '@tanstack/react-query';
import { fetchMe } from '@/api';
import type { Me } from '@/api/types';

/**
 * 当前登录用户态的**唯一来源**：不把用户对象再存一份到全局 store ——
 * 它来自后端，多存一份会让退出登录必须清两处，漏一处就是「下一个用户看到上一个用户的名字」。
 *
 * `retry: false`：401 是「确实没登录」这个正常状态，重试没有意义。
 */
export function useCurrentUser() {
  return useQuery<Me>({
    queryKey: ['me'],
    queryFn: fetchMe,
    retry: false,
    staleTime: 60_000,
  });
}
