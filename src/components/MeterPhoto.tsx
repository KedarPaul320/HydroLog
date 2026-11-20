import { useState } from 'react';
import { Gauge } from 'lucide-react';

interface MeterPhotoProps {
  src: string;
  alt: string;
  className?: string;
  onClick?: () => void;
  ariaLabel?: string;
}

export function MeterPhoto({
  src,
  alt,
  className = 'w-14 h-11 object-cover rounded-md',
  onClick,
  ariaLabel,
}: MeterPhotoProps) {
  const [failed, setFailed] = useState(false);

  const content = failed || !src ? (
    <div
      className={`${className} bg-slate-100 border border-slate-200 flex flex-col items-center justify-center text-slate-400`}
      aria-label={alt}
    >
      <Gauge className="w-4 h-4" aria-hidden="true" />
    </div>
  ) : (
    <img
      src={src}
      alt={alt}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={`${className} bg-slate-100 border border-slate-200`}
    />
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label={ariaLabel || `Inspect ${alt}`}
        className="group relative inline-block rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700 cursor-pointer shrink-0"
      >
        {content}
      </button>
    );
  }

  return content;
}
