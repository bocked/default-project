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
