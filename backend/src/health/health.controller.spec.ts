import { ServiceUnavailableException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DatabaseService } from '../database/database.service.js';
import { HealthController } from './health.controller.js';

async function createController(
  ping: () => Promise<void>,
): Promise<HealthController> {
  const moduleRef = await Test.createTestingModule({
    controllers: [HealthController],
    providers: [{ provide: DatabaseService, useValue: { ping } }],
  }).compile();
  return moduleRef.get(HealthController);
}

describe('HealthController', () => {
  it('returns ok when the database answers', async () => {
    const controller = await createController(() => Promise.resolve());

    await expect(controller.check()).resolves.toEqual({ status: 'ok' });
  });

  it('throws 503 when the database does not answer', async () => {
    const controller = await createController(() =>
      Promise.reject(new Error('connection refused')),
    );

    await expect(controller.check()).rejects.toThrow(
      ServiceUnavailableException,
    );
  });
});
