import { PrismaClient, UserRole } from '@prisma/client';
import { hash } from 'bcrypt';

const prisma = new PrismaClient();

const BCRYPT_ROUNDS = 12;

function hashPassword(password: string): Promise<string> {
  return hash(password, BCRYPT_ROUNDS);
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
      passwordHash: await hashPassword('admin123'),
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
