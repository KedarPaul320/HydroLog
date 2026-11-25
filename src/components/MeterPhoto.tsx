import { useEffect, useState } from 'react';
import { Gauge } from 'lucide-react';
import { api } from '../api/client';

interface MeterPhotoProps {
  src?: string;
  photoId?: string;
  alt: string;
  className?: string;
  onClick?: () => void;
  ariaLabel?: string;
}

export function MeterPhoto({
  src,
  photoId,
  alt,
  className = 'w-14 h-11 object-cover rounded-md',
  onClick,
  ariaLabel,
}: MeterPhotoProps) {
  const [resolvedSrc, setResolvedSrc] = useState<string>(src || '');
  const [loading, setLoading] = useState<boolean>(Boolean(!src && photoId));
  const [failed, setFailed] = useState<boolean>(false);

  useEffect(() => {
    setFailed(false);
    if (src) {
      setResolvedSrc(src);
      setLoading(false);
      return;
    }

    if (!photoId) {
      setResolvedSrc('');
      setLoading(false);
      return;
    }

    let active = true;
    setLoading(true);
    api
      .getPhotoDataUrl(photoId)
      .then((url) => {
        if (!active) return;
        if (url) {
          setResolvedSrc(url);
        } else {
          setFailed(true);
        }
      })
      .catch(() => {
        if (active) setFailed(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [src, photoId]);

  const content = loading ? (
    <div
      className={`${className} bg-slate-100 border border-slate-200 animate-pulse`}
      aria-label={`Loading ${alt}`}
    />
  ) : failed || !resolvedSrc ? (
    <div
      className={`${className} bg-slate-100 border border-slate-200 flex flex-col items-center justify-center text-slate-400`}
      aria-label={alt}
    >
      <Gauge className="w-4 h-4" aria-hidden="true" />
    </div>
  ) : (
    <img
      src={resolvedSrc}
      alt={alt}
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
