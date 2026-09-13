import { db, demandHistoryTable, inventoryTable, replenishmentsTable, alertHistoryTable, facilitiesTable } from "@workspace/db";
import { eq, and, desc, asc, gte, lte, sql } from "drizzle-orm";

export async function forecastDemand(facilityId: number, medicineId: number, horizon = 7) {
  // Query demand_history for the last 60 days
  const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  
  const history = await db.select()
    .from(demandHistoryTable)
    .where(and(
      eq(demandHistoryTable.facilityId, facilityId),
      eq(demandHistoryTable.medicineId, medicineId),
      gte(demandHistoryTable.recordDate, sixtyDaysAgo)
    ))
    .orderBy(asc(demandHistoryTable.recordDate));
    
  if (history.length === 0) {
    // fallback to inventory daily consumption or 0
    const inv = await db.select().from(inventoryTable).where(and(eq(inventoryTable.facilityId, facilityId), eq(inventoryTable.medicineId, medicineId))).limit(1);
    const avg = inv[0]?.dailyConsumption || 0;
    const dailyForecasts = Array(horizon).fill(avg);
    return {
      dailyForecasts,
      projectedTotalDemand: avg * horizon,
      averageDailyDemand: avg,
      trend: "stable" as const
    };
  }

  // Calculate weighted moving average (recent days weighted more)
  let totalWeight = 0;
  let weightedSum = 0;
  const alpha = 0.1;
  const todayMs = Date.now();
  
  history.forEach(record => {
    const recordDateMs = new Date(record.recordDate).getTime();
    const daysAgo = Math.max(0, (todayMs - recordDateMs) / (1000 * 60 * 60 * 24));
    const weight = Math.exp(-alpha * daysAgo);
    weightedSum += record.quantityConsumed * weight;
    totalWeight += weight;
  });
  
  const averageDailyDemand = totalWeight > 0 ? weightedSum / totalWeight : 0;
  
  // Linear regression to find trend
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
  const n = history.length;
  let trend: "increasing" | "decreasing" | "stable" = "stable";
  let slope = 0;
  
  if (n > 1) {
    const firstDateMs = new Date(history[0].recordDate).getTime();
    history.forEach((record) => {
      const recordDateMs = new Date(record.recordDate).getTime();
      const x = (recordDateMs - firstDateMs) / (1000 * 60 * 60 * 24);
      const y = record.quantityConsumed;
      sumX += x;
      sumY += y;
      sumXY += x * y;
      sumX2 += x * x;
    });
    
    slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX) || 0;
    if (slope > 0.5) trend = "increasing";
    else if (slope < -0.5) trend = "decreasing";
  }
  
  // Forecast
  const dailyForecasts = [];
  let projectedTotalDemand = 0;
  
  for (let i = 1; i <= horizon; i++) {
    const forecast = Math.max(0, averageDailyDemand + (slope * i));
    dailyForecasts.push(forecast);
    projectedTotalDemand += forecast;
  }
  
  return {
    dailyForecasts,
    projectedTotalDemand,
    averageDailyDemand,
    trend
  };
}

