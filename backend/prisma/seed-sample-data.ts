/**
 * Sample-data seed for local development and QA.
 *
 * Creates 10 approved Australian farm vendors (+1 pending approval), their
 * products, variants, images and shipping options, plus two sample customer
 * accounts. Every sample account uses an @example.com address and the shared
 * password "12345678", which makes sample data easy to identify (and remove).
 *
 * Idempotent: records are looked up by natural key (email, category slug,
 * vendor + product slug, vendor + shipping option name) and only created when
 * missing. Existing records — sample or real — are never modified or deleted.
 *
 *   npm run seed:sample                  # vendors, products, sample customers
 *   npm run seed:sample -- --with-admin  # also create sample.admin@example.com
 *
 * Product images are hotlinked from the Pexels CDN (Pexels License: free to
 * use, no attribution required). Re-host them on Cloudinary before using this
 * data anywhere public.
 */
import 'dotenv/config';
import { PrismaClient, Role, ShippingMethodType } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcryptjs';

const SAMPLE_PASSWORD = '12345678';
const BCRYPT_ROUNDS = 10; // matches registerUser() and AuthService.resetPassword()

type BaseUnit = 'gram' | 'ml' | 'piece';

interface VariantSeed {
  label: string;
  unitAmount: number;
  priceCents: number;
  weightGrams?: number;
}

interface ProductSeed {
  name: string;
  category: string;
  description: string;
  baseUnit: BaseUnit;
  stockAmount: number;
  image: number;
  variants: VariantSeed[];
  isActive?: boolean;
  // Approximate shippable weight of one piece, for piece-based products.
  pieceGrams?: number;
  discount?: { name: string; cents: number; days: number };
}

interface ShippingSeed {
  name: string;
  description?: string;
  type: ShippingMethodType;
  flatRateCents?: number;
  minOrderCents?: number;
  estimatedDays: string;
  weightTiers?: { maxGrams?: number; priceCents: number }[];
}

interface VendorSeed {
  email: string;
  ownerName: string;
  storeName: string;
  description: string;
  location: string;
  state: string;
  phone: string;
  photo: number;
  coverPhoto: number;
  isApproved: boolean;
  shipping: ShippingSeed[];
  products: ProductSeed[];
}

const pexels = (id: number, width = 800) =>
  `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?auto=compress&cs=tinysrgb&w=${width}`;

const v = (
  label: string,
  unitAmount: number,
  priceCents: number,
  weightGrams?: number,
): VariantSeed => ({ label, unitAmount, priceCents, weightGrams });

// Mirrors ProductsService.generateUniqueSlug's base slug.
const slugify = (name: string) =>
  name
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'product';

// Existing slugs ("vegetable", "organic-produce") are reused, never renamed.
const CATEGORIES: { slug: string; name: string }[] = [
  { slug: 'beef', name: 'Beef' },
  { slug: 'lamb', name: 'Lamb' },
  { slug: 'chicken', name: 'Chicken' },
  { slug: 'pork', name: 'Pork' },
  { slug: 'eggs', name: 'Eggs' },
  { slug: 'dairy', name: 'Milk & Dairy' },
  { slug: 'fruits', name: 'Fruits' },
  { slug: 'vegetable', name: 'Vegetables' },
  { slug: 'organic-produce', name: 'Organic Produce' },
  { slug: 'honey', name: 'Honey' },
  { slug: 'seafood', name: 'Seafood' },
  { slug: 'herbs', name: 'Herbs' },
  { slug: 'farm-produce', name: 'Farm Produce' },
];

const standardShipping = (
  flatRateCents: number,
  minOrderCents: number,
  estimatedDays = '3-5 business days',
): ShippingSeed => ({
  name: 'Standard Delivery',
  description: 'Insulated packaging, tracked delivery.',
  type: ShippingMethodType.FLAT_RATE,
  flatRateCents,
  minOrderCents,
  estimatedDays,
});

const farmPickup = (description: string): ShippingSeed => ({
  name: 'Farm Gate Pickup',
  description,
  type: ShippingMethodType.PICKUP,
  estimatedDays: 'Ready next day',
});

const chilledWeightShipping = (estimatedDays: string): ShippingSeed => ({
  name: 'Chilled Express',
  description: 'Refrigerated courier with ice bricks, priced by weight.',
  type: ShippingMethodType.WEIGHT_BASED,
  estimatedDays,
  weightTiers: [
    { maxGrams: 3000, priceCents: 1495 },
    { maxGrams: 8000, priceCents: 2195 },
    { priceCents: 2995 },
  ],
});

