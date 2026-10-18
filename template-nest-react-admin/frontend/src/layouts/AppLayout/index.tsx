import { DownOutlined, HomeOutlined, LogoutOutlined, MenuFoldOutlined, MenuUnfoldOutlined } from '@ant-design/icons';
import { App, Avatar, Button, Dropdown, Flex, Layout, Menu, Skeleton, Typography } from 'antd';
import type { MenuProps } from 'antd';
import type { ReactNode } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router';
import { isUnauthorized } from '@/api/client';
import BrandMark from '@/components/BrandMark';
import LoadError from '@/components/LoadError';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useLogout } from '@/hooks/useLogout';
import { useUiStore } from '@/store/ui';
import './style.less';

/**
 * 导航项配置。**加一级菜单就往这个数组里塞一条**，别另写一份再手工拼。
 * `key` 同时是路由路径与选中态的依据。
 */
const NAV: { key: string; label: string; icon: ReactNode }[] = [{ key: '/', icon: <HomeOutlined />, label: '首页' }];

/**
 * 登录后的壳：Sider 导航 + 顶栏用户区 + 内容区。
 *
 * ⚠️ **拿不到 `me` 且不是 401 时绝不 `return null`** —— 这一层是所有 app 路由的父级，
 * `null` 等于整站白屏。只有 401 允许返回 null（拦截器正在跳登录）。
 */
export default function AppLayout() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { modal } = App.useApp();
  const { data: me, isPending, isError, error, refetch } = useCurrentUser();
  const logout = useLogout();
  const { siderCollapsed, toggleSider } = useUiStore();

  if (isPending) return <Skeleton active />;
  if (isError && isUnauthorized(error)) return null;
  if (isError || !me) return <LoadError onRetry={() => refetch()} />;

  const confirmLogout = () =>
    modal.confirm({
      title: '确认登出？',
      content: '登出后需要重新获取邮箱验证码才能登录。',
      okText: '登出',
      cancelText: '取消',
      onOk: () => logout(),
    });

  const userMenu: MenuProps = {
    items: [
      { key: 'email', label: me.email, disabled: true },
      { type: 'divider' },
      { key: 'logout', label: '登出', danger: true, icon: <LogoutOutlined /> },
    ],
    onClick: ({ key }) => {
      if (key === 'logout') confirmLogout();
    },
  };

  const current = NAV.find((item) => item.key === pathname)?.label ?? '首页';

  return (
    <Layout className="app-shell">
      <Layout.Sider className="app-sider" theme="light" width={232} collapsed={siderCollapsed} trigger={null}>
        <Flex className="app-sider-inner" vertical>
          <Flex className="app-brand" align="center" gap={10}>
            <BrandMark size={28} />
            {!siderCollapsed && (
              <Typography.Text className="app-brand-name" strong>
                Nest React Admin
              </Typography.Text>
            )}
          </Flex>

          <Menu
            className="app-menu"
            theme="light"
            mode="inline"
            selectedKeys={[pathname]}
            items={NAV}
            onClick={({ key }) => navigate(key)}
          />
        </Flex>
      </Layout.Sider>

      <Layout>
        <Layout.Header className="app-header">
          <Button
            type="text"
            className="app-collapse-btn"
            aria-label={siderCollapsed ? '展开侧栏' : '收起侧栏'}
            icon={siderCollapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
            onClick={toggleSider}
          />
          <Typography.Text className="app-header-title">{current}</Typography.Text>

          <div className="app-header-user">
            <Dropdown menu={userMenu} trigger={['click']}>
              <Button className="app-user-btn" type="text">
                <Flex align="center" gap={8}>
                  {/* 字号是这一处唯一保留的行内值：antd 的 Avatar 会按 size 把 fontSize
                      写成行内样式，CSS 里盖不掉。 */}
                  <Avatar className="app-user-avatar" size={28} style={{ fontSize: 12 }}>
                    {me.name.charAt(0).toUpperCase()}
                  </Avatar>
                  <Typography.Text>{me.name}</Typography.Text>
                  <DownOutlined className="app-user-caret" />
                </Flex>
              </Button>
            </Dropdown>
          </div>
        </Layout.Header>

        <Layout.Content className="app-content">
          {/* 页面底座：一张白卡。页面**别自己再套一层卡** —— 页内卡片才是有意义的「卡中卡」。 */}
          <div className="app-page">
            <Outlet />
          </div>
        </Layout.Content>
      </Layout>
    </Layout>
  );
}
