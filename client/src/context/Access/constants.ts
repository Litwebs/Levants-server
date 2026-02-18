export type Role = {
  _id?: string;
  id?: string;
  name: string;
  description?: string;
  permissions?: string[];
  isSystem?: boolean;
  createdBy?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export type AccessState = {
  roles: Role[];
  permissions: string[];
  loading: boolean;
  rolesLoading: boolean;
  permissionsLoading: boolean;
  error: string | null;
};

export const initialAccessState: AccessState = {
  roles: [],
  permissions: [],
  loading: false,
  rolesLoading: false,
  permissionsLoading: false,
  error: null,
};
