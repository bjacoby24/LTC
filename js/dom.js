function byId(id) {
  return document.getElementById(id);
}

function qsa(selector, root = document) {
  return Array.from(root.querySelectorAll(selector));
}

export function getDom() {
  return {
    /* -------------------------
       APP / LOGIN
    ------------------------- */
    appWrapper: byId("appWrapper"),
    loginScreen: byId("loginScreen"),
    loginUsername: byId("loginUsername"),
    loginPassword: byId("loginPassword"),
    loginBtn: byId("loginBtn"),
    logoutBtn: byId("logoutBtn"),
    loginError: byId("loginError"),
    currentUsername: byId("currentUsername"),

    /* -------------------------
       NAV / VIEWS
    ------------------------- */
    sidebar: byId("sidebar"),
    navLinks: qsa("#sidebar a[data-view]"),
    appViews: byId("appViews"),
    views: qsa("#appViews .view"),

    dashboardView: byId("dashboardView"),
    equipmentView: byId("equipmentView"),
    deletedEquipmentView: byId("deletedEquipmentView"),
    workOrdersView: byId("workOrdersView"),
    inventoryView: byId("inventoryView"),
    vendorsView: byId("vendorsView"),
    purchaseOrdersView: byId("purchaseOrdersView"),

    /* -------------------------
       GLOBAL BUTTONS / PANELS
    ------------------------- */
    settingsBtn: byId("settingsBtn"),
    settingsMenuBtn: byId("settingsMenuBtn"),
    settingsDropdown: byId("settingsDropdown"),
    openSettingsBtn: byId("openSettingsBtn"),
    openServicesBtn: byId("openServicesBtn"),
    manageUsersBtn: byId("manageUsersBtn"),
    changePasswordBtn: byId("changePasswordBtn"),

    settingsPanel: byId("settingsPanel"),
    servicesPanel: byId("servicesPanel"),
    formPanel: byId("formPanel"),
    inventoryFormPanel: byId("inventoryFormPanel"),
    inventoryProfilePanel: byId("inventoryProfilePanel"),
    vendorFormPanel: byId("vendorFormPanel"),
    workOrderFormPanel: byId("workOrderFormPanel"),
    poFormPanel: byId("poFormPanel"),

    /* -------------------------
       APP MODAL
    ------------------------- */
    appModal: byId("appModal"),
    appModalTitle: byId("appModalTitle"),
    appModalMessage: byId("appModalMessage"),
    appModalConfirmBtn: byId("appModalConfirmBtn"),
    appModalCancelBtn: byId("appModalCancelBtn"),
    appModalCloseBtn: byId("appModalCloseBtn"),
    appModalActions: byId("appModalActions"),

    /* -------------------------
       DASHBOARD
    ------------------------- */
    dashboardGreeting: byId("dashboardGreeting"),
    dashboardGrid: byId("dashboardGrid"),

    dashDueServicesSection: byId("dashDueServicesSection"),
    dashDueServicesTabs: byId("dashDueServicesTabs"),
    dashDueServicesCategories: byId("dashDueServicesCategories"),
    dashDueServicesList: byId("dashDueServicesList"),
    equipmentServicesList: byId("equipmentServicesList"),

    dueServicesTabs: qsa(".dueServicesTab"),
    dueServicesCategoryTabs: qsa(".dueServicesCategoryTab"),

    editDashboardBtn: byId("editDashboardBtn"),
    dashboardEditorModal: byId("dashboardEditorModal"),
    dashboardWidgetEditorList: byId("dashboardWidgetEditorList"),
    closeDashboardEditorBtn: byId("closeDashboardEditorBtn"),
    saveDashboardEditorBtn: byId("saveDashboardEditorBtn"),
    resetDashboardLayoutBtn: byId("resetDashboardLayoutBtn"),

    dashActiveCount: byId("dashActiveCount"),
    dashInactiveCount: byId("dashInactiveCount"),
    dashInRepairCount: byId("dashInRepairCount"),

    dashWOOpen: byId("dashWOOpen"),
    dashWOPending: byId("dashWOPending"),
    dashWOCompleted: byId("dashWOCompleted"),

    dashOpenIssues: byId("dashOpenIssues"),
    dashOverdueIssues: byId("dashOverdueIssues"),

    dashMonthServiceCost: byId("dashMonthServiceCost"),
    dashYearServiceCost: byId("dashYearServiceCost"),
    dashTotalWOCost: byId("dashTotalWOCost"),
    dashTotalPOCost: byId("dashTotalPOCost"),
    dashCombinedCost: byId("dashCombinedCost"),

    dashRecentActivity: byId("dashRecentActivity"),
    dashWeatherSection: byId("dashWeatherSection"),
    dashWeatherSummary: byId("dashWeatherSummary"),

    /* -------------------------
       EQUIPMENT - MAIN
    ------------------------- */
    equipmentListSection: byId("equipmentListSection"),
    equipmentProfileSection: byId("equipmentProfileModal"),
    equipmentProfileModal: byId("equipmentProfileModal"),
    closeEquipmentProfileBtn: byId("closeEquipmentProfileBtn"),

    openFormBtn: byId("openFormBtn"),
    editProfileBtn: byId("editProfileBtn"),
    backToEquipmentListBtn: byId("backToEquipmentListBtn"),
    addProfileWOBtn: byId("addProfileWOBtn"),

    deleteSelectedEquipmentBtn: byId("deleteSelectedEquipmentBtn"),
    cancelEquipmentSelectionBtn: byId("cancelEquipmentSelectionBtn"),

    equipmentGlobalSearch: byId("equipmentGlobalSearch"),
    equipmentResultCount: byId("equipmentResultCount"),

    equipmentTable: byId("equipmentTable"),
    equipmentTableHeaderRow: byId("equipmentTableHeaderRow"),
    equipmentColumnFilters: byId("equipmentColumnFilters"),

    equipmentOptionsBtn: byId("equipmentOptionsBtn"),
    equipmentOptionsDropdown: byId("equipmentOptionsDropdown"),
    manageEquipmentColumnsBtn: byId("manageEquipmentColumnsBtn"),
    clearEquipmentFiltersBtn: byId("clearEquipmentFiltersBtn"),
    exportEquipmentBtn: byId("exportEquipmentBtn"),
    importEquipmentBtn: byId("importEquipmentBtn"),
    openDeletedEquipmentBtn: byId("openDeletedEquipmentBtn"),
    equipmentImportInput: byId("equipmentImportInput"),

    columnManagerPanel: byId("columnManagerPanel"),
    closeColumnManagerBtn: byId("closeColumnManagerBtn"),
    columnManagerList: byId("columnManagerList"),
    newCustomColumnInput: byId("newCustomColumnInput"),
    addCustomColumnBtn: byId("addCustomColumnBtn"),

    /* -------------------------
       EQUIPMENT - FORM
    ------------------------- */
    formTitle: byId("formTitle"),
    saveBtn: byId("saveBtn"),
    updateBtn: byId("updateBtn"),
    deleteBtn: byId("deleteBtn"),
    closeBtn: byId("closeBtn"),

    unit: byId("unit"),
    type: byId("type"),
    year: byId("year"),
    vin: byId("vin"),
    plate: byId("plate"),
    state: byId("state"),
    status: byId("status"),
    location: byId("location"),
    pm: byId("pm"),
    business: byId("business"),
    rim: byId("rim"),
    size: byId("size"),
    pressure: byId("pressure"),
    manufacturer: byId("manufacturer"),
    bodyClass: byId("bodyClass"),
    driveType: byId("driveType"),
    fuelType: byId("fuelType"),
    engine: byId("engine"),

    /* -------------------------
       EQUIPMENT - PROFILE
    ------------------------- */
    profileTabs: qsa("[data-profile-tab]"),
    profileTabContents: qsa(".profileTabContent"),

    profileUnit: byId("profileUnit"),
    profileType: byId("profileType"),
    profileYear: byId("profileYear"),
    profileVin: byId("profileVin"),
    profilePlate: byId("profilePlate"),
    profileState: byId("profileState"),
    profileStatus: byId("profileStatus"),
    profileLocation: byId("profileLocation"),
    profilePM: byId("profilePM"),
    profileBusiness: byId("profileBusiness"),
    profileRim: byId("profileRim"),
    profileSize: byId("profileSize"),
    profilePressure: byId("profilePressure"),
    profileManufacturer: byId("profileManufacturer"),
    profileBodyClass: byId("profileBodyClass"),
    profileDriveType: byId("profileDriveType"),
    profileFuelType: byId("profileFuelType"),
    profileEngine: byId("profileEngine"),

    historyStatusFilter: byId("historyStatusFilter"),
    historyDateFrom: byId("historyDateFrom"),
    historyDateTo: byId("historyDateTo"),
    applyHistoryFiltersBtn: byId("applyHistoryFiltersBtn"),
    clearHistoryFiltersBtn: byId("clearHistoryFiltersBtn"),

    profileRepairCount: byId("profileRepairCount"),
    profileRepairCost: byId("profileRepairCost"),
    filteredRepairCount: byId("filteredRepairCount"),
    filteredRepairCost: byId("filteredRepairCost"),

    equipmentHistoryTable: byId("equipmentHistoryTable"),
    equipmentServicesTable: byId("equipmentServicesTable"),
    partAssignmentHistoryTable: byId("partAssignmentHistoryTable"),

    /* -------------------------
       EQUIPMENT - SERVICE TRACKING MODAL
    ------------------------- */
    serviceTrackingModal: byId("serviceTrackingModal"),
    serviceTrackingTaskName: byId("serviceTrackingTaskName"),
    serviceTrackingLastDateInput: byId("serviceTrackingLastDateInput"),
    serviceTrackingLastMilesInput: byId("serviceTrackingLastMilesInput"),
    serviceTrackingNotesInput: byId("serviceTrackingNotesInput"),
    serviceTrackingSaveBtn: byId("serviceTrackingSaveBtn"),
    serviceTrackingCancelBtn: byId("serviceTrackingCancelBtn"),
    serviceTrackingCloseBtn: byId("serviceTrackingCloseBtn"),

    /* -------------------------
       DELETED EQUIPMENT
    ------------------------- */
    deletedEquipmentTable: byId("deletedEquipmentTable"),
    deletedEquipmentTableHeaderRow: byId("deletedEquipmentTableHeaderRow"),
    deletedEquipmentColumnFilters: byId("deletedEquipmentColumnFilters"),
    deletedEquipmentGlobalSearch: byId("deletedEquipmentGlobalSearch"),
    deletedEquipmentResultCount: byId("deletedEquipmentResultCount"),
    restoreSelectedEquipmentBtn: byId("restoreSelectedEquipmentBtn"),
    permanentlyDeleteSelectedBtn: byId("permanentlyDeleteSelectedBtn"),

    /* -------------------------
       WORK ORDERS NAV
    ------------------------- */
    openWorkOrderBtn: byId("openWorkOrderBtn"),
    openQuickWOFormBtn: byId("openQuickWOFormBtn"),
    deleteSelectedWOBtn: byId("deleteSelectedWOBtn"),
    cancelWOSelectionBtn: byId("cancelWOSelectionBtn"),

    workOrdersOptionsBtn: byId("workOrdersOptionsBtn"),
    workOrdersOptionsDropdown: byId("workOrdersOptionsDropdown"),
    manageWOColumnsBtn: byId("manageWOColumnsBtn"),
    clearWOFiltersBtn: byId("clearWOFiltersBtn"),

    workOrdersTable: byId("workOrdersTable"),
    workOrdersTableHeaderRow: byId("workOrdersTableHeaderRow"),
    workOrdersColumnFilters: byId("woColumnFilters"),
    woColumnFilters: byId("woColumnFilters"),
    woGlobalSearch: byId("woGlobalSearch"),
    workOrdersGlobalSearch: byId("woGlobalSearch"),
    woResultCount: byId("woResultCount"),
    workOrdersResultCount: byId("woResultCount"),

    /* -------------------------
       INVENTORY - GRID / LIST
    ------------------------- */
    openInventoryFormBtn: byId("openInventoryFormBtn"),
    deleteSelectedInventoryBtn: byId("deleteSelectedInventoryBtn"),
    previewInventoryBarcodesBtn: byId("previewInventoryBarcodesBtn"),
    cancelInventorySelectionBtn: byId("cancelInventorySelectionBtn"),

    inventoryOptionsBtn: byId("inventoryOptionsBtn"),
    inventoryOptionsDropdown: byId("inventoryOptionsDropdown"),
    manageInventoryColumnsBtn: byId("manageInventoryColumnsBtn"),
    clearInventoryFiltersBtn: byId("clearInventoryFiltersBtn"),
    printInventoryBarcodesBtn: byId("printInventoryBarcodesBtn"),
    importInventoryBtn: byId("importInventoryBtn"),
    exportInventoryBtn: byId("exportInventoryBtn"),
    inventoryImportInput: byId("inventoryImportInput"),

    inventoryTable: byId("inventoryTable"),
    inventoryTableHeaderRow: byId("inventoryTableHeaderRow"),
    inventoryColumnFilters: byId("inventoryColumnFilters"),
    inventoryGlobalSearch: byId("inventoryGlobalSearch"),
    inventoryResultCount: byId("inventoryResultCount"),

    /* -------------------------
       INVENTORY - BARCODE MODAL
    ------------------------- */
    inventoryBarcodeModal: byId("inventoryBarcodeModal"),
    closeInventoryBarcodeModalBtn: byId("closeInventoryBarcodeModalBtn"),
    inventoryBarcodeCopiesInput: byId("inventoryBarcodeCopiesInput"),
    inventoryBarcodeLabelSize: byId("inventoryBarcodeLabelSize"),
    inventoryBarcodeType: byId("inventoryBarcodeType"),
    refreshInventoryBarcodePreviewBtn: byId("refreshInventoryBarcodePreviewBtn"),
    printInventoryBarcodePreviewBtn: byId("printInventoryBarcodePreviewBtn"),
    inventoryBarcodePreview: byId("inventoryBarcodePreview"),

    /* -------------------------
       INVENTORY - FORM
    ------------------------- */
    inventoryFormTitle: byId("inventoryFormTitle"),
    saveInventoryBtn: byId("saveInventoryBtn"),
    updateInventoryBtn: byId("updateInventoryBtn"),
    deleteInventoryBtn: byId("deleteInventoryBtn"),
    closeInventoryBtn: byId("closeInventoryBtn"),

    invName: byId("invName"),
    invPartNumber: byId("invPartNumber"),
    invCategory: byId("invCategory"),
    invQuantity: byId("invQuantity"),
    invUnitCost: byId("invUnitCost"),
    invLocation: byId("invLocation"),
    invVendor: byId("invVendor"),
    invReorderPoint: byId("invReorderPoint"),
    invReorderQty: byId("invReorderQty"),
    invMaxQty: byId("invMaxQty"),
    invBinLocation: byId("invBinLocation"),
    invManufacturer: byId("invManufacturer"),
    invPartType: byId("invPartType"),
    invUom: byId("invUom"),
    invNotes: byId("invNotes"),
    invProfileNotes: byId("invProfileNotes"),

    /* -------------------------
       INVENTORY - PROFILE
    ------------------------- */
    inventoryProfileTitle: byId("inventoryProfileTitle"),
    inventoryProfileSubtitle: byId("inventoryProfileSubtitle"),
    closeInventoryProfileBtn: byId("closeInventoryProfileBtn"),
    editInventoryProfileBtn: byId("editInventoryProfileBtn"),

    profileInvName: byId("profileInvName"),
    profileInvPartNumber: byId("profileInvPartNumber"),
    profileInvCategory: byId("profileInvCategory"),
    profileInvLocation: byId("profileInvLocation"),
    profileInvVendor: byId("profileInvVendor"),
    profileInvQuantity: byId("profileInvQuantity"),
    profileInvUnitCost: byId("profileInvUnitCost"),
    profileInvReorderPoint: byId("profileInvReorderPoint"),
    profileInvReorderQty: byId("profileInvReorderQty"),
    profileInvMaxQty: byId("profileInvMaxQty"),
    profileInvBinLocation: byId("profileInvBinLocation"),
    profileInvManufacturer: byId("profileInvManufacturer"),
    profileInvPartType: byId("profileInvPartType"),
    profileInvUom: byId("profileInvUom"),
    profileInvLastPurchased: byId("profileInvLastPurchased"),
    profileInvLastIssued: byId("profileInvLastIssued"),
    profileInvNotes: byId("profileInvNotes"),
    profileInvProfileNotes: byId("profileInvProfileNotes"),

    inventoryPurchaseHistoryTable: byId("inventoryPurchaseHistoryTable"),
    inventoryIssueHistoryTable: byId("inventoryIssueHistoryTable"),
    inventoryAdjustmentHistoryTable: byId("inventoryAdjustmentHistoryTable"),

    /* -------------------------
       INVENTORY - ADMIN QUICK ADJUST
    ------------------------- */
    inventoryAdminQuickAdjustSection: byId("inventoryAdminQuickAdjustSection"),
    inventoryAdjustType: byId("inventoryAdjustType"),
    inventoryAdjustQty: byId("inventoryAdjustQty"),
    inventoryAdjustReason: byId("inventoryAdjustReason"),
    saveInventoryAdjustmentBtn: byId("saveInventoryAdjustmentBtn"),
    inventoryAdjustmentHistorySection: byId("inventoryAdjustmentHistorySection"),

    /* -------------------------
       VENDORS
    ------------------------- */
    openVendorFormBtn: byId("openVendorFormBtn"),
    deleteSelectedVendorBtn: byId("deleteSelectedVendorBtn"),
    cancelVendorSelectionBtn: byId("cancelVendorSelectionBtn"),

    vendorsOptionsBtn: byId("vendorsOptionsBtn"),
    vendorsOptionsDropdown: byId("vendorsOptionsDropdown"),
    manageVendorColumnsBtn: byId("manageVendorColumnsBtn"),
    clearVendorFiltersBtn: byId("clearVendorFiltersBtn"),

    vendorsTable: byId("vendorsTable"),
    vendorsTableHeaderRow: byId("vendorsTableHeaderRow"),
    vendorsColumnFilters: byId("vendorsColumnFilters"),
    vendorsGlobalSearch: byId("vendorsGlobalSearch"),
    vendorsResultCount: byId("vendorsResultCount"),

    /* -------------------------
       PURCHASE ORDERS
    ------------------------- */
    openPurchaseOrderBtn: byId("openPurchaseOrderBtn"),
    openPOFormBtn: byId("openPOFormBtn"),
    deleteSelectedPOBtn: byId("deleteSelectedPOBtn"),
    cancelPOSelectionBtn: byId("cancelPOSelectionBtn"),

    poOptionsBtn: byId("poOptionsBtn"),
    poOptionsDropdown: byId("poOptionsDropdown"),
    managePOColumnsBtn: byId("managePOColumnsBtn"),
    clearPOFiltersBtn: byId("clearPOFiltersBtn"),

    purchaseOrdersTable: byId("purchaseOrdersTable"),
    purchaseOrdersTableHeaderRow: byId("purchaseOrdersTableHeaderRow"),
    purchaseOrdersColumnFilters: byId("purchaseOrdersColumnFilters"),
    purchaseOrdersGlobalSearch: byId("purchaseOrdersGlobalSearch"),
    purchaseOrdersResultCount: byId("purchaseOrdersResultCount"),

    /* -------------------------
       SETTINGS
    ------------------------- */
    companyNameInput: byId("companyNameInput"),
    defaultLocationInput: byId("defaultLocationInput"),
    themeSelect: byId("themeSelect"),
    weatherZipInput: byId("weatherZipInput"),
    saveSettingsBtn: byId("saveSettingsBtn"),
    settingsServicesBtn: byId("settingsServicesBtn"),
    settingsUsersBtn: byId("settingsUsersBtn"),
    settingsPasswordBtn: byId("settingsPasswordBtn"),

    /* -------------------------
       USERS / PASSWORD
    ------------------------- */
    usersFrame: byId("usersFrame"),
    currentPasswordInput: byId("currentPasswordInput"),
    newPasswordInput: byId("newPasswordInput"),
    confirmPasswordInput: byId("confirmPasswordInput"),
    savePasswordBtn: byId("savePasswordBtn")
  };
}

export { byId, qsa };