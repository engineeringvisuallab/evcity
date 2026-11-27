// City Mall - 10 floors, 8 shops (categories) per floor (STEP C3, 26 Nov): categories, products and the link to the live e-commerce website. Floors: 0 supermarket & food, 1 women's fashion, 2 men's & kids' fashion, 3 shoes / bags / watches / jewellery, 4 mobile & laptop, 5 TV / audio / camera / gaming, 6 home appliance & smart home, 7 furniture & bedding, 8 kitchen / decor / light / garden, 9 toys / books / sports / gifts.
export type ProductKind =
  | 'car' | 'bike' | 'battery' | 'charger' | 'solar' | 'motor' | 'tyre' | 'helmet'
  | 'shirt' | 'shoe' | 'bag' | 'watch' | 'phone' | 'laptop' | 'tv' | 'headphone' | 'sofa' | 'lamp' | 'pot' | 'toy' | 'book' | 'ball' | 'box' | 'bottle' | 'cake';

/** floor: 0 = ground floor ... 9 = top floor. */
export interface Category { id: string; bn: string; en: string; color: number; kind: ProductKind; floor: number }
export interface Product {
  id: string; categoryId: string; name: string; price: number; kind: ProductKind; color: number;
  slug: string; url?: string; // url (if given) overrides the template below
}
export interface Catalog { categories: Category[]; products: Product[] }

/** ★ ONLY THING TO EDIT to connect the real shop ★ */
export const SHOP_LINK = {
  baseUrl: 'https://your-shop.example.com',   // <- your live e-commerce website
  productPath: '/product/{slug}',             // {slug} or {id} are replaced
  categoryPath: '/category/{id}',             // "সব পণ্য দেখুন" board in each shop
  apiUrl: '',                                 // e.g. 'https://your-shop.example.com/api/products' ('' = demo products)
  utm: 'utm_source=city_mall&utm_medium=game',
};

export const FLOORS: { bn: string; en: string; dept: string; deptEn: string }[] = [
  { bn: 'নিচতলা', en: 'Ground Floor', dept: 'সুপারমার্কেট ও খাবার', deptEn: 'Supermarket & Food' },
  { bn: '১ম তলা', en: '1st Floor', dept: 'নারীদের ফ্যাশন', deptEn: "Women's Fashion" },
  { bn: '২য় তলা', en: '2nd Floor', dept: 'পুরুষ ও শিশুদের ফ্যাশন', deptEn: "Men's & Kids' Fashion" },
  { bn: '৩য় তলা', en: '3rd Floor', dept: 'জুতা, ব্যাগ, ঘড়ি ও গয়না', deptEn: 'Shoes, Bags, Watches & Jewellery' },
  { bn: '৪র্থ তলা', en: '4th Floor', dept: 'মোবাইল ও ল্যাপটপ', deptEn: 'Mobile & Laptop' },
  { bn: '৫ম তলা', en: '5th Floor', dept: 'টিভি, অডিও, ক্যামেরা ও গেমিং', deptEn: 'TV, Audio, Camera & Gaming' },
  { bn: '৬ষ্ঠ তলা', en: '6th Floor', dept: 'হোম অ্যাপ্লায়েন্স ও স্মার্ট হোম', deptEn: 'Home Appliance & Smart Home' },
  { bn: '৭ম তলা', en: '7th Floor', dept: 'ফার্নিচার ও বিছানা', deptEn: 'Furniture & Bedding' },
  { bn: '৮ম তলা', en: '8th Floor', dept: 'রান্নাঘর, ডেকর, লাইট ও বাগান', deptEn: 'Kitchen, Decor, Light & Garden' },
  { bn: '৯ম তলা', en: '9th Floor', dept: 'খেলনা, বই, স্পোর্টস ও গিফট', deptEn: 'Toys, Books, Sports & Gifts' },
];

