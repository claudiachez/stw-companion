export function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex items-center justify-center h-40 text-t3 text-sm">
      {message}
    </div>
  );
}
