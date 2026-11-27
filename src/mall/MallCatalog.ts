// City Mall - 10 floors, 8 shops (categories) per floor (STEP C3, 26 Nov): categories, products and the link to the live e-commerce website. Floors: 0 supermarket & food, 1 women's fashion, 2 men's & kids' fashion, 3 shoes / bags / watches / jewellery, 4 mobile & laptop, 5 TV / audio / camera / gaming, 6 home appliance & smart home, 7 furniture & bedding, 8 kitchen / decor / light / garden, 9 toys / books / sports / gifts.
export type ProductKind =
  | 'car' | 'bike' | 'battery' | 'charger' | 'solar' | 'motor' | 'tyre' | 'helmet'
  | 'shirt' | 'shoe' | 'bag' | 'watch' | 'phone' | 'laptop' | 'tv' | 'headphone' | 'sofa' | 'lamp' | 'pot' | 'toy' | 'book' | 'ball' | 'box' | 'bottle' | 'cake'
  | 'bed' | 'chair' | 'appliance'; // C5: bed / chair / appliance (fridge, AC, washer, cupboard, printer) so a bedroom does not show a sofa

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
  { id: 'printer', bn: 'প্রিন্টার ও স্ক্যানার', en: "Printers", color: 0xe2e8f0, kind: 'appliance', floor: 4 },
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
  { id: 'fridge', bn: 'ফ্রিজ ও ফ্রিজার', en: "Fridges", color: 0xe2e8f0, kind: 'appliance', floor: 6 },
  { id: 'ac', bn: 'এসি ও ফ্যান', en: "AC & Fans", color: 0x38bdf8, kind: 'appliance', floor: 6 },
  { id: 'washer', bn: 'ওয়াশিং মেশিন', en: "Washing Machines", color: 0xcbd5e1, kind: 'appliance', floor: 6 },
  { id: 'kitchenapp', bn: 'কিচেন অ্যাপ্লায়েন্স', en: "Kitchen Appliances", color: 0xf59e0b, kind: 'pot', floor: 6 },
  { id: 'appl', bn: 'হোম অ্যাপ্লায়েন্স', en: "Appliances", color: 0x22d3ee, kind: 'pot', floor: 6 },
  { id: 'smart', bn: 'স্মার্ট হোম', en: "Smart Home", color: 0xfacc15, kind: 'lamp', floor: 6 },
  { id: 'cctv', bn: 'সিকিউরিটি ও সিসি ক্যামেরা', en: "Security", color: 0x1e293b, kind: 'laptop', floor: 6 },
  { id: 'solar', bn: 'সোলার ও আইপিএস', en: "Solar & IPS", color: 0xfacc15, kind: 'appliance', floor: 6 },
  { id: 'sofa', bn: 'সোফা ও ফার্নিচার', en: "Sofa & Furniture", color: 0x92400e, kind: 'sofa', floor: 7 },
  { id: 'beds', bn: 'বিছানা', en: "Beds & Mattress", color: 0x6366f1, kind: 'bed', floor: 7 },
  { id: 'dining', bn: 'ডাইনিং সেট', en: "Dining Sets", color: 0x78350f, kind: 'chair', floor: 7 },
  { id: 'wardrobe', bn: 'আলমারি ও ওয়ার্ডরোব', en: "Wardrobes", color: 0x92400e, kind: 'appliance', floor: 7 },
  { id: 'officef', bn: 'অফিস ফার্নিচার', en: "Office Furniture", color: 0x475569, kind: 'chair', floor: 7 },
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


