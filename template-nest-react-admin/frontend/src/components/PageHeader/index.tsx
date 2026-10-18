import { Flex, Typography } from 'antd';
import type { ReactNode } from 'react';
import './style.less';

export interface PageHeaderProps {
  /** 页面标题。`ReactNode` 而不是 `string` —— 允许带状态 Tag */
  title: ReactNode;
  /** 标题下的一行说明。文案要说清「这一页是干什么的」，不是装饰 */
  subTitle?: ReactNode;
  /** 右侧操作区。窄屏时换行到标题下方，不挤掉标题 */
  extra?: ReactNode;
}

/** 页面顶部：标题 + 说明 + 右侧操作区。被 2 个以上页面用时才放进 `components/`。 */
export default function PageHeader({ title, subTitle, extra }: PageHeaderProps) {
  return (
    <div className="page-header">
      <Flex className="page-header-row" align="center" gap={12} wrap>
        <Typography.Title className="page-header-title" level={2}>
          {title}
        </Typography.Title>
        {extra ? <div className="page-header-extra">{extra}</div> : null}
      </Flex>
      {subTitle ? (
        <Typography.Text className="page-header-sub" type="secondary">
          {subTitle}
        </Typography.Text>
      ) : null}
    </div>
  );
}
