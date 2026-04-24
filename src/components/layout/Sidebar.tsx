// EPIC-004/STORY-054/TASK-054-002: Sidebar navigation — matches docs/ui/project/3aa/components.jsx Sidebar spec

'use client';

import React from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { T } from '@/lib/theme';

const NAV = [
  { key: 'universe', label: 'Universe', path: '/universe' },
  // Alerts and Settings are planned (EPIC-005+)
];

export default function Sidebar({ userEmail }: { userEmail?: string }) {
  const pathname = usePathname();
  const router = useRouter();

  const activeKey = pathname.startsWith('/stocks') ? 'universe'
    : pathname.startsWith('/universe') ? 'universe'
    : '';

  return (
    <div style={{
      width: 200,
      flexShrink: 0,
      display: 'flex',
      flexDirection: 'column',
      background: T.sidebarBg,
      borderRight: `1px solid ${T.border}`,
      height: '100%',
    }}>
      {/* Logo */}
      <div style={{ padding: '16px 16px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{
          width: 24, height: 24, borderRadius: 4, background: T.accent,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 11, fontWeight: 800, color: '#0b0d11',
          fontFamily: 'var(--font-dm-mono, monospace)',
        }}>
          3A
        </div>
        <span style={{ fontSize: 13, fontWeight: 600, color: T.text }}>3AA</span>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: '8px 0' }}>
        {NAV.map(({ key, label, path }) => {
          const active = activeKey === key;
          return (
            <button
              key={key}
              onClick={() => router.push(path)}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '7px 16px',
                border: 'none',
                borderLeft: active ? `2px solid ${T.accent}` : '2px solid transparent',
                background: active ? T.accent + '18' : 'transparent',
                color: active ? T.accent : T.textMuted,
                fontSize: 13,
                fontWeight: active ? 600 : 400,
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'all 0.1s',
                fontFamily: 'inherit',
              }}
            >
              {label}
            </button>
          );
        })}
      </nav>

      {/* User section */}
      {userEmail && (
        <div style={{
          padding: '10px 16px',
          borderTop: `1px solid ${T.border}`,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}>
          <div style={{
            width: 26, height: 26, borderRadius: '50%',
            background: T.accent + '33',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 11, fontWeight: 700, color: T.accent,
            flexShrink: 0,
          }}>
            {userEmail[0].toUpperCase()}
          </div>
          <span style={{
            fontSize: 11, color: T.textMuted,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {userEmail}
          </span>
        </div>
      )}
    </div>
  );
}
