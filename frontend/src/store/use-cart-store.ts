import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface CartItem {
  id: string;
  productId: string;
  variantId: string;
  variantLabel: string;
  name: string;
  priceCents: number;
  quantity: number;
  vendorId: string;
  // Optional: carts saved before farm grouping existed don't have it.
  vendorName?: string;
  image?: string;
  stockAmount: number;
  unitAmount: number;
  // Set by syncItem when the product, variant or stock is gone.
  unavailable?: boolean;
}

function getMaxQuantity(item: CartItem): number {
  return Math.floor(item.stockAmount / item.unitAmount);
}

interface CartStore {
  items: CartItem[];
  addItem: (item: CartItem) => void;
  removeItem: (itemId: string) => void;
  updateQuantity: (itemId: string, quantity: number) => void;
  /** Refreshes a line from live product data, clamping quantity to stock. */
  syncItem: (
    itemId: string,
    patch: Pick<CartItem, 'stockAmount' | 'priceCents' | 'unavailable'> & Partial<Pick<CartItem, 'vendorName' | 'image'>>,
  ) => void;
  clearCart: () => void;
  getTotalItems: () => number;
  getTotalPrice: () => number;
}

export const useCartStore = create<CartStore>()(
  persist(
    (set, get) => ({
      items: [],
      addItem: (item) => {
        const currentItems = get().items;
        const existingItem = currentItems.find((i) => i.variantId === item.variantId);
        const max = getMaxQuantity(item);

        if (existingItem) {
          set({
            items: currentItems.map((i) =>
              i.variantId === item.variantId
                ? {
                    ...i,
                    quantity: Math.min(i.quantity + item.quantity, max),
                    stockAmount: item.stockAmount,
                    unitAmount: item.unitAmount,
                    priceCents: item.priceCents,
                    vendorName: item.vendorName ?? i.vendorName,
                    unavailable: false,
                  }
                : i
            ),
          });
        } else {
          set({ items: [...currentItems, { ...item, quantity: Math.min(item.quantity, max) }] });
        }
      },
      removeItem: (itemId) => {
        set({ items: get().items.filter((i) => i.id !== itemId) });
      },
      updateQuantity: (itemId, quantity) => {
        set({
          items: get().items.map((i) => {
            if (i.id !== itemId) return i;
            const max = getMaxQuantity(i);
            return { ...i, quantity: Math.min(Math.max(1, quantity), max) };
          }),
        });
      },
      syncItem: (itemId, patch) => {
        set({
          items: get().items.map((i) => {
            if (i.id !== itemId) return i;
            const next = { ...i, ...patch };
            const max = getMaxQuantity(next);
            return { ...next, quantity: max >= 1 ? Math.min(Math.max(1, i.quantity), max) : i.quantity };
          }),
        });
      },
      clearCart: () => set({ items: [] }),
      getTotalItems: () => get().items.reduce((total, item) => total + item.quantity, 0),
      getTotalPrice: () => get().items.reduce((total, item) => total + item.priceCents * item.quantity, 0),
    }),
    {
      name: 'cart-storage',
    }
  )
);

/** Cart lines grouped by farm, in the order each farm was first added. */
export function groupByFarm(items: CartItem[]) {
  const groups = new Map<string, { vendorId: string; vendorName?: string; items: CartItem[]; subtotalCents: number }>();
  for (const item of items) {
    const group = groups.get(item.vendorId) ?? { vendorId: item.vendorId, vendorName: item.vendorName, items: [], subtotalCents: 0 };
    group.vendorName ??= item.vendorName;
    group.items.push(item);
    group.subtotalCents += item.priceCents * item.quantity;
    groups.set(item.vendorId, group);
  }
  return [...groups.values()];
}
