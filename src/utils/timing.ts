export function startTiming(label: string): () => void {
  const start = Date.now();
  const ts = new Date(start).toISOString();
  console.log(`[${ts}] START ${label}`);
  return () => {
    const end = Date.now();
    const tsEnd = new Date(end).toISOString();
    const duration = end - start;
    console.log(`[${tsEnd}] END   ${label} (${duration}ms)`);
  };
}

