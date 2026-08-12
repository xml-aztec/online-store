"use client";

import { Drawer } from "@/shared/ui/Drawer";
import { ProductDetailContent } from "@/widgets/ProductDetailContent";

interface ProductDrawerProps {
  productId: string | null;
  onClose: () => void;
}

export function ProductDrawer({ productId, onClose }: ProductDrawerProps) {
  return (
    <Drawer open={productId !== null} onClose={onClose} width={520}>
      {productId && <ProductDetailContent productId={productId} />}
    </Drawer>
  );
}
