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
  views?: number;
  likeCount?: number;
  likedByMe?: boolean;
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

export interface AdminAnnouncement {
  id: string;
  title: string;
  message: string;
  channel: string;
  status: string;
  createdById: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdminFeedback {
  id: string;
  userId: string | null;
  category: string;
  text: string;
  quoteId: string | null;
  status: string;
  adminReply: string | null;
  repliedAt: string | null;
  createdAt: string;
  updatedAt: string;
  user: {
    id: string;
    email: string;
    name: string | null;
    nickname: string | null;
    telegramId: string | null;
  } | null;
}

export interface SiteSetting {
  key: string;
  value: string;
  label: string;
  group: string;
  updatedAt: string;
}

export interface SeoRule {
  id: string;
  page: string;
  title: string | null;
  description: string | null;
  keywords: string | null;
  updatedAt: string;
}

export interface AdminActivityEntry {
  id: string;
  userId: string;
  action: string;
  detail: string | null;
  targetId: string | null;
  createdAt: string;
  user: { id: string; email: string; name: string | null; nickname: string | null } | null;
}

export interface BackupRecord {
  id: string;
  label: string;
  size: number;
  createdAt: string;
}

export interface TopQuote {
  id: string;
  text: string;
  displayAuthor: string;
  views?: number;
  likeCount?: number;
  category: { id: string; name: string; slug: string };
}

export interface TopQuotes {
  mostRead: TopQuote[];
  mostLiked: TopQuote[];
}

export interface TelegramBanUser {
  id: string;
  email: string;
  nickname: string | null;
  name: string | null;
  telegramId: string | null;
  blockedAt: string | null;
  createdAt: string;
}
