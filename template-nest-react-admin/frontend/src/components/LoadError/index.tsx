import { Button, Result } from 'antd';
import type { ReactNode } from 'react';

export interface LoadErrorProps {
  /** 默认「加载失败」 */
  title?: ReactNode;
  /** 默认「服务暂时不可用，请稍后重试」。**别把 4xx 参数错误说成服务故障**，那种情况重试无效 */
  subTitle?: ReactNode;
  /** 就地重试。不传则整页刷新（路由 `errorElement` 场景没有 refetch 可用） */
  onRetry?: () => void;
}

/** 加载失败 / 渲染崩溃的**唯一**错误页。页面不许自己拼 `Result` + 重试按钮。 */
export default function LoadError({
  title = '加载失败',
  subTitle = '服务暂时不可用，请稍后重试',
  onRetry,
}: LoadErrorProps) {
  return (
    <Result
      status="error"
      title={title}
      subTitle={subTitle}
      extra={
        <Button type="primary" onClick={() => (onRetry ? onRetry() : window.location.reload())}>
          重试
        </Button>
      }
    />
  );
}
