'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface Props {
  organizationSlug: string;
  labels: {
    overview: string;
    assistant: string;
    chat: string;
    crm: string;
    calendar: string;
    rules: string;
  };
}

export function TenantNavTabs({ organizationSlug, labels }: Props) {
  const pathname = usePathname();
  const basePath = `/app/${organizationSlug}`;

  const tabs = [
    { name: 'Digital Employee', href: `${basePath}/assistant/chat`, exact: true },
    { name: `📅 ${labels.calendar}`, href: `${basePath}/calendar`, exact: false },
    { name: 'Impostazioni', href: basePath, exact: true },
  ];

  return (
    <div style={{
      background: 'rgba(15, 23, 42, 0.6)',
      backdropFilter: 'blur(12px)',
      borderBottom: '1px solid var(--border-color)',
      padding: '0 2rem',
      display: 'flex',
      gap: '2rem',
      overflowX: 'auto',
      marginBottom: '2rem'
    }}>
      {tabs.map((tab) => {
        const isActive = tab.exact 
          ? pathname === tab.href 
          : pathname.startsWith(tab.href);

        return (
          <Link
            key={tab.href}
            href={tab.href}
            style={{
              padding: '1rem 0.5rem',
              color: isActive ? '#60A5FA' : '#94A3B8',
              fontWeight: isActive ? '600' : '500',
              textDecoration: 'none',
              borderBottom: isActive ? '2px solid #60A5FA' : '2px solid transparent',
              transition: 'color 0.2s, border-bottom 0.2s',
              whiteSpace: 'nowrap',
              fontSize: '0.95rem'
            }}
          >
            {tab.name}
          </Link>
        );
      })}
    </div>
  );
}
