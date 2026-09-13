"use client"

import React, { useEffect, useRef, useState, useCallback } from "react"
import { Volume2, VolumeX, ArrowDown } from "lucide-react"

// ─────────────────────────────────────────────────────────────
// METRO HERO / SCROLL-LOCKED VIDEO HERO
//
// Behavior:
// 1. Static Initial State: Video is strictly PAUSED at 0.0s. It will
//    NEVER play automatically. It only scrubs when the user scrolls.
// 2. Start (0.0 -> 0.16):
//    - "THE CITY OPENS" is crisp and centered.
//    - "SCROLL ↓" is visible.
//    - As user scrolls, "SCROLL ↓" immediately disappears (< 0.04).
//    - "THE CITY OPENS" blurs out (blur: 0 -> 24px) and fades to 0 opacity.
// 3. Mid (0.18 -> 0.72):
//    - Doors slide open in response to scroll.
//    - Anamorphic horizontal lens flare glints across the door opening.
//    - Camera moves forward through the doorway.
//    - NO text is visible during this transition.
// 4. Exit / Reveal (0.72 -> 1.0):
//    - Camera moves outside the subway doors into the open night city.
//    - "Every door in the city is already open." smoothly sharpens and fades in.
// 5. Bottom Progress Bar: Sleek white indicator tracking exact scroll position.
// 6. Smoothness: Frame-locked seeking pipeline using `seeking` guard & lerp
//    prevents decoder stutter and dropped frames.
// ─────────────────────────────────────────────────────────────

const VIDEO_SRC =
  "https://raw.githubusercontent.com/gughigug/metro-hero-assets/main/Subway_doors_open_to_city_202608242331.mp4"

export interface MetroHeroProps {
  title?: string
  subtitle?: string
  videoSrc?: string
  signature?: { name: string; url: string } | false
  className?: string
  style?: React.CSSProperties
  /** Height multiplier for the scroll track (e.g. 3.5 = 350vh) */
  scrollDistance?: number
}

const DEFAULT_SIGNATURE = {
  name: "by chinmay bhatt",
  url: "https://www.guglielmogiannattasio.it",
}

