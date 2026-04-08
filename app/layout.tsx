import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Networking Agent",
  description: "Find and reach the right people in 30 days",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="bg-gray-950 text-gray-100 min-h-screen antialiased">
        {children}
      </body>
    </html>
  );
}
