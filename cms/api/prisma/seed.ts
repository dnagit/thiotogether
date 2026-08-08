/**
 * Seed: idempotent-ish demo dataset. Safe to run on an empty database.
 *   npm run prisma:seed -w api
 * Default super admin: admin@example.com / ChangeMe123!
 */
import { PrismaClient, Prisma } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { ALL_PERMISSIONS, ROLE_PERMISSION_PRESETS } from '../../shared/src/constants/permissions';
import { grantTokensForDonation } from '../src/core/tokens/tokenService.js';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  console.log('🌱 Seeding…');

  // ── Permissions & roles ───────────────────────────────────
  for (const name of ALL_PERMISSIONS) {
    await prisma.permission.upsert({ where: { name }, create: { name }, update: {} });
  }
  const allPerms = await prisma.permission.findMany();
  const permByName = new Map(allPerms.map((p) => [p.name, p.id]));

  const roleDefs = [
    { name: 'SUPER_ADMIN', displayName: 'Super Admin', description: 'Full access', isSystem: true },
    { name: 'ADMIN', displayName: 'Admin', description: 'Manage content and donations', isSystem: true },
    { name: 'EDITOR', displayName: 'Editor', description: 'Edit content', isSystem: true },
  ];
  for (const def of roleDefs) {
    const role = await prisma.role.upsert({ where: { name: def.name }, create: def, update: {} });
    const preset = ROLE_PERMISSION_PRESETS[def.name] ?? [];
    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    await prisma.rolePermission.createMany({
      data: preset
        .map((p) => permByName.get(p))
        .filter((id): id is number => id !== undefined)
        .map((permissionId) => ({ roleId: role.id, permissionId })),
    });
  }

  const superAdminRole = await prisma.role.findUniqueOrThrow({ where: { name: 'SUPER_ADMIN' } });
  const editorRole = await prisma.role.findUniqueOrThrow({ where: { name: 'EDITOR' } });

  // ── Users ─────────────────────────────────────────────────
  const passwordHash = await bcrypt.hash('ChangeMe123!', 12);
  await prisma.user.upsert({
    where: { email: 'admin@example.com' },
    create: { email: 'admin@example.com', name: 'Super Admin', passwordHash, roleId: superAdminRole.id },
    update: {},
  });
  await prisma.user.upsert({
    where: { email: 'editor@example.com' },
    create: { email: 'editor@example.com', name: 'Content Editor', passwordHash, roleId: editorRole.id },
    update: {},
  });

  // ── Pages (nested tree with blocks) ───────────────────────
  const mkPage = async (data: {
    title: string; slug: string; path: string; parentId?: number | null;
    isHome?: boolean; sortOrder?: number; blocks?: any[];
  }) => {
    const existing = await prisma.page.findFirst({ where: { path: data.path } });
    if (existing) return existing;
    return prisma.page.create({
      data: {
        title: data.title,
        slug: data.slug,
        path: data.path,
        parentId: data.parentId ?? null,
        isHome: data.isHome ?? false,
        sortOrder: data.sortOrder ?? 0,
        status: 'PUBLISHED',
        publishedAt: new Date(),
        metaTitle: data.title,
        metaDescription: `${data.title} page`,
        blocks: { create: data.blocks ?? [] },
      },
    });
  };

  const home = await mkPage({
    title: 'Home', slug: 'home', path: '/home', isHome: true, sortOrder: 0,
    blocks: [
      {
        type: 'hero', sortOrder: 0,
        props: {
          headline: 'Building a Better Tomorrow',
          subheadline: 'We create change through community-driven projects and your generous support.',
          ctaLabel: 'Explore Projects', ctaUrl: '/donation',
          image: '',
        },
        styles: { background: 'var(--color-primary)', textColor: '#ffffff', paddingTop: '6rem', paddingBottom: '6rem' },
        settings: {},
      },
      {
        type: 'features', sortOrder: 1,
        props: {
          title: 'What we do',
          items: [
            { icon: '🎓', title: 'Education', text: 'Scholarships and school support for children in need.' },
            { icon: '🏥', title: 'Healthcare', text: 'Medical equipment for rural hospitals.' },
            { icon: '🌱', title: 'Environment', text: 'Reforestation and clean water initiatives.' },
          ],
        },
        styles: {}, settings: {},
      },
      {
        type: 'cta', sortOrder: 2,
        props: { title: 'Ready to make a difference?', buttonLabel: 'Donate now', buttonUrl: '/donation' },
        styles: {}, settings: {},
      },
    ],
  });
  void home;

  await mkPage({
    title: 'About', slug: 'about', path: '/about', sortOrder: 1,
    blocks: [
      { type: 'banner', sortOrder: 0, props: { title: 'About Us', subtitle: 'Who we are' }, styles: {}, settings: {} },
      {
        type: 'rich-text', sortOrder: 1,
        props: { html: '<h2>Our Story</h2><p>Founded in 2015, we have helped thousands of people across the region.</p>' },
        styles: {}, settings: {},
      },
      {
        type: 'team', sortOrder: 2,
        props: {
          title: 'Our Team',
          members: [
            { name: 'Anna Lee', role: 'Director', photo: '' },
            { name: 'Ben Chai', role: 'Operations', photo: '' },
          ],
        },
        styles: {}, settings: {},
      },
    ],
  });

  const services = await mkPage({
    title: 'Services', slug: 'services', path: '/services', sortOrder: 2,
    blocks: [
      { type: 'banner', sortOrder: 0, props: { title: 'Services' }, styles: {}, settings: {} },
      {
        type: 'cards', sortOrder: 1,
        props: {
          items: [
            { title: 'Web Development', text: 'Modern web applications.', url: '/services/web-development' },
            { title: 'Mobile Development', text: 'iOS & Android apps.', url: '/services/mobile-development' },
          ],
        },
        styles: {}, settings: {},
      },
    ],
  });
  await mkPage({
    title: 'Web Development', slug: 'web-development', path: '/services/web-development',
    parentId: services.id, sortOrder: 0,
    blocks: [{ type: 'text', sortOrder: 0, props: { text: 'We build fast, accessible websites.' }, styles: {}, settings: {} }],
  });
  const mobile = await mkPage({
    title: 'Mobile Development', slug: 'mobile-development', path: '/services/mobile-development',
    parentId: services.id, sortOrder: 1,
    blocks: [{ type: 'text', sortOrder: 0, props: { text: 'Native and cross-platform mobile apps.' }, styles: {}, settings: {} }],
  });
  await mkPage({
    title: 'Flutter', slug: 'flutter', path: '/services/mobile-development/flutter',
    parentId: mobile.id, sortOrder: 0,
    blocks: [{ type: 'text', sortOrder: 0, props: { text: 'Cross-platform apps with Flutter.' }, styles: {}, settings: {} }],
  });
  await mkPage({
    title: 'Vue', slug: 'vue', path: '/services/mobile-development/vue',
    parentId: mobile.id, sortOrder: 1,
    blocks: [{ type: 'text', sortOrder: 0, props: { text: 'Hybrid apps with Vue + Capacitor.' }, styles: {}, settings: {} }],
  });

  const contact = await mkPage({
    title: 'Contact', slug: 'contact', path: '/contact', sortOrder: 3,
    blocks: [
      { type: 'banner', sortOrder: 0, props: { title: 'Contact Us' }, styles: {}, settings: {} },
      { type: 'contact-form', sortOrder: 1, props: { formSlug: 'contact' }, styles: {}, settings: {} },
      { type: 'google-map', sortOrder: 2, props: { lat: 13.7563, lng: 100.5018, zoom: 13 }, styles: {}, settings: {} },
    ],
  });

  // ── Menus ─────────────────────────────────────────────────
  const pagesByPath = new Map(
    (await prisma.page.findMany({ select: { id: true, path: true } })).map((p) => [p.path, p.id]),
  );

  const mainMenu = await prisma.menu.upsert({
    where: { location: 'main' },
    create: { name: 'Main Menu', location: 'main' },
    update: {},
  });
  if ((await prisma.menuItem.count({ where: { menuId: mainMenu.id } })) === 0) {
    const mkItem = (data: any) => prisma.menuItem.create({ data: { menuId: mainMenu.id, ...data } });
    await mkItem({ label: 'Home', type: 'PAGE', pageId: pagesByPath.get('/home'), sortOrder: 0 });
    await mkItem({ label: 'About', type: 'PAGE', pageId: pagesByPath.get('/about'), sortOrder: 1 });
    const servicesItem = await mkItem({ label: 'Services', type: 'PAGE', pageId: services.id, sortOrder: 2 });
    await mkItem({
      label: 'Web Development', type: 'PAGE',
      pageId: pagesByPath.get('/services/web-development'),
      parentId: servicesItem.id, sortOrder: 0,
    });
    await mkItem({
      label: 'Mobile Development', type: 'PAGE',
      pageId: pagesByPath.get('/services/mobile-development'),
      parentId: servicesItem.id, sortOrder: 1,
    });
    await mkItem({ label: 'Donate', type: 'CUSTOM', url: '/donation', sortOrder: 3 });
    await mkItem({ label: 'Contact', type: 'PAGE', pageId: contact.id, sortOrder: 4 });
  }

  const footerMenu = await prisma.menu.upsert({
    where: { location: 'footer' },
    create: { name: 'Footer Menu', location: 'footer' },
    update: {},
  });
  if ((await prisma.menuItem.count({ where: { menuId: footerMenu.id } })) === 0) {
    await prisma.menuItem.createMany({
      data: [
        { menuId: footerMenu.id, label: 'About', type: 'PAGE', pageId: pagesByPath.get('/about'), sortOrder: 0 },
        { menuId: footerMenu.id, label: 'Donate', type: 'CUSTOM', url: '/donation', sortOrder: 1 },
        { menuId: footerMenu.id, label: 'Privacy Policy', type: 'EXTERNAL', url: 'https://example.com/privacy', target: '_blank', sortOrder: 2 },
      ],
    });
  }

  // ── Contact form ──────────────────────────────────────────
  const contactForm = await prisma.form.upsert({
    where: { slug: 'contact' },
    create: {
      name: 'Contact Form', slug: 'contact',
      description: 'General enquiries',
      submitLabel: 'Send Message',
      successMessage: 'Thanks for reaching out — we will reply within 2 business days.',
    },
    update: {},
  });
  if ((await prisma.formField.count({ where: { formId: contactForm.id } })) === 0) {
    await prisma.formField.createMany({
      data: [
        { formId: contactForm.id, type: 'TEXT', name: 'name', label: 'Your Name', required: true, options: [], validation: { maxLength: 100 }, sortOrder: 0, width: 6 },
        { formId: contactForm.id, type: 'EMAIL', name: 'email', label: 'Email', required: true, options: [], validation: {}, sortOrder: 1, width: 6 },
        { formId: contactForm.id, type: 'PHONE', name: 'phone', label: 'Phone', required: false, options: [], validation: {}, sortOrder: 2, width: 6 },
        {
          formId: contactForm.id, type: 'SELECT', name: 'topic', label: 'Topic', required: true,
          options: [
            { label: 'General', value: 'general' },
            { label: 'Donations', value: 'donations' },
            { label: 'Partnership', value: 'partnership' },
          ],
          validation: {}, sortOrder: 3, width: 6,
        },
        { formId: contactForm.id, type: 'TEXTAREA', name: 'message', label: 'Message', required: true, options: [], validation: { maxLength: 2000 }, sortOrder: 4, width: 12 },
      ],
    });
  }

  // ── Bank accounts & donation projects ─────────────────────
  const mkBank = async (accountNumber: string, data: any) => {
    const existing = await prisma.bankAccount.findFirst({ where: { accountNumber } });
    return existing ?? prisma.bankAccount.create({ data: { accountNumber, ...data } });
  };
  const bankA = await mkBank('123-4-56789-0', {
    bankName: 'SCB', accountName: 'Better Tomorrow Foundation', branch: 'Head Office',
  });
  const bankB = await mkBank('987-6-54321-0', {
    bankName: 'KBank', accountName: 'Better Tomorrow Foundation', branch: 'Sukhumvit',
  });

  const mkProject = async (slug: string, data: any, bankIds: number[]) => {
    const existing = await prisma.donationProject.findFirst({ where: { slug } });
    if (existing) return existing;
    return prisma.donationProject.create({
      data: {
        slug,
        ...data,
        bankAccounts: { create: bankIds.map((bankAccountId) => ({ bankAccountId })) },
      },
    });
  };

  const projectSchool = await mkProject(
    'school-library',
    {
      name: 'Build a School Library',
      description:
        '<p>Help us build a library for a rural school serving 300 students. Funds go to construction, books, and furniture.</p>',
      shortDescription: 'A library for 300 rural students.',
      targetAmount: 500_000, currency: 'THB', themeColor: '#2563eb',
      startDate: new Date('2026-01-01'), endDate: new Date('2026-12-31'),
      sortOrder: 0,
      metaTitle: 'Build a School Library — Donate',
    },
    [bankA.id, bankB.id],
  );
  await mkProject(
    'clean-water',
    {
      name: 'Clean Water for Villages',
      description: '<p>Install water filtration systems in 10 remote villages.</p>',
      shortDescription: 'Filtration systems for 10 villages.',
      targetAmount: 300_000, currency: 'THB', themeColor: '#0d9488',
      startDate: new Date('2026-03-01'),
      sortOrder: 1,
    },
    [bankA.id],
  );

  // ── Sample donations ──────────────────────────────────────
  if ((await prisma.donation.count()) === 0) {
    const donations = [
      { code: 'DN-SEED0001', name: 'Somchai P.', amount: 1000, status: 'VERIFIED' },
      { code: 'DN-SEED0002', name: 'Jane D.', amount: 5000, status: 'VERIFIED' },
      { code: 'DN-SEED0003', name: 'Anon K.', amount: 300, status: 'PENDING' },
      { code: 'DN-SEED0004', name: 'Malee S.', amount: 2500, status: 'NEEDS_REVIEW' },
    ] as const;
    for (const d of donations) {
      await prisma.donation.create({
        data: {
          donationCode: d.code,
          projectId: projectSchool.id,
          accountName: d.name,
          amount: d.amount,
          transferDate: new Date('2026-06-15'),
          transferTime: '14:30',
          slipUrl: 'https://placehold.co/400x600?text=Slip',
          status: d.status,
          ...(d.status === 'VERIFIED' ? { verifiedAt: new Date() } : {}),
          logs: { create: { action: 'submitted', toStatus: 'PENDING' } },
        },
      });
    }
    const verifiedSum = await prisma.donation.aggregate({
      where: { projectId: projectSchool.id, status: 'VERIFIED' },
      _sum: { amount: true },
    });
    await prisma.donationProject.update({
      where: { id: projectSchool.id },
      data: { currentAmount: verifiedSum._sum.amount ?? 0 },
    });
  }

  // ── Settings ──────────────────────────────────────────────
  const settings: Array<{ key: string; value: unknown; group: string }> = [
    { key: 'siteName', value: 'Better Tomorrow Foundation', group: 'general' },
    { key: 'siteDescription', value: 'Community-driven change through your support.', group: 'general' },
    { key: 'contactEmail', value: 'hello@example.com', group: 'contact' },
    { key: 'contactPhone', value: '+66 2 000 0000', group: 'contact' },
    { key: 'contactAddress', value: '123 Sukhumvit Rd, Bangkok', group: 'contact' },
    { key: 'facebook', value: 'https://facebook.com/example', group: 'social' },
    { key: 'instagram', value: 'https://instagram.com/example', group: 'social' },
    { key: 'metaTitle', value: 'Better Tomorrow Foundation', group: 'seo' },
    { key: 'metaDescription', value: 'Join us in building a better tomorrow.', group: 'seo' },
    { key: 'primaryColor', value: '#2563eb', group: 'theme' },
    { key: 'secondaryColor', value: '#0d9488', group: 'theme' },
    { key: 'logoUrl', value: '', group: 'theme' },
    { key: 'faviconUrl', value: '', group: 'theme' },
    { key: 'fontFamily', value: "'Inter', system-ui, sans-serif", group: 'theme' },
    { key: 'headerStyle', value: 'default', group: 'theme' },
    { key: 'footerText', value: '© 2026 Better Tomorrow Foundation. All rights reserved.', group: 'theme' },
  ];
  for (const s of settings) {
    await prisma.setting.upsert({
      where: { key: s.key },
      create: { key: s.key, value: s.value as any, group: s.group },
      update: {},
    });
  }

  await seedBoardGame();
  await seedBirthday();

  console.log('✅ Seed complete.');
  console.log('   Login: admin@example.com / ChangeMe123!');
}

