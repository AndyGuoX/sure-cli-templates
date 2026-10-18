import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { logout } from '@/api';

/**
 * 退出登录。三步一个都不能省：
 * 1. `logout()` 失败也必须放人走 —— 服务端清不掉 Cookie 不能把用户卡住；
 * 2. `qc.clear()` 清空所有缓存（尤其 `['me']`），不清会泄露上一个用户的数据；
 * 3. `replace: true` 不让用户按后退回到已失效的会话页面。
 */
export function useLogout(): () => void {
  const qc = useQueryClient();
  const navigate = useNavigate();

  return () => {
    logout()
      .catch(() => {})
      .then(() => {
        qc.clear();
        navigate('/login', { replace: true });
      });
  };
}
