import { getDom } from "./dom.js";
import { normalizeText, formatMoney, escapeHtml } from "./utils.js";
import {
  loadEquipment,
  loadWorkOrders,
  loadPurchaseOrders,
  loadSettings,
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
    "recentActivity",
    "vehicleStatus",
    "activeWorkOrders",
    "openIssues",
    "serviceCosts",
    "totalCosts"
  ];

  const DEFAULT_WIDGET_SPANS = {
    equipmentServices: 12,
    weatherSummary: 4,
    recentActivity: 6,
    vehicleStatus: 6,
    activeWorkOrders: 4,
    openIssues: 4,
    serviceCosts: 4,
    totalCosts: 4
  };

  const DEFAULT_VISIBLE_WIDGETS = {
    equipmentServices: true,
    weatherSummary: true,
    recentActivity: true,
    vehicleStatus: true,
    activeWorkOrders: true,
    openIssues: true,
    serviceCosts: true,
    totalCosts: true
  };

  const WIDGET_LABELS = {
    equipmentServices: "Equipment Services",
    weatherSummary: "Weather",
    recentActivity: "Recent Comments / Activity",
    vehicleStatus: "Vehicle Status",
    activeWorkOrders: "Active Work Orders",
    openIssues: "Open Issues",
    serviceCosts: "Service Costs",
    totalCosts: "Total Costs"
  };

  let draggedWidgetId = null;

  let dashboardCache = {
    equipmentList: [],
    workOrders: [],
    purchaseOrders: [],
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
  let layoutEventsBound = false;
  let syncEventsBound = false;
  let editorEventsBound = false;

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
    div.className = "muted";
    div.textContent = text;
    return div;
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

  function getWidgetById(widgetId) {
    return getDashboardWidgets().find(
      widget => String(widget.dataset.widgetId || "") === String(widgetId || "")
    );
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

  function loadDashboardLayout() {
    try {
      const parsed = JSON.parse(localStorage.getItem(DASHBOARD_LAYOUT_KEY) || "{}");
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch (error) {
      console.error("Unable to load dashboard layout:", error);
      return {};
    }
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

  function persistCurrentDashboardLayout() {
    const grid = dom.dashboardGrid || document.getElementById("dashboardGrid");
    if (!grid) return;

    const widgets = getDashboardWidgets();
    const order = widgets.map(widget => String(widget.dataset.widgetId || "")).filter(Boolean);
    const spans = {};

    widgets.forEach(widget => {
      const widgetId = String(widget.dataset.widgetId || "");
      const span = Number(widget.dataset.span || widget.dataset.widgetSpan || 4) || 4;
      if (widgetId) spans[widgetId] = span;
    });

    localStorage.setItem(
      DASHBOARD_LAYOUT_KEY,
      JSON.stringify({
        order,
        spans
      })
    );
  }

  function getSafeSpan(span) {
    const numeric = Number(span) || 4;
    if (numeric <= 4) return 4;
    if (numeric <= 6) return 6;
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

    const layout = loadDashboardLayout();
    const order = safeArray(layout.order);
    const spans = safeObject(layout.spans);

    const widgetMap = new Map();
    getDashboardWidgets().forEach(widget => {
      const widgetId = String(widget.dataset.widgetId || "");
      if (widgetId) widgetMap.set(widgetId, widget);
    });

    const orderedIds = [
      ...order.filter(id => widgetMap.has(id)),
      ...DEFAULT_WIDGET_ORDER.filter(id => widgetMap.has(id) && !order.includes(id)),
      ...Array.from(widgetMap.keys()).filter(
        id => !order.includes(id) && !DEFAULT_WIDGET_ORDER.includes(id)
      )
    ];

    orderedIds.forEach(widgetId => {
      const widget = widgetMap.get(widgetId);
      if (!widget) return;

      grid.appendChild(widget);
      applyWidgetSpan(widget, spans[widgetId] ?? DEFAULT_WIDGET_SPANS[widgetId] ?? 4);
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
    });

    applyDashboardLayout();
    renderDashboardEditorList();
  }

  function moveWidgetBefore(sourceId, targetId) {
    const grid = dom.dashboardGrid || document.getElementById("dashboardGrid");
    if (!grid) return;

    const sourceWidget = getWidgetById(sourceId);
    const targetWidget = getWidgetById(targetId);

    if (!sourceWidget || !targetWidget || sourceWidget === targetWidget) return;

    grid.insertBefore(sourceWidget, targetWidget);
    persistCurrentDashboardLayout();
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

    const orderedWidgetIds = widgets
      .map(widget => String(widget.dataset.widgetId || ""))
      .filter(Boolean);

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
      hint.textContent = `Widget ID: ${widgetId}`;

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

  function bindLayoutEvents() {
    if (layoutEventsBound) return;
    layoutEventsBound = true;

    const grid = dom.dashboardGrid || document.getElementById("dashboardGrid");
    if (!grid) return;

    getDashboardWidgets().forEach(widget => {
      widget.setAttribute("draggable", "true");

      widget.addEventListener("dragstart", event => {
        draggedWidgetId = String(widget.dataset.widgetId || "");
        widget.classList.add("dashboardWidgetDragging");

        if (event.dataTransfer) {
          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setData("text/plain", draggedWidgetId);
        }
      });

      widget.addEventListener("dragend", () => {
        widget.classList.remove("dashboardWidgetDragging");
        draggedWidgetId = null;

        getDashboardWidgets().forEach(item => {
          item.classList.remove("dashboardWidgetDragOver");
        });
      });

      widget.addEventListener("dragover", event => {
        event.preventDefault();

        const currentId = String(widget.dataset.widgetId || "");
        if (!draggedWidgetId || !currentId || draggedWidgetId === currentId) return;

        widget.classList.add("dashboardWidgetDragOver");
      });

      widget.addEventListener("dragleave", () => {
        widget.classList.remove("dashboardWidgetDragOver");
      });

      widget.addEventListener("drop", event => {
        event.preventDefault();
        widget.classList.remove("dashboardWidgetDragOver");

        const targetId = String(widget.dataset.widgetId || "");
        if (!draggedWidgetId || !targetId || draggedWidgetId === targetId) return;

        moveWidgetBefore(draggedWidgetId, targetId);
      });
    });

    grid.addEventListener("click", event => {
      const resizeBtn = event.target.closest("[data-resize-widget][data-span]");
      if (!resizeBtn) return;

      const widgetId = String(resizeBtn.dataset.resizeWidget || "");
      const nextSpan = Number(resizeBtn.dataset.span || 4) || 4;
      const widget = getWidgetById(widgetId);
      if (!widget) return;

      applyWidgetSpan(widget, nextSpan);
      persistCurrentDashboardLayout();
    });
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
      greetingEl.textContent = getGreetingByTime();
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
        : getGreetingByTime();
    } catch (error) {
      console.error("Failed to render dashboard greeting:", error);
      greetingEl.textContent = getGreetingByTime();
    }
  }

  async function hydrateDashboardData() {
    try {
      const [equipmentList, workOrders, purchaseOrders, settings] = await Promise.all([
        loadEquipment(),
        loadWorkOrders(),
        loadPurchaseOrders(),
        loadSettings()
      ]);

      dashboardCache = {
        equipmentList: safeArray(equipmentList),
        workOrders: safeArray(workOrders),
        purchaseOrders: safeArray(purchaseOrders),
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

  function renderVehicleStatus(equipmentList) {
    const activeCount = safeArray(equipmentList).filter(eq => (eq.status || "") === "Active").length;
    const inactiveCount = safeArray(equipmentList).filter(eq => (eq.status || "") === "Inactive").length;
    const inRepairCount = safeArray(equipmentList).filter(eq => (eq.status || "") === "In Repair").length;
    const outOfServiceCount = safeArray(equipmentList).filter(
      eq => (eq.status || "") === "Out of Service"
    ).length;

    const dashActiveCount = dom.dashActiveCount || document.getElementById("dashActiveCount");
    const dashInactiveCount = dom.dashInactiveCount || document.getElementById("dashInactiveCount");
    const dashInRepairCount =
      dom.dashInRepairCount ||
      dom.dashInShopCount ||
      document.getElementById("dashInRepairCount") ||
      document.getElementById("dashInShopCount");
    const dashOutOfServiceCount =
      dom.dashOutOfServiceCount || document.getElementById("dashOutOfServiceCount");

    if (dashActiveCount) dashActiveCount.textContent = String(activeCount);
    if (dashInactiveCount) dashInactiveCount.textContent = String(inactiveCount);
    if (dashInRepairCount) dashInRepairCount.textContent = String(inRepairCount);
    if (dashOutOfServiceCount) dashOutOfServiceCount.textContent = String(outOfServiceCount);
  }

  function renderWorkOrderSummary(workOrders) {
    const woOpen = safeArray(workOrders).filter(wo => (wo.status || "") === "Open").length;
    const woPending = safeArray(workOrders).filter(wo =>
      ["Pending", "In Progress", "Manager Review"].includes(wo.status || "")
    ).length;
    const woCompleted = safeArray(workOrders).filter(wo =>
      ["Completed", "Closed"].includes(wo.status || "")
    ).length;

    const dashWOOpen = dom.dashWOOpen || document.getElementById("dashWOOpen");
    const dashWOPending = dom.dashWOPending || document.getElementById("dashWOPending");
    const dashWOCompleted = dom.dashWOCompleted || document.getElementById("dashWOCompleted");

    if (dashWOOpen) dashWOOpen.textContent = String(woOpen);
    if (dashWOPending) dashWOPending.textContent = String(woPending);
    if (dashWOCompleted) dashWOCompleted.textContent = String(woCompleted);
  }

  function renderOpenIssues(workOrders) {
    const openIssues = safeArray(workOrders).filter(wo =>
      ["Open", "Pending", "In Progress", "Manager Review"].includes(wo.status || "")
    ).length;

    const overdueIssues = safeArray(workOrders).filter(wo => {
      const opened = parseDate(wo.opened || wo.date || wo.woDate);
      const status = String(wo.status || "");

      if (!opened) return false;
      if (["Completed", "Closed"].includes(status)) return false;

      const ageInDays = Math.floor(
        (parseDate(getTodayDateString()) - parseDate(dateToYMD(opened))) /
          (1000 * 60 * 60 * 24)
      );

      return ageInDays > 7;
    }).length;

    const dashOpenIssues = dom.dashOpenIssues || document.getElementById("dashOpenIssues");
    const dashOverdueIssues =
      dom.dashOverdueIssues || document.getElementById("dashOverdueIssues");

    if (dashOpenIssues) dashOpenIssues.textContent = String(openIssues);
    if (dashOverdueIssues) dashOverdueIssues.textContent = String(overdueIssues);
  }

  function renderCostSummary(workOrders, purchaseOrders) {
    const workOrderCosts = safeArray(workOrders).reduce(
      (sum, wo) => sum + toNumber(wo.total || wo.totalCost),
      0
    );

    const purchaseOrderCosts = safeArray(purchaseOrders).reduce(
      (sum, po) => sum + toNumber(po.total || po.totalCost),
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
      return sum + toNumber(wo.total || wo.totalCost);
    }, 0);

    const dashMonthServiceCost =
      dom.dashMonthServiceCost ||
      dom.dashServiceCostMonth ||
      document.getElementById("dashMonthServiceCost") ||
      document.getElementById("dashServiceCostMonth");

    const dashYearServiceCost =
      dom.dashYearServiceCost ||
      dom.dashServiceCostTotal ||
      document.getElementById("dashYearServiceCost") ||
      document.getElementById("dashServiceCostTotal");

    const dashTotalWOCost = dom.dashTotalWOCost || document.getElementById("dashTotalWOCost");
    const dashTotalPOCost = dom.dashTotalPOCost || document.getElementById("dashTotalPOCost");
    const dashCombinedCost = dom.dashCombinedCost || document.getElementById("dashCombinedCost");

    if (dashMonthServiceCost) {
      dashMonthServiceCost.textContent = formatMoney(workOrderCostsThisMonth);
    }

    if (dashYearServiceCost) {
      dashYearServiceCost.textContent = formatMoney(workOrderCosts);
    }

    if (dashTotalWOCost) {
      dashTotalWOCost.textContent = formatMoney(workOrderCosts);
    }

    if (dashTotalPOCost) {
      dashTotalPOCost.textContent = formatMoney(purchaseOrderCosts);
    }

    if (dashCombinedCost) {
      dashCombinedCost.textContent = formatMoney(workOrderCosts + purchaseOrderCosts);
    }
  }

  function renderRecentActivity(workOrders) {
    const container =
      dom.dashRecentActivity ||
      document.getElementById("dashRecentActivity") ||
      document.getElementById("recentActivityList");

    if (!container) return;

    container.innerHTML = "";

    const sorted = safeArray(workOrders)
      .slice()
      .sort((a, b) => {
        const aDate = parseDate(a.updatedAt || a.completed || a.closed || a.opened || a.date || a.woDate);
        const bDate = parseDate(b.updatedAt || b.completed || b.closed || b.opened || b.date || b.woDate);
        return (bDate?.getTime() || 0) - (aDate?.getTime() || 0);
      })
      .slice(0, 6);

    if (!sorted.length) {
      container.appendChild(createEmptyMessage("No recent work order activity"));
      return;
    }

    sorted.forEach(item => {
      const row = document.createElement("div");
      row.className = "activityRow";

      row.innerHTML = `
        <div>
          <div class="dueServicesRowTitle">${escapeHtml(
            item.workOrderNumber || item.woNumber || item.number || "Work Order"
          )}</div>
          <div class="activityMeta">${escapeHtml(item.unit || item.equipmentNumber || "")}</div>
        </div>
        <div class="activityMeta">${escapeHtml(item.status || "")}</div>
      `;

      container.appendChild(row);
    });
  }

  function getBucketOrder() {
    return ["due", "dueIn30Days", "overdue"];
  }

  function getCategoryOrder() {
    return ["Trucks", "Trailers", "O/O's"];
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

    const counts = {
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

    const labelMap = {
      due: "Due",
      dueIn30Days: "Due in 30 Days",
      overdue: "Overdue"
    };

    tabs.innerHTML = getBucketOrder()
      .map(bucket => {
        const isActive = bucket === dueServicesActiveTab;
        const badgeClass = bucket === "overdue" ? "red" : bucket === "due" ? "orange" : "blue";

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

  function renderDueServicesList(data) {
    const { list } = getDueServicesTargets();
    if (!list) return;

    const activeBucket = safeObject(data?.[dueServicesActiveTab]);
    const items = safeArray(activeBucket[dueServicesActiveCategory]);

    list.innerHTML = "";

    if (!items.length) {
      list.appendChild(createEmptyMessage("No equipment currently matches this filter."));
      return;
    }

    items.forEach(item => {
      const row = document.createElement("div");
      row.className = "dueServiceRow";

      row.innerHTML = `
        <div class="dueServiceMain">
          <strong>${escapeHtml(item.unit || "Unit")}</strong>
          <div class="dueServiceMeta">
            ${escapeHtml(item.serviceLabel || "Service")}
            ${item.location ? ` • ${escapeHtml(item.location)}` : ""}
          </div>
          <div class="dueServiceMeta">
            ${escapeHtml(item.dueReason || "No completion history")}
            ${
              item.lastCompletedDisplay && item.lastCompletedDisplay !== "—"
                ? ` • Last ${escapeHtml(item.lastCompletedDisplay)}`
                : ""
            }
          </div>
        </div>
        <div class="dueServiceType">${escapeHtml(item.type || "")}</div>
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
        list.appendChild(
          createEmptyMessage("You do not have access to equipment service reminders")
        );
      }
      return;
    }

    const data = buildDashboardDueServicesData(equipmentList, dashboardCache.settings);
    ensureDueServicesStateIsValid(data);
    renderDueServicesTabs(data);
    renderDueServicesCategories(data);
    renderDueServicesList(data);
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
      `https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}&current=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min,weather_code&temperature_unit=fahrenheit&timezone=auto&forecast_days=3`;

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

    summary.innerHTML = `<div class="muted">Loading weather...</div>`;

    try {
      const zip = dashboardCache?.settings?.weatherZip || "62201";
      const weather = await fetchWeatherSummaryByZip(zip);

      const currentTemp = weather.current?.temperature_2m;
      const currentCode = weather.current?.weather_code;

      const maxToday = Array.isArray(weather.daily?.temperature_2m_max)
        ? weather.daily.temperature_2m_max[0]
        : null;

      const minToday = Array.isArray(weather.daily?.temperature_2m_min)
        ? weather.daily.temperature_2m_min[0]
        : null;

      const nextDayCode = Array.isArray(weather.daily?.weather_code)
        ? weather.daily.weather_code[1]
        : null;

      summary.innerHTML = `
        <div class="weatherNow">
          <div class="weatherTitle">${escapeHtml(weather.placeName)} ${escapeHtml(weather.zip)}</div>
          <div class="weatherTemp">${currentTemp ?? "--"}°F</div>
          <div class="weatherCond">${escapeHtml(getWeatherCodeLabel(currentCode))}</div>
        </div>
        <div class="weatherToday">
          <div>Today: High ${maxToday ?? "--"}° / Low ${minToday ?? "--"}°</div>
          <div>Tomorrow: ${escapeHtml(getWeatherCodeLabel(nextDayCode))}</div>
        </div>
      `;
    } catch (error) {
      console.error("Weather widget failed:", error);
      summary.innerHTML = `<div class="muted">Unable to load weather.</div>`;
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
          createEmptyMessage("You do not have access to the dashboard")
        );
      }

      if (summary) {
        summary.innerHTML = "";
        summary.appendChild(createEmptyMessage("You do not have access to the dashboard"));
      }

      if (tabs) tabs.innerHTML = "";
      if (categories) categories.innerHTML = "";

      if (list) {
        list.innerHTML = "";
        list.appendChild(createEmptyMessage("You do not have access to the dashboard"));
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

    renderVehicleStatus(equipmentList);
    renderWorkOrderSummary(workOrders);
    renderOpenIssues(workOrders);
    renderCostSummary(workOrders, purchaseOrders);
    renderRecentActivity(workOrders);
    renderDueServicesSection(equipmentList);
    await renderWeatherSummary();
    applyDashboardLayout();
  }

  applyDashboardLayout();
  bindLayoutEvents();
  bindDueServicesEvents();
  bindSyncEvents();
  bindDashboardEditorEvents();
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