import { getContent } from '@/lib/content';
import { pageMeta } from '@/components/site';
import { ServicesHubView } from '@/components/views';

export const dynamic = 'force-dynamic';

export async function generateMetadata() {
  const C = await getContent(), h = C.site.pg.hub;
  return pageMeta(C.site, { u: '/services', title: h.title, desc: h.desc });
}
export default async function Page() {
  return <ServicesHubView C={await getContent()} />;
}
