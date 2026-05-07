import { getDom } from "./dom.js";
import { normalizeText, formatMoney, escapeHtml } from "./utils.js";
import {
  loadEquipment,
  loadWorkOrders,
  loadPurchaseOrders,
  loadInventory,
  loadSettings,
  saveSettings,
  loadUsers,
  getLoggedInUsername,
  getLoggedInUser
} from "./storage.js";
import {
  buildDashboardDueServicesData,
  parseDate,
  dateToYMD
} from "./service-tracking.js";

export async function initDashboard() {
  const dom = getDom();

  const DASHBOARD_LAYOUT_KEY = "fleetDashboardLayout";
  const DASHBOARD_WIDGETS_KEY = "fleetDashboardWidgets";

  const DEFAULT_WIDGET_ORDER = [
    "equipmentServices",
    "weatherSummary",
    "vehicleStatus",
    "openIssues",
    "activeWorkOrders",
    "recentActivity",
    "inventoryAlerts",
    "serviceCosts"
  ];

  const DEFAULT_WIDGET_SPANS = {
    equipmentServices: 8,
    weatherSummary: 4,
    vehicleStatus: 4,
    openIssues: 4,
    activeWorkOrders: 4,
    recentActivity: 4,
    inventoryAlerts: 4,
    serviceCosts: 4
  };

  const DEFAULT_VISIBLE_WIDGETS = {
    equipmentServices: true,
    weatherSummary: true,
    vehicleStatus: true,
    openIssues: true,
    activeWorkOrders: true,
    recentActivity: true,
    inventoryAlerts: true,
    serviceCosts: true
  };

  const WIDGET_LABELS = {
    equipmentServices: "Equipment Services / PM Compliance",
    weatherSummary: "Weather",
    vehicleStatus: "Vehicle Status",
    openIssues: "Open Issues",
    activeWorkOrders: "Active Work Orders",
    recentActivity: "Recent Activity",
    inventoryAlerts: "Inventory Alerts",
    serviceCosts: "Service Costs"
  };

  let dashboardCache = {
    equipmentList: [],
    workOrders: [],
    purchaseOrders: [],
    inventory: [],
    settings: {
      companyName: "",
      defaultLocation: "",
      theme: "default",
      weatherZip: "62201",
      serviceTasks: [],
      serviceTemplates: []
    }
  };

  let dueServicesActiveTab = "due";
  let dueServicesActiveCategory = "Trucks";

  let dueServicesEventsBound = false;
let syncEventsBound = false;
let editorEventsBound = false;
let searchEventsBound = false;
let weatherZipEventsBound = false;

  function safeArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function safeObject(value) {
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  }

  function normalizeLower(value) {
    return normalizeText(value).toLowerCase();
  }

  function toNumber(value) {
    const num = Number(value);
    return Number.isFinite(num) ? num : 0;
  }

  function createEmptyMessage(text) {
    const div = document.createElement("div");
    div.className = "muted dashboardEmptyMessage";
    div.textContent = text;
    return div;
  }

  function createEmptyTableRow(text, colSpan = 5) {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td colspan="${colSpan}" class="dashboardEmptyTableCell">
        ${escapeHtml(text)}
      </td>
    `;
    return row;
  }

  function setText(idOrElement, value) {
    const el =
      typeof idOrElement === "string"
        ? document.getElementById(idOrElement)
        : idOrElement;

    if (el) {
      el.textContent = String(value ?? "");
    }
  }

  function normalizeZipInput(value) {
  return String(value || "")
    .trim()
    .replace(/[^\d]/g, "")
    .slice(0, 5);
}

  function getCurrentPermissions() {
    const loggedInUser = getLoggedInUser();
    const permissions =
      loggedInUser &&
      typeof loggedInUser === "object" &&
      loggedInUser.permissions &&
      typeof loggedInUser.permissions === "object"
        ? loggedInUser.permissions
        : {};

    return {
      dashboardView: true,
      equipmentView: true,
      workOrdersView: true,
      inventoryView: true,
      purchaseOrdersAccess: true,
      ...permissions
    };
  }

  function canViewDashboard() {
    return !!getCurrentPermissions().dashboardView;
  }

  function canViewEquipment() {
    return !!getCurrentPermissions().equipmentView;
  }

  function canViewWorkOrders() {
    return !!getCurrentPermissions().workOrdersView;
  }

  function canViewInventory() {
    return !!getCurrentPermissions().inventoryView;
  }

  function canViewPurchaseOrders() {
    return !!getCurrentPermissions().purchaseOrdersAccess;
  }

  function getTodayDateString() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function getGreetingByTime() {
    const hour = new Date().getHours();

    if (hour < 12) return "Good Morning";
    if (hour < 18) return "Good Afternoon";
    return "Good Evening";
  }

  function getDashboardWidgets() {
    const grid = dom.dashboardGrid || document.getElementById("dashboardGrid");
    if (!grid) return [];

    return Array.from(grid.querySelectorAll("[data-widget-id]"));
  }

  function getDueServicesTargets() {
    const section =
      dom.dashDueServicesSection ||
      document.getElementById("dashDueServicesSection") ||
      document.getElementById("equipmentServicesSection") ||
      document.getElementById("equipmentServicesCard") ||
      null;

    const tabs =
      dom.dashDueServicesTabs ||
      document.getElementById("dashDueServicesTabs") ||
      section?.querySelector("#dashDueServicesTabs") ||
      null;

    const categories =
      dom.dashDueServicesCategories ||
      document.getElementById("dashDueServicesCategories") ||
      section?.querySelector("#dashDueServicesCategories") ||
      null;

    const list =
      dom.dashDueServicesList ||
      dom.equipmentServicesList ||
      document.getElementById("dashDueServicesList") ||
      document.getElementById("equipmentServicesList") ||
      section?.querySelector("#dashDueServicesList") ||
      null;

    return { section, tabs, categories, list };
  }

  function getWeatherTargets() {
    const section =
      dom.dashWeatherSection ||
      document.getElementById("dashWeatherSection") ||
      null;

    const summary =
      dom.dashWeatherSummary ||
      document.getElementById("dashWeatherSummary") ||
      section?.querySelector("#dashWeatherSummary") ||
      null;

    return { section, summary };
  }

  function loadDashboardWidgetVisibility() {
    try {
      const parsed = JSON.parse(localStorage.getItem(DASHBOARD_WIDGETS_KEY) || "{}");
      return {
        ...DEFAULT_VISIBLE_WIDGETS,
        ...safeObject(parsed)
      };
    } catch (error) {
      console.error("Unable to load dashboard widget visibility:", error);
      return { ...DEFAULT_VISIBLE_WIDGETS };
    }
  }

  function saveDashboardWidgetVisibility(visibility) {
    localStorage.setItem(
      DASHBOARD_WIDGETS_KEY,
      JSON.stringify({
        ...DEFAULT_VISIBLE_WIDGETS,
        ...safeObject(visibility)
      })
    );
  }

  function getSafeSpan(span) {
    const numeric = Number(span) || 4;

    if (numeric <= 4) return 4;
    if (numeric <= 6) return 6;
    if (numeric <= 8) return 8;
    return 12;
  }

  function applyWidgetSpan(widget, span) {
    if (!widget) return;

    const safeSpan = getSafeSpan(span);
    widget.dataset.span = String(safeSpan);
    widget.dataset.widgetSpan = String(safeSpan);

    widget.classList.remove(
      "widgetSpan1",
      "widgetSpan2",
      "widgetSpan4",
      "widgetSpan6",
      "widgetSpan8",
      "widgetSpan12"
    );

    widget.classList.add(`widgetSpan${safeSpan}`);
    widget.style.gridColumn = `span ${safeSpan}`;
  }

  function applyWidgetVisibility() {
    const visibility = loadDashboardWidgetVisibility();

    getDashboardWidgets().forEach(widget => {
      const widgetId = String(widget.dataset.widgetId || "");
      const isVisible = visibility[widgetId] !== false;
      widget.hidden = !isVisible;
      widget.style.display = isVisible ? "" : "none";
    });
  }

  function applyDashboardLayout() {
    const grid = dom.dashboardGrid || document.getElementById("dashboardGrid");
    if (!grid) return;

    const widgetMap = new Map();

    getDashboardWidgets().forEach(widget => {
      const widgetId = String(widget.dataset.widgetId || "");
      if (widgetId) widgetMap.set(widgetId, widget);
    });

    DEFAULT_WIDGET_ORDER.forEach(widgetId => {
      const widget = widgetMap.get(widgetId);
      if (!widget) return;

      grid.appendChild(widget);
      applyWidgetSpan(widget, DEFAULT_WIDGET_SPANS[widgetId] ?? 4);
      widget.removeAttribute("draggable");
    });

    applyWidgetVisibility();
  }

  function resetDashboardLayout() {
    localStorage.removeItem(DASHBOARD_LAYOUT_KEY);
    localStorage.removeItem(DASHBOARD_WIDGETS_KEY);

    getDashboardWidgets().forEach(widget => {
      const widgetId = String(widget.dataset.widgetId || "");
      applyWidgetSpan(widget, DEFAULT_WIDGET_SPANS[widgetId] ?? 4);
      widget.hidden = false;
      widget.style.display = "";
      widget.removeAttribute("draggable");
    });

    applyDashboardLayout();
    renderDashboardEditorList();
  }

  function openDashboardEditor() {
    const modal = dom.dashboardEditorModal || document.getElementById("dashboardEditorModal");
    if (!modal) return;

    renderDashboardEditorList();
    modal.classList.add("show");
    modal.setAttribute("aria-hidden", "false");
  }

  function closeDashboardEditor() {
    const modal = dom.dashboardEditorModal || document.getElementById("dashboardEditorModal");
    if (!modal) return;

    modal.classList.remove("show");
    modal.setAttribute("aria-hidden", "true");
  }

  function renderDashboardEditorList() {
    const list =
      dom.dashboardWidgetEditorList ||
      dom.dashboardWidgetList ||
      document.getElementById("dashboardWidgetEditorList") ||
      document.getElementById("dashboardWidgetList");

    if (!list) return;

    const visibility = loadDashboardWidgetVisibility();
    const widgets = getDashboardWidgets();

    const orderedWidgetIds = DEFAULT_WIDGET_ORDER.filter(widgetId =>
      widgets.some(widget => String(widget.dataset.widgetId || "") === widgetId)
    );

    list.innerHTML = "";

    orderedWidgetIds.forEach(widgetId => {
      const row = document.createElement("label");
      row.className = "dashboardEditorOption";

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.value = widgetId;
      checkbox.checked = visibility[widgetId] !== false;

      const textWrap = document.createElement("span");
      textWrap.className = "dashboardEditorOptionText";

      const title = document.createElement("span");
      title.className = "dashboardEditorOptionTitle";
      title.textContent = WIDGET_LABELS[widgetId] || widgetId;

      const hint = document.createElement("span");
      hint.className = "dashboardEditorOptionHint";
      hint.textContent = "Show this dashboard widget";

      textWrap.appendChild(title);
      textWrap.appendChild(hint);

      row.appendChild(checkbox);
      row.appendChild(textWrap);
      list.appendChild(row);
    });
  }

  function saveDashboardEditorSelection() {
    const list =
      dom.dashboardWidgetEditorList ||
      dom.dashboardWidgetList ||
      document.getElementById("dashboardWidgetEditorList") ||
      document.getElementById("dashboardWidgetList");

    if (!list) return;

    const nextVisibility = { ...DEFAULT_VISIBLE_WIDGETS };

    Array.from(list.querySelectorAll('input[type="checkbox"]')).forEach(input => {
      const widgetId = String(input.value || "");
      if (!widgetId) return;
      nextVisibility[widgetId] = !!input.checked;
    });

    saveDashboardWidgetVisibility(nextVisibility);
    applyWidgetVisibility();
    closeDashboardEditor();
  }

  function bindDashboardEditorEvents() {
    if (editorEventsBound) return;
    editorEventsBound = true;

    const openBtn = dom.editDashboardBtn || document.getElementById("editDashboardBtn");
    const modal = dom.dashboardEditorModal || document.getElementById("dashboardEditorModal");
    const cancelBtn =
      dom.dashboardEditorCancelBtn ||
      document.getElementById("dashboardEditorCancelBtn");
    const saveBtn =
      dom.dashboardEditorSaveBtn ||
      dom.saveDashboardEditorBtn ||
      document.getElementById("dashboardEditorSaveBtn") ||
      document.getElementById("saveDashboardEditorBtn");
    const closeBtn =
      dom.dashboardEditorCloseBtn ||
      dom.closeDashboardEditorBtn ||
      document.getElementById("dashboardEditorCloseBtn") ||
      document.getElementById("closeDashboardEditorBtn");
    const resetBtn =
      dom.dashboardEditorResetBtn ||
      dom.resetDashboardLayoutBtn ||
      document.getElementById("dashboardEditorResetBtn") ||
      document.getElementById("resetDashboardLayoutBtn");

    openBtn?.addEventListener("click", () => {
      openDashboardEditor();
    });

    cancelBtn?.addEventListener("click", () => {
      closeDashboardEditor();
    });

    closeBtn?.addEventListener("click", () => {
      closeDashboardEditor();
    });

    saveBtn?.addEventListener("click", () => {
      saveDashboardEditorSelection();
    });

    resetBtn?.addEventListener("click", () => {
      resetDashboardLayout();
    });

    modal?.addEventListener("click", event => {
      if (event.target === modal) {
        closeDashboardEditor();
      }
    });

    document.addEventListener("keydown", event => {
      if (event.key !== "Escape") return;
      if (modal?.classList.contains("show")) {
        closeDashboardEditor();
      }
    });
  }

  function bindDashboardSearchEvents() {
    if (searchEventsBound) return;
    searchEventsBound = true;

    const searchInput = document.getElementById("dashboardSearchInput");
    if (!searchInput) return;

    searchInput.addEventListener("input", () => {
      renderRecentActivity(dashboardCache.workOrders);
      renderInventoryAlerts(dashboardCache.inventory);
      renderDueServicesSection(dashboardCache.equipmentList);
    });
  }

  function getDashboardSearchTerm() {
    return normalizeLower(document.getElementById("dashboardSearchInput")?.value || "");
  }

  function itemMatchesSearch(...values) {
    const searchTerm = getDashboardSearchTerm();
    if (!searchTerm) return true;

    return values.some(value => normalizeLower(value).includes(searchTerm));
  }

  async function renderDashboardGreeting() {
    const greetingEl =
      dom.dashboardGreeting ||
      document.getElementById("dashboardGreeting") ||
      dom.dashboardTitle ||
      document.getElementById("dashboardTitle") ||
      document.getElementById("dashboardPageTitle");

    if (!greetingEl) return;

    const currentUsername = normalizeText(getLoggedInUsername());

    if (!currentUsername) {
      greetingEl.textContent = "Dashboard";
      return;
    }

    try {
      const users = safeArray(await loadUsers());
      const currentUser = users.find(
        user => normalizeLower(user?.username) === currentUsername.toLowerCase()
      );

      const firstName = normalizeText(currentUser?.firstName);
      greetingEl.textContent = firstName
        ? `${getGreetingByTime()}, ${firstName}`
        : "Dashboard";
    } catch (error) {
      console.error("Failed to render dashboard greeting:", error);
      greetingEl.textContent = "Dashboard";
    }
  }

  async function hydrateDashboardData() {
    try {
      const [equipmentList, workOrders, purchaseOrders, inventory, settings] = await Promise.all([
        loadEquipment(),
        loadWorkOrders(),
        loadPurchaseOrders(),
        loadInventory(),
        loadSettings()
      ]);

      dashboardCache = {
        equipmentList: safeArray(equipmentList),
        workOrders: safeArray(workOrders),
        purchaseOrders: safeArray(purchaseOrders),
        inventory: safeArray(inventory),
        settings: {
          companyName: "",
          defaultLocation: "",
          theme: "default",
          weatherZip: "62201",
          serviceTasks: [],
          serviceTemplates: [],
          ...safeObject(settings),
          weatherZip: normalizeText(settings?.weatherZip || "62201") || "62201",
          serviceTasks: safeArray(settings?.serviceTasks),
          serviceTemplates: safeArray(settings?.serviceTemplates)
        }
      };
    } catch (error) {
      console.error("Failed to load dashboard data:", error);

      dashboardCache = {
        equipmentList: [],
        workOrders: [],
        purchaseOrders: [],
        inventory: [],
        settings: {
          companyName: "",
          defaultLocation: "",
          theme: "default",
          weatherZip: "62201",
          serviceTasks: [],
          serviceTemplates: []
        }
      };
    }
  }

  function getOpenWorkOrders(workOrders) {
    return safeArray(workOrders).filter(wo => {
      const status = String(wo.status || "").trim();
      return !["Completed", "Closed", "Canceled", "Cancelled"].includes(status);
    });
  }

  function getLowStockInventoryItems(inventory) {
    return safeArray(inventory).filter(item => {
      const quantity = toNumber(item.quantity);
      const reorderPoint = toNumber(item.reorderPoint || item.minimumQuantity);
      return reorderPoint > 0 && quantity <= reorderPoint;
    });
  }

  function getBucketOrder() {
    return ["due", "dueIn30Days", "overdue"];
  }

  function getCategoryOrder() {
    return ["Trucks", "Trailers", "O/O's"];
  }

  function getDueServicesData(equipmentList) {
    return buildDashboardDueServicesData(equipmentList, dashboardCache.settings);
  }

  function getDueServicesCounts(data) {
    return {
      due: getCategoryOrder().reduce(
        (sum, category) => sum + safeArray(data?.due?.[category]).length,
        0
      ),
      dueIn30Days: getCategoryOrder().reduce(
        (sum, category) => sum + safeArray(data?.dueIn30Days?.[category]).length,
        0
      ),
      overdue: getCategoryOrder().reduce(
        (sum, category) => sum + safeArray(data?.overdue?.[category]).length,
        0
      )
    };
  }

  function renderKpis(equipmentList, workOrders, inventory) {
    const activeUnits = safeArray(equipmentList).filter(
      eq => String(eq.status || "").trim() === "Active"
    ).length;

    const openWorkOrders = getOpenWorkOrders(workOrders).length;
    const dueData = getDueServicesData(equipmentList);
    const dueCounts = getDueServicesCounts(dueData);
    const lowStockParts = getLowStockInventoryItems(inventory).length;

    setText("dashKpiActiveUnits", activeUnits);
    setText("dashKpiOpenWorkOrders", openWorkOrders);
    setText("dashKpiDueServices", dueCounts.due);
    setText("dashKpiOverdueServices", dueCounts.overdue);
    setText("dashKpiLowStockParts", lowStockParts);
  }

  function renderVehicleStatus(equipmentList) {
    const activeCount = safeArray(equipmentList).filter(
      eq => String(eq.status || "").trim() === "Active"
    ).length;

    const inactiveCount = safeArray(equipmentList).filter(
      eq => String(eq.status || "").trim() === "Inactive"
    ).length;

    const inRepairCount = safeArray(equipmentList).filter(
      eq => String(eq.status || "").trim() === "In Repair"
    ).length;

    setText(dom.dashActiveCount || document.getElementById("dashActiveCount"), activeCount);
    setText(dom.dashInactiveCount || document.getElementById("dashInactiveCount"), inactiveCount);
    setText(
      dom.dashInRepairCount ||
        dom.dashInShopCount ||
        document.getElementById("dashInRepairCount") ||
        document.getElementById("dashInShopCount"),
      inRepairCount
    );
  }

  function renderWorkOrderSummary(workOrders) {
    const woOpen = safeArray(workOrders).filter(
      wo => String(wo.status || "").trim() === "Open"
    ).length;

    const woPending = safeArray(workOrders).filter(wo =>
      ["Pending", "In Progress", "Manager Review"].includes(String(wo.status || "").trim())
    ).length;

    const woCompleted = safeArray(workOrders).filter(wo =>
      ["Completed", "Closed"].includes(String(wo.status || "").trim())
    ).length;

    setText(dom.dashWOOpen || document.getElementById("dashWOOpen"), woOpen);
    setText(dom.dashWOPending || document.getElementById("dashWOPending"), woPending);
    setText(dom.dashWOCompleted || document.getElementById("dashWOCompleted"), woCompleted);
  }

  function renderOpenIssues(workOrders) {
    const openIssues = getOpenWorkOrders(workOrders).length;

    const pendingIssues = safeArray(workOrders).filter(wo =>
      ["Pending", "In Progress", "Manager Review"].includes(String(wo.status || "").trim())
    ).length;

    const overdueIssues = safeArray(workOrders).filter(wo => {
      const opened = parseDate(wo.opened || wo.date || wo.woDate);
      const status = String(wo.status || "").trim();

      if (!opened) return false;
      if (["Completed", "Closed", "Canceled", "Cancelled"].includes(status)) return false;

      const ageInDays = Math.floor(
        (parseDate(getTodayDateString()) - parseDate(dateToYMD(opened))) /
          (1000 * 60 * 60 * 24)
      );

      return ageInDays > 7;
    }).length;

    setText(dom.dashOpenIssues || document.getElementById("dashOpenIssues"), openIssues);
    setText(dom.dashOverdueIssues || document.getElementById("dashOverdueIssues"), overdueIssues);
    setText(document.getElementById("dashPendingIssues"), pendingIssues);
  }

  function getWorkOrderCost(wo) {
    return toNumber(wo.total || wo.totalCost || wo.totalLabor + wo.totalParts);
  }

  function getPurchaseOrderCost(po) {
    return toNumber(po.total || po.totalCost || po.grandTotal || po.amount);
  }

  function renderCostSummary(workOrders, purchaseOrders) {
    const workOrderCosts = safeArray(workOrders).reduce(
      (sum, wo) => sum + getWorkOrderCost(wo),
      0
    );

    const purchaseOrderCosts = safeArray(purchaseOrders).reduce(
      (sum, po) => sum + getPurchaseOrderCost(po),
      0
    );

    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    const workOrderCostsThisMonth = safeArray(workOrders).reduce((sum, wo) => {
      const rawDate = wo.completed || wo.closed || wo.updatedAt || wo.opened || wo.date || wo.woDate;
      const parsed = parseDate(rawDate);
      if (!parsed) return sum;
      if (parsed.getMonth() !== currentMonth || parsed.getFullYear() !== currentYear) return sum;
      return sum + getWorkOrderCost(wo);
    }, 0);

    setText(
      dom.dashMonthServiceCost ||
        dom.dashServiceCostMonth ||
        document.getElementById("dashMonthServiceCost") ||
        document.getElementById("dashServiceCostMonth"),
      formatMoney(workOrderCostsThisMonth)
    );

    setText(
      dom.dashYearServiceCost ||
        dom.dashServiceCostTotal ||
        document.getElementById("dashYearServiceCost") ||
        document.getElementById("dashServiceCostTotal"),
      formatMoney(workOrderCosts)
    );

    setText(dom.dashTotalWOCost || document.getElementById("dashTotalWOCost"), formatMoney(workOrderCosts));
    setText(dom.dashTotalPOCost || document.getElementById("dashTotalPOCost"), formatMoney(purchaseOrderCosts));
    setText(dom.dashCombinedCost || document.getElementById("dashCombinedCost"), formatMoney(workOrderCosts + purchaseOrderCosts));

    renderServiceCostChart(workOrders);
  }

  function getMonthKey(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    return `${year}-${month}`;
  }

  function getMonthLabel(date) {
    return date.toLocaleDateString(undefined, {
      month: "short",
      year: "2-digit"
    });
  }

  function renderServiceCostChart(workOrders) {
    const chart = document.getElementById("dashServiceCostChart");
    if (!chart) return;

    const months = [];
    const now = new Date();

    for (let i = 5; i >= 0; i -= 1) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({
        key: getMonthKey(date),
        label: getMonthLabel(date),
        total: 0
      });
    }

    const monthMap = new Map(months.map(month => [month.key, month]));

    safeArray(workOrders).forEach(wo => {
      const rawDate = wo.completed || wo.closed || wo.updatedAt || wo.opened || wo.date || wo.woDate;
      const parsed = parseDate(rawDate);
      if (!parsed) return;

      const key = getMonthKey(parsed);
      const month = monthMap.get(key);
      if (!month) return;

      month.total += getWorkOrderCost(wo);
    });

    const maxValue = Math.max(...months.map(month => month.total), 1);

    chart.innerHTML = months
      .map(month => {
        const height = Math.max(8, Math.round((month.total / maxValue) * 100));

        return `
          <div class="dashboardCostBarItem">
            <div class="dashboardCostBarTrack">
              <div class="dashboardCostBar" style="height: ${height}%"></div>
            </div>
            <div class="dashboardCostBarLabel">${escapeHtml(month.label)}</div>
          </div>
        `;
      })
      .join("");
  }

  function formatActivityDate(item) {
    const rawDate = item.updatedAt || item.completed || item.closed || item.opened || item.date || item.woDate;
    const parsed = parseDate(rawDate);

    if (!parsed) return "";

    return parsed.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric"
    });
  }

  function renderRecentActivity(workOrders) {
    const container =
      dom.dashRecentActivity ||
      document.getElementById("dashRecentActivity") ||
      document.getElementById("recentActivityList");

    if (!container) return;

    container.innerHTML = "";

    const sorted = safeArray(workOrders)
      .filter(item =>
        itemMatchesSearch(
          item.workOrderNumber,
          item.woNumber,
          item.number,
          item.unit,
          item.equipmentNumber,
          item.status,
          item.notes
        )
      )
      .slice()
      .sort((a, b) => {
        const aDate = parseDate(a.updatedAt || a.completed || a.closed || a.opened || a.date || a.woDate);
        const bDate = parseDate(b.updatedAt || b.completed || b.closed || b.opened || b.date || b.woDate);
        return (bDate?.getTime() || 0) - (aDate?.getTime() || 0);
      })
      .slice(0, 5);

    if (!sorted.length) {
      container.appendChild(createEmptyMessage("No recent work order activity"));
      return;
    }

    sorted.forEach(item => {
      const row = document.createElement("div");
      row.className = "activityRow dashboardActivityRow";

      const title =
        item.workOrderNumber ||
        item.woNumber ||
        item.number ||
        "Work Order";

      const unit =
        item.unit ||
        item.equipmentNumber ||
        item.equipmentId ||
        "";

      row.innerHTML = `
        <div class="dashboardActivityIcon">✓</div>
        <div class="dashboardActivityContent">
          <div class="dueServicesRowTitle">${escapeHtml(title)}</div>
          <div class="activityMeta">
            ${unit ? `Unit ${escapeHtml(unit)} • ` : ""}
            ${escapeHtml(item.status || "Updated")}
          </div>
        </div>
        <div class="activityMeta">${escapeHtml(formatActivityDate(item))}</div>
      `;

      container.appendChild(row);
    });
  }

  function getServiceStatusLabel(bucket) {
    if (bucket === "overdue") return "Overdue";
    if (bucket === "dueIn30Days") return "Due in 30 Days";
    return "Due";
  }

  function getServiceStatusClass(bucket) {
    if (bucket === "overdue") return "red";
    if (bucket === "dueIn30Days") return "gold";
    return "blue";
  }

  function ensureDueServicesStateIsValid(data) {
    if (!getBucketOrder().includes(dueServicesActiveTab)) {
      dueServicesActiveTab = "due";
    }

    const bucketData = safeObject(data?.[dueServicesActiveTab]);

    if (!bucketData[dueServicesActiveCategory]) {
      dueServicesActiveCategory = "Trucks";
    }
  }

  function renderDueServicesTabs(data) {
    const { tabs } = getDueServicesTargets();
    if (!tabs) return;

    const counts = getDueServicesCounts(data);

    const labelMap = {
      due: "Due",
      dueIn30Days: "Due in 30 Days",
      overdue: "Overdue"
    };

    tabs.innerHTML = getBucketOrder()
      .map(bucket => {
        const isActive = bucket === dueServicesActiveTab;
        const badgeClass = getServiceStatusClass(bucket);

        return `
          <button
            type="button"
            class="dueServicesTabBtn ${isActive ? "active" : ""}"
            data-due-services-tab="${bucket}"
          >
            ${labelMap[bucket]}
            <span class="badge ${badgeClass}">${counts[bucket]}</span>
          </button>
        `;
      })
      .join("");
  }

  function renderDueServicesCategories(data) {
    const { categories } = getDueServicesTargets();
    if (!categories) return;

    const activeGroup = safeObject(data?.[dueServicesActiveTab]);

    categories.innerHTML = getCategoryOrder()
      .map(category => {
        const count = safeArray(activeGroup[category]).length;
        const isActive = category === dueServicesActiveCategory;

        return `
          <button
            type="button"
            class="dueServicesCategoryBtn ${isActive ? "active" : ""}"
            data-due-services-category="${category}"
          >
            ${category}
            <span class="dueServicesCount">${count}</span>
          </button>
        `;
      })
      .join("");
  }

  function getOwnerLabel(item) {
    return (
      normalizeText(item.owner) ||
      normalizeText(item.business) ||
      normalizeText(item.assignee) ||
      "Company"
    );
  }

  function getLastDoneLabel(item) {
    return (
      normalizeText(item.lastCompletedDisplay) ||
      normalizeText(item.lastCompleted) ||
      normalizeText(item.completedDate) ||
      "No history"
    );
  }

  function renderDueServicesList(data) {
    const { list } = getDueServicesTargets();
    if (!list) return;

    const activeBucket = safeObject(data?.[dueServicesActiveTab]);
    const items = safeArray(activeBucket[dueServicesActiveCategory])
      .filter(item =>
        itemMatchesSearch(
          item.unit,
          item.serviceLabel,
          item.location,
          item.type,
          item.dueReason,
          item.lastCompletedDisplay
        )
      );

    list.innerHTML = "";

    if (!items.length) {
      list.appendChild(createEmptyTableRow("No equipment currently matches this filter."));
      return;
    }

    items.forEach(item => {
      const row = document.createElement("tr");
      const statusLabel = getServiceStatusLabel(dueServicesActiveTab);
      const statusClass = getServiceStatusClass(dueServicesActiveTab);

      row.innerHTML = `
        <td>
          <strong>${escapeHtml(item.unit || "Unit")}</strong>
          ${
            item.location
              ? `<div class="dashboardTableSubtext">${escapeHtml(item.location)}</div>`
              : ""
          }
        </td>
        <td>${escapeHtml(item.serviceLabel || "Service")}</td>
        <td>
          <span class="badge ${statusClass}">${escapeHtml(statusLabel)}</span>
        </td>
        <td>${escapeHtml(getLastDoneLabel(item))}</td>
        <td>${escapeHtml(getOwnerLabel(item))}</td>
      `;

      list.appendChild(row);
    });
  }

  function renderDueServicesSection(equipmentList) {
    const { section, tabs, categories, list } = getDueServicesTargets();
    if (!section && !tabs && !categories && !list) return;

    if (!canViewEquipment()) {
      if (tabs) tabs.innerHTML = "";
      if (categories) categories.innerHTML = "";
      if (list) {
        list.innerHTML = "";
        list.appendChild(createEmptyTableRow("You do not have access to equipment service reminders."));
      }
      return;
    }

    const data = getDueServicesData(equipmentList);
    ensureDueServicesStateIsValid(data);
    renderDueServicesTabs(data);
    renderDueServicesCategories(data);
    renderDueServicesList(data);
  }

  function renderInventoryAlerts(inventory) {
    const container = document.getElementById("dashInventoryAlerts");
    if (!container) return;

    container.innerHTML = "";

    if (!canViewInventory()) {
      container.appendChild(createEmptyMessage("You do not have access to inventory alerts."));
      return;
    }

    const lowStock = getLowStockInventoryItems(inventory)
      .filter(item =>
        itemMatchesSearch(
          item.name,
          item.itemName,
          item.partNumber,
          item.category,
          item.location,
          item.vendor
        )
      )
      .sort((a, b) => {
        const aQty = toNumber(a.quantity);
        const bQty = toNumber(b.quantity);
        return aQty - bQty;
      })
      .slice(0, 5);

    if (!lowStock.length) {
      container.appendChild(createEmptyMessage("No low stock parts."));
      return;
    }

    lowStock.forEach(item => {
      const quantity = toNumber(item.quantity);
      const reorderPoint = toNumber(item.reorderPoint || item.minimumQuantity);
      const name = item.name || item.itemName || "Inventory Item";
      const partNumber = item.partNumber ? `#${item.partNumber}` : "";

      const row = document.createElement("div");
      row.className = "dashboardInventoryRow";

      row.innerHTML = `
        <div>
          <strong>${escapeHtml(name)}</strong>
          <div class="activityMeta">
            ${escapeHtml(partNumber)}
            ${item.location ? ` • ${escapeHtml(item.location)}` : ""}
          </div>
          <div class="activityMeta">On hand: ${quantity} • Reorder point: ${reorderPoint}</div>
        </div>
        <span class="badge red">${quantity}</span>
      `;

      container.appendChild(row);
    });
  }

  function getWeatherCodeLabel(code) {
    const map = {
      0: "Clear",
      1: "Mostly clear",
      2: "Partly cloudy",
      3: "Overcast",
      45: "Fog",
      48: "Freezing fog",
      51: "Light drizzle",
      53: "Drizzle",
      55: "Heavy drizzle",
      61: "Light rain",
      63: "Rain",
      65: "Heavy rain",
      71: "Light snow",
      73: "Snow",
      75: "Heavy snow",
      80: "Rain showers",
      81: "Heavy showers",
      82: "Violent showers",
      95: "Thunderstorm"
    };

    return map[Number(code)] || "Forecast unavailable";
  }

  function getWeatherIcon(code) {
    const numericCode = Number(code);

    if ([0, 1].includes(numericCode)) return "☀️";
    if ([2].includes(numericCode)) return "🌤️";
    if ([3].includes(numericCode)) return "☁️";
    if ([45, 48].includes(numericCode)) return "🌫️";
    if ([51, 53, 55].includes(numericCode)) return "🌦️";
    if ([61, 63, 65, 80, 81, 82].includes(numericCode)) return "🌧️";
    if ([71, 73, 75].includes(numericCode)) return "❄️";
    if ([95].includes(numericCode)) return "⛈️";

    return "🌡️";
  }

  function formatForecastDay(dateString) {
    const parsed = parseDate(dateString);
    if (!parsed) return "Day";

    return parsed.toLocaleDateString(undefined, {
      weekday: "short"
    });
  }

  function formatForecastDate(dateString) {
    const parsed = parseDate(dateString);
    if (!parsed) return "";

    return parsed.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric"
    });
  }

  async function fetchWeatherSummaryByZip(zip = "62201") {
    const cleanZip = String(zip || "62201").trim() || "62201";

    const geoUrl =
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(cleanZip)}&count=1&language=en&format=json`;

    const geoRes = await fetch(geoUrl);
    if (!geoRes.ok) {
      throw new Error("Unable to look up zip code.");
    }

    const geoData = await geoRes.json();
    const place = Array.isArray(geoData?.results) ? geoData.results[0] : null;

    if (!place) {
      throw new Error("Zip code not found.");
    }

    const forecastUrl =
      `https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}&current=temperature_2m,weather_code,wind_speed_10m&daily=temperature_2m_max,temperature_2m_min,weather_code,precipitation_probability_max&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=auto&forecast_days=7`;

    const forecastRes = await fetch(forecastUrl);
    if (!forecastRes.ok) {
      throw new Error("Unable to load weather forecast.");
    }

    const forecastData = await forecastRes.json();

    return {
      placeName: [place.name, place.admin1].filter(Boolean).join(", "),
      zip: cleanZip,
      current: forecastData?.current || {},
      daily: forecastData?.daily || {}
    };
  }

  async function renderWeatherSummary() {
  const { summary } = getWeatherTargets();
  if (!summary) return;

  const currentZip = normalizeZipInput(dashboardCache?.settings?.weatherZip || "62201") || "62201";

  summary.innerHTML = `
    <div class="weatherZipLookup">
      <label for="dashboardWeatherZipInput">Weather ZIP</label>

      <div class="weatherZipForm">
        <input
          id="dashboardWeatherZipInput"
          type="text"
          inputmode="numeric"
          maxlength="5"
          value="${escapeHtml(currentZip)}"
          placeholder="62201"
        />
        <button id="dashboardWeatherZipBtn" type="button">Update</button>
      </div>

      <div id="dashboardWeatherZipMessage" class="weatherZipMessage"></div>
    </div>

    <div id="dashboardWeatherForecastBody">
      <div class="muted">Loading weather...</div>
    </div>
  `;

  const forecastBody = document.getElementById("dashboardWeatherForecastBody");

  try {
    const weather = await fetchWeatherSummaryByZip(currentZip);

    const currentTemp = weather.current?.temperature_2m;
    const currentCode = weather.current?.weather_code;
    const currentWind = weather.current?.wind_speed_10m;

    const dailyDates = Array.isArray(weather.daily?.time) ? weather.daily.time : [];
    const dailyCodes = Array.isArray(weather.daily?.weather_code) ? weather.daily.weather_code : [];
    const dailyHighs = Array.isArray(weather.daily?.temperature_2m_max)
      ? weather.daily.temperature_2m_max
      : [];
    const dailyLows = Array.isArray(weather.daily?.temperature_2m_min)
      ? weather.daily.temperature_2m_min
      : [];
    const dailyPrecip = Array.isArray(weather.daily?.precipitation_probability_max)
      ? weather.daily.precipitation_probability_max
      : [];

    const forecastCards = dailyDates.slice(0, 7).map((dateString, index) => {
      const code = dailyCodes[index];
      const high = dailyHighs[index] ?? "--";
      const low = dailyLows[index] ?? "--";
      const precip = dailyPrecip[index] ?? 0;

      return `
        <div class="weatherForecastDay">
          <div class="weatherForecastTop">
            <strong>${escapeHtml(formatForecastDay(dateString))}</strong>
            <span>${escapeHtml(formatForecastDate(dateString))}</span>
          </div>

          <div class="weatherForecastIcon">${getWeatherIcon(code)}</div>

          <div class="weatherForecastTemps">
            <strong>${high}°</strong>
            <span>${low}°</span>
          </div>

          <div class="weatherForecastCondition">
            ${escapeHtml(getWeatherCodeLabel(code))}
          </div>

          <div class="weatherForecastRain">
            ${precip}% precip
          </div>
        </div>
      `;
    }).join("");

    if (forecastBody) {
      forecastBody.innerHTML = `
        <div class="weatherCurrentPanel">
          <div class="weatherCurrentIcon">${getWeatherIcon(currentCode)}</div>

          <div class="weatherCurrentDetails">
            <div class="weatherTitle">${escapeHtml(weather.placeName)} ${escapeHtml(weather.zip)}</div>
            <div class="weatherTemp">${currentTemp ?? "--"}°F</div>
            <div class="weatherCond">${escapeHtml(getWeatherCodeLabel(currentCode))}</div>
            <div class="weatherWind">Wind ${currentWind ?? "--"} mph</div>
          </div>
        </div>

        <div class="weatherForecastHeader">
          <h4>7-Day Forecast</h4>
        </div>

        <div class="weatherForecastGrid">
          ${forecastCards || `<div class="muted">Forecast unavailable.</div>`}
        </div>
      `;
    }
  } catch (error) {
    console.error("Weather widget failed:", error);

    if (forecastBody) {
      forecastBody.innerHTML = `<div class="muted">Unable to load weather for ZIP ${escapeHtml(currentZip)}.</div>`;
    }
  }
}

  function bindDueServicesEvents() {
    if (dueServicesEventsBound) return;
    dueServicesEventsBound = true;

    const { section, tabs, categories, list } = getDueServicesTargets();
    const root = section || tabs?.parentElement || categories?.parentElement || list?.parentElement;
    if (!root) return;

    root.addEventListener("click", event => {
      const tabBtn = event.target.closest("[data-due-services-tab]");
      if (tabBtn) {
        dueServicesActiveTab = String(tabBtn.dataset.dueServicesTab || "due");
        renderDueServicesSection(safeArray(dashboardCache.equipmentList));
        return;
      }

      const categoryBtn = event.target.closest("[data-due-services-category]");
      if (categoryBtn) {
        dueServicesActiveCategory = String(
          categoryBtn.dataset.dueServicesCategory || "Trucks"
        );
        renderDueServicesSection(safeArray(dashboardCache.equipmentList));
      }
    });
  }

  function bindWeatherZipEvents() {
  if (weatherZipEventsBound) return;
  weatherZipEventsBound = true;

  const weatherSection =
    dom.dashWeatherSection ||
    document.getElementById("dashWeatherSection");

  if (!weatherSection) return;

  async function updateWeatherZip() {
    const input = document.getElementById("dashboardWeatherZipInput");
    const message = document.getElementById("dashboardWeatherZipMessage");
    const button = document.getElementById("dashboardWeatherZipBtn");

    const nextZip = normalizeZipInput(input?.value || "");

    if (!nextZip || nextZip.length !== 5) {
      if (message) {
        message.textContent = "Enter a valid 5-digit ZIP code.";
        message.className = "weatherZipMessage error";
      }
      return;
    }

    try {
      if (button) {
        button.disabled = true;
        button.textContent = "Updating...";
      }

      const nextSettings = {
        ...safeObject(dashboardCache.settings),
        weatherZip: nextZip
      };

      await saveSettings(nextSettings);

      dashboardCache.settings = {
        ...safeObject(dashboardCache.settings),
        weatherZip: nextZip
      };

      if (message) {
        message.textContent = `Weather ZIP updated to ${nextZip}.`;
        message.className = "weatherZipMessage success";
      }

      await renderWeatherSummary();
    } catch (error) {
      console.error("Failed to update weather ZIP:", error);

      if (message) {
        message.textContent = "Unable to update weather ZIP.";
        message.className = "weatherZipMessage error";
      }
    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = "Update";
      }
    }
  }

  weatherSection.addEventListener("click", event => {
    const button = event.target.closest("#dashboardWeatherZipBtn");
    if (!button) return;

    event.preventDefault();
    event.stopPropagation();

    updateWeatherZip();
  });

  weatherSection.addEventListener("keydown", event => {
    const input = event.target.closest("#dashboardWeatherZipInput");
    if (!input) return;

    if (event.key === "Enter") {
      event.preventDefault();
      event.stopPropagation();
      updateWeatherZip();
    }
  });

  weatherSection.addEventListener("input", event => {
    const input = event.target.closest("#dashboardWeatherZipInput");
    if (!input) return;

    const cleanValue = normalizeZipInput(input.value);
    if (input.value !== cleanValue) {
      input.value = cleanValue;
    }
  });
}

  function bindSyncEvents() {
    if (syncEventsBound) return;
    syncEventsBound = true;

    window.addEventListener("fleet:equipment-changed", () => {
      updateDashboard();
    });

    window.addEventListener("fleet:work-orders-changed", () => {
      updateDashboard();
    });

    window.addEventListener("fleet:purchase-orders-changed", () => {
      updateDashboard();
    });

    window.addEventListener("fleet:inventory-changed", () => {
      updateDashboard();
    });

    window.addEventListener("fleet:settings-changed", () => {
      updateDashboard();
    });
  }

  async function updateDashboard() {
    const { tabs, categories, list } = getDueServicesTargets();
    const { summary } = getWeatherTargets();

    if (!canViewDashboard()) {
      await renderDashboardGreeting();

      const recentContainer =
        dom.dashRecentActivity ||
        document.getElementById("dashRecentActivity") ||
        document.getElementById("recentActivityList");

      if (recentContainer) {
        recentContainer.innerHTML = "";
        recentContainer.appendChild(
          createEmptyMessage("You do not have access to the dashboard.")
        );
      }

      const inventoryAlerts = document.getElementById("dashInventoryAlerts");
      if (inventoryAlerts) {
        inventoryAlerts.innerHTML = "";
        inventoryAlerts.appendChild(
          createEmptyMessage("You do not have access to the dashboard.")
        );
      }

      if (summary) {
        summary.innerHTML = "";
        summary.appendChild(createEmptyMessage("You do not have access to the dashboard."));
      }

      if (tabs) tabs.innerHTML = "";
      if (categories) categories.innerHTML = "";

      if (list) {
        list.innerHTML = "";
        list.appendChild(createEmptyTableRow("You do not have access to the dashboard."));
      }

      return;
    }

    await hydrateDashboardData();
    await renderDashboardGreeting();

    const equipmentList = canViewEquipment()
      ? safeArray(dashboardCache.equipmentList)
      : [];

    const workOrders = canViewWorkOrders()
      ? safeArray(dashboardCache.workOrders)
      : [];

    const purchaseOrders = canViewPurchaseOrders()
      ? safeArray(dashboardCache.purchaseOrders)
      : [];

    const inventory = canViewInventory()
      ? safeArray(dashboardCache.inventory)
      : [];

    renderKpis(equipmentList, workOrders, inventory);
    renderVehicleStatus(equipmentList);
    renderWorkOrderSummary(workOrders);
    renderOpenIssues(workOrders);
    renderCostSummary(workOrders, purchaseOrders);
    renderRecentActivity(workOrders);
    renderInventoryAlerts(inventory);
    renderDueServicesSection(equipmentList);
    await renderWeatherSummary();
    applyDashboardLayout();
  }

  localStorage.removeItem(DASHBOARD_LAYOUT_KEY);

  applyDashboardLayout();
  bindDueServicesEvents();
  bindSyncEvents();
  bindWeatherZipEvents();
  bindDashboardEditorEvents();
  bindDashboardSearchEvents();
  await updateDashboard();

  return {
    updateDashboard,
    renderDashboardGreeting,
    applyDashboardLayout,
    openDashboardEditor,
    closeDashboardEditor,
    resetDashboardLayout
  };
}