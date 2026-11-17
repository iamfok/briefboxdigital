import { getContent } from '@/lib/content';
import { pageMeta } from '@/components/site';
import { ContactView } from '@/components/views';

export const dynamic = 'force-dynamic';

export async function generateMetadata() {
  const C = await getContent(), c = C.site.pg.contact;
  return pageMeta(C.site, { u: '/contact', title: c.title, desc: c.desc });
}
export default async function Page() {
  return <ContactView C={await getContent()} />;
}
