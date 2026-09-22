import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { Inter, Playfair_Display } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/lib/auth";
import { SiteShell } from "@/components/SiteShell";
import { ToastProvider } from "@/components/ToastProvider";
import { PwaRegister } from "@/components/PwaRegister";
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
  title: "Iqtibosim — iqtiboslar to'plami",
  description: "Fikrlarni to'playdigan, bo'limlar va heshteglar bo'yicha saralanadigan iqtiboslar sayti.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Iqtibosim" },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
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
        <PageViewTracker />
        <ToastProvider>
          <AuthProvider>
            <SiteShell>{children}</SiteShell>
          </AuthProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
