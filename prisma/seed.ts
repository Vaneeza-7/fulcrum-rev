import 'dotenv/config';

/**
 * Database seed script.
 * Tenants are now created dynamically via the onboarding flow (Clerk org webhook + UI).
 * This file is kept as a placeholder for any future seed data needs.
 */
async function main() {
  console.log('No seed data required — tenants are created via the onboarding flow.');
}

main().catch((e) => {
  console.error('Seed failed:', e);
  process.exit(1);
});
