import {
  db,
  facilitiesTable,
  inventoryTable,
  medicinesTable,
  demandHistoryTable,
  replenishmentsTable,
  alertHistoryTable,
} from "@workspace/db";
import { facilities, medicines } from "./seed-data";
import { logger } from "./logger";
import { eq } from "drizzle-orm";

// Simple deterministic PRNG for reproducible seeds
class PRNG {
  private seed: number;
  constructor(seed: number) {
    this.seed = seed;
  }
  next() {
    this.seed = (this.seed * 9301 + 49297) % 233280;
    return this.seed / 233280;
  }
  nextRange(min: number, max: number) {
    return min + this.next() * (max - min);
  }
  nextInt(min: number, max: number) {
    return Math.floor(this.nextRange(min, max));
  }
  nextChoice<T>(arr: T[]): T {
    return arr[this.nextInt(0, arr.length)];
  }
}

const dateOffset = (days: number) => {
  const d = new Date(Date.now() + days * 86_400_000);
  return d.toISOString().slice(0, 10);
};

async function batchInsert<T extends any>(table: any, items: T[], batchSize = 100) {
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    await db.insert(table).values(batch).onConflictDoNothing();
  }
}

export async function ensureSeedData() {
  logger.info("Starting seed data generation...");

  const existingFacilities = await db.select({ id: facilitiesTable.id }).from(facilitiesTable).limit(1);
  if (existingFacilities.length > 0) {
    logger.info("Database already seeded. Exiting.");
    return;
  }

  let stats = {
    facilities: 0,
    medicines: 0,
    inventory: 0,
    demand: 0,
    replenishment: 0,
    alerts: 0,
    shortages: 0,
    risks: 0,
  };

  const rng = new PRNG(12345);

  // Phase 1: Insert facilities
  const facValues = facilities.map((f) => ({
    code: f[0],
    name: f[1],
    type: f[2],
    city: f[3],
    district: f[4],
    address: f[5],
    latitude: f[6],
    longitude: f[7],
    contactName: f[8],
    contactPhone: f[9],
    capacity: f[10] || null,
  }));
  await batchInsert(facilitiesTable, facValues);

  // Phase 1: Insert medicines
  const medValues = medicines.map((m) => ({
    genericName: m[0],
    brandName: m[1],
    strength: m[2],
    form: m[3],
    unit: m[4],
    category: m[5],
    reorderLevel: m[6],
    isEssential: m[7],
  }));
  await batchInsert(medicinesTable, medValues);

  const dbFacilities = await db.select().from(facilitiesTable);
  const dbMedicines = await db.select().from(medicinesTable);
  stats.facilities = dbFacilities.length;
  stats.medicines = dbMedicines.length;

  if (dbFacilities.length === 0 || dbMedicines.length === 0) {
    logger.error("Failed to seed basic entities");
    return;
  }

  // Phase 2: Inventory & Phase 3: Demand History
  const inventoryValues: any[] = [];
  const demandValues: any[] = [];
  const replValues: any[] = [];
  const alertValues: any[] = [];

  const facilityMedicines = new Map<number, number[]>();

  for (const fac of dbFacilities) {
    let prob = 0.3;
    if (fac.type === "hospital") prob = rng.nextRange(0.6, 0.9);
    else if (fac.type === "clinic") prob = rng.nextRange(0.2, 0.35);
    else if (fac.type === "pharmacy") prob = rng.nextRange(0.3, 0.5);
    else if (fac.type === "distributor") prob = rng.nextRange(0.4, 0.7);

    const fMeds = [];
    for (const med of dbMedicines) {
      if (rng.next() > prob && !med.isEssential) continue;
      fMeds.push(med.id);

      let baseQty = 100;
      let baseDaily = 10;
      if (fac.type === "hospital") {
        baseQty = rng.nextInt(100, 2000);
        baseDaily = rng.nextInt(5, 80);
      } else if (fac.type === "clinic") {
        baseQty = rng.nextInt(20, 200);
        baseDaily = rng.nextInt(1, 15);
      } else if (fac.type === "pharmacy") {
        baseQty = rng.nextInt(50, 500);
        baseDaily = rng.nextInt(3, 30);
      } else if (fac.type === "distributor") {
        baseQty = rng.nextInt(200, 5000);
        baseDaily = rng.nextInt(10, 100);
      }

      const numBatches = rng.nextInt(1, 4);
      for (let b = 0; b < numBatches; b++) {
        const isNearExpiry = rng.next() < 0.08;
        const expiryDays = isNearExpiry ? rng.nextInt(1, 60) : rng.nextInt(60, 730);

        const qoh = Math.floor(baseQty / numBatches);
        inventoryValues.push({
          facilityId: fac.id,
          medicineId: med.id,
          batchNumber: `B-26${String(rng.nextInt(1, 12)).padStart(2, "0")}${rng.nextInt(100, 999)}`,
          quantityOnHand: qoh,
          reservedQuantity: Math.floor(qoh * rng.nextRange(0, 0.1)),
          expiryDate: dateOffset(expiryDays),
          dailyConsumption: baseDaily,
        });
      }

      const trend = rng.next() < 0.15 ? 1.05 : rng.next() < 0.1 ? 0.95 : 1.0;
      for (let d = -rng.nextInt(30, 45); d < 0; d++) {
        const trendFactor = Math.pow(trend, Math.abs(d) / 10);
        const dailyVariance = rng.nextRange(0.7, 1.3);
        const consumed = Math.floor(baseDaily * trendFactor * dailyVariance);
        const dispensed = Math.floor(consumed * rng.nextRange(0.9, 1.1));

        demandValues.push({
          facilityId: fac.id,
          medicineId: med.id,
          recordDate: dateOffset(d),
          quantityConsumed: consumed,
          quantityDispensed: dispensed,
        });
      }
    }
    facilityMedicines.set(fac.id, fMeds);
  }

  await batchInsert(inventoryTable, inventoryValues);
  await batchInsert(demandHistoryTable, demandValues);
  stats.inventory = inventoryValues.length;
  stats.demand = demandValues.length;

  // Phase 4: Replenishments
  for (let i = 0; i < 220; i++) {
    const fac = rng.nextChoice(dbFacilities);
    const fMeds = facilityMedicines.get(fac.id);
    if (!fMeds || fMeds.length === 0) continue;
    const medId = rng.nextChoice(fMeds);

    let status = rng.nextChoice(["ordered", "shipped", "delivered"]);
    if (rng.next() < 0.15) status = "delayed";

    replValues.push({
      facilityId: fac.id,
      medicineId: medId,
      incomingQuantity: rng.nextInt(50, 2000),
      expectedDate: dateOffset(rng.nextInt(1, 30)),
      leadTimeDays: rng.nextInt(2, 14),
      orderStatus: status,
      reliability: status === "delayed" ? rng.nextRange(0.4, 0.7) : rng.nextRange(0.8, 1.0),
    });
  }
  await batchInsert(replenishmentsTable, replValues);
  stats.replenishment = replValues.length;

  // Phase 5: Intentional Scenarios
  const dbInventory = await db.select().from(inventoryTable);
  const groupedInv = new Map<string, any[]>();
  for (const inv of dbInventory) {
    const key = `${inv.facilityId}-${inv.medicineId}`;
    if (!groupedInv.has(key)) groupedInv.set(key, []);
    groupedInv.get(key)!.push(inv);
  }
  const keys = Array.from(groupedInv.keys());

  // Shortage scenarios (15+)
  for (let i = 0; i < 18; i++) {
    if (keys.length === 0) break;
    const key = keys.splice(rng.nextInt(0, keys.length), 1)[0];
    const invs = groupedInv.get(key)!;
    const first = invs[0];
    const consumption = first.dailyConsumption || 10;

    for (const inv of invs) {
      await db.update(inventoryTable)
        .set({ quantityOnHand: Math.floor((consumption * rng.nextRange(0.5, 2)) / invs.length) })
        .where(eq(inventoryTable.id, inv.id));
    }

    alertValues.push({
      facilityId: first.facilityId,
      medicineId: first.medicineId,
      alertType: "shortage",
      severity: "critical",
      title: "Critical Stock Shortage",
      detail: "Inventory levels have fallen below 3 days of supply.",
      status: "active",
    });
    stats.shortages++;
  }

  // Surplus scenarios (10+)
  for (let i = 0; i < 12; i++) {
    if (keys.length === 0) break;
    const key = keys.splice(rng.nextInt(0, keys.length), 1)[0];
    const invs = groupedInv.get(key)!;
    const first = invs[0];
    const consumption = first.dailyConsumption || 10;

    for (const inv of invs) {
      await db.update(inventoryTable)
        .set({ quantityOnHand: Math.floor((consumption * rng.nextRange(100, 150)) / invs.length) })
        .where(eq(inventoryTable.id, inv.id));
    }
  }

  // Regional risk scenarios (5+)
  for (let i = 0; i < 6; i++) {
    const med = rng.nextChoice(dbMedicines);
    const udupiFacs = dbFacilities.filter((f) => f.city === "Udupi" || f.city === "Manipal");
    let affected = 0;
    for (const fac of udupiFacs) {
      const k = `${fac.id}-${med.id}`;
      if (groupedInv.has(k)) {
        const invs = groupedInv.get(k)!;
        for (const inv of invs) {
          await db.update(inventoryTable)
            .set({ quantityOnHand: Math.floor((inv.dailyConsumption || 10) * rng.nextRange(0.5, 2)) })
            .where(eq(inventoryTable.id, inv.id));
        }
        affected++;
      }
    }
    if (affected >= 3) stats.risks++;
  }

  await batchInsert(alertHistoryTable, alertValues);
  stats.alerts = alertValues.length;

  // Phase 6: Report
  logger.info(`Seed complete:
- Facilities: ${stats.facilities}
- Medicines: ${stats.medicines}
- Inventory records: ${stats.inventory}
- Demand history records: ${stats.demand}
- Replenishment records: ${stats.replenishment}
- Alert history records: ${stats.alerts}
- Shortage scenarios: ${stats.shortages}
- Regional risk scenarios: ${stats.risks}`);
}