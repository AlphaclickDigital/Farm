import {
  Carrot,
  Apple,
  Milk,
  Wheat,
  Beef,
  Leaf,
  Package,
  Drumstick,
  Egg,
  Fish,
  Ham,
  Hexagon,
  Sprout,
  type LucideIcon,
} from "lucide-react"

export const categoryVisuals: Record<string, { icon: LucideIcon }> = {
  vegetables: { icon: Carrot },
  vegetable: { icon: Carrot },
  fruits: { icon: Apple },
  dairy: { icon: Milk },
  grains: { icon: Wheat },
  meat: { icon: Beef },
  beef: { icon: Beef },
  lamb: { icon: Beef },
  pork: { icon: Ham },
  chicken: { icon: Drumstick },
  eggs: { icon: Egg },
  seafood: { icon: Fish },
  honey: { icon: Hexagon },
  herbs: { icon: Leaf },
  "organic-produce": { icon: Sprout },
  "farm-produce": { icon: Wheat },
}

export function getCategoryIcon(slug: string): LucideIcon {
  return categoryVisuals[slug]?.icon ?? Package
}
