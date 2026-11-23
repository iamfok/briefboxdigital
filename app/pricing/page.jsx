import { getContent } from '@/lib/content';
import { pageMeta } from '@/components/site';
import { PricingView } from '@/components/views';

export const dynamic = 'force-dynamic';

export async function generateMetadata() {
  const C = await getContent(), p = C.site.pg.pricing;
  return pageMeta(C.site, { u: '/pricing', title: p.title, desc: p.desc, img: p.cover });
}
export default async function Page() {
  return <PricingView C={await getContent()} />;
}
