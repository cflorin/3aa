// EPIC-001/STORY-008/TASK-008-002
import { redirect } from 'next/navigation';

export default function Home() {
  redirect('/signin');
}
