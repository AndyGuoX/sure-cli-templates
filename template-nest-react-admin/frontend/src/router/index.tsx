import { createBrowserRouter } from 'react-router';
import LoadError from '@/components/LoadError';
import RequireAuth from '@/components/RequireAuth';
import AppLayout from '@/layouts/AppLayout';
import AuthLayout from '@/layouts/AuthLayout';
import Home from '@/pages/Home';
import Login from '@/pages/auth/Login';

/**
 * 渲染期崩溃（读了 `undefined` 的属性之类）拦不到 promise 里，只有 ErrorBoundary 能拦 ——
 * react-router 的 `errorElement` 就是它。**每个顶层布局路由都必须带**。
 */
const crashed = <LoadError title="页面出错了" subTitle="刷新一下通常就好，反复出现请联系管理员" />;

export const router = createBrowserRouter([
  {
    element: <AuthLayout />,
    errorElement: crashed,
    children: [{ path: '/login', element: <Login /> }],
  },
  {
    element: <RequireAuth />,
    errorElement: crashed,
    children: [
      {
        element: <AppLayout />,
        errorElement: crashed,
        children: [{ path: '/', element: <Home /> }],
      },
    ],
  },
  // 乱输地址的兜底：没有它就是一个白页
  { path: '*', element: <LoadError title="页面不存在" subTitle="地址可能已失效" /> },
]);
