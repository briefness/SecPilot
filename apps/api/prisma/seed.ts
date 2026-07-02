import { PrismaClient, UserRole } from '@prisma/client';
import { createHash } from 'node:crypto';

const prisma = new PrismaClient();

function hashPassword(password: string): string {
  return createHash('sha256').update(password).digest('hex');
}

async function main() {
  console.log('🌱 Seeding database...');

  const adminUser = await prisma.user.upsert({
    where: { email: 'admin@secops.local' },
    update: {},
    create: {
      email: 'admin@secops.local',
      name: 'Admin User',
      role: UserRole.ADMIN,
      mfaEnabled: false,
      passwordHash: hashPassword('admin123'),
    },
  });
  console.log(`✅ Admin user created: ${adminUser.email}`);

  console.log('🎉 Seed completed!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
