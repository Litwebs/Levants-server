export const mockUsers = [
  {
    id: "USR001",
    name: "John Admin",
    email: "john@levantsdairy.com",
    role: "admin" as const,
    status: "active" as const,
    lastLogin: "Today, 9:15 AM",
    createdAt: "Jan 12, 2026",
  },
  {
    id: "USR002",
    name: "Sarah Manager",
    email: "sarah@levantsdairy.com",
    role: "manager" as const,
    status: "active" as const,
    lastLogin: "Yesterday, 4:32 PM",
    createdAt: "Dec 03, 2025",
  },
];

export const defaultNotificationSettings = [
  {
    id: "notif-1",
    name: "New Orders",
    description: "Get notified when a new order is placed",
    email: true,
    push: true,
    sms: false,
  },
];