export const CATEGORIES: Category[] = [
  { id: 'fruits', bn: 'ফল ও সবজি', en: "Fruits & Veg", color: 0x84cc16, kind: 'box', floor: 0 },
  { id: 'bakery', bn: 'বেকারি', en: "Bakery", color: 0xf59e0b, kind: 'cake', floor: 0 },
  { id: 'drinks', bn: 'পানীয়', en: "Drinks", color: 0x22d3ee, kind: 'bottle', floor: 0 },
  { id: 'snacks', bn: 'স্ন্যাকস', en: "Snacks", color: 0xef4444, kind: 'box', floor: 0 },
  { id: 'dairy', bn: 'দুধ ও ডিম', en: "Dairy & Eggs", color: 0xe2e8f0, kind: 'bottle', floor: 0 },
  { id: 'grain', bn: 'চাল-ডাল', en: "Rice & Grains", color: 0xd4a017, kind: 'box', floor: 0 },
  { id: 'sweets', bn: 'মিষ্টি ও চকলেট', en: "Sweets", color: 0xa855f7, kind: 'cake', floor: 0 },
  { id: 'daily', bn: 'প্রতিদিনের জিনিস', en: "Daily Needs", color: 0x3b82f6, kind: 'bottle', floor: 0 },
  { id: 'saree', bn: 'শাড়ি', en: "Sarees", color: 0xdc2626, kind: 'shirt', floor: 1 },
  { id: 'salwar', bn: 'সালোয়ার কামিজ', en: "Salwar Kameez", color: 0x16a34a, kind: 'shirt', floor: 1 },
  { id: 'kurti', bn: 'কুর্তি ও টপ', en: "Kurti & Tops", color: 0xf472b6, kind: 'shirt', floor: 1 },
  { id: 'womenwest', bn: 'ওয়েস্টার্ন পোশাক', en: "Western Wear", color: 0x6366f1, kind: 'shirt', floor: 1 },
  { id: 'hijab', bn: 'বোরকা ও হিজাব', en: "Borka & Hijab", color: 0x1e293b, kind: 'shirt', floor: 1 },
  { id: 'bridal', bn: 'বিয়ের পোশাক', en: "Bridal Wear", color: 0xe11d48, kind: 'shirt', floor: 1 },
  { id: 'womenwinter', bn: 'শীতের পোশাক', en: "Winter Wear", color: 0xa855f7, kind: 'shirt', floor: 1 },
  { id: 'beauty', bn: 'কসমেটিক্স ও বিউটি', en: "Beauty", color: 0xfb7185, kind: 'bottle', floor: 1 },
  { id: 'panjabi', bn: 'পাঞ্জাবি ও পায়জামা', en: "Panjabi", color: 0x1d4ed8, kind: 'shirt', floor: 2 },
  { id: 'menformal', bn: 'ফরমাল শার্ট ও প্যান্ট', en: "Formal Wear", color: 0xe2e8f0, kind: 'shirt', floor: 2 },
  { id: 'mendenim', bn: 'জিন্স ও ক্যাজুয়াল', en: "Jeans & Casual", color: 0x475569, kind: 'shirt', floor: 2 },
  { id: 'menwinter', bn: 'জ্যাকেট ও সোয়েটার', en: "Jackets", color: 0x0ea5e9, kind: 'shirt', floor: 2 },
  { id: 'kidsboys', bn: 'ছেলেশিশুর পোশাক', en: "Boys Wear", color: 0x3b82f6, kind: 'shirt', floor: 2 },
  { id: 'kidsgirls', bn: 'মেয়েশিশুর পোশাক', en: "Girls Wear", color: 0xf472b6, kind: 'shirt', floor: 2 },
  { id: 'baby', bn: 'নবজাতকের জিনিস', en: "Baby Care", color: 0xfde68a, kind: 'shirt', floor: 2 },
  { id: 'sport', bn: 'স্পোর্টসওয়্যার', en: "Sportswear", color: 0xef4444, kind: 'shirt', floor: 2 },
  { id: 'shoes', bn: 'জুতা', en: "Shoes", color: 0x92400e, kind: 'shoe', floor: 3 },
  { id: 'sandal', bn: 'স্যান্ডেল ও চপ্পল', en: "Sandals", color: 0xd97706, kind: 'shoe', floor: 3 },
  { id: 'bags', bn: 'ব্যাগ', en: "Bags", color: 0xa855f7, kind: 'bag', floor: 3 },
  { id: 'travel', bn: 'ট্রাভেল ব্যাগ', en: "Travel Bags", color: 0x2563eb, kind: 'bag', floor: 3 },
  { id: 'watches', bn: 'ঘড়ি', en: "Watches", color: 0x64748b, kind: 'watch', floor: 3 },
  { id: 'jewel', bn: 'গয়না', en: "Jewellery", color: 0xfacc15, kind: 'watch', floor: 3 },
  { id: 'glasses', bn: 'চশমা ও সানগ্লাস', en: "Eyewear", color: 0x0f172a, kind: 'watch', floor: 3 },
  { id: 'wallet', bn: 'বেল্ট ও ওয়ালেট', en: "Belts & Wallets", color: 0x92400e, kind: 'bag', floor: 3 },
  { id: 'mobiles', bn: 'মোবাইল', en: "Mobiles", color: 0x3b82f6, kind: 'phone', floor: 4 },
  { id: 'laptops', bn: 'ল্যাপটপ', en: "Laptops", color: 0x64748b, kind: 'laptop', floor: 4 },
  { id: 'tablets', bn: 'ট্যাবলেট', en: "Tablets", color: 0x64748b, kind: 'phone', floor: 4 },
  { id: 'mobacc', bn: 'মোবাইল এক্সেসরিজ', en: "Mobile Accessories", color: 0xef4444, kind: 'phone', floor: 4 },
  { id: 'lapacc', bn: 'ল্যাপটপ এক্সেসরিজ', en: "Laptop Accessories", color: 0x22d3ee, kind: 'laptop', floor: 4 },
  { id: 'printer', bn: 'প্রিন্টার ও স্ক্যানার', en: "Printers", color: 0xe2e8f0, kind: 'laptop', floor: 4 },
  { id: 'storage', bn: 'পেনড্রাইভ ও এসএসডি', en: "Storage", color: 0x8b5cf6, kind: 'box', floor: 4 },
  { id: 'monitor', bn: 'মনিটর', en: "Monitors", color: 0x111827, kind: 'tv', floor: 4 },
  { id: 'tvs', bn: 'টিভি ও সাউন্ড', en: "TV & Audio", color: 0x0f172a, kind: 'tv', floor: 5 },
  { id: 'speaker', bn: 'স্পিকার ও সাউন্ডবার', en: "Speakers", color: 0x1e293b, kind: 'headphone', floor: 5 },
  { id: 'audio', bn: 'হেডফোন', en: "Headphones", color: 0xef4444, kind: 'headphone', floor: 5 },
  { id: 'cameras', bn: 'ক্যামেরা', en: "Cameras", color: 0x8b5cf6, kind: 'laptop', floor: 5 },
  { id: 'action', bn: 'অ্যাকশন ক্যামেরা ও ড্রোন', en: "Action Cam & Drone", color: 0xef4444, kind: 'laptop', floor: 5 },
  { id: 'gaming', bn: 'গেমিং', en: "Gaming", color: 0x22c55e, kind: 'toy', floor: 5 },
  { id: 'gameacc', bn: 'গেমিং এক্সেসরিজ', en: "Gaming Gear", color: 0x3b82f6, kind: 'toy', floor: 5 },
  { id: 'projector', bn: 'প্রজেক্টর', en: "Projectors", color: 0xe2e8f0, kind: 'tv', floor: 5 },
  { id: 'fridge', bn: 'ফ্রিজ ও ফ্রিজার', en: "Fridges", color: 0xe2e8f0, kind: 'box', floor: 6 },
  { id: 'ac', bn: 'এসি ও ফ্যান', en: "AC & Fans", color: 0x38bdf8, kind: 'box', floor: 6 },
  { id: 'washer', bn: 'ওয়াশিং মেশিন', en: "Washing Machines", color: 0xcbd5e1, kind: 'box', floor: 6 },
  { id: 'kitchenapp', bn: 'কিচেন অ্যাপ্লায়েন্স', en: "Kitchen Appliances", color: 0xf59e0b, kind: 'pot', floor: 6 },
  { id: 'appl', bn: 'হোম অ্যাপ্লায়েন্স', en: "Appliances", color: 0x22d3ee, kind: 'pot', floor: 6 },
  { id: 'smart', bn: 'স্মার্ট হোম', en: "Smart Home", color: 0xfacc15, kind: 'lamp', floor: 6 },
  { id: 'cctv', bn: 'সিকিউরিটি ও সিসি ক্যামেরা', en: "Security", color: 0x1e293b, kind: 'laptop', floor: 6 },
  { id: 'solar', bn: 'সোলার ও আইপিএস', en: "Solar & IPS", color: 0xfacc15, kind: 'solar', floor: 6 },
  { id: 'sofa', bn: 'সোফা ও ফার্নিচার', en: "Sofa & Furniture", color: 0x92400e, kind: 'sofa', floor: 7 },
  { id: 'beds', bn: 'বিছানা', en: "Beds & Mattress", color: 0x6366f1, kind: 'sofa', floor: 7 },
  { id: 'dining', bn: 'ডাইনিং সেট', en: "Dining Sets", color: 0x78350f, kind: 'sofa', floor: 7 },
  { id: 'wardrobe', bn: 'আলমারি ও ওয়ার্ডরোব', en: "Wardrobes", color: 0x92400e, kind: 'sofa', floor: 7 },
  { id: 'officef', bn: 'অফিস ফার্নিচার', en: "Office Furniture", color: 0x475569, kind: 'sofa', floor: 7 },
  { id: 'bedding', bn: 'বিছানার চাদর', en: "Bedding", color: 0xa855f7, kind: 'box', floor: 7 },
  { id: 'carpet', bn: 'কার্পেট ও পর্দা', en: "Carpets & Curtains", color: 0xa855f7, kind: 'box', floor: 7 },
  { id: 'shelf', bn: 'শেলফ ও টেবিল', en: "Shelves & Tables", color: 0xd97706, kind: 'sofa', floor: 7 },
  { id: 'kitchen', bn: 'রান্নাঘর', en: "Kitchenware", color: 0xef4444, kind: 'pot', floor: 8 },
  { id: 'dinner', bn: 'ডিনারওয়্যার', en: "Dinnerware", color: 0x22d3ee, kind: 'pot', floor: 8 },
  { id: 'light', bn: 'লাইটিং', en: "Lighting", color: 0xfacc15, kind: 'lamp', floor: 8 },
  { id: 'decor', bn: 'হোম ডেকর', en: "Home Decor", color: 0xf472b6, kind: 'lamp', floor: 8 },
  { id: 'garden', bn: 'বাগান', en: "Garden", color: 0x22c55e, kind: 'pot', floor: 8 },
  { id: 'tools', bn: 'টুলস ও হার্ডওয়্যার', en: "Tools & Hardware", color: 0xf59e0b, kind: 'pot', floor: 8 },
  { id: 'bath', bn: 'বাথরুম ও স্যানিটারি', en: "Bathroom", color: 0x22d3ee, kind: 'pot', floor: 8 },
  { id: 'organizer', bn: 'স্টোরেজ ও অর্গানাইজার', en: "Storage & Organisers", color: 0x6366f1, kind: 'box', floor: 8 },
  { id: 'toys', bn: 'খেলনা', en: "Toys", color: 0xf472b6, kind: 'toy', floor: 9 },
  { id: 'books', bn: 'বই', en: "Books", color: 0x3b82f6, kind: 'book', floor: 9 },
  { id: 'stationery', bn: 'স্টেশনারি', en: "Stationery", color: 0xfacc15, kind: 'book', floor: 9 },
  { id: 'sports', bn: 'খেলাধুলা', en: "Sports", color: 0x22c55e, kind: 'ball', floor: 9 },
  { id: 'bikes', bn: 'সাইকেল', en: "Cycles", color: 0x84cc16, kind: 'bike', floor: 9 },
  { id: 'games', bn: 'বোর্ড গেম', en: "Board Games", color: 0xa855f7, kind: 'toy', floor: 9 },
  { id: 'music', bn: 'বাদ্যযন্ত্র', en: "Music", color: 0xef4444, kind: 'ball', floor: 9 },
  { id: 'gifts', bn: 'গিফট শপ', en: "Gift Shop", color: 0xfb7185, kind: 'box', floor: 9 },
];


