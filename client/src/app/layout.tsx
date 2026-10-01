import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { Inter, Playfair_Display } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/lib/auth";
import { I18nProvider } from "@/lib/i18n";
import { DEFAULT_OG_IMAGE, SITE_NAME, SITE_URL } from "@/lib/siteMeta";
import { SiteShell } from "@/components/SiteShell";
import { ToastProvider } from "@/components/ToastProvider";
import { CookieConsentGate } from "@/components/CookieConsentGate";
import { TermsReAcceptGate } from "@/components/TermsReAcceptGate";
import { PwaRegister } from "@/components/PwaRegister";
import { InstallPwa } from "@/components/InstallPwa";
import { PageViewTracker } from "@/components/PageViewTracker";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const playfair = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
  display: "swap",
});

// Applies the saved theme before first paint so there is no flash of the
// wrong palette. Runs on the client only.
const themeInit = `(function(){try{var t=localStorage.getItem('iqtibosim_theme');if(!t){t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}if(t==='dark'){document.documentElement.classList.add('dark');}}catch(e){}})();`;

export const metadata: Metadata = {
  // Required for any relative URL-based metadata field (og:image, canonical,
  // icons). Without it, Next raises a build error rather than silently emitting
  // a broken relative URL that social crawlers cannot resolve.
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Iqtibosim — iqtiboslar to'plami",
    // Child segments that only set `title` get "… | Iqtibosim" automatically.
    template: "%s | Iqtibosim",
  },
  description: "Fikrlarni to'playdigan, bo'limlar va heshteglar bo'yicha saralanadigan iqtiboslar sayti.",
  applicationName: SITE_NAME,
  keywords: ["iqtibos", "iqtiboslar", "motivatsiya", "maqolalar", "o'zbekcha iqtiboslar"],
  authors: [{ name: SITE_NAME }],
  creator: SITE_NAME,
  publisher: SITE_NAME,
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Iqtibosim" },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  // Site-wide defaults. Individual routes override these via pageMeta() in
  // their nested layout.tsx.
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    locale: "uz_UZ",
    url: SITE_URL,
    title: "Iqtibosim — iqtiboslar to'plami",
    description: "Fikrlarni to'playdigan, bo'limlar va heshteglar bo'yicha saralanadigan iqtiboslar sayti.",
    images: [
      {
        url: `${SITE_URL}${DEFAULT_OG_IMAGE.url}`,
        width: DEFAULT_OG_IMAGE.width,
        height: DEFAULT_OG_IMAGE.height,
        alt: DEFAULT_OG_IMAGE.alt,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Iqtibosim — iqtiboslar to'plami",
    description: "Fikrlarni to'playdigan, bo'limlar va heshteglar bo'yicha saralanadigan iqtiboslar sayti.",
    images: [`${SITE_URL}${DEFAULT_OG_IMAGE.url}`],
  },
  formatDetection: { telephone: false, address: false, email: false },
};

export const viewport: Viewport = {
  themeColor: "#2563eb",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="uz" suppressHydrationWarning className={`${inter.variable} ${playfair.variable} antialiased`}>
      <head>
        <Script id="theme-init" strategy="beforeInteractive" dangerouslySetInnerHTML={{ __html: themeInit }} />
      </head>
      <body className="min-h-screen bg-background text-foreground">
        <PwaRegister />
        <InstallPwa />
        <PageViewTracker />
        <ToastProvider>
          <AuthProvider>
            <I18nProvider>
              <CookieConsentGate />
              <TermsReAcceptGate />
              <SiteShell>{children}</SiteShell>
            </I18nProvider>
          </AuthProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
