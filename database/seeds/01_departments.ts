import { Knex } from 'knex';

export async function seed(knex: Knex): Promise<void> {
  const departments = [
    { name: 'sborniy', display_name: 'Sborniy' },
    { name: 'sales', display_name: 'Sales' },
    { name: 'marketing', display_name: 'Marketing' },
    { name: 'translator', display_name: 'Tarjimon' },
    { name: 'declarant', display_name: 'Deklarant' },
    { name: 'bookkeeper', display_name: 'Buxgalter' },
    { name: 'seo', display_name: 'SEO' },
  ];

  for (const dept of departments) {
    const exists = await knex<Record<string, unknown>>('departments')
      .where({ name: dept.name })
      .first();
    if (!exists) {
      await knex('departments').insert({
        name: dept.name,
        display_name: dept.display_name,
      });
    }
  }

  // Insert default system settings
  const usdRateExists = await knex<Record<string, unknown>>('system_settings')
    .where({ key: 'usd_exchange_rate' })
    .first();
  if (!usdRateExists) {
    await knex('system_settings').insert({
      key: 'usd_exchange_rate',
      value: '12650.00',
      description:
        'Default USD to UZS Exchange Rate, manually adjustable by CEO.',
    });
  }
}