// [name, price BDT, colour]
const DEMO: Record<string, [string, number, number][]> = {
  fruits: [['Mango Box 5kg', 1200, 0xf59e0b], ['Fresh Veg Crate', 650, 0x22c55e], ['Apple Pack 2kg', 520, 0xef4444]],
  bakery: [['Birthday Cake 1kg', 1400, 0xf472b6], ['Butter Croissant', 90, 0xd97706], ['Fruit Cake', 650, 0xa855f7]],
  drinks: [['Orange Juice 1L', 160, 0xf97316], ['Mineral Water 5L', 90, 0x38bdf8], ['Cold Coffee', 120, 0x92400e]],
  snacks: [['Chips Family Pack', 80, 0xef4444], ['Biscuit Box', 150, 0x3b82f6], ['Nut Mix 500g', 480, 0xd97706]],
  dairy: [['Fresh Milk 1L', 110, 0xf1f5f9], ['Egg Tray 30pcs', 420, 0xfde68a], ['Yogurt Pack', 180, 0xf9a8d4]],
  grain: [['Miniket Rice 25kg', 1900, 0xfde047], ['Lentil 5kg', 720, 0xf59e0b], ['Atta 10kg', 560, 0xe7e5e4]],
  sweets: [['Rasgulla Box', 450, 0xf8fafc], ['Chocolate Box', 900, 0x78350f], ['Dates Pack', 380, 0x57534e]],
  daily: [['Detergent 2kg', 380, 0x3b82f6], ['Hand Wash', 140, 0x22c55e], ['Cooking Oil 5L', 950, 0xfacc15]],
  shoes: [['Leather Loafer', 3400, 0x78350f], ['Running Shoes', 4200, 0xef4444], ['Kolhapuri Sandal', 1200, 0xd97706]],
  bags: [['Leather Handbag', 4800, 0x92400e], ['Laptop Backpack', 2600, 0x1e293b], ['Travel Trolley', 7500, 0x2563eb]],
  watches: [['Classic Watch', 5200, 0x94a3b8], ['Smart Watch', 8900, 0x0f172a], ['Ladies Watch', 4300, 0xf59e0b]],
  jewel: [['Gold Plated Set', 9500, 0xfacc15], ['Silver Ring', 2400, 0xcbd5e1], ['Pearl Necklace', 6800, 0xf8fafc]],
  sport: [['Jersey Set', 1400, 0x16a34a], ['Track Pants', 1300, 0x1e293b], ['Gym Tank', 700, 0xef4444]],
  mobiles: [['Galaxy-Style A5', 32000, 0x1e293b], ['Pixel-Style 9', 68000, 0xe2e8f0], ['Budget Phone X', 14500, 0x3b82f6]],
  laptops: [['Ultrabook 14"', 89000, 0x94a3b8], ['Gaming Laptop 16"', 145000, 0x111827], ['Student Laptop', 48000, 0x3b82f6]],
  tvs: [['Smart TV 55"', 72000, 0x111827], ['Soundbar 2.1', 14500, 0x1e293b], ['LED TV 32"', 24500, 0x0f172a]],
  audio: [['Wireless Headphone', 7800, 0xef4444], ['Earbuds Pro', 5600, 0xf8fafc], ['Gaming Headset', 4900, 0x22c55e]],
  cameras: [['Mirrorless Camera', 98000, 0x1e293b], ['Action Camera', 22000, 0xef4444], ['CCTV Set 4ch', 16500, 0xe2e8f0]],
  gaming: [['Game Console', 58000, 0x1e293b], ['Controller', 6200, 0x3b82f6], ['VR Headset', 42000, 0xe2e8f0]],
  appl: [['Rice Cooker 1.8L', 4800, 0xe2e8f0], ['Air Fryer 5L', 9800, 0x1e293b], ['Blender 600W', 5200, 0xef4444]],
  smart: [['Smart Bulb Set', 2400, 0xfde047], ['WiFi Router', 3800, 0x1e293b], ['Power Bank 20000', 3200, 0x3b82f6]],
  sofa: [['3-Seater Sofa', 48000, 0x78716c], ['Armchair', 16500, 0x0ea5e9], ['Lounge Set', 72000, 0x92400e]],
  beds: [['King Size Bed', 68000, 0x78350f], ['Foam Mattress', 24000, 0xf1f5f9], ['Kids Bunk Bed', 32000, 0x3b82f6]],
  kitchen: [['Non-stick Pan Set', 4200, 0x1e293b], ['Pressure Cooker', 3600, 0xcbd5e1], ['Knife Block', 2800, 0x92400e]],
  light: [['Chandelier', 14500, 0xfacc15], ['Table Lamp', 2800, 0xf97316], ['LED Panel Pack', 3200, 0xf8fafc]],
  decor: [['Wall Clock', 1800, 0x92400e], ['Flower Vase', 1400, 0x22d3ee], ['Canvas Art', 3500, 0xa855f7]],
  dinner: [['Dinner Set 24pc', 6800, 0xf8fafc], ['Glass Set 6pc', 1200, 0x38bdf8], ['Melamine Bowl Set', 1400, 0xf59e0b]],
  bedding: [['Bedsheet Set', 2400, 0x6366f1], ['Comforter', 5800, 0xf472b6], ['Pillow Pair', 1800, 0xf1f5f9]],
  garden: [['Flower Pot Set', 1500, 0xb45309], ['Garden Tool Kit', 2200, 0x22c55e], ['Indoor Plant', 900, 0x16a34a]],
  toys: [['Building Blocks', 2400, 0xef4444], ['RC Car', 3200, 0x3b82f6], ['Teddy Bear', 1600, 0xd97706]],
  books: [['Bangla Novel Set', 1800, 0xef4444], ['Science Encyclopedia', 2800, 0x1d4ed8], ['Story Book Pack', 950, 0xf59e0b]],
  stationery: [['Notebook Pack', 420, 0xfacc15], ['Art Colour Box', 650, 0xf472b6], ['School Bag Set', 1900, 0x22c55e]],
  sports: [['Football', 1400, 0xf8fafc], ['Cricket Bat', 2600, 0xd97706], ['Badminton Set', 1900, 0x3b82f6]],
  bikes: [['Kids Cycle', 9800, 0xef4444], ['Mountain Bike', 32000, 0x3b82f6], ['City Cycle', 18500, 0x84cc16]],
  games: [['Ludo Deluxe', 650, 0xfacc15], ['Chess Set', 1400, 0x1e293b], ['Puzzle 1000pc', 1200, 0x22d3ee]],
  music: [['Acoustic Guitar', 9500, 0xd97706], ['Keyboard 61 key', 16500, 0x1e293b], ['Harmonium', 12500, 0x78350f]],
  gifts: [['Gift Hamper', 3200, 0xfb7185], ['Perfume Set', 4500, 0xa855f7], ['Greeting Box', 650, 0xf59e0b]],
};

