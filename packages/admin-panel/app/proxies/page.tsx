import { Suspense } from 'react';
import { ProxyInventoryWorkspace } from '@/components/proxy-inventory-workspace';

export default function ProxiesPage() {
  return (
    <Suspense fallback={<ProxyInventoryFallback />}>
      <ProxyInventoryWorkspace />
    </Suspense>
  );
}

function ProxyInventoryFallback() {
  return (
    <div className="proxy-page" aria-label="Loading proxy inventory">
      <div className="proxy-detail-loading"><div /><div /><div /></div>
    </div>
  );
}
