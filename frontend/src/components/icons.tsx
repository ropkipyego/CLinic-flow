type IconProps = { className?: string };

function Svg({ className, children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg className={className ?? "h-4 w-4"} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {children}
    </svg>
  );
}

export const Icons = {
  dashboard: (p: IconProps) => (
    <Svg {...p}><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></Svg>
  ),
  patients: (p: IconProps) => (
    <Svg {...p}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></Svg>
  ),
  visits: (p: IconProps) => (
    <Svg {...p}><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></Svg>
  ),
  consultation: (p: IconProps) => (
    <Svg {...p}><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /><path d="M8 7h8M8 11h6" /></Svg>
  ),
  lab: (p: IconProps) => (
    <Svg {...p}><path d="M9 3h6M10 3v7l-5 9a2 2 0 0 0 1.8 3h10.4A2 2 0 0 0 19 19l-5-9V3" /></Svg>
  ),
  pharmacy: (p: IconProps) => (
    <Svg {...p}><rect x="3" y="8" width="18" height="13" rx="2" /><path d="M12 8V4M9 4h6M12 12v5M9.5 14.5h5" /></Svg>
  ),
  cashier: (p: IconProps) => (
    <Svg {...p}><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20" /></Svg>
  ),
  reports: (p: IconProps) => (
    <Svg {...p}><path d="M4 19V5M4 19h16M8 16l3-5 3 3 4-7" /></Svg>
  ),
  sms: (p: IconProps) => (
    <Svg {...p}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></Svg>
  ),
  admin: (p: IconProps) => (
    <Svg {...p}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9c.3.7.9 1.2 1.6 1.3H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></Svg>
  ),
  menu: (p: IconProps) => (
    <Svg {...p}><path d="M4 7h16M4 12h16M4 17h16" /></Svg>
  ),
  close: (p: IconProps) => (
    <Svg {...p}><path d="M6 6l12 12M18 6L6 18" /></Svg>
  ),
  search: (p: IconProps) => (
    <Svg {...p}><circle cx="11" cy="11" r="7" /><path d="M20 20l-3-3" /></Svg>
  ),
  logout: (p: IconProps) => (
    <Svg {...p}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="M16 17l5-5-5-5" /><path d="M21 12H9" /></Svg>
  ),
};
