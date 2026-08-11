export interface BannedIpRecord {
  id: string;
  ipAddress: string;
  reason?: string | null;
  createdAt: string;
}

export interface AdminLogEntry {
  id: string;
  time: string;
  level: "info" | "warn" | "ban" | "delete";
  message: string;
}
