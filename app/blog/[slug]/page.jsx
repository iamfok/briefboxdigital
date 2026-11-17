import { notFound } from 'next/navigation';
import { getContent, sortedPosts } from '@/lib/content';
import { pageMeta } from '@/components/site';
import { PostView, postTitle } from '@/components/views';

export const dynamic = 'force-dynamic';

const find = (C, slug) => sortedPosts(C).find(p => p.slug === slug);

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const C = await getContent(), p = find(C, slug);
  if (!p) return {};
  return pageMeta(C.site, { u: '/blog/' + p.slug, type: 'article', title: postTitle(C.site, p), desc: p.desc });
}
export default async function Page({ params }) {
  const { slug } = await params;
  const C = await getContent(), p = find(C, slug);
  if (!p) notFound();
  return <PostView C={C} p={p} />;
}