export async function projectStockout(facilityId: number, medicineId: number, horizon = 14) {
  const inv = await db.select().from(inventoryTable).where(and(eq(inventoryTable.facilityId, facilityId), eq(inventoryTable.medicineId, medicineId)));
  const currentStock = inv.reduce((sum, item) => sum + item.quantityOnHand - item.reservedQuantity, 0);
  
  const { dailyForecasts, averageDailyDemand } = await forecastDemand(facilityId, medicineId, horizon);
  
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  const futureStr = new Date(today.getTime() + horizon * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  
  const replenishments = await db.select()
    .from(replenishmentsTable)
    .where(and(
      eq(replenishmentsTable.facilityId, facilityId),
      eq(replenishmentsTable.medicineId, medicineId),
      gte(replenishmentsTable.expectedDate, todayStr),
      lte(replenishmentsTable.expectedDate, futureStr)
    ))
    .then(rows => rows.filter(r => r.orderStatus === 'ordered' || r.orderStatus === 'shipped'));
    
  let stock = currentStock;
  const projectedDailyStock = [];
  let daysToStockout = -1;
  let projectedStockoutDate: string | null = null;
  
  let earliestArrivingImpact: { quantity: number; arrivalDate: string; arrivesBeforeStockout: boolean } | null = null;

  for (let i = 0; i < horizon; i++) {
    const currentDate = new Date(today.getTime() + (i + 1) * 24 * 60 * 60 * 1000);
    const dateStr = currentDate.toISOString().slice(0, 10);
    
    stock -= dailyForecasts[i];
    
    const arrivals = replenishments.filter(r => r.expectedDate === dateStr);
    for (const arr of arrivals) {
      stock += arr.incomingQuantity;
      if (!earliestArrivingImpact) {
         earliestArrivingImpact = { quantity: arr.incomingQuantity, arrivalDate: arr.expectedDate, arrivesBeforeStockout: daysToStockout === -1 };
      }
    }
    
    projectedDailyStock.push({ date: dateStr, stock });
    
    if (stock <= 0 && daysToStockout === -1) {
      daysToStockout = i + 1;
      projectedStockoutDate = dateStr;
    }
  }
  
  let shortageRisk: 'critical' | 'high' | 'watch' | 'stable' = 'stable';
  if (daysToStockout !== -1) {
    if (daysToStockout <= 3) shortageRisk = 'critical';
    else if (daysToStockout <= 7) shortageRisk = 'high';
    else if (daysToStockout <= 14) shortageRisk = 'watch';
  } else if (currentStock <= averageDailyDemand * 7) {
    shortageRisk = 'watch';
  }
  
  return {
    currentStock,
    projectedDailyStock,
    daysToStockout: daysToStockout !== -1 ? daysToStockout : null,
    projectedStockoutDate,
    shortageRisk,
    replenishmentImpact: earliestArrivingImpact
  };
}

export async function calculateConfidence(facilityId: number, medicineId: number) {
  const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const history = await db.select()
    .from(demandHistoryTable)
    .where(and(
      eq(demandHistoryTable.facilityId, facilityId),
      eq(demandHistoryTable.medicineId, medicineId),
      gte(demandHistoryTable.recordDate, sixtyDaysAgo)
    ));
    
  const inv = await db.select().from(inventoryTable).where(and(eq(inventoryTable.facilityId, facilityId), eq(inventoryTable.medicineId, medicineId))).limit(1);
  
  let percentage = 100;
  const evidence: string[] = [];
  
  if (history.length < 10) {
    percentage -= 30;
    evidence.push(`Only ${history.length} data points in the last 60 days.`);
  } else {
    evidence.push(`${history.length} data points available.`);
  }
  
  if (inv.length > 0 && inv[0].lastCountedAt) {
    const daysSinceCount = (Date.now() - new Date(inv[0].lastCountedAt).getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceCount > 7) {
      percentage -= 20;
      evidence.push(`Inventory last counted ${Math.round(daysSinceCount)} days ago.`);
    } else {
      evidence.push(`Inventory count is fresh.`);
    }
  } else {
    percentage -= 40;
    evidence.push(`No recent inventory count.`);
  }
  
  if (history.length > 1) {
    const mean = history.reduce((sum, h) => sum + h.quantityConsumed, 0) / history.length;
    const variance = history.reduce((sum, h) => sum + Math.pow(h.quantityConsumed - mean, 2), 0) / history.length;
    const stdDev = Math.sqrt(variance);
    const cv = mean > 0 ? stdDev / mean : 0;
    
    if (cv > 1.5) {
      percentage -= 20;
      evidence.push("Demand is highly volatile.");
    } else if (cv > 0.5) {
      percentage -= 10;
      evidence.push("Demand is moderately volatile.");
    } else {
      evidence.push("Demand is stable.");
    }
  }
  
  const level = percentage >= 80 ? 'high' : percentage >= 50 ? 'moderate' : 'low';
  
  return { level, percentage: Math.max(0, percentage), evidence };
}

export async function analyzeRegionalRisk(medicineId: number) {
  const allFacilities = await db.select().from(facilitiesTable);
  
  let totalAvailableStock = 0;
  let totalProjectedDemand = 0;
  let facilitiesAffectedCount = 0;
  let incomingReplenishment = 0;
  const affectedFacilities: Array<{ facilityId: number; facilityName: string; daysToStockout: number | null; risk: string }> = [];
  
  for (const facility of allFacilities) {
    const stockoutProj = await projectStockout(facility.id, medicineId, 14);
    const inv = await db.select().from(inventoryTable).where(and(eq(inventoryTable.facilityId, facility.id), eq(inventoryTable.medicineId, medicineId)));
    const currentStock = inv.reduce((sum, item) => sum + item.quantityOnHand - item.reservedQuantity, 0);
    
    const { projectedTotalDemand } = await forecastDemand(facility.id, medicineId, 14);
    
    totalAvailableStock += currentStock;
    totalProjectedDemand += projectedTotalDemand;
    
    const replens = await db.select().from(replenishmentsTable).where(and(eq(replenishmentsTable.facilityId, facility.id), eq(replenishmentsTable.medicineId, medicineId), eq(replenishmentsTable.orderStatus, 'ordered')));
    incomingReplenishment += replens.reduce((sum, r) => sum + r.incomingQuantity, 0);
    
    if (stockoutProj.shortageRisk !== 'stable') {
      facilitiesAffectedCount++;
      affectedFacilities.push({
        facilityId: facility.id,
        facilityName: facility.name,
        daysToStockout: stockoutProj.daysToStockout,
        risk: stockoutProj.shortageRisk
      });
    }
  }
  
  affectedFacilities.sort((a, b) => (a.daysToStockout ?? 999) - (b.daysToStockout ?? 999));
  
  const projectedRegionalDeficit = Math.max(0, totalProjectedDemand - (totalAvailableStock + incomingReplenishment));
  const averageStockCover = totalProjectedDemand > 0 ? (totalAvailableStock / totalProjectedDemand) * 14 : 999;
  
  let riskClass: 'isolated_shortage' | 'emerging_regional' | 'regional_shortage' | 'stable' = 'stable';
  const affectedRatio = allFacilities.length > 0 ? facilitiesAffectedCount / allFacilities.length : 0;
  
  if (affectedRatio > 0.5 || projectedRegionalDeficit > 0) riskClass = 'regional_shortage';
  else if (affectedRatio > 0.2) riskClass = 'emerging_regional';
  else if (affectedRatio > 0) riskClass = 'isolated_shortage';
  
  return {
    facilitiesAffected: facilitiesAffectedCount,
    averageStockCover,
    regionalAvailableStock: totalAvailableStock,
    projectedRegionalDemand: totalProjectedDemand,
    projectedRegionalDeficit,
    incomingReplenishment,
    classification: riskClass,
    propagationChain: affectedFacilities
  };
}

export async function upsertAlert(data: {
  facilityId: number;
  medicineId: number;
  alertType: string;
  severity: string;
  title: string;
  detail: string;
  projectedStockoutDate?: string | null;
  forecastConfidence?: number | null;
  recommendedAction?: string | null;
}) {
  const existing = await db.select()
    .from(alertHistoryTable)
    .where(and(
      eq(alertHistoryTable.facilityId, data.facilityId),
      eq(alertHistoryTable.medicineId, data.medicineId),
      eq(alertHistoryTable.alertType, data.alertType),
      eq(alertHistoryTable.status, 'active')
    )).limit(1);
    
  if (existing.length > 0) {
    return await db.update(alertHistoryTable)
      .set({
        severity: data.severity,
        title: data.title,
        detail: data.detail,
        projectedStockoutDate: data.projectedStockoutDate ?? null,
        forecastConfidence: data.forecastConfidence ?? null,
        recommendedAction: data.recommendedAction ?? null,
        updatedAt: new Date()
      })
      .where(eq(alertHistoryTable.id, existing[0].id))
      .returning();
  } else {
    return await db.insert(alertHistoryTable)
      .values({
        facilityId: data.facilityId,
        medicineId: data.medicineId,
        alertType: data.alertType,
        severity: data.severity,
        title: data.title,
        detail: data.detail,
        projectedStockoutDate: data.projectedStockoutDate ?? null,
        forecastConfidence: data.forecastConfidence ?? null,
        recommendedAction: data.recommendedAction ?? null,
        status: 'active'
      })
      .returning();
  }
}
