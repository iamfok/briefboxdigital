import { notFound } from 'next/navigation';
import { getContent } from '@/lib/content';
import { pageMeta } from '@/components/site';
import { ServiceView } from '@/components/views';

export const dynamic = 'force-dynamic';

const find = (C, slug) => C.services.find(s => s.slug === slug);

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const C = await getContent(), s = find(C, slug);
  if (!s) return {};
  return pageMeta(C.site, { u: '/services/' + s.slug, title: s.seo_title, desc: s.meta });
}
export default async function Page({ params }) {
  const { slug } = await params;
  const C = await getContent(), s = find(C, slug);
  if (!s) notFound();
  return <ServiceView C={C} s={s} />;
}
