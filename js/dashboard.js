import { getDom } from "./dom.js";
import { normalizeText } from "./utils.js";
import {
  loadEquipment,
  loadWorkOrders,
  loadInventory,
  loadVendors,
  loadPurchaseOrders,
  loadSettings
} from "./storage.js";

export async function initDashboard() {
  const dom = getDom();

  let dashboardCache = {
    equipmentList: [],
    workOrders: [],
    inventory: [],
    vendors: [],
    purchaseOrders: [],
    settings: {
      companyName: "",
      defaultLocation: "",
      theme: "default",
      serviceTasks: [],
      serviceTemplates: []
    }
  };

  function createEmptyMessage(text) {
    const div = document.createElement("div");
    div.className = "muted";
    div.textContent = text;
    return div;
  }

  function safeArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function safeObject(value) {
    return value && typeof value === "object" && !Array.isArray(value)
      ? value
      : {};
  }

  function normalizeLower(value) {
    return normalizeText(value).toLowerCase();
  }

  function toNumber(value) {
    const num = Number(value);
    return Number.isFinite(num) ? num : 0;
  }

  function getTodayDateString() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function parseDate(value) {
    if (!value) return null;

    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      return new Date(value.getTime());
    }

    const text = String(value).trim();
    if (!text) return null;

    const parsed = new Date(text);
    if (Number.isNaN(parsed.getTime())) return null;

    return parsed;
  }

  function dateToYMD(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function addDays(date, amount) {
    const next = new Date(date.getTime());
    next.setDate(next.getDate() + amount);
    return next;
  }

  function addWeeks(date, amount) {
    return addDays(date, amount * 7);
  }

  function addMonths(date, amount) {
    const next = new Date(date.getTime());
    next.setMonth(next.getMonth() + amount);
    return next;
  }

  function addYears(date, amount) {
    const next = new Date(date.getTime());
    next.setFullYear(next.getFullYear() + amount);
    return next;
  }

  function addIntervalToDate(date, value, unit) {
    const amount = Math.max(0, toNumber(value));

    if (!(date instanceof Date) || Number.isNaN(date.getTime()) || amount <= 0) {
      return null;
    }

    switch (normalizeLower(unit)) {
      case "day":
      case "days":
        return addDays(date, amount);
      case "week":
      case "weeks":
        return addWeeks(date, amount);
      case "month":
      case "months":
        return addMonths(date, amount);
      case "year":
      case "years":
        return addYears(date, amount);
      default:
        return addDays(date, amount);
    }
  }

  function normalizeServiceTask(task = {}) {
    const legacyLocation = String(task.location || "").trim();

    const locations = Array.isArray(task.locations)
      ? task.locations
          .map(value => String(value || "").trim())
          .filter(Boolean)
      : legacyLocation
        ? [legacyLocation]
        : [];

    const appliesToAllLocations =
      typeof task.appliesToAllLocations === "boolean"
        ? task.appliesToAllLocations
        : locations.length === 0;

    return {
      ...task,
      id: task.id || "",
      task: task.task || "",
      status: task.status || "Active",
      appliesToAllLocations,
      locations: appliesToAllLocations ? [] : [...new Set(locations)],
      dateTrackingMode: task.dateTrackingMode || "every",
      dateEveryValue: task.dateEveryValue || "",
      dateEveryUnit: task.dateEveryUnit || "Days",
      dateOnValue: task.dateOnValue || "",
      dateNoticeValue: task.dateNoticeValue || "7",
      milesTrackingMode: task.milesTrackingMode || "every",
      milesEveryValue: task.milesEveryValue || "",
      milesAtValue: task.milesAtValue || "",
      milesNoticeValue: task.milesNoticeValue || "0",
      linkedTaskId: task.linkedTaskId || "",
      parentTaskId: task.parentTaskId || ""
    };
  }

  async function hydrateDashboardData() {
    try {
      const [
        equipmentList,
        workOrders,
        inventory,
        vendors,
        purchaseOrders,
        settings
      ] = await Promise.all([
        loadEquipment(),
        loadWorkOrders(),
        loadInventory(),
        loadVendors(),
        loadPurchaseOrders(),
        loadSettings()
      ]);

      dashboardCache = {
        equipmentList: safeArray(equipmentList),
        workOrders: safeArray(workOrders),
        inventory: safeArray(inventory),
        vendors: safeArray(vendors),
        purchaseOrders: safeArray(purchaseOrders),
        settings: safeObject(settings)
      };
    } catch (error) {
      console.error("Failed to load dashboard data:", error);
      dashboardCache = {
        equipmentList: [],
        workOrders: [],
        inventory: [],
        vendors: [],
        purchaseOrders: [],
        settings: {
          companyName: "",
          defaultLocation: "",
          theme: "default",
          serviceTasks: [],
          serviceTemplates: []
        }
      };
    }
  }

  function getAllServiceTasks() {
    return safeArray(dashboardCache.settings?.serviceTasks).map(normalizeServiceTask);
  }

  function getServiceTasksForEquipment(eq, allTasks) {
    const equipmentLocation = normalizeLower(eq?.location || "");

    return safeArray(allTasks)
      .filter(task => {
        if (normalizeLower(task.status || "active") === "inactive") {
          return false;
        }

        if (task.appliesToAllLocations) {
          return true;
        }

        const taskLocations = safeArray(task.locations);
        if (!taskLocations.length) {
          return true;
        }

        return taskLocations.some(location => normalizeLower(location) === equipmentLocation);
      })
      .sort((a, b) => {
        const aName = normalizeLower(a.task || "");
        const bName = normalizeLower(b.task || "");
        return aName.localeCompare(bName);
      });
  }

  function getEquipmentCurrentMileage(eq) {
    const candidates = [
      eq?.currentMileage,
      eq?.mileage,
      eq?.odometer,
      eq?.currentMiles,
      eq?.miles
    ];

    for (const candidate of candidates) {
      const value = Number(candidate);
      if (Number.isFinite(value) && value >= 0) {
        return value;
      }
    }

    return null;
  }

  function getEquipmentServiceTrackingMap(eq) {
    const candidates = [
      eq?.serviceTracking,
      eq?.serviceStatus,
      eq?.serviceRecords
    ];

    for (const candidate of candidates) {
      if (candidate && typeof candidate === "object" && !Array.isArray(candidate)) {
        return candidate;
      }
    }

    return {};
  }

  function getTaskTracking(eq, task) {
    const trackingMap = getEquipmentServiceTrackingMap(eq);
    const byId = task?.id ? trackingMap[task.id] : null;

    if (byId && typeof byId === "object" && !Array.isArray(byId)) {
      return byId;
    }

    const taskName = normalizeLower(task?.task || "");
    if (!taskName) return null;

    for (const [key, value] of Object.entries(trackingMap)) {
      if (normalizeLower(key) === taskName) {
        return value && typeof value === "object" && !Array.isArray(value)
          ? value
          : null;
      }
    }

    return null;
  }

  function getTrackingDateValue(tracking) {
    if (!tracking) return "";

    return (
      tracking.lastCompletedDate ||
      tracking.lastServiceDate ||
      tracking.completedDate ||
      tracking.lastDoneDate ||
      tracking.lastDate ||
      ""
    );
  }

  function getTrackingMilesValue(tracking) {
    if (!tracking) return null;

    const candidates = [
      tracking.lastCompletedMiles,
      tracking.lastServiceMiles,
      tracking.completedMiles,
      tracking.lastMiles,
      tracking.lastOdometer,
      tracking.mileage
    ];

    for (const candidate of candidates) {
      const value = Number(candidate);
      if (Number.isFinite(value) && value >= 0) {
        return value;
      }
    }

    return null;
  }

  function evaluateDateStatus(task, tracking) {
    const mode = normalizeLower(task?.dateTrackingMode || "disabled");

    if (mode === "disabled") {
      return { enabled: false, status: "ok", dueDate: null };
    }

    const noticeDays = Math.max(0, toNumber(task?.dateNoticeValue || 0));
    const today = parseDate(getTodayDateString());

    if (!today) {
      return { enabled: false, status: "ok", dueDate: null };
    }

    let dueDate = null;

    if (mode === "on" && task?.dateOnValue) {
      dueDate = parseDate(task.dateOnValue);
    }

    if (mode === "every" && task?.dateEveryValue) {
      const lastCompleted = parseDate(getTrackingDateValue(tracking));
      if (lastCompleted) {
        dueDate = addIntervalToDate(lastCompleted, task.dateEveryValue, task.dateEveryUnit);
      }
    }

    if (!dueDate || Number.isNaN(dueDate.getTime())) {
      return { enabled: true, status: "unknown", dueDate: null };
    }

    const dueDateOnly = parseDate(dateToYMD(dueDate));
    const soonThreshold = addDays(dueDateOnly, -noticeDays);

    if (today > dueDateOnly) {
      return { enabled: true, status: "overdue", dueDate: dueDateOnly };
    }

    if (today >= soonThreshold) {
      return { enabled: true, status: "dueSoon", dueDate: dueDateOnly };
    }

    return { enabled: true, status: "ok", dueDate: dueDateOnly };
  }

  function evaluateMilesStatus(task, tracking, eq) {
    const mode = normalizeLower(task?.milesTrackingMode || "disabled");

    if (mode === "disabled") {
      return { enabled: false, status: "ok", dueMiles: null };
    }

    const currentMiles = getEquipmentCurrentMileage(eq);
    if (currentMiles == null) {
      return { enabled: true, status: "unknown", dueMiles: null };
    }

    const noticeMiles = Math.max(0, toNumber(task?.milesNoticeValue || 0));
    let dueMiles = null;

    if (mode === "at" && task?.milesAtValue) {
      dueMiles = toNumber(task.milesAtValue);
    }

    if (mode === "every" && task?.milesEveryValue) {
      const lastMiles = getTrackingMilesValue(tracking);
      if (lastMiles != null) {
        dueMiles = lastMiles + Math.max(0, toNumber(task.milesEveryValue));
      }
    }

    if (!Number.isFinite(dueMiles) || dueMiles == null || dueMiles <= 0) {
      return { enabled: true, status: "unknown", dueMiles: null };
    }

    if (currentMiles > dueMiles) {
      return { enabled: true, status: "overdue", dueMiles };
    }

    if (currentMiles >= dueMiles - noticeMiles) {
      return { enabled: true, status: "dueSoon", dueMiles };
    }

    return { enabled: true, status: "ok", dueMiles };
  }

  function evaluateTaskReminder(eq, task) {
    const tracking = getTaskTracking(eq, task);
    const dateResult = evaluateDateStatus(task, tracking);
    const milesResult = evaluateMilesStatus(task, tracking, eq);

    const statuses = [dateResult.status, milesResult.status];

    if (statuses.includes("overdue")) {
      return {
        status: "overdue",
        dateResult,
        milesResult,
        tracking
      };
    }

    if (statuses.includes("dueSoon")) {
      return {
        status: "dueSoon",
        dateResult,
        milesResult,
        tracking
      };
    }

    const anyEnabled = dateResult.enabled || milesResult.enabled;
    const anyKnown =
      dateResult.status !== "unknown" ||
      milesResult.status !== "unknown";

    if (anyEnabled && anyKnown) {
      return {
        status: "ok",
        dateResult,
        milesResult,
        tracking
      };
    }

    const legacyPm = normalizeLower(eq?.pm || "");
    if (legacyPm.includes("overdue")) {
      return {
        status: "overdue",
        dateResult,
        milesResult,
        tracking
      };
    }

    if (legacyPm.includes("due soon")) {
      return {
        status: "dueSoon",
        dateResult,
        milesResult,
        tracking
      };
    }

    return {
      status: "ok",
      dateResult,
      milesResult,
      tracking
    };
  }

  function getServiceReminderSummary(equipmentList) {
    const allTasks = getAllServiceTasks();

    let overdueCount = 0;
    let dueSoonCount = 0;
    let totalAssignedTasks = 0;
    let equipmentWithAssignedTasks = 0;

    safeArray(equipmentList).forEach(eq => {
      const tasks = getServiceTasksForEquipment(eq, allTasks);
      if (tasks.length) {
        equipmentWithAssignedTasks += 1;
      }

      totalAssignedTasks += tasks.length;

      tasks.forEach(task => {
        const result = evaluateTaskReminder(eq, task);

        if (result.status === "overdue") overdueCount += 1;
        if (result.status === "dueSoon") dueSoonCount += 1;
      });
    });

    return {
      overdueCount,
      dueSoonCount,
      totalAssignedTasks,
      equipmentWithAssignedTasks
    };
  }

  function renderRecentActivity(workOrders) {
    if (!dom.dashRecentActivity) return;

    dom.dashRecentActivity.innerHTML = "";

    const recentActivity = [...workOrders]
      .sort((a, b) =>
        String(b.date || b.opened || "").localeCompare(
          String(a.date || a.opened || "")
        )
      )
      .slice(0, 5);

    if (!recentActivity.length) {
      dom.dashRecentActivity.appendChild(
        createEmptyMessage("No recent activity yet")
      );
      return;
    }

    recentActivity.forEach(item => {
      const row = document.createElement("div");
      row.className = "activityRow";
      row.innerHTML = `
        <div>
          <strong>${item.workOrderNumber || item.woNumber || "Work Order"}</strong>
          <div class="activityMeta">${item.equipmentNumber || ""}</div>
        </div>
        <div class="activityMeta">${item.status || ""}</div>
      `;
      dom.dashRecentActivity.appendChild(row);
    });
  }

  function renderTopRepairs(workOrders) {
    if (!dom.dashTopRepairs) return;

    dom.dashTopRepairs.innerHTML = "";

    const reasonCounts = {};

    workOrders.forEach(wo => {
      const key = normalizeText(wo.woType || wo.repair || "Other");
      reasonCounts[key] = (reasonCounts[key] || 0) + 1;
    });

    const topReasons = Object.entries(reasonCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    if (!topReasons.length) {
      dom.dashTopRepairs.appendChild(createEmptyMessage("No repair data yet"));
      return;
    }

    topReasons.forEach(([reason, count]) => {
      const row = document.createElement("div");
      row.className = "reasonRow";
      row.innerHTML = `
        <span>${reason}</span>
        <span class="badge blue">${count}</span>
      `;
      dom.dashTopRepairs.appendChild(row);
    });
  }

  async function updateDashboard() {
    await hydrateDashboardData();

    const equipmentList = safeArray(dashboardCache.equipmentList);
    const workOrders = safeArray(dashboardCache.workOrders);
    const inventory = safeArray(dashboardCache.inventory);
    const vendors = safeArray(dashboardCache.vendors);
    const purchaseOrders = safeArray(dashboardCache.purchaseOrders);

    const activeCount = equipmentList.filter(
      eq => (eq.status || "") === "Active"
    ).length;
    const inactiveCount = equipmentList.filter(
      eq => (eq.status || "") === "Inactive"
    ).length;
    const inRepairCount = equipmentList.filter(
      eq => (eq.status || "") === "In Repair"
    ).length;
    const outOfServiceCount = equipmentList.filter(
      eq => (eq.status || "") === "Out of Service"
    ).length;

    if (dom.dashActiveCount) dom.dashActiveCount.textContent = activeCount;
    if (dom.dashInactiveCount) dom.dashInactiveCount.textContent = inactiveCount;
    if (dom.dashInShopCount) dom.dashInShopCount.textContent = inRepairCount;
    if (dom.dashOutOfServiceCount) {
      dom.dashOutOfServiceCount.textContent = outOfServiceCount;
    }

    const woOpen = workOrders.filter(
      wo => (wo.status || "") === "Open"
    ).length;

    const woPending = workOrders.filter(wo =>
      ["Pending", "In Progress"].includes(wo.status || "")
    ).length;

    const woCompleted = workOrders.filter(wo =>
      ["Completed", "Closed"].includes(wo.status || "")
    ).length;

    if (dom.dashWOOpen) dom.dashWOOpen.textContent = woOpen;
    if (dom.dashWOPending) dom.dashWOPending.textContent = woPending;
    if (dom.dashWOCompleted) dom.dashWOCompleted.textContent = woCompleted;

    const totalWOCost = workOrders.reduce(
      (sum, wo) => sum + Number(wo.grandTotal || wo.total || 0),
      0
    );

    const totalPOCost = purchaseOrders.reduce(
      (sum, po) => sum + Number(po.total || 0),
      0
    );

    if (dom.dashTotalWOCost) {
      dom.dashTotalWOCost.textContent = `$${totalWOCost.toFixed(2)}`;
    }

    if (dom.dashTotalPOCost) {
      dom.dashTotalPOCost.textContent = `$${totalPOCost.toFixed(2)}`;
    }

    if (dom.dashCombinedCost) {
      dom.dashCombinedCost.textContent = `$${(totalWOCost + totalPOCost).toFixed(2)}`;
    }

    if (dom.dashServiceCostMonth) {
      dom.dashServiceCostMonth.textContent = `$${totalWOCost.toFixed(2)}`;
    }

    if (dom.dashServiceCostTotal) {
      dom.dashServiceCostTotal.textContent = `$${totalWOCost.toFixed(2)}`;
    }

    if (dom.dashInventoryCount) dom.dashInventoryCount.textContent = inventory.length;
    if (dom.dashVendorCount) dom.dashVendorCount.textContent = vendors.length;
    if (dom.dashPOCount) dom.dashPOCount.textContent = purchaseOrders.length;
    if (dom.dashTotalEquipment) dom.dashTotalEquipment.textContent = equipmentList.length;
    if (dom.dashRepairHistoryCount) dom.dashRepairHistoryCount.textContent = workOrders.length;

    const assignedCount = equipmentList.filter(
      eq => normalizeText(eq.business)
    ).length;
    const unassignedCount = equipmentList.length - assignedCount;

    if (dom.dashAssignedCount) dom.dashAssignedCount.textContent = assignedCount;
    if (dom.dashUnassignedCount) dom.dashUnassignedCount.textContent = unassignedCount;

    const avgResolveList = workOrders.filter(
      wo => Number(wo.resolveDays || 0) > 0
    );

    const avgResolveDays = avgResolveList.length
      ? avgResolveList.reduce(
          (sum, wo) => sum + Number(wo.resolveDays || 0),
          0
        ) / avgResolveList.length
      : 0;

    if (dom.dashAvgResolveDays) {
      dom.dashAvgResolveDays.textContent = avgResolveDays.toFixed(1);
    }

    const serviceSummary = getServiceReminderSummary(equipmentList);

    if (dom.dashOverduePM) {
      dom.dashOverduePM.textContent = serviceSummary.overdueCount;
    }

    if (dom.dashDueSoonPM) {
      dom.dashDueSoonPM.textContent = serviceSummary.dueSoonCount;
    }

    const openIssues = workOrders.filter(wo =>
      ["Open", "Pending", "In Progress"].includes(wo.status || "")
    ).length;

    const overdueIssues = workOrders.filter(
      wo => normalizeText(wo.priority).toLowerCase() === "overdue"
    ).length;

    if (dom.dashOpenIssues) dom.dashOpenIssues.textContent = openIssues;
    if (dom.dashOverdueIssues) dom.dashOverdueIssues.textContent = overdueIssues;

    renderRecentActivity(workOrders);
    renderTopRepairs(workOrders);
  }

  await updateDashboard();

  return {
    updateDashboard
  };
}