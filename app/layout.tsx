import type { Metadata } from "next";
import "./globals.css";
import "./native-launch.css";
import "./brand-polish.css";
import "@solana/wallet-adapter-react-ui/styles.css";
import { WalletContext } from "@/components/wallet-context";

export const metadata: Metadata = {
  title: "Solana Anything — Launch everywhere",
  description: "Prepare independent Solana token launches from one clean workspace.",
  icons: { icon: "/favicon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body><WalletContext>{children}</WalletContext></body>
    </html>
  );
}
