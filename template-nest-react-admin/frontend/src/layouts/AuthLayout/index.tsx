import { Outlet } from 'react-router';
import './style.less';

/**
 * 登录前的壳：只有背景与居中。卡片由页面自己渲染 —— 品牌区、页脚都是页面内容，
 * 塞进壳里就得让壳知道每个页面要什么。
 */
export default function AuthLayout() {
  return (
    <div className="auth-wrap">
      <Outlet />
    </div>
  );
}
