export const permissionKeys = {
  dashboardRead: "dashboard.read",
  studentsRead: "students.read",
  studentsWrite: "students.write",
  chargesRead: "charges.read",
  chargesWrite: "charges.write",
  receiptsRead: "receipts.read",
  reviewsRead: "reviews.read",
  reviewsResolve: "reviews.resolve",
  webhooksManage: "webhooks.manage",
  settingsManage: "settings.manage"
} as const;

export type PermissionKey = (typeof permissionKeys)[keyof typeof permissionKeys];
