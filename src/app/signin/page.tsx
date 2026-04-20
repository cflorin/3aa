// EPIC-002: Authentication & User Management
// STORY-014: Sign-In Page UI (Screen 1)
// TASK-014-002: /signin Server Component — reads sessionId cookie directly for already-auth redirect
// ADR-011: /signin excluded from middleware; getCurrentUser() not available here (middleware never runs)
// PRD §9A / Screen 1: redirect already-authenticated users to /universe

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { validateSession } from '@/modules/auth/auth.service';
import SignInForm from './SignInForm';

export default async function SignInPage() {
  const sessionId = cookies().get('sessionId')?.value;

  if (sessionId) {
    const user = await validateSession(sessionId);
    if (user) {
      redirect('/universe');
    }
  }

  return (
    <main>
      <SignInForm />
    </main>
  );
}
