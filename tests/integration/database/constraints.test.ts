// EPIC-001: Platform Foundation & Deployment
// STORY-004: Implement Prisma Schema and Database Migrations
// TASK-004-009: Integration tests — FK, JSONB defaults, and unique constraint verification

import { PrismaClient, Prisma } from '@prisma/client';

const prisma = new PrismaClient();

// Cleanup helper: delete in reverse FK dependency order
async function cleanupTestData() {
  await prisma.alertHistory.deleteMany({});
  await prisma.alert.deleteMany({});
  await prisma.userMonitoringHistory.deleteMany({});
  await prisma.userOverrideHistory.deleteMany({});
  await prisma.userClassificationOverride.deleteMany({});
  await prisma.userValuationOverride.deleteMany({});
  await prisma.userMonitoredStock.deleteMany({});
  await prisma.userAlertPreferences.deleteMany({});
  await prisma.userPreferences.deleteMany({});
  await prisma.valuationHistory.deleteMany({});
  await prisma.valuationState.deleteMany({});
  await prisma.classificationHistory.deleteMany({});
  await prisma.classificationState.deleteMany({});
  await prisma.stock.deleteMany({});
  await prisma.userSession.deleteMany({});
  await prisma.user.deleteMany({});
}

describe('EPIC-001/STORY-004: Database Constraints', () => {
  beforeAll(async () => {
    await prisma.$connect();
    await cleanupTestData();
  });

  afterAll(async () => {
    await cleanupTestData();
    await prisma.$disconnect();
  });

  afterEach(async () => {
    await cleanupTestData();
  });

  // ── FK Constraints ──────────────────────────────────────────────────────────

  test('inserting classification_state for non-existent ticker throws FK violation', async () => {
    await expect(
      prisma.classificationState.create({
        data: {
          ticker: 'NOTEXIST',
          confidenceLevel: 'high',
          reasonCodes: [],
          scores: { bucket: {}, earnings_quality: {}, balance_sheet_quality: {} },
          classificationSource: 'auto',
        },
      }),
    ).rejects.toThrow();
  });

  test('inserting user_session for non-existent user throws FK violation', async () => {
    await expect(
      prisma.userSession.create({
        data: {
          userId: '00000000-0000-0000-0000-000000000000',
          expiresAt: new Date(Date.now() + 3600000),
        },
      }),
    ).rejects.toThrow();
  });

  test('deleting a stock cascades to classification_state', async () => {
    const stock = await prisma.stock.create({
      data: { ticker: 'CASC1', companyName: 'Cascade Test', country: 'US' },
    });
    await prisma.classificationState.create({
      data: {
        ticker: 'CASC1',
        confidenceLevel: 'high',
        reasonCodes: [],
        scores: {},
        classificationSource: 'auto',
      },
    });

    await prisma.stock.delete({ where: { ticker: 'CASC1' } });

    const state = await prisma.classificationState.findUnique({ where: { ticker: 'CASC1' } });
    expect(state).toBeNull();
  });

  // ── Unique Constraints ──────────────────────────────────────────────────────

  test('inserting duplicate user email throws P2002 unique constraint', async () => {
    await prisma.user.create({
      data: { email: 'test@example.com', passwordHash: 'hash1' },
    });

    await expect(
      prisma.user.create({
        data: { email: 'test@example.com', passwordHash: 'hash2' },
      }),
    ).rejects.toThrow(Prisma.PrismaClientKnownRequestError);

    const err = await prisma.user
      .create({ data: { email: 'test@example.com', passwordHash: 'hash2' } })
      .catch((e) => e);
    expect(err.code).toBe('P2002');
  });

  // ── JSONB Defaults ──────────────────────────────────────────────────────────

  test('Stock.dataProviderProvenance defaults to {} and dataQualityIssues defaults to []', async () => {
    const stock = await prisma.stock.create({
      data: { ticker: 'DFLT1', companyName: 'Default Test', country: 'US' },
    });

    expect(stock.dataProviderProvenance).toEqual({});
    expect(stock.dataQualityIssues).toEqual([]);
  });

  test('UserPreferences.preferences and defaultFilters default to {}', async () => {
    const user = await prisma.user.create({
      data: { email: 'prefs@example.com', passwordHash: 'hash' },
    });
    const prefs = await prisma.userPreferences.create({
      data: { userId: user.userId },
    });

    expect(prefs.preferences).toEqual({});
    expect(prefs.defaultFilters).toEqual({});
  });

  test('UserAlertPreferences.mutedAlertFamilies defaults to []', async () => {
    const user = await prisma.user.create({
      data: { email: 'alertprefs@example.com', passwordHash: 'hash' },
    });
    const alertPrefs = await prisma.userAlertPreferences.create({
      data: { userId: user.userId },
    });

    expect(alertPrefs.mutedAlertFamilies).toEqual([]);
    expect(alertPrefs.priorityThreshold).toBe('low');
    expect(alertPrefs.emailDigestFrequency).toBe('daily');
  });

  test('ClassificationState.reasonCodes DB default is [] (via raw SQL omitting the column)', async () => {
    await prisma.stock.create({
      data: { ticker: 'DFLT2', companyName: 'Default Test 2', country: 'US' },
    });

    // Use raw SQL so the DB default kicks in (Prisma always sends the value if provided)
    await prisma.$executeRaw`
      INSERT INTO classification_state
        (ticker, confidence_level, scores, classification_source, classification_last_updated_at, created_at, updated_at)
      VALUES
        ('DFLT2', 'medium', '{}', 'auto', NOW(), NOW(), NOW())
    `;

    const fetched = await prisma.$queryRaw<{ reason_codes: unknown }[]>`
      SELECT reason_codes FROM classification_state WHERE ticker = 'DFLT2'
    `;
    expect(fetched[0].reason_codes).toEqual([]);
  });

  // ── NOT NULL Constraints ────────────────────────────────────────────────────

  test('inserting Stock without ticker throws', async () => {
    await expect(
      prisma.$executeRaw`INSERT INTO stocks (company_name, country) VALUES ('No Ticker', 'US')`,
    ).rejects.toThrow();
  });

  // ── Composite PKs ───────────────────────────────────────────────────────────

  test('user_monitored_stocks enforces composite PK (user_id, ticker)', async () => {
    const user = await prisma.user.create({
      data: { email: 'monitor@example.com', passwordHash: 'hash' },
    });
    await prisma.stock.create({
      data: { ticker: 'MON1', companyName: 'Monitor Test', country: 'US' },
    });
    await prisma.userMonitoredStock.create({
      data: { userId: user.userId, ticker: 'MON1' },
    });

    await expect(
      prisma.userMonitoredStock.create({
        data: { userId: user.userId, ticker: 'MON1' },
      }),
    ).rejects.toThrow(Prisma.PrismaClientKnownRequestError);
  });

  // ── tsr_hurdles nullable base_hurdle_default (bucket 8) ───────────────────

  test('tsr_hurdles allows NULL base_hurdle_default for bucket 8', async () => {
    const hurdle = await prisma.tsrHurdle.create({
      data: {
        bucket: 99,
        baseHurdleLabel: 'No normal hurdle',
        baseHurdleDefault: null,
      },
    });
    expect(hurdle.baseHurdleDefault).toBeNull();
    await prisma.tsrHurdle.delete({ where: { bucket: 99 } });
  });
});
