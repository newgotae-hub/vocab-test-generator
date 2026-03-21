import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";

const segoeUi = localFont({
  src: [
    {
      path: "./fonts/segoeui.ttf",
      weight: "400",
      style: "normal",
    },
    {
      path: "./fonts/segoeuib.ttf",
      weight: "700",
      style: "normal",
    },
  ],
  variable: "--font-ui",
});

const garamond = localFont({
  src: [
    {
      path: "./fonts/gara.ttf",
      weight: "400",
      style: "normal",
    },
    {
      path: "./fonts/garabd.ttf",
      weight: "700",
      style: "normal",
    },
  ],
  variable: "--font-display",
});

export const metadata: Metadata = {
  title: "Voca Atelier",
  description: "교재 DB를 바탕으로 Basic, Advanced, Etymology를 한 번에 학습하는 프리미엄 보카 스터디 앱",
  applicationName: "Voca Atelier",
  appleWebApp: {
    capable: true,
    title: "Voca Atelier",
    statusBarStyle: "default",
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: "/favicon.ico",
    apple: "/favicon.ico",
  },
};

export const viewport: Viewport = {
  themeColor: "#f4efe7",
  colorScheme: "light",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body className={`${segoeUi.variable} ${garamond.variable} antialiased`}>{children}</body>
    </html>
  );
}
