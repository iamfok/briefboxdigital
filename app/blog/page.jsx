import { getContent } from '@/lib/content';
import { pageMeta } from '@/components/site';
import { BlogView } from '@/components/views';

export const dynamic = 'force-dynamic';

export async function generateMetadata() {
  const C = await getContent(), b = C.site.pg.blog;
  return pageMeta(C.site, { u: '/blog', title: b.title, desc: b.desc, img: b.cover });
}
export default async function Page() {
  return <BlogView C={await getContent()} />;
}
