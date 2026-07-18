export type Review = {
  _id: string;
  orderId: string;
  customerName: string;
  description: string;
  rating: number;
  imageUrl?: string | null;
  isVisible: boolean;
  createdAt?: string;
  updatedAt?: string;
};

export type ListReviewsMeta = {
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  averageRating: number | null;
};

export type CreateReviewBody = {
  orderId: string;
  customerName: string;
  description: string;
  rating: number;
  image?: File | null;
};

export type UpdateReviewVisibilityBody = {
  isVisible: boolean;
};
