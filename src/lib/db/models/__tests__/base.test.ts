import { BaseEntity } from '../base';

describe('BaseEntity', () => {
  it('should have correct interface structure', () => {
    const baseEntity: BaseEntity = {
      id: 'test-id',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    expect(baseEntity).toHaveProperty('id');
    expect(baseEntity).toHaveProperty('createdAt');
    expect(baseEntity).toHaveProperty('updatedAt');
    expect(typeof baseEntity.id).toBe('string');
    expect(baseEntity.createdAt).toBeInstanceOf(Date);
    expect(baseEntity.updatedAt).toBeInstanceOf(Date);
  });

  it('should allow optional properties', () => {
    const baseEntity: BaseEntity = {};

    expect(baseEntity.id).toBeUndefined();
    expect(baseEntity.createdAt).toBeUndefined();
    expect(baseEntity.updatedAt).toBeUndefined();
  });

  it('should allow partial properties', () => {
    const baseEntityWithId: BaseEntity = { id: 'test-id' };
    const baseEntityWithTimestamp: BaseEntity = { createdAt: new Date() };

    expect(baseEntityWithId.id).toBe('test-id');
    expect(baseEntityWithId.createdAt).toBeUndefined();
    expect(baseEntityWithTimestamp.createdAt).toBeInstanceOf(Date);
    expect(baseEntityWithTimestamp.id).toBeUndefined();
  });
});