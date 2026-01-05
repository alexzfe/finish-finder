import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "@fontsource-variable/roboto-condensed";
import "@fontsource-variable/karla";
import * as Sentry from "@sentry/nextjs";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Finish Finder | UFC Fight Entertainment Analysis",
  description: "AI-powered analysis of upcoming UFC fights to predict which matches will be the most entertaining to watch.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        {/* Skip navigation link for accessibility */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-[100] focus:rounded-lg focus:bg-[var(--ufc-red)] focus:px-4 focus:py-2 focus:text-white focus:outline-none focus:ring-2 focus:ring-white"
        >
          Skip to main content
        </a>
        <Sentry.ErrorBoundary fallback={<div>Something went wrong. Please refresh.</div>}>
          {children}
        </Sentry.ErrorBoundary>
      </body>
    </html>
  );
}
