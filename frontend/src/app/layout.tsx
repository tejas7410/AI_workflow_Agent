import type { Metadata } from "next";
import "./globals.css";
import AppShell from "@/components/AppShell";

export const metadata: Metadata = {
  title: "AI Agent Workflow Builder",
  description:
    "Secure multi-tenant AI workflow platform.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-950 antialiased">
        <AppShell>
          {children}
        </AppShell>
      </body>
    </html>
  );
}