export default function MetroHero({
  title = "Welcome",
  subtitle = "Every door in the city is already open.",
  videoSrc = VIDEO_SRC,
  signature = DEFAULT_SIGNATURE,
  className = "",
  style,
  scrollDistance = 3.5,
}: MetroHeroProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const [progress, setProgress] = useState(0)
  const [isMuted, setIsMuted] = useState(true)

  // Physics & seeking synchronization
  const targetProgressRef = useRef(0)
  const currentProgressRef = useRef(0)
  const durationRef = useRef(8.0)
  const isSeekingRef = useRef(false)
  const pendingTimeRef = useRef<number | null>(null)
  const rafIdRef = useRef<number | null>(null)

  // Direct touch tracking for mobile
  const isTouchingRef = useRef(false)
  const touchStartYRef = useRef(0)
  const touchStartScrollRef = useRef(0)

  // Safe frame-accurate video seek function
  const applySeek = useCallback((time: number) => {
    const vid = videoRef.current
    if (!vid || vid.readyState < 1) return

    // Clamp time strictly inside video duration
    const clampedTime = Math.max(0, Math.min(durationRef.current - 0.01, time))

    if (isSeekingRef.current) {
      pendingTimeRef.current = clampedTime
      return
    }

    isSeekingRef.current = true
    try {
      if ("fastSeek" in vid && typeof (vid as any).fastSeek === "function") {
        ;(vid as any).fastSeek(clampedTime)
      } else {
        vid.currentTime = clampedTime
      }
    } catch {
      vid.currentTime = clampedTime
    }
  }, [])

  // Handle seeked event: process any queued target time
  const handleSeeked = useCallback(() => {
    isSeekingRef.current = false
    if (pendingTimeRef.current !== null) {
      const nextTime = pendingTimeRef.current
      pendingTimeRef.current = null
      applySeek(nextTime)
    }
  }, [applySeek])

  // Setup video: pause strictly, set duration
  const handleLoadedMetadata = useCallback(() => {
    const vid = videoRef.current
    if (!vid) return
    durationRef.current = vid.duration || 8.0
    vid.pause()
    vid.currentTime = 0
  }, [])

  // Ensure video NEVER plays on its own
  const preventAutoPlay = useCallback(() => {
    const vid = videoRef.current
    if (vid && !vid.paused) {
      vid.pause()
    }
  }, [])

  // Main animation loop: dampens progress smoothly and feeds video frames
  useEffect(() => {
    let active = true

    const loop = () => {
      if (!active) return

      const diff = targetProgressRef.current - currentProgressRef.current
      if (Math.abs(diff) > 0.0002) {
        // Silky smooth dampening
        currentProgressRef.current += diff * 0.1
        const p = Math.max(0, Math.min(1, currentProgressRef.current))
        setProgress(p)

        const targetTime = p * durationRef.current
        applySeek(targetTime)
      }

      // Always guarantee video stays paused
      preventAutoPlay()

      rafIdRef.current = requestAnimationFrame(loop)
    }

    rafIdRef.current = requestAnimationFrame(loop)
    return () => {
      active = false
      if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current)
    }
  }, [applySeek, preventAutoPlay])

  // Track window scroll
  useEffect(() => {
    // Disable automatic browser scroll restoration on refresh so user starts at top
    if (typeof window !== "undefined" && "scrollRestoration" in window.history) {
      window.history.scrollRestoration = "manual"
    }

    const onScroll = () => {
      if (!containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      const totalScrollable = rect.height - window.innerHeight
      if (totalScrollable <= 0) return

      const scrolled = -rect.top
      const p = Math.max(0, Math.min(1, scrolled / totalScrollable))
      targetProgressRef.current = p
    }

    window.addEventListener("scroll", onScroll, { passive: true })
    onScroll()
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  // Direct wheel scrubbing fallback (for embedded preview without window scroll)
  const handleWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    // If container can scroll naturally in window, let window scroll handle it;
    // but if the page cannot scroll (e.g. embed or fixed height), wheel directly drives targetProgress.
    if (!containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    const totalScrollable = rect.height - window.innerHeight
    if (totalScrollable <= 0) {
      const delta = e.deltaY * 0.001
      targetProgressRef.current = Math.max(0, Math.min(1, targetProgressRef.current + delta))
    }
  }, [])

  // Touch handlers for mobile
  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    isTouchingRef.current = true
    touchStartYRef.current = e.touches[0].clientY
    touchStartScrollRef.current = targetProgressRef.current
  }

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!isTouchingRef.current) return
    const deltaY = touchStartYRef.current - e.touches[0].clientY
    const progressDelta = deltaY / (window.innerHeight * 0.8)
    targetProgressRef.current = Math.max(0, Math.min(1, touchStartScrollRef.current + progressDelta))
  }

  const handleTouchEnd = () => {
    isTouchingRef.current = false
  }

  // Keyboard accessibility
  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "ArrowDown" || e.key === "PageDown") {
      e.preventDefault()
      targetProgressRef.current = Math.min(1, targetProgressRef.current + 0.04)
    } else if (e.key === "ArrowUp" || e.key === "PageUp") {
      e.preventDefault()
      targetProgressRef.current = Math.max(0, targetProgressRef.current - 0.04)
    } else if (e.key === "Home") {
      e.preventDefault()
      targetProgressRef.current = 0
    } else if (e.key === "End") {
      e.preventDefault()
      targetProgressRef.current = 1
    }
  }

  // Audio mute toggle (NEVER calls vid.play() - video remains scroll-locked)
  const toggleSound = (e: React.MouseEvent) => {
    e.stopPropagation()
    const vid = videoRef.current
    if (!vid) return
    const nextMuted = !isMuted
    vid.muted = nextMuted
    setIsMuted(nextMuted)
  }

  // ─────────────────────────────────────────────────────────
  // EXACT VISUAL STAGES:
  // ─────────────────────────────────────────────────────────

  // 1. "THE CITY OPENS"
  // Visible at 0.0. Blurs out and fades away as soon as user begins scrolling.
  // Completely invisible after progress 0.16.
  let title1Opacity = 0
  let title1Blur = 24
  let title1Scale = 1.08
  if (progress <= 0.16) {
    const t = progress / 0.16 // 0 -> 1
    title1Opacity = Math.max(0, 1 - t * 1.1)
    title1Blur = t * 24
    title1Scale = 1 + t * 0.08
  }

  // 2. "SCROLL ↓"
  // Visible at 0.0, vanishes immediately as user starts to scroll.
  const scrollPromptOpacity = Math.max(0, 1 - progress / 0.04)

  // 3. Anamorphic horizontal lens flare streak across the door opening
  // Appears while doors slide open (~0.22 to ~0.55), peaking at ~0.38
  let flareOpacity = 0
  if (progress > 0.2 && progress < 0.58) {
    flareOpacity = Math.sin(((progress - 0.2) / 0.38) * Math.PI)
  }

  // 4. "Every door in the city is already open."
  // REQUIREMENT: "gate ke bahar jaaye then ye text aaye"
  // The camera reaches outside the doors into the city at progress >= 0.72.
  // Text starts resolving at 0.72, sharpens to 100% by 0.84, stays till 1.0.
  let title2Opacity = 0
  let title2Blur = 16
  let title2Scale = 0.94
  if (progress >= 0.72) {
    const t = Math.min(1, (progress - 0.72) / 0.12) // 0 -> 1 between 0.72 and 0.84
    title2Opacity = t
    title2Blur = (1 - t) * 16
    title2Scale = 0.94 + t * 0.06
  }

  return (
    <div
      ref={containerRef}
      className={`relative w-full bg-black ${className}`}
      style={{
        height: `${scrollDistance * 100}vh`,
        ...style,
      }}
    >
      {/* Sticky Fullscreen Frame */}
      <div
        className="sticky top-0 left-0 w-full h-screen overflow-hidden flex items-center justify-center select-none outline-none"
        tabIndex={0}
        onWheel={handleWheel}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onKeyDown={handleKeyDown}
        role="region"
        aria-label="Scroll-Locked Video Hero"
      >
        {/* Main Video Viewport Card (with rounded corners on desktop) */}
        <div className="relative w-full h-full md:w-[94vw] md:h-[90vh] md:max-w-[1400px] md:max-h-[860px] md:rounded-3xl overflow-hidden bg-[#05070d] shadow-[0_25px_90px_rgba(0,0,0,0.9)] border border-white/10 flex items-center justify-center">
          {/* Background Video */}
          <video
            ref={videoRef}
            src={videoSrc}
            playsInline
            muted={isMuted}
            preload="auto"
            onLoadedMetadata={handleLoadedMetadata}
            onSeeked={handleSeeked}
            onPlay={preventAutoPlay}
            className="absolute inset-0 w-full h-full object-cover pointer-events-none"
          />

          {/* Vignette Overlay */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background:
                "radial-gradient(ellipse 90% 85% at 50% 50%, rgba(0,0,0,0.12) 35%, rgba(0,0,0,0.78) 100%)",
            }}
          />

          {/* Anamorphic Horizontal Lens Flare Streak */}
          <div
            className="absolute left-0 right-0 top-1/2 -translate-y-1/2 pointer-events-none transition-opacity duration-100"
            style={{
              opacity: flareOpacity,
              height: "2px",
              background:
                "linear-gradient(90deg, transparent 0%, rgba(90, 180, 255, 0.05) 15%, rgba(130, 215, 255, 0.95) 42%, rgba(255, 255, 255, 1) 50%, rgba(210, 150, 255, 0.95) 58%, rgba(130, 90, 255, 0.05) 85%, transparent 100%)",
              boxShadow:
                "0 0 24px rgba(110, 200, 255, 0.95), 0 0 55px rgba(180, 120, 255, 0.6), 0 0 90px rgba(70, 150, 255, 0.4)",
              filter: "blur(0.5px)",
            }}
          />

          {/* Ambient Glow Bloom */}
          <div
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none transition-opacity duration-100"
            style={{
              opacity: flareOpacity * 0.75,
              width: "500px",
              height: "180px",
              background:
                "radial-gradient(ellipse, rgba(120, 200, 255, 0.45) 0%, rgba(180, 110, 255, 0.2) 45%, transparent 75%)",
              filter: "blur(32px)",
              mixBlendMode: "screen",
            }}
          />

          {/* ── STAGE 1: "THE CITY OPENS" (Only at the beginning) ── */}
          {title1Opacity > 0.01 && (
            <div
              className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none p-6 text-center"
              style={{
                opacity: title1Opacity,
                filter: `blur(${title1Blur}px)`,
                transform: `scale(${title1Scale})`,
                willChange: "opacity, filter, transform",
              }}
            >
              <h1
                className="text-white font-black tracking-tighter uppercase"
                style={{
                  fontFamily:
                    "-apple-system, BlinkMacSystemFont, 'SF Pro Display', Inter, Roboto, sans-serif",
                  fontSize: "clamp(2.75rem, 6.8vw, 6.5rem)",
                  lineHeight: 0.95,
                  textShadow:
                    "0 4px 30px rgba(0, 0, 0, 0.95), 0 10px 60px rgba(0, 0, 0, 0.75)",
                }}
              >
                {title}
              </h1>
            </div>
          )}

          {/* ── SCROLL INDICATOR (Fades as soon as user touches scroll) ── */}
          {scrollPromptOpacity > 0.01 && (
            <div
              className="absolute bottom-16 sm:bottom-20 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1.5 pointer-events-none"
              style={{
                opacity: scrollPromptOpacity,
              }}
            >
              <span
                className="text-[11px] font-semibold tracking-[0.35em] text-white/70 uppercase"
                style={{
                  fontFamily:
                    "-apple-system, BlinkMacSystemFont, 'SF Pro Display', Inter, sans-serif",
                }}
              >
                SCROLL
              </span>
              <ArrowDown className="w-3.5 h-3.5 text-white/70 animate-bounce" />
            </div>
          )}

          {/* ── STAGE 2: "Every door in the city is already open." ── */}
          {/* ONLY shows when camera has exited outside the subway car doors (progress >= 0.72) */}
          {title2Opacity > 0.01 && (
            <div
              className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none p-6 text-center"
              style={{
                opacity: title2Opacity,
                filter: `blur(${title2Blur}px)`,
                transform: `scale(${title2Scale})`,
                willChange: "opacity, filter, transform",
              }}
            >
              <h2
                className="text-white font-bold tracking-tight max-w-4xl"
                style={{
                  fontFamily:
                    "-apple-system, BlinkMacSystemFont, 'SF Pro Display', Inter, Roboto, sans-serif",
                  fontSize: "clamp(1.85rem, 4.2vw, 3.85rem)",
                  lineHeight: 1.15,
                  textShadow:
                    "0 4px 30px rgba(0, 0, 0, 0.95), 0 12px 60px rgba(0, 0, 0, 0.8)",
                }}
              >
                {subtitle}
              </h2>
            </div>
          )}

          {/* ── CONTROLS & OVERLAYS ── */}
          <button
            onClick={toggleSound}
            aria-label={isMuted ? "Unmute sound" : "Mute sound"}
            title={isMuted ? "Unmute subway audio" : "Mute sound"}
            className="absolute top-5 right-5 z-20 flex items-center justify-center w-10 h-10 rounded-full bg-black/40 hover:bg-black/60 backdrop-blur-md border border-white/15 text-white/80 hover:text-white transition-all duration-200 cursor-pointer"
          >
            {isMuted ? (
              <VolumeX className="w-4 h-4" />
            ) : (
              <Volume2 className="w-4 h-4 text-cyan-400" />
            )}
          </button>

          {/* Signature at bottom right */}
          {signature && (
            <a
              href={signature.url}
              target="_blank"
              rel="noopener noreferrer"
              className="absolute bottom-4 right-5 z-20 text-[11px] text-white/45 hover:text-white/80 transition-colors duration-200"
              style={{
                fontFamily:
                  "-apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif",
              }}
            >
              {signature.name}
            </a>
          )}

          {/* ── SLEEK BOTTOM PROGRESS BAR ── */}
          <div
            className="absolute bottom-0 left-0 right-0 h-[2px] bg-white/10 overflow-hidden z-20 pointer-events-none"
            aria-hidden="true"
          >
            <div
              className="h-full bg-white transition-[width] duration-75 ease-out shadow-[0_0_8px_rgba(255,255,255,0.8)]"
              style={{
                width: `${progress * 100}%`,
              }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
