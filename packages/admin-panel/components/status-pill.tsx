export function StatusPill({ value }: { value: string }) {
  return <span className={`status status-${value}`}>{value}</span>;
}
