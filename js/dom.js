import { byId, qs, qsa } from "./utils.js";

export function getDom() {
  return {
    /* -------------------------
       APP / LOGIN
    ------------------------- */
    loginScreen: byId("loginScreen"),
    appWrapper: byId("appWrapper"),
    loginBtn: byId("loginBtn"),
    loginUsername: byId("loginUsername"),
    loginPassword: byId("loginPassword"),
    loginError: byId("loginError"),

    /* -------------------------
       SETTINGS
    ------------------------- */
    settingsMenuBtn: byId("settingsMenuBtn"),
    settingsDropdown: byId("settingsDropdown"),
    openSettingsBtn: byId("openSettingsBtn"),
    openServicesBtn: byId("openServicesBtn") || byId("servicesBtn"),
    changePasswordBtn: byId("changePasswordBtn"),
    logoutBtn: byId("logoutBtn"),

    settingsPanel: byId("settingsPanel"),
    saveSettingsBtn: byId("saveSettingsBtn"),
    closeSettingsBtn: byId("closeSettingsBtn"),

    companyNameSetting: byId("companyNameSetting"),
    defaultLocationSetting: byId("defaultLocationSetting"),
    themeSetting: byId("themeSetting"),

    /* -------------------------
       PASSWORD MODAL
    ------------------------- */
    passwordModal: byId("passwordModal"),
    closePasswordModalBtn: byId("closePasswordModalBtn"),
    savePasswordBtn: byId("savePasswordBtn"),
    newPasswordInput: byId("newPasswordInput"),

    /* -------------------------
       APP MESSAGE / CONFIRM MODAL
    ------------------------- */
    appModal: byId("appModal"),
    appModalTitle: byId("appModalTitle"),
    appModalMessage: byId("appModalMessage"),
    appModalConfirmBtn: byId("appModalConfirmBtn"),
    appModalCancelBtn: byId("appModalCancelBtn"),
    appModalCloseBtn: byId("appModalCloseBtn"),

    /* -------------------------
       SERVICE TRACKING MODAL
    ------------------------- */
    serviceTrackingModal: byId("serviceTrackingModal"),
    serviceTrackingModalTitle: byId("serviceTrackingModalTitle"),
    serviceTrackingTaskName: byId("serviceTrackingTaskName"),
    serviceTrackingLastDateInput: byId("serviceTrackingLastDateInput"),
    serviceTrackingLastMilesInput: byId("serviceTrackingLastMilesInput"),
    serviceTrackingNotesInput: byId("serviceTrackingNotesInput"),
    saveServiceTrackingBtn: byId("saveServiceTrackingBtn"),
    cancelServiceTrackingBtn: byId("cancelServiceTrackingBtn"),
    closeServiceTrackingModalBtn: byId("closeServiceTrackingModalBtn"),

    /* -------------------------
       NAVIGATION
    ------------------------- */
    views: qsa(".view"),
    navLinks: qsa("#sidebar a"),
    homeLogo: byId("homeLogo"),

    /* -------------------------
       SHARED PANELS
    ------------------------- */
    formPanel: byId("formPanel"),
    inventoryFormPanel: byId("inventoryFormPanel"),
    vendorFormPanel: byId("vendorFormPanel"),
    workOrderFormPanel: byId("workOrderFormPanel"),
    poFormPanel: byId("poFormPanel"),

    /* -------------------------
       EQUIPMENT
    ------------------------- */
    equipmentListSection: byId("equipmentListSection"),
    equipmentProfileSection: byId("equipmentProfileSection"),
    equipmentTable: byId("equipmentTable"),
    equipmentTableBody: qs("#equipmentTable tbody"),
    equipmentGlobalSearch: byId("equipmentGlobalSearch"),
    equipmentResultCount: byId("equipmentResultCount"),
    equipmentColumnFilters: byId("equipmentColumnFilters"),
    equipmentTableHeaderRow: byId("equipmentTableHeaderRow"),

    equipmentOptionsBtn: byId("equipmentOptionsBtn"),
    equipmentOptionsDropdown: byId("equipmentOptionsDropdown"),
    manageColumnsBtn: byId("manageColumnsBtn"),
    clearEquipmentFiltersBtn: byId("clearEquipmentFiltersBtn"),
    importEquipmentBtn: byId("importEquipmentBtn"),
    equipmentImportInput: byId("equipmentImportInput"),
    openDeletedEquipmentBtn: byId("openDeletedEquipmentBtn"),
    openFormBtn: byId("openFormBtn"),
    closeColumnManagerBtn: byId("closeColumnManagerBtn"),

    backToEquipmentListBtn: byId("backToEquipmentListBtn"),
    editProfileBtn: byId("editProfileBtn"),
    addProfileWOBtn: byId("addProfileWOBtn"),

    equipmentHistoryTableBody: qs("#equipmentHistoryTable tbody"),
    equipmentServicesTableBody: qs("#equipmentServicesTable tbody"),
    partAssignmentHistoryTableBody: qs("#partAssignmentHistoryTable tbody"),

    columnManagerPanel: byId("columnManagerPanel"),
    columnManagerList: byId("columnManagerList"),

    formTitle: byId("formTitle"),
    saveBtn: byId("saveBtn"),
    updateBtn: byId("updateBtn"),
    deleteBtn: byId("deleteBtn"),
    closeBtn: byId("closeBtn"),
    decodeVinBtn: byId("decodeVinBtn"),

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

    historyStatusFilter: byId("historyStatusFilter"),
    historyDateFrom: byId("historyDateFrom"),
    historyDateTo: byId("historyDateTo"),
    applyHistoryFiltersBtn: byId("applyHistoryFiltersBtn"),
    clearHistoryFiltersBtn: byId("clearHistoryFiltersBtn"),

    profileTabs: qsa(".profileTab"),
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
    profileCylinders: byId("profileCylinders"),
    profileRepairCount: byId("profileRepairCount"),
    profileRepairCost: byId("profileRepairCost"),
    filteredRepairCount: byId("filteredRepairCount"),
    filteredRepairCost: byId("filteredRepairCost"),

    deleteSelectedEquipmentBtn: byId("deleteSelectedEquipmentBtn"),
    cancelEquipmentSelectionBtn: byId("cancelEquipmentSelectionBtn"),

    /* -------------------------
       WORK ORDERS NAV PAGE
    ------------------------- */
    workOrdersTable: byId("workOrdersTable"),
    workOrdersTableBody: qs("#workOrdersTable tbody"),
    workOrdersTableHeaderRow: byId("workOrdersTableHeaderRow"),
    woGlobalSearch: byId("woGlobalSearch"),
    woResultCount: byId("woResultCount"),
    woColumnFilters: byId("woColumnFilters"),

    workOrdersOptionsBtn: byId("workOrdersOptionsBtn"),
    workOrdersOptionsDropdown: byId("workOrdersOptionsDropdown"),
    manageWOColumnsBtn: byId("manageWOColumnsBtn"),
    clearWOFiltersBtn: byId("clearWOFiltersBtn"),
    openQuickWOFormBtn: byId("openQuickWOFormBtn"),
    deleteSelectedWOBtn: byId("deleteSelectedWOBtn"),
    cancelWOSelectionBtn: byId("cancelWOSelectionBtn"),

    /* -------------------------
       QUICK WORK ORDER PANEL
    ------------------------- */
    woEquipmentQuick: byId("woEquipmentQuick"),
    woEquipmentMatchInfo: byId("woEquipmentMatchInfo"),
    woMileageQuick: byId("woMileageQuick"),
    woAssigneeQuick: byId("woAssigneeQuick"),
    woDateScheduledQuick: byId("woDateScheduledQuick"),
    woServiceTypeQuick: byId("woServiceTypeQuick"),
    woInitialNotesQuick: byId("woInitialNotesQuick"),

    saveQuickWOBtn: byId("saveQuickWOBtn"),
    updateQuickWOBtn: byId("updateQuickWOBtn"),
    deleteQuickWOBtn: byId("deleteQuickWOBtn"),
    closeQuickWOBtn: byId("closeQuickWOBtn"),

    /* -------------------------
       INVENTORY
    ------------------------- */
    inventoryTable: byId("inventoryTable"),
    inventoryTableBody: qs("#inventoryTable tbody"),
    inventoryTableHeaderRow: byId("inventoryTableHeaderRow"),
    inventoryGlobalSearch: byId("inventoryGlobalSearch"),
    inventoryResultCount: byId("inventoryResultCount"),
    inventoryColumnFilters: byId("inventoryColumnFilters"),

    inventoryOptionsBtn: byId("inventoryOptionsBtn"),
    inventoryOptionsDropdown: byId("inventoryOptionsDropdown"),
    manageInventoryColumnsBtn: byId("manageInventoryColumnsBtn"),
    clearInventoryFiltersBtn: byId("clearInventoryFiltersBtn"),
    importInventoryBtn: byId("importInventoryBtn"),
    inventoryImportInput: byId("inventoryImportInput"),

    openInventoryFormBtn: byId("openInventoryFormBtn"),
    deleteSelectedInventoryBtn: byId("deleteSelectedInventoryBtn"),
    cancelInventorySelectionBtn: byId("cancelInventorySelectionBtn"),

    invName: byId("invName"),
    invPartNumber: byId("invPartNumber"),
    invCategory: byId("invCategory"),
    invQuantity: byId("invQuantity"),
    invUnitCost: byId("invUnitCost"),
    invLocation: byId("invLocation"),
    invVendor: byId("invVendor"),
    invNotes: byId("invNotes"),

    saveInventoryBtn: byId("saveInventoryBtn"),
    updateInventoryBtn: byId("updateInventoryBtn"),
    deleteInventoryBtn: byId("deleteInventoryBtn"),
    closeInventoryBtn: byId("closeInventoryBtn"),

    /* -------------------------
       VENDORS
    ------------------------- */
    vendorsTable: byId("vendorsTable"),
    vendorsTableBody: qs("#vendorsTable tbody"),
    vendorsTableHeaderRow: byId("vendorsTableHeaderRow"),
    vendorsGlobalSearch: byId("vendorsGlobalSearch"),
    vendorsResultCount: byId("vendorsResultCount"),
    vendorsColumnFilters: byId("vendorsColumnFilters"),

    vendorsOptionsBtn: byId("vendorsOptionsBtn"),
    vendorsOptionsDropdown: byId("vendorsOptionsDropdown"),
    manageVendorColumnsBtn: byId("manageVendorColumnsBtn"),
    clearVendorFiltersBtn: byId("clearVendorFiltersBtn"),
    openVendorFormBtn: byId("openVendorFormBtn"),
    deleteSelectedVendorBtn: byId("deleteSelectedVendorBtn"),
    cancelVendorSelectionBtn: byId("cancelVendorSelectionBtn"),

    vendorName: byId("vendorName"),
    vendorContact: byId("vendorContact"),
    vendorPhone: byId("vendorPhone"),
    vendorEmail: byId("vendorEmail"),
    vendorAddress: byId("vendorAddress"),

    saveVendorBtn: byId("saveVendorBtn"),
    updateVendorBtn: byId("updateVendorBtn"),
    deleteVendorBtn: byId("deleteVendorBtn"),
    closeVendorBtn: byId("closeVendorBtn"),

    /* -------------------------
       PURCHASE ORDERS NAV PAGE
    ------------------------- */
    poTable: byId("poTable"),
    poTableBody: qs("#poTable tbody"),
    poTableHeaderRow: byId("poTableHeaderRow"),
    poGlobalSearch: byId("poGlobalSearch"),
    poResultCount: byId("poResultCount"),
    poColumnFilters: byId("poColumnFilters"),

    poOptionsBtn: byId("poOptionsBtn"),
    poOptionsDropdown: byId("poOptionsDropdown"),
    managePOColumnsBtn: byId("managePOColumnsBtn"),
    clearPOFiltersBtn: byId("clearPOFiltersBtn"),
    openPOFormBtn: byId("openPOFormBtn"),
    deleteSelectedPOBtn: byId("deleteSelectedPOBtn"),
    cancelPOSelectionBtn: byId("cancelPOSelectionBtn"),

    /* -------------------------
       PURCHASE ORDER SIDE PANEL
    ------------------------- */
    poNumberInput: byId("poNumberInput"),
    poVendorInput: byId("poVendorInput"),
    poDateInput: byId("poDateInput"),
    poStatusInput: byId("poStatusInput"),
    poTotalInput: byId("poTotalInput"),
    poNotesInput: byId("poNotesInput"),

    savePOBtn: byId("savePOBtn"),
    updatePOBtn: byId("updatePOBtn"),
    deletePOBtn: byId("deletePOBtn"),
    closePOBtn: byId("closePOBtn"),

    /* -------------------------
       DELETED EQUIPMENT
    ------------------------- */
    deletedEquipmentTable: byId("deletedEquipmentTable"),
    deletedEquipmentTableBody: qs("#deletedEquipmentTable tbody"),
    deletedEquipmentTableHeaderRow: byId("deletedEquipmentTableHeaderRow"),
    deletedEquipmentGlobalSearch: byId("deletedEquipmentGlobalSearch"),
    deletedEquipmentResultCount: byId("deletedEquipmentResultCount"),
    deletedEquipmentColumnFilters: byId("deletedEquipmentColumnFilters"),

    deletedEquipmentOptionsBtn: byId("deletedEquipmentOptionsBtn"),
    deletedEquipmentOptionsDropdown: byId("deletedEquipmentOptionsDropdown"),
    manageDeletedEquipmentColumnsBtn: byId("manageDeletedEquipmentColumnsBtn"),
    clearDeletedEquipmentFiltersBtn: byId("clearDeletedEquipmentFiltersBtn"),
    restoreSelectedEquipmentBtn: byId("restoreSelectedEquipmentBtn"),
    permanentlyDeleteSelectedEquipmentBtn: byId("permanentlyDeleteSelectedEquipmentBtn"),
    cancelDeletedSelectionBtn: byId("cancelDeletedSelectionBtn"),

    deletedEquipmentPanel: byId("deletedEquipmentPanel"),
    restoreDeletedEquipmentBtn: byId("restoreDeletedEquipmentBtn"),
    permanentlyDeleteEquipmentBtn: byId("permanentlyDeleteEquipmentBtn"),

    deletedProfileUnit: byId("deletedProfileUnit"),
    deletedProfileType: byId("deletedProfileType"),
    deletedProfileYear: byId("deletedProfileYear"),
    deletedProfileVin: byId("deletedProfileVin"),
    deletedProfilePlate: byId("deletedProfilePlate"),
    deletedProfileState: byId("deletedProfileState"),
    deletedProfileStatus: byId("deletedProfileStatus"),
    deletedProfileLocation: byId("deletedProfileLocation"),
    deletedProfilePM: byId("deletedProfilePM"),
    deletedProfileBusiness: byId("deletedProfileBusiness"),
    deletedProfileRim: byId("deletedProfileRim"),
    deletedProfileSize: byId("deletedProfileSize"),
    deletedProfilePressure: byId("deletedProfilePressure"),

    /* -------------------------
       DASHBOARD
    ------------------------- */
    dashActiveCount: byId("dashActiveCount"),
    dashInactiveCount: byId("dashInactiveCount"),
    dashInShopCount: byId("dashInShopCount"),
    dashOutOfServiceCount: byId("dashOutOfServiceCount"),

    dashWOOpen: byId("dashWOOpen"),
    dashWOPending: byId("dashWOPending"),
    dashWOCompleted: byId("dashWOCompleted"),

    dashOverduePM: byId("dashOverduePM"),
    dashDueSoonPM: byId("dashDueSoonPM"),
    dashAvgResolveDays: byId("dashAvgResolveDays"),

    dashTopRepairs: byId("dashTopRepairs"),
    dashOpenIssues: byId("dashOpenIssues"),
    dashOverdueIssues: byId("dashOverdueIssues"),

    dashServiceCostMonth: byId("dashServiceCostMonth"),
    dashServiceCostTotal: byId("dashServiceCostTotal"),
    dashTotalWOCost: byId("dashTotalWOCost"),
    dashTotalPOCost: byId("dashTotalPOCost"),
    dashCombinedCost: byId("dashCombinedCost"),
    dashRecentActivity: byId("dashRecentActivity")
  };
}