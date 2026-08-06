import * as React from 'react';
import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement>;

function IconFrame({ children, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

export function GatewayMark(props: IconProps) {
  return (
    <svg viewBox="0 0 32 32" fill="none" aria-hidden="true" {...props}>
      <path d="M5 8h18l4 4-4 4H13l-3 3 3 3h10" stroke="currentColor" strokeWidth="3" strokeLinecap="square" strokeLinejoin="miter" />
      <path d="M23 16v11" stroke="currentColor" strokeWidth="3" strokeLinecap="square" />
    </svg>
  );
}

export function OverviewIcon(props: IconProps) {
  return <IconFrame {...props}><path d="M4 10.5 12 4l8 6.5V20H4z" /><path d="M9 20v-6h6v6" /></IconFrame>;
}

export function ProxyIcon(props: IconProps) {
  return <IconFrame {...props}><circle cx="6" cy="12" r="2" /><circle cx="18" cy="6" r="2" /><circle cx="18" cy="18" r="2" /><path d="M8 12h4l4-6M12 12l4 6" /></IconFrame>;
}

export function ApplicationIcon(props: IconProps) {
  return <IconFrame {...props}><rect x="4" y="4" width="16" height="16" rx="2" /><path d="M4 9h16M8 4v5" /></IconFrame>;
}

export function ProductIcon(props: IconProps) {
  return <IconFrame {...props}><path d="m12 3 8 4.5v9L12 21l-8-4.5v-9z" /><path d="m4 7.5 8 4.5 8-4.5M12 12v9" /></IconFrame>;
}

export function CertificateIcon(props: IconProps) {
  return <IconFrame {...props}><circle cx="9" cy="10" r="4" /><path d="m12 13 7 7M16 17l2-2M7 14l-2 7 4-2 3 2 1.5-5" /></IconFrame>;
}

export function AuthorityIcon(props: IconProps) {
  return <IconFrame {...props}><path d="M12 3 20 6v5c0 5-3.2 8.2-8 10-4.8-1.8-8-5-8-10V6z" /><path d="m8.5 12 2.2 2.2 4.8-5" /></IconFrame>;
}

export function ArrowIcon(props: IconProps) {
  return <IconFrame {...props}><path d="M5 12h14M15 8l4 4-4 4" /></IconFrame>;
}

export function LogoutIcon(props: IconProps) {
  return <IconFrame {...props}><path d="M10 5H5v14h5M14 8l4 4-4 4M18 12H9" /></IconFrame>;
}

export function RefreshIcon(props: IconProps) {
  return <IconFrame {...props}><path d="M20 7v5h-5M4 17v-5h5" /><path d="M6.1 8a7 7 0 0 1 11.7-1L20 12M4 12l2.2 5a7 7 0 0 0 11.7-1" /></IconFrame>;
}

export function AlertIcon(props: IconProps) {
  return <IconFrame {...props}><circle cx="12" cy="12" r="9" /><path d="M12 7v6M12 17h.01" /></IconFrame>;
}

export function LockIcon(props: IconProps) {
  return <IconFrame {...props}><rect x="5" y="10" width="14" height="10" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></IconFrame>;
}

export function TokenIcon(props: IconProps) {
  return <IconFrame {...props}><path d="M7 4h10l4 8-4 8H7l-4-8z" /><path d="m9 12 2 2 4-4" /></IconFrame>;
}

export function ClientIcon(props: IconProps) {
  return <IconFrame {...props}><circle cx="12" cy="8" r="3" /><path d="M5.5 20c.8-4 3-6 6.5-6s5.7 2 6.5 6" /></IconFrame>;
}

export function UpstreamIcon(props: IconProps) {
  return <IconFrame {...props}><ellipse cx="12" cy="6" rx="7" ry="3" /><path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6" /></IconFrame>;
}

export function SearchIcon(props: IconProps) {
  return <IconFrame {...props}><circle cx="10.5" cy="10.5" r="6.5" /><path d="m15.5 15.5 4.5 4.5" /></IconFrame>;
}

export function PlusIcon(props: IconProps) {
  return <IconFrame {...props}><path d="M12 5v14M5 12h14" /></IconFrame>;
}

export function UploadIcon(props: IconProps) {
  return <IconFrame {...props}><path d="M12 16V4M8 8l4-4 4 4M5 14v6h14v-6" /></IconFrame>;
}

export function DownloadIcon(props: IconProps) {
  return <IconFrame {...props}><path d="M12 4v12M8 12l4 4 4-4M5 20h14" /></IconFrame>;
}

export function ChevronIcon(props: IconProps) {
  return <IconFrame {...props}><path d="m9 6 6 6-6 6" /></IconFrame>;
}

export function EditIcon(props: IconProps) {
  return <IconFrame {...props}><path d="m14 5 5 5M4 20l3.5-.8L19 7.7a2.1 2.1 0 0 0-3-3L4.8 16.2z" /></IconFrame>;
}

export function PauseIcon(props: IconProps) {
  return <IconFrame {...props}><path d="M8 5v14M16 5v14" /></IconFrame>;
}

export function CopyIcon(props: IconProps) {
  return <IconFrame {...props}><rect x="8" y="8" width="11" height="11" rx="2" /><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3" /></IconFrame>;
}

export function FilterIcon(props: IconProps) {
  return <IconFrame {...props}><path d="M4 6h16M7 12h10M10 18h4" /></IconFrame>;
}

export function CloseIcon(props: IconProps) {
  return <IconFrame {...props}><path d="m6 6 12 12M18 6 6 18" /></IconFrame>;
}

export function SidebarToggleIcon(props: IconProps) {
  return <IconFrame {...props}><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9 4v16M17 9l-3 3 3 3" /></IconFrame>;
}
