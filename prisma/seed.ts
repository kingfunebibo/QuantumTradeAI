import "dotenv/config";

import { prisma } from "../src/config/prisma";
import { seedSuperAdmin } from "./seeds/superAdmin.seed";

async function main() {
  console.log("🌱 Starting QuantumTradeAI database seeding...");

  await seedSuperAdmin();

  console.log("✅ Database seeding completed successfully.");
}

main()
  .catch((error) => {
    console.error("❌ Database seeding failed:");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });