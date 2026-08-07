import { ProxyDetailWorkspace } from '@/components/proxy-detail-workspace';

export default function ProxyDetailPage({
  params,
  searchParams,
}: {
  params: { proxyId: string };
  searchParams?: { created?: string };
}) {
  return <ProxyDetailWorkspace proxyId={params.proxyId} created={searchParams?.created === '1'} />;
}
