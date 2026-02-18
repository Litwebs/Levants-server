export type ProductStatus = 'active' | 'draft' | 'archived';

export type ProductCategory =
  | 'Milk'
  | 'Milkshakes'
  | 'Cream'
  | 'Honey'
  | 'Butter'
  | 'Cheese';

export interface ProductStock {
  inStock: boolean;
  quantity: number;
  lowStockThreshold: number;
}

export interface ProductVariant {
  id: string;
  name: string;
  price: number;
}

export interface Product {
  id: string;

  name: string;
  sku?: string;

  category: ProductCategory;
  status: ProductStatus;

  description: string;
  longDescription?: string;

  price: number;

  images: string[];

  stock: ProductStock;

  badges: string[];
  allergens: string[];
  ingredients: string[];

  storageNotes?: string;

  variants?: ProductVariant[];

  createdAt: string;
  updatedAt: string;
}

/**
 * =========================
 * MOCK PRODUCTS
 * =========================
 */

export const products: Product[] = [
  {
    id: 'prod_001',
    name: 'Fresh Whole Milk',
    sku: 'MILK-WHOLE-1L',
    category: 'Milk',
    status: 'active',
    description: 'Fresh whole milk from local farms.',
    longDescription:
      'Our fresh whole milk is sourced daily from trusted local farms, offering rich taste and high nutritional value.',
    price: 1.99,
    images: ['https://bunchobagels.com/wp-content/uploads/2024/09/placeholder.jpg'],
    stock: {
      inStock: true,
      quantity: 42,
      lowStockThreshold: 10,
    },
    badges: ['Bestseller'],
    allergens: ['Milk'],
    ingredients: ['Whole milk'],
    storageNotes: 'Keep refrigerated at 2–5°C.',
    createdAt: '2024-01-10T10:15:00.000Z',
    updatedAt: '2024-02-01T12:00:00.000Z',
  },

  {
    id: 'prod_002',
    name: 'Vanilla Milkshake',
    sku: 'SHAKE-VAN-500',
    category: 'Milkshakes',
    status: 'active',
    description: 'Smooth vanilla-flavoured milkshake.',
    longDescription:
      'A creamy vanilla milkshake made with real vanilla extract and fresh milk.',
    price: 2.49,
    images: ['https://bunchobagels.com/wp-content/uploads/2024/09/placeholder.jpg'],
    stock: {
      inStock: true,
      quantity: 8,
      lowStockThreshold: 10,
    },
    badges: ['Limited'],
    allergens: ['Milk'],
    ingredients: ['Milk', 'Sugar', 'Vanilla extract'],
    storageNotes: 'Best served chilled.',
    createdAt: '2024-01-12T09:30:00.000Z',
    updatedAt: '2024-02-05T08:20:00.000Z',
  },

  {
    id: 'prod_003',
    name: 'Organic Butter',
    sku: 'BUTTER-ORG-250',
    category: 'Butter',
    status: 'draft',
    description: 'Creamy organic butter.',
    longDescription:
      'Organic butter churned from high-quality cream for superior taste.',
    price: 3.75,
    images: ['https://bunchobagels.com/wp-content/uploads/2024/09/placeholder.jpg'],
    stock: {
      inStock: true,
      quantity: 15,
      lowStockThreshold: 5,
    },
    badges: [],
    allergens: ['Milk'],
    ingredients: ['Cream'],
    storageNotes: 'Keep refrigerated.',
    createdAt: '2024-01-20T14:45:00.000Z',
    updatedAt: '2024-01-20T14:45:00.000Z',
  },

  {
    id: 'prod_004',
    name: 'Raw Honey Jar',
    sku: 'HONEY-RAW-500',
    category: 'Honey',
    status: 'archived',
    description: 'Pure raw honey.',
    longDescription:
      'Unfiltered raw honey collected from wildflower fields.',
    price: 5.99,
    images: ['https://bunchobagels.com/wp-content/uploads/2024/09/placeholder.jpg'],
    stock: {
      inStock: false,
      quantity: 0,
      lowStockThreshold: 5,
    },
    badges: ['Seasonal'],
    allergens: [],
    ingredients: ['Honey'],
    storageNotes: 'Store at room temperature.',
    createdAt: '2023-12-01T11:00:00.000Z',
    updatedAt: '2024-01-15T16:10:00.000Z',
  },

  {
    id: 'prod_005',
    name: 'Cheddar Cheese Block',
    sku: 'CHEESE-CHED-400',
    category: 'Cheese',
    status: 'active',
    description: 'Mature cheddar cheese.',
    longDescription:
      'Aged cheddar cheese with a sharp, full-bodied flavour.',
    price: 4.50,
    images: ['https://bunchobagels.com/wp-content/uploads/2024/09/placeholder.jpg'],
    stock: {
      inStock: true,
      quantity: 25,
      lowStockThreshold: 8,
    },
    badges: ['Bestseller'],
    allergens: ['Milk'],
    ingredients: ['Milk', 'Salt', 'Cultures'],
    storageNotes: 'Keep refrigerated and sealed.',
    variants: [
      { id: 'var_1', name: 'Mild', price: 4.25 },
      { id: 'var_2', name: 'Extra Mature', price: 4.75 },
    ],
    createdAt: '2024-01-05T08:00:00.000Z',
    updatedAt: '2024-02-02T10:45:00.000Z',
  },
];
