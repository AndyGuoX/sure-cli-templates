import { Flex, Spin, Typography } from 'antd';
import { Navigate, Outlet, useLocation } from 'react-router';
import { isUnauthorized } from '@/api/client';
import BrandMark from '@/components/BrandMark';
import LoadError from '@/components/LoadError';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import './style.less';

/**
 * 登录门禁。三态映射：
 * - `isPending` → 居中加载页（还在确认身份）
 * - 401 → 跳 `/login?redirect=<当前路径>`，登录后原路跳回
 * - 其余失败 → `LoadError`（**只有 401 允许不渲染内容**）
 */
export default function RequireAuth() {
  const location = useLocation();
  const { data, isPending, isError, error, refetch } = useCurrentUser();

  // 全屏启动等待用 Spin 而不是 Skeleton：上骨架会造成「外壳闪现后被踢回登录页」的观感。
  if (isPending)
    return (
      <Flex className="boot-screen" vertical align="center" justify="center">
        <BrandMark />
        <Spin />
        <Typography.Text className="boot-hint" type="secondary">
          正在验证登录状态…
        </Typography.Text>
      </Flex>
    );

  if (isError && isUnauthorized(error)) {
    const redirect = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?redirect=${redirect}`} replace />;
  }
  if (isError || !data) return <LoadError onRetry={() => refetch()} />;
  return <Outlet />;
}