/**
 * A playable demo game: one project priced at 50฿/token, three donors already
 * approved (so they hold spendable tokens), and a 12-tile board ready to open.
 */
async function seedBoardGame(): Promise<void> {
  const project = await prisma.donationProject.findFirst({ where: { slug: 'school-library' } });
  if (!project) return;

  await prisma.donationProject.update({
    where: { id: project.id },
    data: { tokenValue: new Prisma.Decimal(50) },
  });

  const existing = await prisma.game.findUnique({ where: { slug: 'lucky-board-demo' } });
  if (existing) {
    console.log('   Game "lucky-board-demo" already seeded, skipping.');
    return;
  }

  const TILE_COUNT = 12;
  const game = await prisma.game.create({
    data: {
      name: 'เปิดแผ่นป้ายลุ้นรางวัล (ตัวอย่าง)',
      slug: 'lucky-board-demo',
      description: 'บริจาคเพื่อรับ token แล้วเลือกเปิดแผ่นป้ายลุ้นรางวัล',
      tileCount: TILE_COUNT,
      tokensPerTile: 1,
      showReserverNames: true,
      maxTilesPerAccount: 5,
      themeColor: '#7c3aed',
      status: 'DRAFT',
    },
  });

  await prisma.gameDonationProject.create({
    data: { gameId: game.id, projectId: project.id },
  });
  await prisma.boardTile.createMany({
    data: Array.from({ length: TILE_COUNT }, (_, i) => ({ gameId: game.id, boardNumber: i + 1 })),
  });
  await prisma.reward.createMany({
    data: [
      'บัตรกำนัล 1,000 บาท',
      'บัตรกำนัล 500 บาท',
      'เสื้อยืดที่ระลึก',
      'กระเป๋าผ้าที่ระลึก',
      'แก้วน้ำที่ระลึก',
      'สมุดโน้ตที่ระลึก',
      'พวงกุญแจที่ระลึก',
      'สติกเกอร์เซ็ต',
      'ขอบคุณที่ร่วมสนุก',
      'ขอบคุณที่ร่วมสนุก',
      'ขอบคุณที่ร่วมสนุก',
      'ขอบคุณที่ร่วมสนุก',
    ].map((label, i) => ({ gameId: game.id, label, sortOrder: i })),
  });

  // Approved donors, so the demo has accounts that can actually play.
  const donors: Array<[string, number]> = [
    ['ทีโอ้', 250],
    ['player_001', 120],
    ['Somchai Jaidee', 130],
  ];
  for (const [accountName, amount] of donors) {
    const code = `DN-SEED${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    const donation = await prisma.donation.create({
      data: {
        donationCode: code,
        projectId: project.id,
        accountName,
        nickname: accountName,
        contactInfo: 'ข้อมูลตัวอย่างสำหรับทดสอบ',
        amount: new Prisma.Decimal(amount),
        transferDate: new Date(),
        transferTime: '10:00',
        slipUrl: 'https://placehold.co/600x800?text=slip',
        status: 'VERIFIED',
        verifiedAt: new Date(),
      },
    });
    await grantTokensForDonation(donation.id, null, prisma as never);
  }

  console.log(`   Game "lucky-board-demo" seeded: ${TILE_COUNT} tiles, 3 funded accounts.`);
  console.log('   Demo accounts: ทีโอ้ (5 tokens), player_001 (2), Somchai Jaidee (2)');
}

/**
 * A birthday wall ready to receive wishes: the slug the website falls back to when no
 * event is named in the URL, plus a small gift catalogue so the form's picker is never
 * empty. No sample wishes — an empty sky with its own call to action is the honest
 * first-run state.
 *
 * No card backgrounds either, and deliberately: one needs a real picture, and a seeded
 * row pointing at a URL that does not exist would put a broken image in the picker. An
 * empty list is already a working state — every card is the plain one until an admin
 * uploads artwork.
 */
async function seedBirthday(): Promise<void> {
  const existing = await prisma.birthdayEvent.findUnique({ where: { slug: 'birthday' } });
  if (existing) {
    console.log('   Birthday event "birthday" already seeded, skipping.');
    return;
  }

  const event = await prisma.birthdayEvent.create({
    data: {
      title: 'อวยพรวันเกิด',
      slug: 'birthday',
      celebrantName: 'น้องทีโอ้',
      description: 'เขียนคำอวยพร เลือกลูกโป่งและของขวัญ แล้วปล่อยให้ลอยขึ้นไปด้วยกัน',
      themeColor: '#ea480c',
      isOpen: true,
      isActive: true,
      requiresApproval: false,
    },
  });

  await prisma.birthdayGift.createMany({
    data: ['เค้กวันเกิด', 'ช่อดอกไม้', 'ตุ๊กตาหมี', 'กล่องของขวัญ', 'บอลลูนช่อ'].map(
      (name, i) => ({ eventId: event.id, name, sortOrder: i }),
    ),
  });

  console.log('   Birthday event "birthday" seeded with 5 gifts.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
