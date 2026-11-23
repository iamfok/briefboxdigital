// About, Privacy, Terms, Cookies and any page added in the admin.
import { notFound } from 'next/navigation';
import { getContent } from '@/lib/content';
import { pageMeta } from '@/components/site';
import { PageView } from '@/components/views';

export const dynamic = 'force-dynamic';

const find = (C, slug) => C.pages.find(p => p.slug && p.slug === slug);

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const C = await getContent(), p = find(C, slug);
  if (!p) return {};
  return pageMeta(C.site, { u: '/' + p.slug, title: `${p.title} | ${C.site.brand}`, desc: p.desc, img: p.cover || C.site.cover });
}
export default async function Page({ params }) {
  const { slug } = await params;
  const C = await getContent(), p = find(C, slug);
  if (!p) notFound();
  return <PageView C={C} p={p} />;
}
