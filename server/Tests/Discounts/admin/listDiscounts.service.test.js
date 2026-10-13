const Discount = require('../../../models/discount.model');
const { ListDiscounts } = require('../../../services/discounts.admin.service');
const { listAdminDiscountsQuerySchema } = require('../../../validators/discount.validators');
beforeEach(async () => {
  await Discount.insertMany([
    { name: 'Milk [special]', code: 'MILK', kind: 'percent', percentOff: 10, scope: 'global', isActive: true },
    { name: 'Honey', code: 'HONEY', kind: 'amount', amountOff: 2, scope: 'category', category: 'Dairy', isActive: true },
    { name: 'Expired milk', code: 'EXPIRED', kind: 'percent', percentOff: 5, scope: 'global', isActive: true, endsAt: new Date(Date.now() - 10000) },
  ]);
});
test('combined filters count and paginate the complete result set', async () => {
  const result = await ListDiscounts({ search: 'milk', status: 'active', kind: 'percent', scope: 'global', pageSize: 1 });
  expect(result.meta.total).toBe(1);
  expect(result.data.discounts.map(d => d.code)).toEqual(['MILK']);
  expect((await ListDiscounts({ status: 'inactive' })).data.discounts.map(d => d.code)).toEqual(['EXPIRED']);
});
test('search treats regex characters literally and matches case insensitively', async () => {
  expect((await ListDiscounts({ search: '[SPECIAL]' })).data.discounts.map(d => d.code)).toEqual(['MILK']);
  expect((await ListDiscounts({ search: '.*' })).meta.total).toBe(0);
});
test('sorting and pagination share the filtered total', async () => {
  const result = await ListDiscounts({ sort: 'code', pageSize: 1, page: 2 });
  expect(result.meta).toMatchObject({ total: 3, totalPages: 3, page: 2 });
  expect(result.data.discounts.map(d => d.code)).toEqual(['HONEY']);
});
test.each([{ status: 'invalid' }, { sort: 'invalid' }, { pageSize: 101 }, { page: 0 }])('rejects invalid list query %j', query => {
  expect(listAdminDiscountsQuerySchema.validate(query).error).toBeDefined();
});