function demoProducts(): Product[] {
  const out: Product[] = [];
  for (const c of CATEGORIES) {
    (DEMO[c.id] ?? []).forEach(([name, price, color], i) =>
      out.push({ id: `${c.id}-${i + 1}`, categoryId: c.id, name, price, kind: c.kind, color, slug: `${c.id}-${i + 1}` }));
  }
  return out;
}

function withUtm(raw: string): string {
  const u = new URL(raw, location.href);
  for (const [k, v] of new URLSearchParams(SHOP_LINK.utm)) u.searchParams.set(k, v);
  return u.toString();
}
const base = () => SHOP_LINK.baseUrl.replace(/\/$/, '');

export function productUrl(p: Product): string {
  const path = SHOP_LINK.productPath.replace('{slug}', encodeURIComponent(p.slug)).replace('{id}', encodeURIComponent(p.id));
  return withUtm(p.url ?? base() + path);
}
export function categoryUrl(c: Category): string {
  return withUtm(base() + SHOP_LINK.categoryPath.replace('{id}', encodeURIComponent(c.id)));
}

interface ApiProduct {
  id: string | number; category: string; name: string; price: number;
  slug?: string; url?: string; kind?: ProductKind; color?: number | string;
}

/** Live catalog from SHOP_LINK.apiUrl (JSON array or {products:[...]}); falls back to demo data. */
export async function loadCatalog(): Promise<Catalog> {
  const demo: Catalog = { categories: CATEGORIES, products: demoProducts() };
  if (!SHOP_LINK.apiUrl) return demo;
  try {
    const r = await fetch(SHOP_LINK.apiUrl);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const j = (await r.json()) as ApiProduct[] | { products?: ApiProduct[] };
    const list = Array.isArray(j) ? j : j.products ?? [];
    const byId = new Map(CATEGORIES.map((c) => [c.id, c]));
    const products: Product[] = list.filter((a) => byId.has(a.category)).map((a) => {
      const cat = byId.get(a.category)!;
      const color = typeof a.color === 'string' ? parseInt(a.color.replace('#', ''), 16) : a.color ?? cat.color;
      return { id: String(a.id), categoryId: cat.id, name: a.name, price: Number(a.price) || 0,
        kind: a.kind ?? cat.kind, color, slug: a.slug ?? String(a.id), url: a.url };
    });
    return products.length ? { categories: CATEGORIES, products } : demo;
  } catch (e) {
    console.warn('[CityMall] live catalog failed, using demo products:', e);
    return demo;
  }
}