const VENDORS: VendorSeed[] = [
  {
    email: 'greenvalley@example.com',
    ownerName: 'Green Valley Farm',
    storeName: 'Green Valley Farm',
    description:
      'Certified organic market garden in the Yarra Valley. We grow seasonal vegetables in rich volcanic soil without synthetic sprays, and harvest to order every Monday and Thursday.',
    location: 'Yarra Valley',
    state: 'VIC',
    phone: '(03) 5550 0101',
    photo: 143133,
    coverPhoto: 11733071,
    isApproved: true,
    shipping: [
      standardShipping(995, 8000),
      farmPickup('Collect from our farm shop in Coldstream, Fri–Sun 9am–4pm.'),
    ],
    products: [
      {
        name: 'Organic Dutch Carrots',
        category: 'organic-produce',
        description:
          'Sweet, slender Dutch carrots pulled the morning they are packed, tops left on so you can see just how fresh they are. Lovely roasted whole with honey and thyme.',
        baseUnit: 'piece',
        stockAmount: 80,
        pieceGrams: 400,
        image: 6740693,
        variants: [v('Bunch (approx. 400g)', 1, 480), v('Two bunches', 2, 900)],
      },
      {
        name: 'Organic Kipfler Potatoes',
        category: 'vegetable',
        description:
          'Waxy, nutty kipflers with thin skins that never need peeling. Hold their shape beautifully in potato salads or crisp up when smashed and roasted.',
        baseUnit: 'gram',
        stockAmount: 90000,
        image: 4110462,
        variants: [v('1kg bag', 1000, 750), v('2kg bag', 2000, 1390)],
      },
      {
        name: 'Organic Heirloom Tomatoes',
        category: 'organic-produce',
        description:
          'A mixed box of heirloom varieties – Black Russian, Green Zebra, Ox Heart and Tigerella. Vine-ripened and full of flavour. Store at room temperature, never in the fridge.',
        baseUnit: 'gram',
        stockAmount: 30000,
        image: 7656980,
        variants: [v('500g mixed', 500, 690), v('1kg mixed', 1000, 1250)],
        discount: { name: 'Summer Glut Special', cents: 100, days: 21 },
      },
      {
        name: 'Organic Baby Spinach',
        category: 'organic-produce',
        description:
          'Tender baby spinach leaves, washed and ready to eat. Cut fresh, chilled immediately and packed in compostable bags.',
        baseUnit: 'gram',
        stockAmount: 15000,
        image: 2095569,
        variants: [v('200g bag', 200, 420), v('500g bag', 500, 950)],
      },
      {
        name: 'Organic Butternut Pumpkin',
        category: 'vegetable',
        description:
          'Dense, sweet butternut pumpkins cured in the sun for a deeper flavour. Perfect for soups, roasting and risotto.',
        baseUnit: 'piece',
        stockAmount: 45,
        pieceGrams: 1500,
        image: 10705641,
        variants: [v('Whole (approx. 1.5kg)', 1, 580)],
      },
      {
        name: 'Organic Zucchini',
        category: 'vegetable',
        description:
          'Glossy green zucchini picked small and firm. Great on the barbecue, spiralised into noodles or grated into fritters.',
        baseUnit: 'gram',
        stockAmount: 25000,
        image: 3375263,
        variants: [v('500g', 500, 440), v('1kg', 1000, 790)],
      },
      {
        name: 'Organic Cos Lettuce',
        category: 'vegetable',
        description:
          'Crisp, upright cos lettuce with sweet inner leaves – the backbone of a proper Caesar salad.',
        baseUnit: 'piece',
        stockAmount: 60,
        pieceGrams: 450,
        image: 5202194,
        variants: [v('Each', 1, 350), v('Twin pack', 2, 650)],
      },
      {
        name: 'Organic Brown Onions',
        category: 'vegetable',
        description:
          'Long-keeping brown onions grown on our river flats. A kitchen staple with a good, sharp bite.',
        baseUnit: 'gram',
        stockAmount: 70000,
        image: 4197439,
        variants: [v('1kg bag', 1000, 450), v('2kg bag', 2000, 820)],
      },
      {
        name: 'Organic Beetroot',
        category: 'organic-produce',
        description:
          'Deep crimson beetroot with an earthy sweetness. Roast whole, grate raw into salads or pickle for the pantry.',
        baseUnit: 'gram',
        stockAmount: 20000,
        image: 244394,
        variants: [v('500g', 500, 390), v('1kg', 1000, 690)],
      },
      {
        name: 'Organic Tuscan Kale',
        category: 'organic-produce',
        description:
          'Dark, crinkled cavolo nero leaves. Strip from the stems and wilt into soups, pasta or a garlicky sauté.',
        baseUnit: 'piece',
        stockAmount: 40,
        pieceGrams: 300,
        image: 2280567,
        variants: [v('Bunch', 1, 420)],
      },
      {
        name: 'Organic Imperfect Carrots Box',
        category: 'organic-produce',
        description:
          'Wonky, forked and oversized carrots that taste exactly the same. Paused until the next harvest.',
        baseUnit: 'gram',
        stockAmount: 0,
        isActive: false,
        image: 143133,
        variants: [v('2kg box', 2000, 650)],
      },
    ],
  },
  {
    email: 'southerncross@example.com',
    ownerName: 'Southern Cross Beef Farm',
    storeName: 'Southern Cross Beef Farm',
    description:
      'Third-generation cattle station on the New England Tablelands. Our Angus herd is 100% grass-fed and finished on native pasture, then dry-aged and butchered on site. We also run a small flock of lambs and free-range Berkshire pigs.',
    location: 'Armidale, New England',
    state: 'NSW',
    phone: '(02) 5550 0102',
    photo: 16625615,
    coverPhoto: 19780402,
    isApproved: true,
    shipping: [
      chilledWeightShipping('1-3 business days'),
      standardShipping(1495, 15000, '2-4 business days'),
    ],
    products: [
      {
        name: 'Grass-Fed Rump Steak',
        category: 'beef',
        description:
          'Full-flavoured rump cut thick from grass-fed Angus. Dry-aged for 21 days for tenderness. Rest for five minutes after cooking.',
        baseUnit: 'gram',
        stockAmount: 40000,
        image: 5313880,
        variants: [
          v('500g pack', 500, 1890, 550),
          v('1kg pack', 1000, 3550, 1060),
        ],
      },
      {
        name: 'Premium Beef Mince',
        category: 'beef',
        description:
          '5-star lean mince made from whole cuts, never offcuts. Ideal for bolognese, burgers and meatballs.',
        baseUnit: 'gram',
        stockAmount: 60000,
        image: 128401,
        variants: [
          v('500g pack', 500, 1050, 550),
          v('1kg pack', 1000, 1990, 1060),
        ],
        discount: { name: 'Bulk Buy Week', cents: 150, days: 14 },
      },
      {
        name: 'Scotch Fillet Steak',
        category: 'beef',
        description:
          'Beautifully marbled scotch fillet (ribeye), the steak lover’s steak. Cut 3cm thick. Best cooked hot and fast to medium-rare.',
        baseUnit: 'gram',
        stockAmount: 25000,
        image: 29095929,
        variants: [
          v('500g pack', 500, 2690, 550),
          v('1kg pack', 1000, 5100, 1060),
        ],
      },
      {
        name: 'Beef Brisket (Point End)',
        category: 'beef',
        description:
          'Point-end brisket with a generous fat cap for low-and-slow smoking or braising. Pictured after 12 hours on the smoker.',
        baseUnit: 'gram',
        stockAmount: 30000,
        image: 9397270,
        variants: [
          v('1kg piece', 1000, 2190, 1060),
          v('2kg piece', 2000, 4150, 2080),
        ],
      },
      {
        name: 'Beef & Rosemary Sausages',
        category: 'beef',
        description:
          'Thick beef sausages with fresh rosemary and cracked pepper, in natural casings. Gluten free.',
        baseUnit: 'gram',
        stockAmount: 35000,
        image: 96619,
        variants: [
          v('500g (6 snags)', 500, 990, 550),
          v('1kg (12 snags)', 1000, 1850, 1060),
        ],
      },
      {
        name: 'Diced Chuck Steak',
        category: 'beef',
        description:
          'Chuck steak diced into generous cubes. Melts into rich, tender pieces in casseroles, curries and pies.',
        baseUnit: 'gram',
        stockAmount: 30000,
        image: 11677646,
        variants: [
          v('500g pack', 500, 1290, 550),
          v('1kg pack', 1000, 2450, 1060),
        ],
      },
      {
        name: 'Dry-Aged T-Bone',
        category: 'beef',
        description:
          '45-day dry-aged T-bone with both sirloin and tenderloin on the bone. Very limited – currently sold out.',
        baseUnit: 'gram',
        stockAmount: 0,
        image: 8477074,
        variants: [v('Single (approx. 500g)', 500, 2490, 550)],
      },
      {
        name: 'Lamb Loin Chops',
        category: 'lamb',
        description:
          'Tender lamb loin chops from pasture-raised New England lambs. Season simply and grill for a few minutes each side.',
        baseUnit: 'gram',
        stockAmount: 20000,
        image: 11795607,
        variants: [
          v('500g pack', 500, 1950, 550),
          v('1kg pack', 1000, 3700, 1060),
        ],
      },
      {
        name: 'Lamb Leg Roast',
        category: 'lamb',
        description:
          'Bone-in leg of lamb, the classic Sunday roast. Stud with garlic and rosemary and roast slowly.',
        baseUnit: 'gram',
        stockAmount: 24000,
        image: 3659862,
        variants: [
          v('Half leg (approx. 1kg)', 1000, 2250, 1060),
          v('Full leg (approx. 2kg)', 2000, 4200, 2080),
        ],
      },
      {
        name: 'Lamb Shanks',
        category: 'lamb',
        description:
          'Meaty lamb shanks made for slow braising in red wine until they fall off the bone.',
        baseUnit: 'gram',
        stockAmount: 16000,
        image: 7741801,
        variants: [v('2 shanks (approx. 800g)', 800, 1690, 850)],
      },
      {
        name: 'Free-Range Pork Belly',
        category: 'pork',
        description:
          'Berkshire pork belly with even layers of meat and fat. Score the skin, salt well and roast hot for perfect crackling.',
        baseUnit: 'gram',
        stockAmount: 18000,
        image: 8995922,
        variants: [
          v('500g piece', 500, 1450, 550),
          v('1kg piece', 1000, 2750, 1060),
        ],
      },
      {
        name: 'Pork Loin Chops',
        category: 'pork',
        description:
          'Juicy bone-in pork loin chops from free-range Berkshire pigs. Brine for an hour before grilling for extra juiciness.',
        baseUnit: 'gram',
        stockAmount: 20000,
        image: 8914998,
        variants: [
          v('500g pack', 500, 1390, 550),
          v('1kg pack', 1000, 2600, 1060),
        ],
      },
    ],
  },
  {
    email: 'goldenharvest@example.com',
    ownerName: 'Golden Harvest Poultry',
    storeName: 'Golden Harvest Poultry',
    description:
      'Free-range poultry farm on the Darling Downs. Our birds roam open paddocks by day and shelter in mobile sheds at night, moved weekly to fresh pasture. RSPCA-standard stocking density.',
    location: 'Toowoomba, Darling Downs',
    state: 'QLD',
    phone: '(07) 5550 0103',
    photo: 19972937,
    coverPhoto: 2446695,
    isApproved: true,
    shipping: [
      chilledWeightShipping('1-2 business days'),
      farmPickup('Pickup from the farm shop on Gowrie Road, Wed–Sat.'),
    ],
    products: [
      {
        name: 'Free-Range Whole Chicken',
        category: 'chicken',
        description:
          'Slow-grown free-range chicken with firm, flavoursome meat. Roast whole, or spatchcock for the barbecue.',
        baseUnit: 'piece',
        stockAmount: 120,
        image: 10842249,
        variants: [
          v('Size 16 (approx. 1.6kg)', 1, 1690, 1700),
          v('Size 20 (approx. 2kg)', 1, 2050, 2100),
        ],
      },
      {
        name: 'Free-Range Chicken Breast Fillets',
        category: 'chicken',
        description:
          'Skinless breast fillets, hand-trimmed. Lean and versatile – poach, grill or crumb into schnitzels.',
        baseUnit: 'gram',
        stockAmount: 40000,
        image: 5769384,
        variants: [
          v('500g pack', 500, 1290, 550),
          v('1kg pack', 1000, 2450, 1060),
        ],
      },
      {
        name: 'Free-Range Chicken Thigh Fillets',
        category: 'chicken',
        description:
          'Boneless thigh fillets – juicier and more forgiving than breast. Our pick for curries, kebabs and stir-fries.',
        baseUnit: 'gram',
        stockAmount: 40000,
        image: 13422436,
        variants: [
          v('500g pack', 500, 1150, 550),
          v('1kg pack', 1000, 2190, 1060),
        ],
      },
      {
        name: 'Free-Range Chicken Drumsticks',
        category: 'chicken',
        description:
          'Skin-on drumsticks, great value for family dinners. Marinate in garlic, lemon and paprika and bake.',
        baseUnit: 'gram',
        stockAmount: 50000,
        image: 7140316,
        variants: [
          v('1kg pack', 1000, 890, 1060),
          v('2kg family pack', 2000, 1690, 2100),
        ],
      },
      {
        name: 'Free-Range Eggs (Large 700g)',
        category: 'eggs',
        description:
          'Large free-range eggs collected daily from hens with genuine outdoor access. Deep golden yolks.',
        baseUnit: 'piece',
        stockAmount: 600,
        pieceGrams: 60,
        image: 12969328,
        variants: [v('Half dozen', 6, 520), v('Dozen', 12, 950)],
      },
      {
        name: 'Jumbo Free-Range Eggs (800g)',
        category: 'eggs',
        description:
          'Our biggest eggs, graded at 800g per dozen. Ideal for baking where a big yolk makes all the difference.',
        baseUnit: 'piece',
        stockAmount: 360,
        pieceGrams: 70,
        image: 6294256,
        variants: [v('Dozen', 12, 1150), v('Tray of 30', 30, 2600)],
      },
      {
        name: 'Brown Free-Range Eggs',
        category: 'eggs',
        description:
          'Brown-shelled eggs from our Isa Brown flock. Rich and creamy – perfect for a weekend fry-up.',
        baseUnit: 'piece',
        stockAmount: 480,
        pieceGrams: 60,
        image: 1631180,
        variants: [v('Half dozen', 6, 560), v('Dozen', 12, 1020)],
      },
      {
        name: 'Free-Range Chicken Wings',
        category: 'chicken',
        description:
          'Whole wings for crispy oven-baked or smoked wings. Coming back soon.',
        baseUnit: 'gram',
        stockAmount: 0,
        isActive: false,
        image: 7140316,
        variants: [v('1kg pack', 1000, 790, 1060)],
      },
    ],
  },
  {
    email: 'riverlandfresh@example.com',
    ownerName: 'Riverland Fresh Produce',
    storeName: 'Riverland Fresh Produce',
    description:
      'Family-run citrus and stone-fruit orchards on the Murray River at Renmark. Irrigated with care, picked ripe and packed within 24 hours. We also grow almonds and sun-dry our own apricots.',
    location: 'Renmark, Riverland',
    state: 'SA',
    phone: '(08) 5550 0104',
    photo: 12703286,
    coverPhoto: 1443867,
    isApproved: true,
    shipping: [
      standardShipping(1295, 9000, '3-6 business days'),
      {
        name: 'Express Post',
        description: 'Next-day metro delivery in most capital cities.',
        type: ShippingMethodType.FLAT_RATE,
        flatRateCents: 1995,
        estimatedDays: '1-2 business days',
      },
    ],
    products: [
      {
        name: 'Navel Oranges',
        category: 'fruits',
        description:
          'Seedless, easy-peel navels with sweet, juicy segments. Picked to order from our Renmark groves.',
        baseUnit: 'gram',
        stockAmount: 150000,
        image: 12901232,
        variants: [v('1kg', 1000, 450), v('3kg bag', 3000, 1190)],
        discount: { name: 'Harvest Special', cents: 50, days: 30 },
      },
      {
        name: 'Imperial Mandarins',
        category: 'fruits',
        description:
          'Classic Imperial mandarins – fragrant, sweet and the perfect lunchbox fruit.',
        baseUnit: 'gram',
        stockAmount: 80000,
        image: 15626438,
        variants: [v('1kg', 1000, 590), v('2kg', 2000, 1090)],
      },
      {
        name: 'Riverland Lemons',
        category: 'fruits',
        description:
          'Thick-skinned Eureka lemons, heavy with juice. Zest them, juice them, preserve them.',
        baseUnit: 'piece',
        stockAmount: 400,
        pieceGrams: 140,
        image: 7444953,
        variants: [v('Each', 1, 95), v('Bag of 6', 6, 490)],
      },
      {
        name: 'Ruby Grapefruit',
        category: 'fruits',
        description:
          'Blushing ruby grapefruit with a perfect sweet-sharp balance. Halve and grill with a little brown sugar.',
        baseUnit: 'piece',
        stockAmount: 200,
        pieceGrams: 350,
        image: 6489726,
        variants: [v('Each', 1, 180), v('Bag of 4', 4, 650)],
      },
      {
        name: 'Raw Riverland Almonds',
        category: 'farm-produce',
        description:
          'Non-pasteurised Nonpareil almonds grown, hulled and packed on our farm. Crunchy, sweet and great for activating.',
        baseUnit: 'gram',
        stockAmount: 40000,
        image: 1013420,
        variants: [v('500g bag', 500, 1290), v('1kg bag', 1000, 2350)],
      },
      {
        name: 'Sun-Dried Apricots',
        category: 'farm-produce',
        description:
          'Tangy, chewy apricot halves dried in the Riverland sun with no added sulphur – darker in colour and richer in flavour.',
        baseUnit: 'gram',
        stockAmount: 20000,
        image: 29060107,
        variants: [v('250g', 250, 990), v('500g', 500, 1850)],
      },
      {
        name: 'Sweet Corn',
        category: 'vegetable',
        description:
          'Super-sweet bicolour corn picked at dawn. Cook within a couple of days for the sweetest kernels.',
        baseUnit: 'piece',
        stockAmount: 300,
        pieceGrams: 350,
        image: 1353865,
        variants: [v('Each', 1, 150), v('4 cobs', 4, 550)],
      },
      {
        name: 'Roma Tomatoes',
        category: 'vegetable',
        description:
          'Meaty Roma tomatoes with few seeds – the best tomato for sauces and slow-roasting.',
        baseUnit: 'gram',
        stockAmount: 50000,
        image: 10313342,
        variants: [v('1kg', 1000, 650), v('3kg sauce box', 3000, 1650)],
      },
      {
        name: 'Seedless Watermelon',
        category: 'fruits',
        description:
          'Crisp, seedless watermelon grown on the river flats. Chill before slicing.',
        baseUnit: 'piece',
        stockAmount: 60,
        pieceGrams: 6000,
        image: 4869139,
        variants: [v('Whole (approx. 6kg)', 1, 890)],
      },
      {
        name: 'Crimson Seedless Grapes',
        category: 'fruits',
        description:
          'Firm, crunchy red grapes with a sweet finish. Washed and ready to snack.',
        baseUnit: 'gram',
        stockAmount: 30000,
        image: 3085151,
        variants: [v('500g', 500, 590), v('1kg', 1000, 1090)],
      },
    ],
  },
  {
    email: 'highlanddairy@example.com',
    ownerName: 'Highland Dairy Farm',
    storeName: 'Highland Dairy Farm',
    description:
      'Small Jersey and Friesian herd in the Meander Valley at the foot of the Great Western Tiers. Milk is gently pasteurised and bottled on the farm; cheeses are made by hand in our creamery.',
    location: 'Deloraine, Meander Valley',
    state: 'TAS',
    phone: '(03) 5550 0105',
    photo: 2647053,
    coverPhoto: 8064073,
    isApproved: true,
    shipping: [
      {
        name: 'Refrigerated Courier',
        description: 'Chilled delivery in insulated boxes with gel packs.',
        type: ShippingMethodType.FLAT_RATE,
        flatRateCents: 1495,
        minOrderCents: 10000,
        estimatedDays: '2-4 business days',
      },
      farmPickup('Collect from the creamery door, daily 10am–4pm.'),
    ],
    products: [
      {
        name: 'Full Cream Milk (Non-Homogenised)',
        category: 'dairy',
        description:
          'Creamy whole milk with the cream line left on top. Give the bottle a gentle shake before pouring.',
        baseUnit: 'ml',
        stockAmount: 240000,
        image: 5946742,
        variants: [
          v('1L bottle', 1000, 340, 1100),
          v('2L bottle', 2000, 620, 2150),
        ],
      },
      {
        name: 'Light Milk',
        category: 'dairy',
        description:
          'All the goodness of fresh farm milk with less fat. 1.4% fat.',
        baseUnit: 'ml',
        stockAmount: 160000,
        image: 4187717,
        variants: [
          v('1L bottle', 1000, 320, 1100),
          v('2L bottle', 2000, 590, 2150),
        ],
      },
      {
        name: 'Jersey Unhomogenised Milk',
        category: 'dairy',
        description:
          'Milk from our Jersey girls only – noticeably richer, with a golden hue and 4.8% butterfat.',
        baseUnit: 'ml',
        stockAmount: 80000,
        image: 12984540,
        variants: [
          v('1L bottle', 1000, 450, 1100),
          v('2L bottle', 2000, 850, 2150),
        ],
      },
      {
        name: 'Jersey Pouring Cream',
        category: 'dairy',
        description:
          'Thick, pure Jersey cream with nothing added. Whips beautifully and holds its shape.',
        baseUnit: 'ml',
        stockAmount: 30000,
        image: 10809146,
        variants: [v('300ml', 300, 490, 350), v('600ml', 600, 890, 680)],
      },
      {
        name: 'Cultured Butter (Salted)',
        category: 'dairy',
        description:
          'Slow-churned cultured butter with Tasmanian sea salt flakes. Tangy, complex and dangerously good on sourdough.',
        baseUnit: 'gram',
        stockAmount: 20000,
        image: 8188934,
        variants: [v('250g block', 250, 750, 280)],
      },
      {
        name: 'Vintage Cheddar',
        category: 'dairy',
        description:
          'Clothbound cheddar aged for 18 months. Crumbly and sharp with crunchy salt crystals.',
        baseUnit: 'gram',
        stockAmount: 15000,
        image: 6004145,
        variants: [
          v('200g wedge', 200, 990, 230),
          v('500g wedge', 500, 2250, 540),
        ],
      },
      {
        name: 'Tasmanian Brie',
        category: 'dairy',
        description:
          'Soft, bloomy-rind brie with a buttery, mushroomy centre. Best served at room temperature.',
        baseUnit: 'gram',
        stockAmount: 8000,
        image: 5202246,
        variants: [v('200g round', 200, 1150, 230)],
      },
      {
        name: 'Farmhouse Camembert',
        category: 'dairy',
        description:
          'Rich, oozy camembert made with full-cream Jersey milk. Bake in its box with garlic and thyme.',
        baseUnit: 'gram',
        stockAmount: 6000,
        image: 4187782,
        variants: [v('200g round', 200, 1190, 230)],
      },
      {
        name: 'Greek-Style Yoghurt',
        category: 'dairy',
        description:
          'Thick, strained natural yoghurt with live cultures and no added sugar.',
        baseUnit: 'gram',
        stockAmount: 30000,
        image: 12042271,
        variants: [
          v('500g tub', 500, 690, 540),
          v('1kg tub', 1000, 1250, 1060),
        ],
      },
      {
        name: 'Fresh Ricotta',
        category: 'dairy',
        description:
          'Light, fluffy basket ricotta made fresh each morning from whey and whole milk.',
        baseUnit: 'gram',
        stockAmount: 9000,
        image: 7965943,
        variants: [v('375g basket', 375, 650, 420)],
      },
      {
        name: 'Washed Rind Cheese',
        category: 'dairy',
        description:
          'Pungent, sticky-orange washed rind with a sweet, supple paste. Sold out until the next batch matures.',
        baseUnit: 'gram',
        stockAmount: 0,
        image: 6660248,
        variants: [v('200g', 200, 1390, 230)],
      },
    ],
  },
  {
    email: 'outbackfree@example.com',
    ownerName: 'Outback Free Range Farm',
    storeName: 'Outback Free Range Farm',
    description:
      'Pasture-raised eggs and poultry from the Avon Valley. Our hens have 1,500 square metres each and are guarded by Maremma dogs. We also keep heritage breeds, ducks and quail.',
    location: 'Northam, Avon Valley',
    state: 'WA',
    phone: '(08) 5550 0106',
    photo: 2255459,
    coverPhoto: 10290187,
    isApproved: true,
    shipping: [
      standardShipping(1095, 7000, '2-5 business days'),
      farmPickup('Honesty-box pickup at the farm gate, any day 8am–6pm.'),
    ],
    products: [
      {
        name: 'Pasture-Raised Eggs',
        category: 'eggs',
        description:
          'Eggs from hens that spend their days foraging on open pasture. Assorted shell colours, vivid yolks.',
        baseUnit: 'piece',
        stockAmount: 900,
        pieceGrams: 60,
        image: 30805250,
        variants: [
          v('Half dozen', 6, 590),
          v('Dozen', 12, 1090),
          v('Tray of 30', 30, 2450),
        ],
      },
      {
        name: 'Duck Eggs',
        category: 'eggs',
        description:
          'Large duck eggs with rich, creamy yolks. Bakers love them for sponges and pasta dough.',
        baseUnit: 'piece',
        stockAmount: 180,
        pieceGrams: 80,
        image: 3680159,
        variants: [v('Half dozen', 6, 850)],
      },
      {
        name: 'Quail Eggs',
        category: 'eggs',
        description:
          'Speckled quail eggs – soft-boil for 2½ minutes for canapés and salads.',
        baseUnit: 'piece',
        stockAmount: 480,
        pieceGrams: 12,
        image: 6701871,
        variants: [v('Pack of 12', 12, 690), v('Pack of 24', 24, 1290)],
      },
      {
        name: 'Heritage Breed Eggs',
        category: 'eggs',
        description:
          'A mixed dozen from our Araucana, Marans and Leghorn hens – blue, chocolate-brown and white shells in one box.',
        baseUnit: 'piece',
        stockAmount: 240,
        pieceGrams: 60,
        image: 6294164,
        variants: [v('Dozen', 12, 1250)],
      },
      {
        name: 'Pasture-Raised Whole Chicken',
        category: 'chicken',
        description:
          'Slow-growing birds raised outdoors for 12 weeks. Firmer texture and a proper chicken flavour.',
        baseUnit: 'piece',
        stockAmount: 60,
        image: 10842249,
        variants: [v('Approx. 1.8kg', 1, 1990, 1900)],
      },
      {
        name: 'Chicken Maryland',
        category: 'chicken',
        description:
          'Thigh and drumstick joined – a generous, bone-in cut that roasts and braises beautifully.',
        baseUnit: 'gram',
        stockAmount: 30000,
        image: 7140316,
        variants: [v('1kg pack', 1000, 1390, 1060)],
      },
      {
        name: 'Free-Range Chicken Sausages',
        category: 'chicken',
        description:
          'Chicken, leek and sage sausages made in small batches. Gluten and preservative free.',
        baseUnit: 'gram',
        stockAmount: 20000,
        image: 96619,
        variants: [v('500g pack', 500, 1090, 550)],
      },
      {
        name: 'Chicken Liver Pâté',
        category: 'farm-produce',
        description:
          'Silky chicken liver pâté with brandy and thyme, sealed with clarified butter.',
        baseUnit: 'gram',
        stockAmount: 6000,
        image: 7491909,
        variants: [v('200g jar', 200, 890, 380)],
      },
    ],
  },
  {
    email: 'sunnyacres@example.com',
    ownerName: 'Sunny Acres Farm',
    storeName: 'Sunny Acres Farm',
    description:
      'Cool-climate orchard 900 metres up on the slopes of Mount Canobolas. Apples, pears, cherries and stone fruit, hand-picked at peak ripeness. Spray-free during harvest.',
    location: 'Orange, Central Tablelands',
    state: 'NSW',
    phone: '(02) 5550 0107',
    photo: 17896143,
    coverPhoto: 12029646,
    isApproved: true,
    shipping: [
      standardShipping(1195, 8500, '2-4 business days'),
      farmPickup('Collect from the orchard shed, weekends 9am–3pm.'),
    ],
    products: [
      {
        name: 'Pink Lady Apples',
        category: 'fruits',
        description:
          'Crisp, tangy-sweet Pink Ladies – the apple Australia is famous for. Keeps for weeks in the crisper.',
        baseUnit: 'gram',
        stockAmount: 120000,
        image: 1402659,
        variants: [v('1kg', 1000, 590), v('2kg', 2000, 1090)],
      },
      {
        name: 'Granny Smith Apples',
        category: 'fruits',
        description:
          'Tart, bright green Granny Smiths. Our go-to for apple pie, crumble and coleslaw.',
        baseUnit: 'gram',
        stockAmount: 100000,
        image: 135130,
        variants: [v('1kg', 1000, 490), v('2kg', 2000, 890)],
      },
      {
        name: 'Fresh Cherries',
        category: 'fruits',
        description:
          'Dark, glossy Lapins and Sweetheart cherries – big, firm and very sweet. Short season, so get in quick.',
        baseUnit: 'gram',
        stockAmount: 25000,
        image: 11551649,
        variants: [v('500g', 500, 1290), v('1kg', 1000, 2390)],
        discount: { name: 'Early Season Special', cents: 200, days: 10 },
      },
      {
        name: 'Yellow Peaches',
        category: 'fruits',
        description:
          'Fragrant, juicy yellow peaches that drip down your wrist. Ripen on the bench for a day or two.',
        baseUnit: 'gram',
        stockAmount: 40000,
        image: 2253534,
        variants: [v('1kg', 1000, 790)],
      },
      {
        name: 'Blood Plums',
        category: 'fruits',
        description:
          'Deep red-fleshed blood plums with a tart skin and sweet centre. Excellent for jam.',
        baseUnit: 'gram',
        stockAmount: 30000,
        image: 10958681,
        variants: [v('1kg', 1000, 690)],
      },
      {
        name: 'Packham Pears',
        category: 'fruits',
        description:
          'Buttery, sweet Packham pears. Pick them up firm and let them soften at home.',
        baseUnit: 'gram',
        stockAmount: 60000,
        image: 11170935,
        variants: [v('1kg', 1000, 490), v('2kg', 2000, 890)],
      },
      {
        name: 'Bosc Pears',
        category: 'fruits',
        description:
          'Russet-skinned Bosc pears with dense, honeyed flesh that holds up to poaching.',
        baseUnit: 'gram',
        stockAmount: 30000,
        image: 10039792,
        variants: [v('1kg', 1000, 550)],
      },
      {
        name: 'Blueberries',
        category: 'fruits',
        description:
          'Plump, dusky blueberries grown under netting. Sold by the 125g punnet.',
        baseUnit: 'piece',
        stockAmount: 300,
        pieceGrams: 140,
        image: 15305308,
        variants: [v('Punnet (125g)', 1, 490), v('3 punnets', 3, 1350)],
      },
      {
        name: 'Strawberries',
        category: 'fruits',
        description:
          'Sweet, ruby-red strawberries picked ripe – not white-shouldered supermarket berries.',
        baseUnit: 'piece',
        stockAmount: 300,
        pieceGrams: 270,
        image: 14838905,
        variants: [v('Punnet (250g)', 1, 450), v('2 punnets', 2, 850)],
      },
      {
        name: 'Berry Medley Pack',
        category: 'fruits',
        description:
          'One punnet each of strawberries and blueberries, packed together for breakfast bowls.',
        baseUnit: 'piece',
        stockAmount: 100,
        pieceGrams: 400,
        image: 1120575,
        variants: [v('Medley pack', 1, 890)],
      },
      {
        name: 'Raw Apple Cider Vinegar',
        category: 'farm-produce',
        description:
          'Unfiltered apple cider vinegar with the "mother", fermented from our own Pink Ladies.',
        baseUnit: 'ml',
        stockAmount: 40000,
        image: 5471920,
        variants: [v('500ml bottle', 500, 990, 750)],
      },
      {
        name: 'Cherry Lovers Box (2kg)',
        category: 'fruits',
        description:
          'A 2kg box of our best export-grade cherries. Season finished – back next December.',
        baseUnit: 'gram',
        stockAmount: 0,
        isActive: false,
        image: 175727,
        variants: [v('2kg box', 2000, 4490)],
      },
    ],
  },
  {
    email: 'bluemountain@example.com',
    ownerName: 'Blue Mountain Honey Farm',
    storeName: 'Blue Mountain Honey Farm',
    description:
      'Beekeepers in the Upper Blue Mountains since 1987. Our 300 hives follow the eucalypt flowering through the national park, giving us single-origin raw honeys that change with every season.',
    location: 'Blackheath, Blue Mountains',
    state: 'NSW',
    phone: '(02) 5550 0108',
    photo: 5247965,
    coverPhoto: 11334354,
    isApproved: true,
    shipping: [
      standardShipping(895, 6000, '3-5 business days'),
      {
        name: 'Express Post',
        description: 'Tracked express delivery, bubble-wrapped jars.',
        type: ShippingMethodType.FLAT_RATE,
        flatRateCents: 1495,
        estimatedDays: '1-2 business days',
      },
    ],
    products: [
      {
        name: 'Raw Eucalyptus Honey',
        category: 'honey',
        description:
          'Cold-extracted, unheated honey from mixed eucalypt blossom. Mild, malty and smooth. May candy naturally in cool weather.',
        baseUnit: 'gram',
        stockAmount: 60000,
        image: 5634206,
        variants: [v('250g jar', 250, 950, 450), v('500g jar', 500, 1690, 800)],
      },
      {
        name: 'Yellow Box Honey',
        category: 'honey',
        description:
          'Prized single-origin Yellow Box honey – pale gold, delicately floral and slow to crystallise.',
        baseUnit: 'gram',
        stockAmount: 30000,
        image: 9477268,
        variants: [
          v('250g jar', 250, 1150, 450),
          v('500g jar', 500, 1990, 800),
        ],
      },
      {
        name: 'Creamed Honey',
        category: 'honey',
        description:
          'Raw honey gently stirred into a thick, spreadable cream. No additives – just honey with a finer crystal.',
        baseUnit: 'gram',
        stockAmount: 25000,
        image: 11284797,
        variants: [
          v('250g jar', 250, 1090, 450),
          v('500g jar', 500, 1890, 800),
        ],
      },
      {
        name: 'Stringybark Honey',
        category: 'honey',
        description:
          'Dark, robust honey from the stringybark flow, with caramel and toffee notes. Excellent in marinades.',
        baseUnit: 'gram',
        stockAmount: 30000,
        image: 8805426,
        variants: [
          v('500g jar', 500, 1790, 800),
          v('1kg jar', 1000, 3200, 1500),
        ],
      },
      {
        name: 'Cut Comb Honeycomb',
        category: 'honey',
        description:
          'A slab of honeycomb cut straight from the frame. Eat the wax and all, on cheese boards or warm toast.',
        baseUnit: 'gram',
        stockAmount: 6000,
        image: 4111270,
        variants: [v('200g piece', 200, 1650, 350)],
      },
      {
        name: 'Bush Honey Bulk Tub',
        category: 'honey',
        description:
          'Our everyday bush blend in a resealable tub – best value for honey lovers and home brewers.',
        baseUnit: 'gram',
        stockAmount: 45000,
        image: 302163,
        variants: [
          v('1kg tub', 1000, 2690, 1150),
          v('3kg tub', 3000, 7200, 3300),
        ],
      },
      {
        name: 'Pure Beeswax Pillar Candles',
        category: 'farm-produce',
        description:
          'Hand-poured from our own beeswax with cotton wicks. Burns clean with a faint honey scent.',
        baseUnit: 'piece',
        stockAmount: 80,
        pieceGrams: 300,
        image: 11721808,
        variants: [v('Single', 1, 1290), v('Pair', 2, 2350)],
      },
      {
        name: 'Beeswax Tealight Set',
        category: 'farm-produce',
        description:
          'Twelve beeswax tealights in reusable aluminium cups. About four hours burn time each.',
        baseUnit: 'piece',
        stockAmount: 60,
        pieceGrams: 250,
        image: 10012665,
        variants: [v('Set of 12', 1, 1890)],
      },
      {
        name: 'Honey Tasting Gift Pack',
        category: 'honey',
        description:
          'Three 125g jars – Yellow Box, Stringybark and Eucalyptus – with a wooden dipper and tasting notes.',
        baseUnit: 'piece',
        stockAmount: 40,
        pieceGrams: 700,
        image: 4480158,
        variants: [v('Gift pack', 1, 3990)],
      },
    ],
  },
  {
    email: 'coastalseafood@example.com',
    ownerName: 'Coastal Seafood Farm',
    storeName: 'Coastal Seafood Farm',
    description:
      'Prawn and barramundi aquaculture farm on the Fraser Coast, plus a small fleet landing local catch. Everything is snap-frozen or chilled within hours of harvest.',
    location: 'Hervey Bay, Fraser Coast',
    state: 'QLD',
    phone: '(07) 5550 0109',
    photo: 13037727,
    coverPhoto: 21293856,
    isApproved: true,
    shipping: [chilledWeightShipping('1-2 business days')],
    products: [
      {
        name: 'Cooked Tiger Prawns',
        category: 'seafood',
        description:
          'Large tiger prawns cooked in seawater on the farm and chilled immediately. Peel and eat with lemon and aioli.',
        baseUnit: 'gram',
        stockAmount: 40000,
        image: 725992,
        variants: [v('500g', 500, 1990, 600), v('1kg', 1000, 3750, 1150)],
      },
      {
        name: 'Peeled Cooked Prawn Meat',
        category: 'seafood',
        description:
          'Hand-peeled and deveined prawn meat, ready for cocktails, salads and pasta.',
        baseUnit: 'gram',
        stockAmount: 20000,
        image: 14387795,
        variants: [v('500g', 500, 2290, 600)],
      },
      {
        name: 'Barramundi Fillets (Skin-On)',
        category: 'seafood',
        description:
          'Clean, mild barramundi fillets from our saltwater ponds. Pan-fry skin-side down until crisp.',
        baseUnit: 'gram',
        stockAmount: 35000,
        image: 14062111,
        variants: [v('500g', 500, 1950, 600), v('1kg', 1000, 3690, 1150)],
      },
      {
        name: 'Whole Barramundi (Cleaned)',
        category: 'seafood',
        description:
          'Whole plate-size barramundi, gilled and gutted. Bake in foil with ginger, chilli and lime.',
        baseUnit: 'piece',
        stockAmount: 50,
        pieceGrams: 900,
        image: 3731945,
        variants: [v('Approx. 800g', 1, 2490)],
      },
      {
        name: 'Whole Snapper',
        category: 'seafood',
        description:
          'Line-caught pink snapper landed by our boats. Scaled and gutted, ready for the oven or grill.',
        baseUnit: 'piece',
        stockAmount: 30,
        pieceGrams: 1100,
        image: 10892487,
        variants: [v('Approx. 1kg', 1, 3290)],
      },
      {
        name: 'Freshly Shucked Rock Oysters',
        category: 'seafood',
        description:
          'Plump rock oysters shucked to order and packed on ice. Best eaten within 48 hours.',
        baseUnit: 'piece',
        stockAmount: 360,
        pieceGrams: 60,
        image: 6510283,
        variants: [v('Half dozen', 6, 1450), v('Dozen', 12, 2600)],
      },
      {
        name: 'Moreton Bay Bugs',
        category: 'seafood',
        description:
          'Sweet, lobster-like Moreton Bay bugs, cooked and frozen. Split and grill with garlic butter.',
        baseUnit: 'gram',
        stockAmount: 10000,
        image: 8352780,
        variants: [v('500g', 500, 3490, 600)],
      },
      {
        name: 'Blue Swimmer Crabs',
        category: 'seafood',
        description:
          'Cooked blue swimmer crabs with sweet, delicate meat. Great in pasta or picked for crab sandwiches.',
        baseUnit: 'piece',
        stockAmount: 80,
        pieceGrams: 350,
        image: 10432614,
        variants: [v('Each', 1, 1490), v('Pack of 4', 4, 5490)],
      },
      {
        name: 'Seafood Platter for Two',
        category: 'seafood',
        description:
          'Cooked prawns, shucked oysters and a bug tail on ice – everything you need for a lazy Sunday lunch.',
        baseUnit: 'piece',
        stockAmount: 25,
        pieceGrams: 1500,
        image: 37238850,
        variants: [v('Platter', 1, 8900)],
      },
      {
        name: 'Tropical Rock Lobster',
        category: 'seafood',
        description:
          'Wild-caught tropical rock lobster. Highly seasonal – currently sold out.',
        baseUnit: 'piece',
        stockAmount: 0,
        pieceGrams: 1200,
        image: 3640442,
        variants: [v('Each (approx. 1kg)', 1, 8500)],
      },
      {
        name: 'Pacific Oysters (Bulk 5 Dozen)',
        category: 'seafood',
        description:
          'Unshucked oysters for events and parties. Temporarily unavailable while we restock the leases.',
        baseUnit: 'piece',
        stockAmount: 0,
        isActive: false,
        pieceGrams: 80,
        image: 2647936,
        variants: [v('5 dozen', 60, 9900)],
      },
    ],
  },
  {
    email: 'freshroots@example.com',
    ownerName: 'Fresh Roots Organic Farm',
    storeName: 'Fresh Roots Organic Farm',
    description:
      'Biodynamic herb and salad farm on the Mornington Peninsula. We grow over 40 herbs and leafy greens in no-dig beds and pick everything to order.',
    location: 'Red Hill, Mornington Peninsula',
    state: 'VIC',
    phone: '(03) 5550 0110',
    photo: 28125162,
    coverPhoto: 89267,
    isApproved: true,
    shipping: [
      standardShipping(895, 5000, '2-3 business days'),
      farmPickup(
        'Pickup from our Red Hill market stall every Saturday morning.',
      ),
    ],
    products: [
      {
        name: 'Organic Basil',
        category: 'herbs',
        description:
          'Big, fragrant Genovese basil bunches. Keep stems in a glass of water on the bench.',
        baseUnit: 'piece',
        stockAmount: 120,
        pieceGrams: 80,
        image: 8129055,
        variants: [v('Bunch', 1, 390), v('Pesto bundle (3 bunches)', 3, 1050)],
      },
      {
        name: 'Organic Flat-Leaf Parsley',
        category: 'herbs',
        description:
          'Italian flat-leaf parsley with a bright, peppery flavour. Generous bunches.',
        baseUnit: 'piece',
        stockAmount: 150,
        pieceGrams: 80,
        image: 13354860,
        variants: [v('Bunch', 1, 320)],
      },
      {
        name: 'Organic Coriander',
        category: 'herbs',
        description:
          'Coriander with roots attached – pound the roots into Thai curry pastes.',
        baseUnit: 'piece',
        stockAmount: 120,
        pieceGrams: 80,
        image: 10048317,
        variants: [v('Bunch', 1, 340)],
      },
      {
        name: 'Organic Rosemary',
        category: 'herbs',
        description:
          'Woody, resinous rosemary sprigs for roast lamb, potatoes and focaccia.',
        baseUnit: 'piece',
        stockAmount: 100,
        pieceGrams: 50,
        image: 4113916,
        variants: [v('Bunch', 1, 300)],
      },
      {
        name: 'Organic Mint',
        category: 'herbs',
        description:
          'Cool spearmint for tabouli, mojitos and a pot of fresh mint tea.',
        baseUnit: 'piece',
        stockAmount: 100,
        pieceGrams: 60,
        image: 214165,
        variants: [v('Bunch', 1, 320)],
      },
      {
        name: 'Organic Thyme',
        category: 'herbs',
        description:
          'Tiny-leafed English thyme, wonderfully aromatic. Strip the leaves into stews and stuffings.',
        baseUnit: 'piece',
        stockAmount: 90,
        pieceGrams: 40,
        image: 5501053,
        variants: [v('Bunch', 1, 350)],
      },
      {
        name: 'Organic Purple Garlic',
        category: 'organic-produce',
        description:
          'Hardneck Australian purple garlic – hot, sticky cloves that are easy to peel.',
        baseUnit: 'gram',
        stockAmount: 15000,
        image: 1392585,
        variants: [v('250g', 250, 890), v('500g', 500, 1650)],
      },
      {
        name: 'Organic Mixed Salad Leaves',
        category: 'organic-produce',
        description:
          'A colourful mix of baby cos, oak leaf, rocket, mizuna and edible flowers. Washed and ready to eat.',
        baseUnit: 'gram',
        stockAmount: 12000,
        image: 4198024,
        variants: [v('200g bag', 200, 550), v('500g bag', 500, 1250)],
      },
      {
        name: 'Organic Rainbow Chard',
        category: 'organic-produce',
        description:
          'Chard with jewel-coloured stems. Sauté the stems first, then wilt in the leaves.',
        baseUnit: 'piece',
        stockAmount: 70,
        pieceGrams: 450,
        image: 5852255,
        variants: [v('Bunch', 1, 450)],
      },
      {
        name: 'Organic Sweet Potato',
        category: 'vegetable',
        description:
          'Gold-fleshed sweet potatoes, cured for sweetness. Roast in wedges with smoked paprika.',
        baseUnit: 'gram',
        stockAmount: 50000,
        image: 7456548,
        variants: [v('1kg', 1000, 590), v('2kg', 2000, 1090)],
      },
      {
        name: 'Organic Butterhead Lettuce',
        category: 'vegetable',
        description:
          'Soft, buttery lettuce heads with tender leaves – lovely in a simple vinaigrette.',
        baseUnit: 'piece',
        stockAmount: 60,
        pieceGrams: 300,
        image: 12233423,
        variants: [v('Each', 1, 390)],
      },
      {
        name: 'Organic Herb Bundle',
        category: 'herbs',
        description:
          'A weekly mixed bundle of five seasonal herbs. Paused over winter.',
        baseUnit: 'piece',
        stockAmount: 0,
        isActive: false,
        pieceGrams: 300,
        image: 4113898,
        variants: [v('Weekly bundle', 1, 1290)],
      },
    ],
  },
  {
    // Awaiting admin approval: neither the store nor its products should be
    // publicly visible until approved.
    email: 'wattlecreek@example.com',
    ownerName: 'Wattle Creek Pastures',
    storeName: 'Wattle Creek Pastures',
    description:
      'New to the marketplace: Dorper lamb and free-range pork from the Adelaide Hills.',
    location: 'Mount Barker, Adelaide Hills',
    state: 'SA',
    phone: '(08) 5550 0111',
    photo: 97317,
    coverPhoto: 13410595,
    isApproved: false,
    shipping: [chilledWeightShipping('2-3 business days')],
    products: [
      {
        name: 'Dorper Lamb Shoulder',
        category: 'lamb',
        description: 'Bone-in Dorper lamb shoulder for slow roasting.',
        baseUnit: 'gram',
        stockAmount: 15000,
        image: 6607314,
        variants: [v('Approx. 1.5kg', 1500, 3290, 1580)],
      },
      {
        name: 'Lamb Mince',
        category: 'lamb',
        description: 'Lean lamb mince for koftas and shepherd’s pie.',
        baseUnit: 'gram',
        stockAmount: 10000,
        image: 128401,
        variants: [v('500g pack', 500, 1190, 550)],
      },
      {
        name: 'Free-Range Pork Sausages',
        category: 'pork',
        description: 'Traditional pork sausages with sage and nutmeg.',
        baseUnit: 'gram',
        stockAmount: 12000,
        image: 96619,
        variants: [v('500g pack', 500, 1050, 550)],
      },
    ],
  },
];

