import { api } from './client';

export interface HealthStatus {
  status: 'ok';
  time: string;
}

/** 健康检查。后端会真的打一次数据库，所以 200 代表「后端 + PostgreSQL」都通。 */
export async function fetchHealth(): Promise<HealthStatus> {
  return (await api.get<HealthStatus>('/health')).data;
}
