import type { Role } from '../types/contracts';

const ROLE_LABEL: Record<Role, string> = {
  presales: '售前',
  pm: 'PM',
  delivery: '交付',
  postsales: '售后',
  admin: '管理员',
};

const ROLE_TAG: Record<Role, string> = {
  presales: 'tag-info',
  pm: 'tag-success',
  delivery: 'tag-warning',
  postsales: 'tag-info',
  admin: 'tag-danger',
};

export interface RoleChipProps {
  role: Role;
}

/** Compact role badge. Uses the `.tag` family from global.css. */
export default function RoleChip({ role }: RoleChipProps) {
  return <span className={`tag ${ROLE_TAG[role]}`}>{ROLE_LABEL[role]}</span>;
}

export { ROLE_LABEL, ROLE_TAG };
