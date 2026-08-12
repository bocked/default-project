export interface ServerConfig {
  url: string;
}

export interface User {
  id: string;
  email: string;
  name: string | null;
  nickname: string | null;
  role: string;
  emailVerified: boolean;
  phoneVerified: boolean;
  createdAt: string;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  quoteCount?: number;
}

export interface Tag {
  id: string;
  name: string;
  slug: string;
  quoteCount?: number;
}

export type QuoteStatus = "PENDING" | "APPROVED" | "REJECTED";

export interface Quote {
  id: string;
  text: string;
  displayAuthor: string;
  anonymous: boolean;
  telegramUrl?: string | null;
  status?: QuoteStatus;
  rejectionReason?: string | null;
  createdAt: string;
  category: { id: string; name: string; slug: string };
  tags: Array<{ id: string; name: string; slug: string }>;
}

export interface PaginatedQuotes {
  quotes: Quote[];
  total: number;
  page: number;
  limit: number;
}

export interface PublicUserProfile {
  id: string;
  nickname: string | null;
  createdAt: string;
}

export interface PublicUserProfileData {
  user: PublicUserProfile;
  quotes: Quote[];
}

// ---------------------------------------------------------------------------
// Admin console types
// ---------------------------------------------------------------------------

export interface AdminUser {
  id: string;
  email: string;
  name: string | null;
  nickname: string | null;
  role: string;
  emailVerified: boolean;
  phoneVerified: boolean;
  telegramId: string | null;
  phoneNumber: string | null;
  blocked: boolean;
  blockedAt: string | null;
  deletedAt: string | null;
  createdAt: string;
}

export interface AdminQuote {
  id: string;
  text: string;
  displayAuthor: string;
  anonymous: boolean;
  telegramUrl: string | null;
  status: QuoteStatus;
  rejectionReason: string | null;
  deletedAt: string | null;
  createdAt: string;
  category: Category;
  tags: Tag[];
  user: {
    id: string;
    email: string;
    name: string | null;
    nickname: string | null;
    telegramId: string | null;
    phoneNumber: string | null;
    blocked: boolean;
  };
}

export interface AdminTag {
  id: string;
  name: string;
  slug: string;
  quoteCount: number;
}

export interface AdminLogEntry {
  id: string;
  time: string;
  level: "info" | "warn" | "ban" | "delete";
  message: string;
}

export interface AuditLogEntry {
  id: string;
  adminId: string | null;
  adminEmail: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  detail: string | null;
  ip: string | null;
  createdAt: string;
}

export interface ContentBlock {
  key: string;
  title: string;
  value: string;
  updatedAt: string;
}

export interface ActivityPoint {
  date: string;
  registrations: number;
  quotes: number;
  approved: number;
}

export interface AdminStats {
  bans: number;
  online: number;
  quotes: { pending: number; approved: number; rejected: number };
  users: number;
  deletedQuotes: number;
  blockedUsers: number;
}
