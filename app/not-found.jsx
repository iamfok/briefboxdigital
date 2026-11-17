import { getContent } from '@/lib/content';
import { NotFoundView } from '@/components/views';

export default async function NotFound() {
  const C = await getContent();
  return (
    <>
      <title>{`Page not found | ${C.site.brand}`}</title>
      <meta name="robots" content="noindex,follow" />
      <NotFoundView C={C} />
    </>
  );
}
