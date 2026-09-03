'use client'

import React from 'react'
import Image from 'next/image'

interface PosterFrameProps {
  src: string
  alt: string
  width?: number
  height?: number
  dossierTitle?: string
  priority?: boolean
  className?: string
}

export function PosterFrame({
  src,
  alt,
  width = 900,
  height = 1200,
  dossierTitle = 'CYBERCARNIVAL 2026',
  priority = false,
  className = '',
}: PosterFrameProps) {
  return (
    <div
      className={`group relative z-20 h-auto w-full cursor-pointer rounded-[14px] border border-[rgba(145,70,255,0.6)] bg-[rgba(8,5,18,0.85)] p-4 sm:p-5 backdrop-blur-sm shadow-[0_0_35px_rgba(145,70,255,0.25),inset_0_0_20px_rgba(145,70,255,0.08)] transition-all duration-500 hover:border-primary hover:shadow-[0_0_45px_rgba(168,85,247,0.5)] ${className}`}
    >
      {/* Crisp Dominant Uncropped Poster Artwork */}
      <Image
        src={src}
        alt={alt}
        width={width}
        height={height}
        className="block h-auto w-full rounded-[10px] object-contain transition-transform duration-700 ease-out group-hover:scale-[1.02]"
        priority={priority}
      />

      {/* Subtle bottom gradient badge overlay */}
      <div className="pointer-events-none absolute inset-x-4 sm:inset-x-5 bottom-4 sm:bottom-5 rounded-b-[10px] bg-gradient-to-t from-background/95 via-background/40 to-transparent p-5 text-left transition-opacity duration-300">
        <span className="font-mono text-[10px] tracking-[0.25em] text-primary font-bold">● OFFICIAL DOSSIER</span>
        <p className="mt-0.5 font-display text-lg sm:text-xl font-bold text-foreground">{dossierTitle}</p>
      </div>
    </div>
  )
}
