export type UserRole = 'customer' | 'admin' | 'super_admin' | 'operator' | 'finance';
export type ProfileStatus = 'active' | 'inactive' | 'blocked';

export interface UserProfile {
  id: string;
  full_name: string;
  email: string;
  phone?: string | null;
  document_type?: string | null;
  document_number?: string | null;
  role: UserRole;
  status: ProfileStatus;
  created_at?: string;
  updated_at?: string;
}

export interface SignUpData {
  full_name: string;
  email: string;
  password: string;
  phone?: string;
  document_type?: string;
  document_number?: string;
}
