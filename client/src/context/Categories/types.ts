export type Category = {
  _id: string;
  title: string;
  subtitle: string;
  image?: {
    _id: string;
    url: string;
    originalName: string;
  } | null;
  createdBy?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type CreateCategoryBody = {
  title: string;
  subtitle?: string;
  image?: string | null;
};

export type UpdateCategoryBody = {
  title?: string;
  subtitle?: string;
  image?: string | null;
};

export type ListCategoriesMeta = {
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};
