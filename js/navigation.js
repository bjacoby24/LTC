import { getDom } from "./dom.js";
import { getLoggedInUser } from "./storage.js";

export function initNavigation() {
  const dom = getDom();

  const navLinks = Array.from(document.querySelectorAll("#sidebar a[data-view]"));
  const views = Array.from(document.querySelectorAll("#appViews .view"));

  const VIEW_PERMISSIONS = {
    dashboardView: "dashboardView",
    equipmentView: "equipmentView",
    workOrdersView: "workOrdersView",
    inventoryView: "inventoryView",
    vendorsView: "vendorsAccess",
    purchaseOrdersView: "purchaseOrdersAccess",
    deletedEquipmentView: "deletedEquipmentAccess"
  };

  function getUserPermissions() {
    const loggedInUser = getLoggedInUser();
    const role = String(loggedInUser?.role || "").trim().toLowerCase();

    const permissions =
      loggedInUser &&
      typeof loggedInUser === "object" &&
      loggedInUser.permissions &&
      typeof loggedInUser.permissions === "object"
        ? loggedInUser.permissions
        : {};

    if (role === "admin") {
      return {
        dashboardView: true,
        equipmentView: true,
        workOrdersView: true,
        inventoryView: true,
        vendorsAccess: true,
        purchaseOrdersAccess: true,
        deletedEquipmentAccess: true
      };
    }

    return {
      dashboardView: true,
      equipmentView: true,
      workOrdersView: true,
      inventoryView: true,
      vendorsAccess: true,
      purchaseOrdersAccess: true,
      deletedEquipmentAccess: false,
      ...permissions
    };
  }

  function userCanAccessView(viewId) {
    const permissions = getUserPermissions();
    const permissionKey = VIEW_PERMISSIONS[viewId];

    if (!permissionKey) return true;
    return !!permissions[permissionKey];
  }

  function getFirstAccessibleView() {
    const preferredOrder = [
      "dashboardView",
      "equipmentView",
      "workOrdersView",
      "inventoryView",
      "vendorsView",
      "purchaseOrdersView",
      "deletedEquipmentView"
    ];

    return preferredOrder.find(viewId => userCanAccessView(viewId)) || "dashboardView";
  }

  function applyNavigationPermissions() {
    navLinks.forEach(link => {
      const viewId = link.dataset.view || "";
      const allowed = userCanAccessView(viewId);
      link.style.display = allowed ? "" : "none";
    });

    views.forEach(view => {
      if (!view || !view.id) return;

      const allowed = userCanAccessView(view.id);

      if (!allowed && view.classList.contains("active")) {
        view.classList.remove("active");
      }
    });
  }

  function showView(viewId) {
    const targetViewId = userCanAccessView(viewId)
      ? viewId
      : getFirstAccessibleView();

    navLinks.forEach(link => {
      link.classList.toggle("active", link.dataset.view === targetViewId);
    });

    views.forEach(view => {
      view.classList.toggle("active", view.id === targetViewId);
    });
  }

  function bindNavigationEvents() {
    navLinks.forEach(link => {
      link.addEventListener("click", event => {
        event.preventDefault();

        const viewId = link.dataset.view;
        if (!viewId) return;
        if (!userCanAccessView(viewId)) return;

        showView(viewId);
      });
    });

    if (dom.homeLogo) {
      dom.homeLogo.addEventListener("click", () => {
        showView(getFirstAccessibleView());
      });
    }
  }

  function initDefaultView() {
    const activeLink = navLinks.find(link => link.classList.contains("active"));
    const requestedView = activeLink?.dataset?.view || "dashboardView";
    showView(requestedView);
  }

  applyNavigationPermissions();
  bindNavigationEvents();
  initDefaultView();

  return {
    showView,
    applyNavigationPermissions,
    userCanAccessView,
    getFirstAccessibleView
  };
}