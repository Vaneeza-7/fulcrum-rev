import 'dotenv/config';
import { seedTenant, HUNHU_CONFIG, PULSE_CONFIG } from '../lib/onboarding/seed-tenant';

async function main() {
  console.log('Seeding Fulcrum tenants...\n');

  const hunhuId = await seedTenant(HUNHU_CONFIG);
  console.log(`  Hunhu tenant created: ${hunhuId}`);

  const pulseId = await seedTenant(PULSE_CONFIG);
  console.log(`  Pulse tenant created: ${pulseId}`);

  console.log('\nSeeding complete!');
  console.log('Next steps:');
  console.log('  1. Set up Clerk org IDs for each tenant');
  console.log('  2. Configure CRM credentials in tenant.crm_config');
  console.log('  3. Install Slack app in each workspace');
}

main().catch((e) => {
  console.error('Seed failed:', e);
  process.exit(1);
});
