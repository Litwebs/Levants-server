export type Announcement = {
  _id: string;
  title: string;
  description?: string;
  isActive: boolean;
  expiresAt?: string;
  createdBy?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type CreateAnnouncementBody = {
  title: string;
  description?: string;
  expiresAt?: string;
};

export type UpdateAnnouncementBody = {
  title?: string;
  description?: string;
  expiresAt?: string | null;
  isActive?: boolean;
};

export type ListAnnouncementsMeta = {
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};
