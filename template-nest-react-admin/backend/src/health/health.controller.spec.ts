import { DataSource } from 'typeorm';
import { HealthController } from './health.controller.js';

describe('HealthController', () => {
  it('探一次数据库并返回 ok', async () => {
    const query = vi.fn().mockResolvedValue([{ '?column?': 1 }]);
    const controller = new HealthController({ query } as unknown as DataSource);

    const result = await controller.check();

    expect(query).toHaveBeenCalledWith('SELECT 1');
    expect(result.status).toBe('ok');
    expect(Date.parse(result.time)).not.toBeNaN();
  });
});
