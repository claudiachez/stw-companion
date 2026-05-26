export function LoadingSpinner({ className = '' }: { className?: string }) {
  return (
    <div className={`flex items-center justify-center ${className}`}>
      <div className="w-6 h-6 border-2 border-acc border-t-transparent rounded-full animate-spin" />
    </div>
  );
}
