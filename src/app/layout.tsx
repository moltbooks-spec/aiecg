import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "AIECG | AI-Powered Electrocardiogram Analysis Platform",
  description:
    "AIECG platform: upload an ECG image and receive an accurate, professional downloadable PDF report — built for doctors and hospitals.",
  keywords: [
    "AIECG",
    "ECG",
    "EKG",
    "ECG analysis",
    "AI cardiology",
    "electrocardiogram",
    "medical AI",
    "cardiac report",
    "doctors",
    "hospitals",
  ],
  applicationName: "AIECG",
};

export const viewport: Viewport = {
  themeColor: "#0f766e",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" dir="ltr" suppressHydrationWarning>
      <body
        className={`${inter.variable} antialiased bg-background text-foreground font-sans`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
