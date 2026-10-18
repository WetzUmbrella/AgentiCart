import type { Metadata } from "next";
import Header from "@/components/Header";
import "./globals.css";

export const metadata: Metadata = {
  title: "AgentCart",
  description: "Approve once. Pay only for parts confirmed to fit.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,400..800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <div className="shell">
          <Header />
          {children}
        </div>
      </body>
    </html>
  );
}
