import type { NavItem } from '@/components/client';
import type { Persona } from './session';

// Left menu and profile menu per role (same items and order as the prototype).
export function navFor(p: Persona): NavItem[] {
  switch (p) {
    case 'superadmin':
      return [
        { label: 'Dashboard', href: '/dashboard' },
        { label: 'Clients', href: '/clients' },
        { label: 'Vendors', href: '/vendors' },
        { label: 'W-2 Resources', href: '/resources/w2' },
        { label: '1099 Resources', href: '/resources/1099' },
        { label: 'Invoice Management', href: '/invoice-management' },
        { label: 'Document Tracker', href: '/documents' },
        { label: 'User Account Management', href: '/settings/users', group: 'Settings' },
        { label: 'Audit Log', href: '/audit', group: 'Settings' }
      ];
    case 'accountmanager':
      return [
        { label: 'Dashboard', href: '/dashboard' },
        { label: 'My Clients', href: '/clients' },
        { label: 'My Vendors', href: '/vendors' },
        { label: 'W-2 Resources', href: '/resources/w2' },
        { label: '1099 Resources', href: '/resources/1099' },
        { label: 'Invoice Management', href: '/invoice-management' },
        { label: 'Document Tracker', href: '/documents' },
        { label: 'Audit Log', href: '/audit' }
      ];
    case 'vendor':
      return [
        { label: 'Dashboard', href: '/dashboard' },
        { label: 'Consultants', href: '/consultants' },
        { label: 'Invoices', href: '/invoices' }
      ];
    case 'w2':
      return [{ label: 'Dashboard', href: '/dashboard' }, { label: 'Timesheets', href: '/timesheets' }];
    case 'w9':
      return [{ label: 'Dashboard', href: '/dashboard' }, { label: 'Invoices', href: '/invoices' }];
  }
}

export function profileMenuFor(p: Persona): { label: string; href: string }[] {
  if (p === 'vendor') return [
    { label: 'Documents', href: '/my-documents' }, { label: 'Company Profile', href: '/profile' }, { label: 'Change Password', href: '/change-password' }];
  if (p === 'w2' || p === 'w9') return [{ label: 'My Documents', href: '/my-documents' }, { label: 'Change Password', href: '/change-password' }];
  return []; // Super Admin / Account Manager: Sign Out only
}
