import { ProxyDetailWorkspace } from '@/components/proxy-detail-workspace';

export default function ProxyDetailPage({
  params,
}: {
  params: { proxyId: string };
}) {
  return <ProxyDetailWorkspace proxyId={params.proxyId} />;
}
