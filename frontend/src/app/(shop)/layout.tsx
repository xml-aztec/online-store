import type { ReactNode } from "react";

import { BottomNav } from "@/widgets/BottomNav";
import { Footer } from "@/widgets/Footer";
import { Header } from "@/widgets/Header";

export default function ShopLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <Header />
      <main className="flex-1">{children}</main>
      <Footer />
      <BottomNav />
    </div>
  );
}
