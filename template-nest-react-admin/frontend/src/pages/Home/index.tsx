import {
  ApiOutlined,
  CheckCircleFilled,
  ClockCircleOutlined,
  DatabaseOutlined,
  LaptopOutlined,
} from '@ant-design/icons';
import { Alert, Button, Card, Col, Flex, Row, Skeleton, Tag, Typography } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { fetchHealth } from '@/api';
import { isServerDown, problemOf } from '@/api/client';
import PageHeader from '@/components/PageHeader';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { formatDateTime } from '@/utils/formatDateTime';
import './style.less';

/**
 * 脚手架首页：**项目搭建成功**的自检页。
 *
 * 它同时是三件事的可视化验收：前端渲染、`/api/health`（后端 + PostgreSQL）、
 * 登录会话（`/auth/me`）。业务页面就从这个页面往下长，不需要它的时候直接删。
 */
export default function Home() {
  const me = useCurrentUser();
  const health = useQuery({
    queryKey: ['health'],
    queryFn: fetchHealth,
    retry: 1,
    refetchInterval: 30_000,
  });

  const healthOk = health.isSuccess;
  const healthProblem = health.isError ? problemOf(health.error) : null;

  const cards = [
    {
      key: 'frontend',
      icon: <LaptopOutlined />,
      title: '前端',
      desc: 'React 19 · Vite · TypeScript · antd',
      state: 'ready' as const,
    },
    {
      key: 'backend',
      icon: <ApiOutlined />,
      title: '后端',
      desc: 'NestJS 12 · JWT Cookie 会话',
      state: health.isPending ? ('checking' as const) : healthOk ? ('ready' as const) : ('error' as const),
    },
    {
      key: 'database',
      icon: <DatabaseOutlined />,
      title: '数据库',
      desc: 'PostgreSQL · TypeORM · 迁移',
      state: health.isPending ? ('checking' as const) : healthOk ? ('ready' as const) : ('error' as const),
    },
  ];

  return (
    <div className="home-page">
      <PageHeader
        title="项目搭建成功"
        subTitle="前端、后端与数据库已经连通，可以开始开发业务功能了。"
        extra={
          <Flex align="center" gap={8}>
            <ClockCircleOutlined />
            <Typography.Text type="secondary" className="home-time">
              {formatDateTime(health.data?.time ?? null, { seconds: true }) ?? '正在检查…'}
            </Typography.Text>
          </Flex>
        }
      />

      {health.isPending && <Skeleton active paragraph={{ rows: 4 }} />}

      {health.isError && (
        <Alert
          className="home-alert"
          type="error"
          showIcon
          title={isServerDown(health.error) ? '后端暂时不可用' : '自检请求失败'}
          description={healthProblem?.message ?? '请确认后端与数据库已启动。'}
          action={
            <Button size="small" onClick={() => health.refetch()}>
              重试
            </Button>
          }
        />
      )}

      <Row gutter={[16, 16]}>
        {cards.map((card) => (
          <Col key={card.key} xs={24} md={8}>
            <Card className={`home-status-card is-${card.state}`}>
              <Flex align="flex-start" gap={14}>
                <div className="home-status-icon">{card.icon}</div>
                <div className="home-status-body">
                  <Flex align="center" gap={8}>
                    <Typography.Text strong>{card.title}</Typography.Text>
                    <Tag
                      color={card.state === 'ready' ? 'success' : card.state === 'error' ? 'error' : 'processing'}
                      icon={card.state === 'ready' ? <CheckCircleFilled /> : undefined}
                    >
                      {card.state === 'ready' ? '已就绪' : card.state === 'error' ? '异常' : '检查中'}
                    </Tag>
                  </Flex>
                  <Typography.Text type="secondary" className="home-status-desc">
                    {card.desc}
                  </Typography.Text>
                </div>
              </Flex>
            </Card>
          </Col>
        ))}
      </Row>

      <Card className="home-next" title="接下来做什么">
        <Row gutter={[24, 16]}>
          <Col xs={24} md={12}>
            <Typography.Paragraph>
              当前登录用户：<Typography.Text strong>{me.data?.name ?? '—'}</Typography.Text>
              <Typography.Text type="secondary">（{me.data?.email ?? '—'}）</Typography.Text>
            </Typography.Paragraph>
            <Typography.Paragraph type="secondary" className="home-note">
              会话是 httpOnly Cookie 里的 JWT，前端拿不到也不该拿到它；
              <Typography.Text code>/auth/me</Typography.Text> 是用户态的唯一来源。
            </Typography.Paragraph>
          </Col>
          <Col xs={24} md={12}>
            <Typography.Paragraph>
              <Typography.Text strong>新增一个业务模块：</Typography.Text>
            </Typography.Paragraph>
            <ol className="home-steps">
              <li>
                后端：在 <Typography.Text code>backend/src/&lt;域&gt;/</Typography.Text> 建 module / controller /
                service / entity
              </li>
              <li>
                在 <Typography.Text code>app.module.ts</Typography.Text> 里 import 新模块
              </li>
              <li>
                写迁移：<Typography.Text code>npm run migration:generate</Typography.Text>
              </li>
              <li>
                前端：在 <Typography.Text code>api/</Typography.Text>、<Typography.Text code>pages/</Typography.Text> 与{' '}
                <Typography.Text code>router/index.tsx</Typography.Text> 里各加一处
              </li>
            </ol>
          </Col>
        </Row>
      </Card>
    </div>
  );
}