const SAMPLE_CUSTOMERS = [
  { email: 'sample.customer1@example.com', name: 'Sam Sample' },
  { email: 'sample.customer2@example.com', name: 'Alex Example' },
];

const SAMPLE_ADMIN = {
  email: 'sample.admin@example.com',
  name: 'Sample Admin',
};

const DAY_MS = 24 * 60 * 60 * 1000;

function variantWeight(product: ProductSeed, variant: VariantSeed): number {
  if (variant.weightGrams !== undefined) return variant.weightGrams;
  if (product.baseUnit === 'piece') {
    return (product.pieceGrams ?? 100) * variant.unitAmount;
  }
  // gram / ml products: roughly 1g per base unit plus ~5% packaging
  return Math.round(variant.unitAmount * 1.05);
}

async function main() {
  const withAdmin = process.argv.includes('--with-admin');
  if (
    process.env.NODE_ENV === 'production' &&
    !process.argv.includes('--force')
  ) {
    throw new Error(
      'Refusing to seed sample data with NODE_ENV=production (pass --force to override).',
    );
  }

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });

  const stats = {
    categoriesCreated: 0,
    accountsCreated: 0,
    vendorsCreated: 0,
    productsCreated: 0,
    variantsCreated: 0,
    imagesCreated: 0,
    shippingOptionsCreated: 0,
    skipped: 0,
  };

  try {
    const passwordHash = await bcrypt.hash(SAMPLE_PASSWORD, BCRYPT_ROUNDS);

    const ensureUser = async (email: string, name: string, role: Role) => {
      const existing = await prisma.user.findUnique({ where: { email } });
      if (existing) {
        stats.skipped++;
        return existing;
      }
      stats.accountsCreated++;
      return prisma.user.create({
        data: { email, name, role, password: passwordHash },
      });
    };

    // Categories
    const categoryIds = new Map<string, string>();
    for (const cat of CATEGORIES) {
      const existing = await prisma.category.findUnique({
        where: { slug: cat.slug },
      });
      if (existing) {
        categoryIds.set(cat.slug, existing.id);
        continue;
      }
      const created = await prisma.category.create({ data: cat });
      categoryIds.set(cat.slug, created.id);
      stats.categoriesCreated++;
    }

    // Customers and (optionally) admin
    for (const c of SAMPLE_CUSTOMERS) {
      await ensureUser(c.email, c.name, Role.CUSTOMER);
    }
    if (withAdmin) {
      await ensureUser(SAMPLE_ADMIN.email, SAMPLE_ADMIN.name, Role.ADMIN);
    }

    // Vendors, shipping options, products
    for (const vs of VENDORS) {
      const user = await ensureUser(vs.email, vs.ownerName, Role.VENDOR);

      let vendor = await prisma.vendor.findUnique({
        where: { userId: user.id },
      });
      if (!vendor) {
        vendor = await prisma.vendor.create({
          data: {
            userId: user.id,
            storeName: vs.storeName,
            description: vs.description,
            location: vs.location,
            state: vs.state,
            phone: vs.phone,
            photo: pexels(vs.photo, 400),
            coverPhoto: pexels(vs.coverPhoto, 1600),
            isApproved: vs.isApproved,
          },
        });
        stats.vendorsCreated++;
      }

      for (const ship of vs.shipping) {
        const existing = await prisma.vendorShippingOption.findFirst({
          where: { vendorId: vendor.id, name: ship.name },
        });
        if (existing) continue;
        await prisma.vendorShippingOption.create({
          data: {
            vendorId: vendor.id,
            name: ship.name,
            description: ship.description,
            type: ship.type,
            flatRateCents:
              ship.type === ShippingMethodType.FLAT_RATE
                ? ship.flatRateCents
                : null,
            minOrderCents: ship.minOrderCents,
            estimatedDays: ship.estimatedDays,
            ...(ship.weightTiers && {
              // Same tier shape VendorsService.buildWeightTiersCreateData produces.
              weightTiers: {
                create: ship.weightTiers.map((tier, i, tiers) => ({
                  minGrams: i === 0 ? 0 : (tiers[i - 1].maxGrams ?? 0),
                  maxGrams: tier.maxGrams ?? null,
                  priceCents: tier.priceCents,
                })),
              },
            }),
          },
        });
        stats.shippingOptionsCreated++;
      }

      for (const ps of vs.products) {
        const slug = slugify(ps.name);
        const categoryId = categoryIds.get(ps.category);
        if (!categoryId)
          throw new Error(`Unknown category "${ps.category}" for ${ps.name}`);

        const existing = await prisma.product.findUnique({
          where: { vendorId_slug: { vendorId: vendor.id, slug } },
        });
        if (existing) {
          stats.skipped++;
          continue;
        }

        await prisma.product.create({
          data: {
            vendorId: vendor.id,
            categoryId,
            name: ps.name,
            slug,
            description: ps.description,
            baseUnit: ps.baseUnit,
            stockAmount: ps.stockAmount,
            isActive: ps.isActive ?? true,
            ...(ps.discount && {
              discountName: ps.discount.name,
              discountCents: ps.discount.cents,
              discountEndsAt: new Date(Date.now() + ps.discount.days * DAY_MS),
            }),
            variants: {
              create: ps.variants.map((variant) => ({
                label: variant.label,
                unitAmount: variant.unitAmount,
                priceCents: variant.priceCents,
                weightGrams: variantWeight(ps, variant),
              })),
            },
            images: { create: [{ url: pexels(ps.image) }] },
          },
        });
        stats.productsCreated++;
        stats.variantsCreated += ps.variants.length;
        stats.imagesCreated++;
      }
    }

    console.log('Sample data seed complete:');
    console.table(stats);
    console.log(
      `Sample vendor/customer password: "${SAMPLE_PASSWORD}". Sample accounts all use @example.com addresses.`,
    );
    if (withAdmin) {
      console.log(
        `Sample admin account: ${SAMPLE_ADMIN.email} – remove it before any shared deployment.`,
      );
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
