// EPIC-004: Classification Engine & Universe Screen
// STORY-048: Universe Screen — Stock Table
// TASK-048-001: /universe server component
// PRD §Screen 2 — Universe / Monitor List; RFC-003 §Universe Screen

import { Suspense } from 'react';
import UniversePageClient from '@/components/universe/UniversePageClient';

export const metadata = { title: 'Universe | 3AA' };

export default function UniversePage() {
  return (
    <Suspense fallback={<div className="p-8 text-gray-500">Loading universe...</div>}>
      <UniversePageClient />
    </Suspense>
  );
}
