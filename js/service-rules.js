export const SERVICE_CODES = {
  PM90: "PM90",
  ANNUAL: "ANNUAL",
  TRUCK_A: "TRUCK_A",
  TRUCK_B: "TRUCK_B",
  VIK: "VIK",
  VIKTUC: "VIKTUC",
  VIKTUCP: "VIKTUCP",
  REPAIR: "REPAIR"
};

export const SERVICE_CATEGORY_TO_CODE = {
  pm90: SERVICE_CODES.PM90,
  annual: SERVICE_CODES.ANNUAL,
  truck_a: SERVICE_CODES.TRUCK_A,
  truck_b: SERVICE_CODES.TRUCK_B,
  vik: SERVICE_CODES.VIK,
  viktuc: SERVICE_CODES.VIKTUC,
  viktucp: SERVICE_CODES.VIKTUCP,
  repair: SERVICE_CODES.REPAIR
};

export const SERVICE_CODE_TO_CATEGORY = {
  [SERVICE_CODES.PM90]: "pm90",
  [SERVICE_CODES.ANNUAL]: "annual",
  [SERVICE_CODES.TRUCK_A]: "truck_a",
  [SERVICE_CODES.TRUCK_B]: "truck_b",
  [SERVICE_CODES.VIK]: "vik",
  [SERVICE_CODES.VIKTUC]: "viktuc",
  [SERVICE_CODES.VIKTUCP]: "viktucp",
  [SERVICE_CODES.REPAIR]: "repair"
};

export const SERVICE_LABELS = {
  [SERVICE_CODES.PM90]: "90-Day PM",
  [SERVICE_CODES.ANNUAL]: "Annual",
  [SERVICE_CODES.TRUCK_A]: "A Service",
  [SERVICE_CODES.TRUCK_B]: "B Service",
  [SERVICE_CODES.VIK]: "VIK",
  [SERVICE_CODES.VIKTUC]: "VIKTUC",
  [SERVICE_CODES.VIKTUCP]: "VIKTUCP",
  [SERVICE_CODES.REPAIR]: "Repair"
};

export function getServiceLabel(code) {
  return SERVICE_LABELS[code] || String(code || "").trim() || "Service";
}

export function getServiceCategoryFromCode(code) {
  return SERVICE_CODE_TO_CATEGORY[String(code || "").trim()] || "";
}

export function getServiceCodeFromCategory(category) {
  return SERVICE_CATEGORY_TO_CODE[String(category || "").trim().toLowerCase()] || "";
}

export function isTruckServiceCode(code) {
  return code === SERVICE_CODES.TRUCK_A || code === SERVICE_CODES.TRUCK_B;
}