import { redirect } from 'next/navigation';

/** The support inbox is part of the admin app's Inbox now (with data requests and complaints): old links land there. */
export default function SupportInboxPage() {
  redirect('/admin/inbox');
}
