import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "eUrbanizam Admin",
  description: "Operations and finance console",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
