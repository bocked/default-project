export type SortKey = "newest" | "most-liked" | "most-viewed";

export interface ServerConfig {
  url: string;
}

export interface User {
  id: string;
  email: string | null;
  name: string | null;
  nickname: string | null;
  role: string;
  emailVerified: boolean;
  phoneVerified: boolean;
  quickLogin?: boolean;
  telegramUsername?: string | null;
  telegramFirstName?: string | null;
  telegramLastName?: string | null;
  isPremium?: boolean;
  premiumExpiresAt?: string | null;
  customWatermark?: string | null;
  avatarUrl?: string | null;
  isSuperApproved?: boolean;
  superApprovedAt?: string | null;
  /** Terms of Use version this account last accepted, and whether the current
   *  version still needs to be accepted before the profile can be used. */
  acceptedTermsVersion?: string | null;
  termsRequired?: boolean;
  currentTermsVersion?: string;
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

/** VIP-only per-post card styling saved as `customStyles` JSON on the Quote.
 *  Mirrors server/src/schemas.ts `quoteCustomStylesSchema`. */
export interface QuoteCustomStyles {
  fontFamily?: "serif" | "sans" | "mono" | "calligraphic";
  textColor?: string;
  cardBg?: string;
  fontSize?: number;
  alignment?: "left" | "center" | "right";
  border?: "none" | "gold" | "silver" | "neon";
  quoteMark?: "classic" | "double" | "single" | "none";
  texture?: "none" | "paper" | "glass";
}

export interface Quote {
  id: string;
  text: string;
  displayAuthor: string;
  anonymous: boolean;
  telegramUrl?: string | null;
  status?: QuoteStatus;
  rejectionReason?: string | null;
  authorPremium?: boolean;
  customStyles?: QuoteCustomStyles | null;
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
  avatarUrl?: string | null;
  isPremium?: boolean;
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
  email: string | null;
  name: string | null;
  nickname: string | null;
  role: string;
  emailVerified: boolean;
  phoneVerified: boolean;
  telegramId: string | null;
  telegramUsername: string | null;
  phoneNumber: string | null;
  blocked: boolean;
  blockedAt: string | null;
  deletedAt: string | null;
  isPremium: boolean;
  premiumExpiresAt: string | null;
  customWatermark?: string | null;
  isSuperApproved?: boolean;
  superApprovedAt?: string | null;
  createdAt: string;
}

export interface AdminQuote {
  id: string;
  text: string;
  displayAuthor: string;
  anonymous: boolean;
  telegramUrl: string | null;
  telegramPostedAt: string | null;
  status: QuoteStatus;
  rejectionReason: string | null;
  deletedAt: string | null;
  customStyles?: QuoteCustomStyles | null;
  createdAt: string;
  category: Category;
  tags: Tag[];
  user: {
    id: string;
    email: string | null;
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

export interface VisitorPoint {
  date: string;
  visitors: number;
  pageViews: number;
}

export interface AdminStats {
  bans: number;
  online: number;
  quotes: { pending: number; approved: number; rejected: number };
  users: number;
  deletedQuotes: number;
  blockedUsers: number;
  today: { visitors: number; pageViews: number };
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
    email: string | null;
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
  user: { id: string; email: string | null; name: string | null; nickname: string | null } | null;
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
  email: string | null;
  nickname: string | null;
  name: string | null;
  telegramId: string | null;
  blockedAt: string | null;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Legal policies (DB-backed, versioned) and Testlar (quizzes)
// ---------------------------------------------------------------------------

export type PolicyType = "TERMS" | "PRIVACY" | "COOKIES";

export interface PolicyContent {
  type: PolicyType;
  version: string;
  content: string;
  changeSummary: string | null;
  publishedAt: string | null;
}

export interface PolicyResponse {
  policy: PolicyContent;
  draft: { id: string; version: string; changeSummary: string | null } | null;
}

export type QuizStatus = "PENDING" | "APPROVED" | "REJECTED";

export interface QuizQuestion {
  id: string;
  question: string;
  options: string[];
  /** Hidden from guests / non-attempted users unless revealed. */
  correctIndex: number | null;
}

export interface QuizAuthor {
  id: string;
  nickname: string | null;
  avatarUrl: string | null;
}

export interface Quiz {
  id: string;
  title: string;
  description: string | null;
  status: QuizStatus;
  createdAt: string;
  questionCount: number;
  attemptCount: number;
  author: QuizAuthor;
  questions?: QuizQuestion[];
}

export interface QuizListResponse {
  quizzes: Quiz[];
  total: number;
  page: number;
  limit: number;
}

export interface QuizResultPerQuestion {
  correct: boolean;
  correctIndex: number;
  yourAnswer: number;
}

export interface QuizResultSummary {
  quizId: string;
  title: string;
  quizStatus: QuizStatus;
  score: number;
  total: number;
  answers: QuizResultPerQuestion[];
  updatedAt: string;
}

export interface QuizDetailResponse {
  quiz: Quiz;
  myResult: {
    score: number;
    total: number;
    answers: QuizResultPerQuestion[];
    updatedAt: string;
  } | null;
}

export interface QuizAttemptResponse {
  score: number;
  total: number;
  perQuestion: QuizResultPerQuestion[];
  resultId: string;
}

export interface AdminQuiz {
  id: string;
  title: string;
  description: string | null;
  status: QuizStatus;
  rejectionReason: string | null;
  createdAt: string;
  updatedAt: string;
  author: {
    id: string;
    email: string | null;
    nickname: string | null;
    avatarUrl: string | null;
  };
  questionCount: number;
  resultCount: number;
  questions?: QuizQuestion[];
}

export interface AdminQuizListResponse {
  quizzes: AdminQuiz[];
  total: number;
  page: number;
  limit: number;
}

export interface AdminPolicy {
  id: string;
  type: PolicyType;
  version: string;
  content: string;
  isApproved: boolean;
  changeSummary: string | null;
  changeReason: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  current: boolean;
}

export interface AdminPolicyListResponse {
  policies: AdminPolicy[];
}

export interface AdminPolicyTypeResponse {
  type: PolicyType;
  label: string;
  published: string;
  policies: AdminPolicy[];
}

// ---------------------------------------------------------------------------
// Email management (Super Admin) — "Pochta Boshqaruvi"
// ---------------------------------------------------------------------------

export type EmailType =
  | "VERIFICATION"
  | "PASSWORD_RESET"
  | "QUOTE_MODERATION"
  | "ANNOUNCEMENT"
  | "TEST";

export type EmailDeliveryStatus = "SUCCESS" | "FAILED";

export interface EmailsHealth {
  mode: "smtp" | "brevo" | "offline";
  configured: boolean;
  host: string | null;
  port: number;
  secure: boolean;
  from: string;
  sender: string;
  appUrl: string;
  testMode: boolean;
}

export interface EmailLogEntry {
  id: string;
  type: EmailType;
  to: string;
  subject: string;
  status: EmailDeliveryStatus;
  messageId: string | null;
  error: string | null;
  createdAt: string;
}

export interface EmailLogResponse {
  logs: EmailLogEntry[];
  total: number;
  page: number;
  limit: number;
}

export interface EmailTemplate {
  id: string;
  label: string;
  subject: string;
  text: string;
  html: string;
}

export interface EmailTemplatesResponse {
  templates: EmailTemplate[];
}

export interface ActiveOtp {
  userId: string;
  email: string;
  masked: string;
  issuedAt: string;
  expiresAt: string;
}

export interface ActiveOtpResponse {
  otps: ActiveOtp[];
}

export interface EmailTestResult {
  ok: boolean;
  to: string;
  messageId: string | null;
  error: string | null;
}
