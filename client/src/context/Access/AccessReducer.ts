import { type AccessState, initialAccessState, type Role } from "./constants";

export const ACCESS_REQUEST = "ACCESS_REQUEST";
export const ACCESS_FAILURE = "ACCESS_FAILURE";

export const ACCESS_ROLES_REQUEST = "ACCESS_ROLES_REQUEST";
export const ACCESS_ROLES_SUCCESS = "ACCESS_ROLES_SUCCESS";

export const ACCESS_PERMISSIONS_REQUEST = "ACCESS_PERMISSIONS_REQUEST";
export const ACCESS_PERMISSIONS_SUCCESS = "ACCESS_PERMISSIONS_SUCCESS";

export const ACCESS_ROLE_CREATE_SUCCESS = "ACCESS_ROLE_CREATE_SUCCESS";
export const ACCESS_ROLE_UPDATE_SUCCESS = "ACCESS_ROLE_UPDATE_SUCCESS";
export const ACCESS_ROLE_DELETE_SUCCESS = "ACCESS_ROLE_DELETE_SUCCESS";

export type AccessAction =
  | { type: typeof ACCESS_REQUEST }
  | { type: typeof ACCESS_FAILURE; payload: string }
  | { type: typeof ACCESS_ROLES_REQUEST }
  | { type: typeof ACCESS_ROLES_SUCCESS; payload: { roles: Role[] } }
  | { type: typeof ACCESS_PERMISSIONS_REQUEST }
  | {
      type: typeof ACCESS_PERMISSIONS_SUCCESS;
      payload: { permissions: string[] };
    }
  | { type: typeof ACCESS_ROLE_CREATE_SUCCESS; payload: { role: Role } }
  | { type: typeof ACCESS_ROLE_UPDATE_SUCCESS; payload: { role: Role } }
  | { type: typeof ACCESS_ROLE_DELETE_SUCCESS; payload: { roleId: string } };

const getRoleId = (role: Partial<Role>) => String(role._id || role.id || "");

export default function AccessReducer(
  state: AccessState,
  action: AccessAction,
): AccessState {
  switch (action.type) {
    case ACCESS_REQUEST:
      return { ...state, loading: true, error: null };

    case ACCESS_ROLES_REQUEST:
      return { ...state, rolesLoading: true, error: null };

    case ACCESS_PERMISSIONS_REQUEST:
      return { ...state, permissionsLoading: true, error: null };

    case ACCESS_FAILURE:
      return {
        ...state,
        loading: false,
        rolesLoading: false,
        permissionsLoading: false,
        error: action.payload,
      };

    case ACCESS_ROLES_SUCCESS:
      return {
        ...state,
        rolesLoading: false,
        loading: false,
        error: null,
        roles: action.payload.roles,
      };

    case ACCESS_PERMISSIONS_SUCCESS:
      return {
        ...state,
        permissionsLoading: false,
        loading: false,
        error: null,
        permissions: action.payload.permissions,
      };

    case ACCESS_ROLE_CREATE_SUCCESS:
      return {
        ...state,
        error: null,
        roles: [action.payload.role, ...state.roles],
      };

    case ACCESS_ROLE_UPDATE_SUCCESS: {
      const updatedId = getRoleId(action.payload.role);
      return {
        ...state,
        error: null,
        roles: state.roles.map((r) =>
          getRoleId(r) === updatedId ? action.payload.role : r,
        ),
      };
    }

    case ACCESS_ROLE_DELETE_SUCCESS:
      return {
        ...state,
        error: null,
        roles: state.roles.filter((r) => getRoleId(r) !== action.payload.roleId),
      };

    default:
      return state || initialAccessState;
  }
}