// STEP C5: 10 products in every one of the 80 categories. [typical price BDT, the 10 names separated by '|'] - the price of product i = base x PRICE_STEP[i] (rounded to a "shop price"),
// the colour comes from the category colour + COLOR_POOL. The names are demo names: the live site replaces them through SHOP_LINK.apiUrl (any number of products per category: the shelves show them in turn).
const PRICE_STEP = [0.6, 0.75, 0.9, 1, 1.1, 1.25, 1.4, 1.6, 1.9, 2.3];
const COLOR_POOL = [0xef4444, 0x3b82f6, 0x22c55e, 0xf59e0b, 0xa855f7, 0x0ea5e9, 0xf472b6, 0x14b8a6, 0xe2e8f0, 0x475569, 0xfacc15, 0x92400e];
export const PRODUCT_NAMES: Record<string, [number, string]> = {
  fruits: [450, 'Mango Box 5kg|Fresh Veg Crate|Apple Pack 2kg|Banana Dozen|Orange Net 2kg|Grapes 1kg|Tomato 3kg|Potato 5kg|Onion 5kg|Green Chilli Pack'],
  bakery: [400, 'Birthday Cake 1kg|Butter Croissant|Fruit Cake|Sandwich Bread|Brown Bread|Donut Box|Cup Cake Set|Pastry Box|Garlic Bun|Cookie Jar'],
  drinks: [140, 'Orange Juice 1L|Mineral Water 5L|Cold Coffee|Mango Juice|Cola 2L|Lemon Drink|Energy Drink|Green Tea Bottle|Lassi 500ml|Soda Water 6pk'],
  snacks: [120, 'Chips Family Pack|Biscuit Box|Nut Mix 500g|Popcorn Tub|Noodles 12pk|Chocolate Wafer|Salted Peanuts|Cream Cracker|Fruit Roll|Chanachur 1kg'],
  dairy: [150, 'Fresh Milk 1L|Egg Tray 30pcs|Yogurt Pack|Butter 500g|Cheese Slice|Powder Milk 1kg|Cream 250ml|Ghee 500g|Condensed Milk|Paneer 400g'],
  grain: [900, 'Miniket Rice 25kg|Lentil 5kg|Atta 10kg|Chickpea 5kg|Mustard Oil 5L|Sugar 5kg|Salt 2kg|Flattened Rice 2kg|Semolina 5kg|Basmati Rice 5kg'],
  sweets: [500, 'Rasgulla Box|Chocolate Box|Dates Pack|Sandesh Box|Gulab Jamun|Milk Chocolate Bar|Mixed Candy Jar|Halwa Tin|Cashew Barfi|Toffee Pack'],
  daily: [300, 'Detergent 2kg|Hand Wash|Cooking Oil 5L|Dish Soap|Toothpaste Pair|Shampoo 650ml|Tissue Box 6pk|Bath Soap 4pk|Floor Cleaner|Mosquito Coil'],
  saree: [4500, 'Silk Saree|Cotton Saree|Jamdani Saree|Katan Saree|Tant Saree|Georgette Saree|Printed Saree|Party Saree|Block Print Saree|Muslin Saree'],
  salwar: [3200, 'Cotton Salwar Set|Georgette Salwar Set|Embroidered Set|Printed Three-Piece|Party Salwar Set|Lawn Set|Linen Set|Chiffon Set|Eid Collection Set|Casual Salwar Set'],
  kurti: [1600, 'Cotton Kurti|Long Kurti|Printed Top|Embroidered Kurti|Linen Top|Casual Tunic|Party Top|Denim Kurti|A-line Kurti|Short Kurti'],
  womenwest: [2400, 'Maxi Dress|Denim Skirt|Blouse Top|Palazzo Pants|Jumpsuit|Casual Shirt|Midi Dress|Leggings 2pk|Crop Top|Cardigan'],
  hijab: [1800, 'Black Borka|Printed Hijab|Chiffon Hijab|Abaya Set|Prayer Scarf|Jersey Hijab|Niqab Set|Georgette Borka|Burqa with Scarf|Stylish Abaya'],
  bridal: [28000, 'Red Bridal Lehenga|Katan Bridal Saree|Golden Lehenga|Reception Gown|Engagement Saree|Bridal Sherwani Set|Haldi Dress|Embroidered Bridal Set|Maroon Lehenga|Silver Gown'],
  womenwinter: [3600, 'Woolen Shawl|Cardigan|Winter Coat|Fleece Hoodie|Woolen Scarf|Puffer Jacket|Knit Sweater|Long Cape|Cotton Thermal Set|Woolen Cap'],
  beauty: [1500, 'Face Cream|Lipstick Set|Perfume 100ml|Foundation|Eyeliner Pack|Face Wash|Nail Polish Set|Hair Oil|Sunscreen 100ml|Makeup Kit'],
  panjabi: [2800, 'Cotton Panjabi|Silk Panjabi|Embroidered Panjabi|Eid Panjabi|Casual Panjabi|Linen Panjabi|Pajama Pack|Kabli Set|Wedding Panjabi|Printed Panjabi'],
  menformal: [2200, 'White Formal Shirt|Blue Formal Shirt|Slim Fit Pants|Check Shirt|Gabardine Pants|Blazer|Waistcoat|Striped Shirt|Tie Set|Office Trouser'],
  mendenim: [2000, 'Slim Jeans|Straight Jeans|Polo T-Shirt|Round Neck Tee|Cargo Pants|Denim Shirt|Chino Pants|Graphic Tee|Shorts|Joggers'],
  menwinter: [4200, 'Leather Jacket|Wool Sweater|Hoodie|Bomber Jacket|Winter Coat|Fleece Jacket|Cardigan|Puffer Vest|Denim Jacket|Thermal Set'],
  kidsboys: [1200, 'Boys T-Shirt Set|Boys Jeans|Boys Panjabi|School Uniform Set|Boys Shorts|Boys Hoodie|Cartoon Tee|Boys Pajama|Boys Blazer|Boys Track Suit'],
  kidsgirls: [1400, 'Girls Frock|Girls Salwar Set|Girls Skirt Set|Party Dress|Girls Top|Girls Leggings|School Dress|Girls Jacket|Girls Lehenga|Girls Pajama Set'],
  baby: [900, 'Baby Romper Set|Baby Blanket|Diaper Pack|Baby Lotion|Feeding Bottle|Baby Socks 6pk|Baby Bib Set|Baby Towel|Baby Soap Set|Baby Cap Set'],
  sport: [1500, 'Jersey Set|Track Pants|Gym Tank|Sports Shorts|Compression Tee|Running Jacket|Yoga Pants|Sports Cap|Gym Hoodie|Football Kit'],
  shoes: [3600, 'Leather Loafer|Running Shoes|Formal Oxford|Canvas Sneakers|Sports Trainers|Boots|Casual Shoes|School Shoes|Walking Shoes|Football Boots'],
  sandal: [1200, 'Kolhapuri Sandal|Leather Sandal|Rubber Slipper|Flip Flops|Sports Sandal|Ladies Sandal|Kids Sandal|Home Slipper|Heeled Sandal|Comfort Sandal'],
  bags: [3200, 'Leather Handbag|Laptop Backpack|Shoulder Bag|Tote Bag|Clutch|School Bag|Sling Bag|Office Bag|Mini Backpack|Messenger Bag'],
  travel: [6500, 'Travel Trolley|Cabin Bag|Duffel Bag|Large Suitcase|Hiking Backpack|Weekender Bag|Garment Bag|Trolley Set 3pc|Camera Bag|Travel Pouch Set'],
  watches: [4500, 'Classic Watch|Smart Watch|Ladies Watch|Chronograph|Sports Watch|Digital Watch|Leather Strap Watch|Couple Watch Set|Kids Watch|Automatic Watch'],
  jewel: [8000, 'Gold Plated Set|Silver Ring|Pearl Necklace|Diamond Earrings|Bangle Set|Gold Chain|Bridal Jewellery Set|Nose Pin Pair|Anklet Pair|Pendant Set'],
  glasses: [2200, 'Aviator Sunglass|Round Frame|Reading Glasses|Sports Sunglass|Blue Light Glasses|Cat Eye Frame|Wayfarer|Kids Frame|Polarized Sunglass|Rimless Frame'],
  wallet: [1300, 'Leather Wallet|Leather Belt|Card Holder|Ladies Purse|Coin Purse|Travel Wallet|Formal Belt|Reversible Belt|Money Clip|Passport Holder'],
  mobiles: [35000, 'Galaxy-Style A5|Pixel-Style 9|Budget Phone X|Foldable Phone|Gaming Phone|Camera Phone Pro|Slim Phone 5G|Rugged Phone|Basic Phone|Compact Phone'],
  laptops: [85000, 'Ultrabook 14"|Gaming Laptop 16"|Student Laptop|Business Laptop|Creator Laptop|Chromebook|2-in-1 Laptop|Budget Laptop|Workstation 17"|Mini Laptop 11"'],
  tablets: [32000, 'Tablet 10"|Mini Tablet 8"|Pro Tablet 12"|Kids Tablet|Drawing Tablet|E-Reader|Budget Tablet|Tablet with Keyboard|Rugged Tablet|Android Tablet'],
  mobacc: [900, 'Fast Charger|Phone Case|Screen Guard|USB-C Cable|Wireless Charger|Car Mount|Selfie Stick|Earphone Cable|Phone Ring Holder|Memory Card 128GB'],
  lapacc: [1600, 'Wireless Mouse|Keyboard|Laptop Stand|USB Hub|Laptop Bag Sleeve|Cooling Pad|Webcam|Mouse Pad XL|HDMI Cable|Laptop Charger'],
  printer: [14000, 'Inkjet Printer|Laser Printer|All-in-One Printer|Flatbed Scanner|Label Printer|Photo Printer|Ink Tank Printer|Mobile Printer|Toner Pack|Document Scanner'],
  storage: [3500, 'Pen Drive 64GB|Pen Drive 128GB|SSD 512GB|SSD 1TB|Portable HDD 1TB|Memory Card 256GB|Portable SSD 500GB|NAS Box|USB-C Drive|HDD 4TB'],
  monitor: [18000, 'Monitor 24"|Monitor 27"|Curved Monitor|Gaming Monitor|4K Monitor|Office Monitor 22"|Ultrawide Monitor|Portable Monitor|Touch Monitor|Monitor 32"'],
  tvs: [45000, 'Smart TV 55"|Soundbar 2.1|LED TV 32"|OLED TV 65"|4K TV 43"|Android TV 50"|Home Theatre 5.1|QLED TV 75"|Budget TV 24"|TV Wall Mount'],
  speaker: [9000, 'Bluetooth Speaker|Soundbar 3.1|Party Speaker|Mini Speaker|Bookshelf Speaker|Tower Speaker|Smart Speaker|Subwoofer|Outdoor Speaker|Karaoke Speaker'],
  audio: [6500, 'Wireless Headphone|Earbuds Pro|Gaming Headset|Neckband|Studio Headphone|Sports Earbuds|Kids Headphone|Noise Cancelling Headphone|In-ear Monitor|Earphone Basic'],
  cameras: [85000, 'Mirrorless Camera|DSLR Camera|Compact Camera|Instant Camera|Camera Lens 50mm|Tripod|Camera Bag|Flash Light|Zoom Lens|Camcorder'],
  action: [32000, 'Action Camera|Camera Drone|Mini Drone|360 Camera|Gimbal|Drone Pro|Waterproof Case|Helmet Cam|Selfie Drone|Drone Battery'],
  gaming: [45000, 'Game Console|Controller|VR Headset|Handheld Console|Racing Wheel|Game Pack|Retro Console|Gaming Chair|Console Dock|Arcade Stick'],
  gameacc: [3800, 'Gaming Mouse|Gaming Keyboard|Mouse Pad|Headset Stand|Controller Charger|Gaming Pad|Capture Card|Thumb Grips|Stream Mic|RGB Strip'],
  projector: [38000, 'HD Projector|4K Projector|Mini Projector|Portable Projector|Office Projector|Projector Screen|Short Throw Projector|Home Cinema Projector|Pico Projector|Projector Mount'],
  fridge: [52000, 'Fridge 250L|Fridge 350L|Double Door Fridge|Side-by-Side Fridge|Mini Fridge|Chest Freezer|Deep Freezer|Glass Door Fridge|Inverter Fridge|Smart Fridge'],
  ac: [48000, 'Split AC 1.5T|Split AC 1T|Inverter AC 2T|Window AC|Portable AC|Ceiling Fan|Stand Fan|Wall Fan|Air Cooler|Exhaust Fan'],
  washer: [38000, 'Front Load Washer|Top Load Washer|Semi-Auto Washer|Washer Dryer|Mini Washer|Dryer|Twin Tub Washer|Inverter Washer|Smart Washer|Laundry Stand'],
  kitchenapp: [6500, 'Microwave Oven|Electric Kettle|Toaster|Induction Cooker|Rice Cooker|Blender|Mixer Grinder|Coffee Maker|Sandwich Maker|Juicer'],
  appl: [6000, 'Rice Cooker 1.8L|Air Fryer 5L|Blender 600W|Steam Iron|Vacuum Cleaner|Water Purifier|Hair Dryer|Electric Heater|Water Heater|Food Processor'],
  smart: [3500, 'Smart Bulb Set|WiFi Router|Power Bank 20000|Smart Plug|Smart Switch|Door Sensor|Smart Speaker Hub|Robot Cleaner|Smart Lock|Mesh WiFi Pack'],
  cctv: [16000, 'CCTV Set 4ch|CCTV Set 8ch|Dome Camera|Bullet Camera|WiFi Camera|Video Doorbell|DVR 8ch|Alarm Kit|Baby Monitor|Solar Camera'],
  solar: [55000, 'Solar Panel 550W|Solar Panel 330W|IPS 1000VA|IPS 2000VA|Solar Battery 150Ah|Solar Charge Controller|Solar Inverter 3kW|Solar Street Light|Solar Water Heater|Battery 200Ah'],
  sofa: [48000, '3-Seater Sofa|Armchair|Lounge Set|L-Shape Sofa|Recliner|Sofa Bed|Two-Seater Sofa|Corner Sofa|Leather Sofa|Fabric Sofa Set'],
  beds: [60000, 'King Size Bed|Foam Mattress|Kids Bunk Bed|Queen Bed|Storage Bed|Spring Mattress|Single Bed|Wooden Cot|Folding Bed|Bed Set with Side Tables'],
  dining: [42000, '6-Seat Dining Set|4-Seat Dining Set|Glass Dining Table|Dining Chair Pair|Round Dining Set|Marble Dining Set|Bar Stool Set|Extendable Table|Wooden Bench|Kitchen Table'],
  wardrobe: [38000, '3-Door Wardrobe|2-Door Wardrobe|Sliding Wardrobe|Steel Almirah|Shoe Rack|Cloth Rack|Dressing Table|Corner Wardrobe|Kids Wardrobe|Wall Cabinet'],
  officef: [22000, 'Office Chair|Executive Desk|Study Table|Visitor Chair Set|Filing Cabinet|Conference Table|Workstation Desk|Gaming Chair|Reception Counter|Bookcase Desk'],
  bedding: [2800, 'Bedsheet Set|Comforter|Pillow Pair|Quilt|Blanket|Mosquito Net|Mattress Cover|Pillow Cover Set|Baby Bedding Set|Bed Runner'],
  carpet: [6500, 'Floor Carpet 6x9|Prayer Mat|Curtain Pair|Door Mat|Round Rug|Runner Rug|Blackout Curtain|Window Blind|Table Runner|Cushion Cover Set'],
  shelf: [9500, 'Bookshelf|TV Cabinet|Coffee Table|Side Table|Shoe Cabinet|Wall Shelf|Console Table|Study Shelf|Corner Shelf|Storage Cabinet'],
  kitchen: [4000, 'Non-stick Pan Set|Pressure Cooker|Knife Block|Cooking Pot Set|Tawa|Wok|Spice Rack|Chopping Board Set|Casserole Set|Lunch Box Set'],
  dinner: [3800, 'Dinner Set 24pc|Glass Set 6pc|Melamine Bowl Set|Cup Saucer Set|Cutlery Set 24pc|Serving Tray|Water Jug Set|Plate Set 12pc|Mug Set|Soup Bowl Set'],
  light: [3200, 'Chandelier|Table Lamp|LED Panel Pack|Floor Lamp|Wall Light|Tube Light Pack|Bulb Pack 10pcs|Night Lamp|Ceiling Light|Fairy Lights'],
  decor: [2200, 'Wall Clock|Flower Vase|Canvas Art|Photo Frame Set|Decor Mirror|Candle Set|Showpiece|Wall Hanging|Table Fountain|Artificial Flower Set'],
  garden: [1800, 'Flower Pot Set|Garden Tool Kit|Indoor Plant|Hanging Planter|Watering Can|Garden Hose|Seed Pack Set|Compost Bag|Bonsai|Garden Gloves'],
  tools: [4500, 'Drill Machine|Tool Kit 40pc|Hammer Set|Screwdriver Set|Measuring Tape|Spanner Set|Angle Grinder|Toolbox|Paint Roller Set|Ladder'],
  bath: [5500, 'Shower Set|Wash Basin|Commode Seat|Bathroom Tap|Towel Rack|Soap Dispenser|Bath Mirror|Bucket Set|Shower Curtain|Geyser Pipe Set'],
  organizer: [1600, 'Storage Box Set|Shoe Organizer|Wardrobe Organizer|Laundry Basket|Kitchen Rack|Drawer Organizer|Hanger Set|Vacuum Bag Set|File Box|Wall Organizer'],
  toys: [2400, 'Building Blocks|RC Car|Teddy Bear|Doll House|Toy Train|Puzzle Pack|Kitchen Play Set|Toy Robot|Water Gun|Play Dough Set'],
  books: [1200, 'Bangla Novel Set|Science Encyclopedia|Story Book Pack|Poetry Collection|History Book|Cook Book|Biography|Kids Story Set|Dictionary|Atlas'],
  stationery: [500, 'Notebook Pack|Art Colour Box|School Bag Set|Pen Pack|Geometry Box|Marker Set|File Folder Pack|Sticky Notes|Diary|Calculator'],
  sports: [2200, 'Football|Cricket Bat|Badminton Set|Tennis Racket|Yoga Mat|Dumbbell Pair|Skipping Rope|Basketball|Cricket Ball Pack|Swimming Goggles'],
  bikes: [24000, 'Kids Cycle|Mountain Bike|City Cycle|Road Bike|Folding Bike|BMX Bike|Electric Bike|Ladies Cycle|Balance Bike|Fat Tyre Bike'],
  games: [1100, 'Ludo Deluxe|Chess Set|Puzzle 1000pc|Carrom Board|Card Game Set|Monopoly Style Game|Scrabble Style Game|Jenga Style Tower|Snakes and Ladders|Trivia Game'],
  music: [14000, 'Acoustic Guitar|Keyboard 61 key|Harmonium|Ukulele|Tabla Set|Flute|Violin|Electric Guitar|Drum Pad|Microphone Set'],
  gifts: [3200, 'Gift Hamper|Perfume Set|Greeting Box|Chocolate Gift Box|Flower Bouquet|Photo Gift|Gift Card|Teddy Gift Set|Watch Gift Box|Fruit Basket'],
};

const roundPrice = (v: number): number => (v < 100 ? Math.round(v / 5) * 5 : v < 1000 ? Math.round(v / 10) * 10 : v < 10000 ? Math.round(v / 50) * 50 : Math.round(v / 500) * 500);

function demoProducts(): Product[] {
  const out: Product[] = [];
  for (const c of CATEGORIES) {
    const row = PRODUCT_NAMES[c.id];
    if (!row) continue;
    row[1].split('|').forEach((name, i) => {
      const color = i % 3 === 0 ? c.color : COLOR_POOL[(i * 5 + out.length) % COLOR_POOL.length];
      out.push({ id: `${c.id}-${i + 1}`, categoryId: c.id, name, price: roundPrice(row[0] * PRICE_STEP[i % PRICE_STEP.length]), kind: c.kind, color, slug: `${c.id}-${i + 1}` });
    });
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
