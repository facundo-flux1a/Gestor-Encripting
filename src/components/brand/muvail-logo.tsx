'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

type MuvailLogoProps = {
  className?: string;
  compact?: boolean;
  wordmarkOnly?: boolean;
  inverse?: boolean;
  forceLight?: boolean;
  monochrome?: boolean;
  onDark?: boolean;
  label?: string;
};

/** El símbolo usa el recorte original aprobado; no se redibuja ni se vectoriza. */
export function MuvailLogo({
  className,
  compact = false,
  wordmarkOnly = false,
  inverse = false,
  forceLight = false,
  monochrome = false,
  onDark = false,
  label = 'Muvail',
}: MuvailLogoProps) {
  const symbolSize = compact ? 'h-9 w-9' : 'h-14 w-14';
  const darkSurface = onDark || inverse;
  const symbol = (
    <span className={cn('relative inline-flex shrink-0 items-center justify-center', symbolSize)} aria-hidden="true">
      {darkSurface ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src="/branding/muvail-symbol-dark-source.png" alt="" className="h-full w-full object-contain" />
      ) : forceLight ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src="/branding/muvail-symbol-light-source.png" alt="" className="h-full w-full object-contain" />
      ) : (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/branding/muvail-symbol-light-source.png" alt="" className="h-full w-full object-contain dark:hidden" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/branding/muvail-symbol-dark-source.png" alt="" className="hidden h-full w-full object-contain dark:block" />
        </>
      )}
    </span>
  );

  return (
    <span className={cn('inline-flex items-center', !compact && !wordmarkOnly && 'gap-2', className)} aria-label={label}>
      {!wordmarkOnly && symbol}
      {!compact && (
        <>
          <span className="relative inline-flex h-7 items-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {darkSurface ? (
              <img
                src="/branding/muvail-wordmark-dark.svg"
                alt=""
                className="h-full w-auto object-contain"
              />
            ) : forceLight ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src="/branding/muvail-wordmark-light.svg"
                alt=""
                className={cn('h-full w-auto object-contain', monochrome && 'brightness-0')}
              />
            ) : (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/branding/muvail-wordmark-light.svg"
                  alt=""
                  className="h-full w-auto object-contain dark:hidden"
                />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/branding/muvail-wordmark-dark.svg"
                  alt=""
                  className="hidden h-full w-auto object-contain dark:block"
                />
              </>
            )}
          </span>
        </>
      )}
    </span>
  );
}
