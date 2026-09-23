import type { Metadata } from "next";
import "./globals.css";
import "./native-launch.css";
import "./brand-polish.css";
import "./action-polish.css";
import "./anything-theme.css";
import "@solana/wallet-adapter-react-ui/styles.css";
import { WalletContext } from "@/components/wallet-context";

export const metadata: Metadata = {
  title: "Anything Solana — One place to launch anything",
  description: "Launch one token across independent Solana launchpads from one wallet and one clean workspace.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body><WalletContext>{children}</WalletContext></body>
    </html>
  );
}
