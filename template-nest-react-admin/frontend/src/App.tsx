import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App as AntdApp, ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { useEffect } from 'react';
import { RouterProvider } from 'react-router';
import { bindMessageApi } from '@/api/client';
import { router } from '@/router';

const queryClient = new QueryClient({
  defaultOptions: {
    // 中台系统：切回标签页不重拉。401 类查询各自显式 retry:false 覆盖。
    queries: { refetchOnWindowFocus: false, retry: 1 },
  },
});

/**
 * 把 `App.useApp()` 的 message 实例交给 `api/client.ts` 的响应拦截器 ——
 * 拦截器在 React 之外，拿不到 `<AntdApp>` 的上下文；而 antd 的静态方法拿不到
 * 这里的 theme / locale，统一约定禁用。
 */
function MessageBridge() {
  const { message } = AntdApp.useApp();
  useEffect(() => bindMessageApi(message), [message]);
  return null;
}

/**
 * 主题令牌的唯一出处。components 级覆盖都是 token 表达不了的层级差异：
 * Card/Modal 的圆角、Layout 的白底、Menu 的选中态。
 *
 * ⚠️ antd v6 没开 CSS 变量模式，`theme.useToken()` 的值在 `.less` 里取不到 ——
 * 组件样式里用到主题色的地方是字面值，换主题时要一起改。
 */
export default function App() {
  return (
    <ConfigProvider
      locale={zhCN}
      theme={{
        token: {
          colorPrimary: '#1677ff',
          colorInfo: '#1677ff',
          colorSuccess: '#3f8f5f',
          colorWarning: '#c07f24',
          colorError: '#c25450',
          colorTextBase: '#1f2733',
          colorBgLayout: '#f6f7f9',
          colorBorder: '#e8ebf0',
          colorBorderSecondary: '#f0f2f5',
          borderRadius: 8,
          fontSize: 14,
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif',
        },
        components: {
          Card: { borderRadiusLG: 12 },
          Modal: { borderRadiusLG: 12 },
          Layout: { siderBg: '#ffffff', headerBg: '#ffffff' },
          Menu: { itemSelectedBg: '#eaf2ff', itemSelectedColor: '#1677ff' },
        },
      }}
    >
      <AntdApp>
        <QueryClientProvider client={queryClient}>
          <MessageBridge />
          <RouterProvider router={router} />
        </QueryClientProvider>
      </AntdApp>
    </ConfigProvider>
  );
}
