import { getContent } from '@/lib/content';
import { pageMeta } from '@/components/site';
import { HomeView } from '@/components/views';

export const dynamic = 'force-dynamic';

export async function generateMetadata() {
  const C = await getContent();
  return pageMeta(C.site, { u: '/', title: C.site.home.meta, desc: C.site.description });
}

export default async function Home() {
  const C = await getContent();
  return <HomeView C={C} />;
}
