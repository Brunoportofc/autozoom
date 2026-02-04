"use client";

import React, { useRef, useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Card } from "@/components/ui/card";
import { Play, Pause, ZoomIn, Download, Plus, Trash2, Wand2, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { MouseEvent as RecordedMouseEvent } from "@/components/screen-recorder";
import { CursorOverlay } from "@/components/cursor-overlay";

interface VideoEditorProps {
    videoBlob: Blob;
    mouseEvents?: RecordedMouseEvent[];
}

interface Keyframe {
    id: string;
    time: number;
    zoom: number;
    x: number;
    y: number;
    easing?: 'linear' | 'ease-in-out';
}

interface ZoomRegion {
    id: string;
    startTime: number;
    endTime: number;
    targetZoom: number;
    initialX: number;
    initialY: number;
}

// LERP helper
const lerp = (current: number, target: number, factor: number) => current + (target - current) * factor;

const BACKGROUNDS = [
    { id: 'gradient-1', name: 'Sunset', value: 'linear-gradient(to bottom right, #4f46e5, #ec4899)' },
    { id: 'gradient-2', name: 'Ocean', value: 'linear-gradient(to bottom right, #0ea5e9, #10b981)' },
    { id: 'gradient-3', name: 'Dark', value: 'linear-gradient(to bottom right, #18181b, #27272a)' },
    { id: 'solid-black', name: 'Black', value: '#000000' }
];

export function VideoEditor({ videoBlob, mouseEvents = [] }: VideoEditorProps) {
    const videoUrl = React.useMemo(() => URL.createObjectURL(videoBlob), [videoBlob]);
    const videoRef = useRef<HTMLVideoElement>(null);
    const stageRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);

    // Virtual Camera (Physics-based) - for the zoom/pan
    const virtualCamera = useRef({ x: 50, y: 50, zoom: 1 });

    const [isClicking, setIsClicking] = useState(false);

    // Playback state
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);

    // Editor state
    const [zoomLevel, setZoomLevel] = useState(1);
    const [panX, setPanX] = useState(50);
    const [panY, setPanY] = useState(50);

    // Visuals State
    const [containerScale, setContainerScale] = useState(0.8);
    const [backgroundId, setBackgroundId] = useState('gradient-1');

    // Core State: Zoom Regions and Manual Keyframes
    const [zoomRegions, setZoomRegions] = useState<ZoomRegion[]>([]);
    const [manualKeyframes, setManualKeyframes] = useState<Keyframe[]>([
        { id: 'start', time: 0, zoom: 1, x: 50, y: 50 }
    ]);

    // Derived state for the player
    const [keyframes, setKeyframes] = useState<Keyframe[]>([
        { id: 'start', time: 0, zoom: 1, x: 50, y: 50 }
    ]);

    // Effects to derive keyframes from regions + manual
    useEffect(() => {
        const derivedKeyframes: Keyframe[] = [...manualKeyframes];

        zoomRegions.forEach(region => {
            const { startTime, endTime, targetZoom, initialX, initialY } = region;
            const TRANSITION_DURATION = 0.5;

            // 0. ANCHOR (Hold Zoom 1.0 until just before transition)
            if (startTime > TRANSITION_DURATION) {
                derivedKeyframes.push({
                    id: `region-${region.id}-anchor`,
                    time: startTime - TRANSITION_DURATION,
                    zoom: 1,
                    x: 50,
                    y: 50,
                    easing: 'linear'
                });
            }

            // 1. Start Zoom In (ensure we are zoomed in by startTime)
            derivedKeyframes.push({
                id: `region-${region.id}-start`,
                time: startTime,
                zoom: targetZoom,
                x: initialX,
                y: initialY,
                easing: 'ease-in-out'
            });

            // 2. Follow Mouse (sample events between start and end)
            // We only look for events if we have them
            if (mouseEvents.length > 0) {
                const moves = mouseEvents.filter(e =>
                    e.type === 'mousemove' &&
                    e.time > startTime &&
                    e.time < endTime
                );

                let lastSampleTime = startTime;
                moves.forEach(move => {
                    if (move.time - lastSampleTime > 0.15) { // 150ms sample rate
                        derivedKeyframes.push({
                            id: `region-${region.id}-follow-${move.time}`,
                            time: move.time,
                            zoom: targetZoom,
                            x: move.x,
                            y: move.y,
                            easing: 'linear'
                        });
                        lastSampleTime = move.time;
                    }
                });

                // Add hold at the end based on last move or initial position
                const lastPos = moves.length > 0 ? moves[moves.length - 1] : { x: initialX, y: initialY };
                derivedKeyframes.push({
                    id: `region-${region.id}-hold`,
                    time: endTime,
                    zoom: targetZoom,
                    x: lastPos.x,
                    y: lastPos.y,
                    easing: 'linear'
                });
            } else {
                // Fallback if no events (manual region creation potentially)
                derivedKeyframes.push({
                    id: `region-${region.id}-hold`,
                    time: endTime,
                    zoom: targetZoom,
                    x: initialX,
                    y: initialY,
                    easing: 'linear'
                });
            }

            // 3. Return to Normal
            derivedKeyframes.push({
                id: `region-${region.id}-end`,
                time: endTime + 0.8,
                zoom: 1,
                x: 50,
                y: 50,
                easing: 'ease-in-out'
            });
        });

        // Deduplicate and Sort
        const sorted = derivedKeyframes
            .sort((a, b) => a.time - b.time)
            .filter((kf, i, arr) => {
                if (i === 0) return true;
                return (kf.time - arr[i - 1].time) > 0.05; // Debounce very close frames
            });

        setKeyframes(sorted);

    }, [zoomRegions, manualKeyframes, mouseEvents]);

    const [selectedKeyframeId, setSelectedKeyframeId] = useState<string | null>(null);
    const [selectedRegionId, setSelectedRegionId] = useState<string | null>(null);
    const [isExporting, setIsExporting] = useState(false);
    const [isAnalyzing, setIsAnalyzing] = useState(false);

    // Get cursor position from events at a given time
    const getCursorAtTime = (time: number): { x: number; y: number; clicking: boolean } => {
        if (mouseEvents.length === 0) return { x: 50, y: 50, clicking: false };

        // Find the closest event at or before this time
        let closest = mouseEvents[0];
        let clicking = false;

        for (const event of mouseEvents) {
            if (event.time <= time) {
                closest = event;
                if (event.type === 'mousedown') clicking = true;
                if (event.type === 'mouseup') clicking = false;
            } else {
                break;
            }
        }

        // Check if we're within 0.3s of a click
        const recentClick = mouseEvents.some(e =>
            e.type === 'mousedown' &&
            Math.abs(e.time - time) < 0.3
        );

        return { x: closest.x, y: closest.y, clicking: recentClick };
    };

    // Physics-Based Animation Loop with Dual LERP
    useEffect(() => {
        let animationFrameId: number;

        const updateTransform = () => {
            if (!videoRef.current || !stageRef.current) return;

            const time = videoRef.current.currentTime;
            setCurrentTime(time);

            // === STEP 1: Get RAW cursor position from events ===
            const rawCursor = getCursorAtTime(time);
            setIsClicking(rawCursor.clicking);

            // === STEP 3: Calculate CAMERA TARGET from keyframes ===
            const sortedKeyframes = [...keyframes].sort((a, b) => a.time - b.time);

            if (sortedKeyframes.length === 0) {
                return;
            }

            const nextKeyframeIndex = sortedKeyframes.findIndex(k => k.time > time);

            let targetZoom = 1;
            let targetX = 50;
            let targetY = 50;

            if (nextKeyframeIndex === 0) {
                const k = sortedKeyframes[0];
                targetZoom = k.zoom; targetX = k.x; targetY = k.y;
            } else if (nextKeyframeIndex === -1) {
                const k = sortedKeyframes[sortedKeyframes.length - 1];
                targetZoom = k.zoom; targetX = k.x; targetY = k.y;
            } else {
                const k1 = sortedKeyframes[nextKeyframeIndex - 1];
                const k2 = sortedKeyframes[nextKeyframeIndex];
                const progress = (time - k1.time) / (k2.time - k1.time);

                const easeInOutCubic = (t: number) => t < .5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1;
                const easedProgress = easeInOutCubic(progress);

                targetZoom = k1.zoom + (k2.zoom - k1.zoom) * easedProgress;
                targetX = k1.x + (k2.x - k1.x) * easedProgress;
                targetY = k1.y + (k2.y - k1.y) * easedProgress;
            }

            // === STEP 4: Smooth the CAMERA (cinematic lag) ===
            const CAMERA_DAMPING_POS = 0.05;  // Much slower = cinematic
            const CAMERA_DAMPING_ZOOM = 0.08;

            virtualCamera.current.x = lerp(virtualCamera.current.x, targetX, CAMERA_DAMPING_POS);
            virtualCamera.current.y = lerp(virtualCamera.current.y, targetY, CAMERA_DAMPING_POS);
            virtualCamera.current.zoom = lerp(virtualCamera.current.zoom, targetZoom, CAMERA_DAMPING_ZOOM);

            // Snap when very close
            if (Math.abs(targetX - virtualCamera.current.x) < 0.01) virtualCamera.current.x = targetX;
            if (Math.abs(targetY - virtualCamera.current.y) < 0.01) virtualCamera.current.y = targetY;
            if (Math.abs(targetZoom - virtualCamera.current.zoom) < 0.001) virtualCamera.current.zoom = targetZoom;

            // === STEP 5: Apply transform to the STAGE ===
            const z = virtualCamera.current.zoom;
            const x = virtualCamera.current.x;
            const y = virtualCamera.current.y;

            stageRef.current.style.transform = `scale(${z})`;
            stageRef.current.style.transformOrigin = `${x}% ${y}%`;

            if (isPlaying) {
                animationFrameId = requestAnimationFrame(updateTransform);
            }
        };

        if (isPlaying) {
            animationFrameId = requestAnimationFrame(updateTransform);
        } else {
            // Instant jump when paused (for scrubbing)
            updateTransform();
        }

        return () => {
            if (animationFrameId) cancelAnimationFrame(animationFrameId);
        };
    }, [isPlaying, keyframes, currentTime, mouseEvents]);

    // Manual Control Handlers
    const handleValueChange = (type: 'zoom' | 'x' | 'y', value: number) => {
        if (isPlaying) {
            videoRef.current?.pause();
            setIsPlaying(false);
        }

        switch (type) {
            case 'zoom': setZoomLevel(value); break;
            case 'x': setPanX(value); break;
            case 'y': setPanY(value); break;
        }

        if (stageRef.current) {
            const z = type === 'zoom' ? value : zoomLevel;
            const x = type === 'x' ? value : panX;
            const y = type === 'y' ? value : panY;

            stageRef.current.style.transform = `scale(${z})`;
            stageRef.current.style.transformOrigin = `${x}% ${y}%`;
        }
    };

    const addKeyframe = () => {
        const newKeyframe: Keyframe = {
            id: Date.now().toString(),
            time: videoRef.current?.currentTime || 0,
            zoom: zoomLevel,
            x: panX,
            y: panY
        };

        setManualKeyframes(prev => [...prev, newKeyframe]);
        setSelectedKeyframeId(newKeyframe.id);
    };

    const deleteKeyframe = (id: string) => {
        if (id === 'start') return;
        setManualKeyframes(prev => prev.filter(k => k.id !== id));
        setSelectedKeyframeId(null);
    };

    const deleteRegion = (id: string) => {
        setZoomRegions(prev => prev.filter(r => r.id !== id));
        setSelectedRegionId(null);
    };

    const togglePlay = () => {
        if (!videoRef.current) return;
        if (isPlaying) {
            videoRef.current.pause();
        } else {
            videoRef.current.play();
        }
        setIsPlaying(!isPlaying);
    };

    // Event-Driven Auto-Zoom
    const generateKeyframesFromEvents = () => {
        if (mouseEvents.length === 0) {
            console.warn("No mouse events available. Using fallback pixel analysis.");
            analyzeMotionFallback();
            return;
        }

        setIsAnalyzing(true);
        console.log(`🎯 Generating regions from ${mouseEvents.length} events`);

        const newRegions: ZoomRegion[] = [];
        const ZOOM_FOCUS = 2.5;
        const ZOOM_DURATION = 3.0;

        const clicks = mouseEvents.filter(e => e.type === 'mousedown');

        clicks.forEach((click, index) => {
            newRegions.push({
                id: `auto-region-${index}`,
                startTime: click.time,
                endTime: click.time + ZOOM_DURATION,
                targetZoom: ZOOM_FOCUS,
                initialX: click.x, // We store initial target, but effect will derive mouse path
                initialY: click.y
            });
        });

        // Resolve Overlaps: If a region starts before the previous one ends, merge or trim?
        // For simplicity, let's just let them overlap in logic (keyframe generation handles it by sorting)
        // Visually they might stack. Let's not overengineer overlap yet.

        setZoomRegions(newRegions);
        // Reset manual keyframes to just start
        setManualKeyframes([{ id: 'start', time: 0, zoom: 1, x: 50, y: 50 }]);

        setIsAnalyzing(false);
    };

    // Fallback: Pixel Analysis (for browser mode)
    const analyzeMotionFallback = async () => {
        // Fallback implementation skipped for brevity as requested to focus on regions
        // In real impl, this would generate regions instead of keyframes too
    };

    // Export Function
    const handleExport = async () => {
        if (!videoRef.current || !canvasRef.current) return;
        setIsExporting(true);

        const video = videoRef.current;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d', { alpha: false }); // Optimize for no transparency
        if (!ctx) return;

        // Force 1080p Export
        canvas.width = 1920;
        canvas.height = 1080;

        // Enable high quality scaling
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';

        const chunks: Blob[] = [];
        const stream = canvas.captureStream(30);
        const mediaRecorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp9', videoBitsPerSecond: 8000000 }); // High bitrate

        mediaRecorder.ondataavailable = (e) => {
            if (e.data.size > 0) chunks.push(e.data);
        };

        mediaRecorder.onstop = () => {
            const blob = new Blob(chunks, { type: 'video/webm' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `autozoom_export_${Date.now()}.webm`;
            a.click();
            URL.revokeObjectURL(url);
            setIsExporting(false);
        };

        mediaRecorder.start();
        video.currentTime = 0;
        video.muted = true;

        // Wait a tick for seek
        await new Promise(r => setTimeout(r, 100));

        const renderFrame = async () => {
            if (video.ended || video.paused) {
                mediaRecorder.stop();
                return;
            }

            const time = video.currentTime;

            // 1. Calculate Current Keyframe State (Zoom/Pan)
            const sortedKeyframes = [...keyframes].sort((a, b) => a.time - b.time);
            const nextKeyframeIndex = sortedKeyframes.findIndex(k => k.time > time);

            let currentZoom = 1, currentX = 50, currentY = 50;

            if (nextKeyframeIndex === 0) {
                const k = sortedKeyframes[0];
                currentZoom = k.zoom; currentX = k.x; currentY = k.y;
            } else if (nextKeyframeIndex === -1) {
                const k = sortedKeyframes[sortedKeyframes.length - 1];
                currentZoom = k.zoom; currentX = k.x; currentY = k.y;
            } else {
                const k1 = sortedKeyframes[nextKeyframeIndex - 1];
                const k2 = sortedKeyframes[nextKeyframeIndex];
                const progress = (time - k1.time) / (k2.time - k1.time);
                const ease = (t: number) => t < .5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
                const easedProgress = ease(progress);
                currentZoom = k1.zoom + (k2.zoom - k1.zoom) * easedProgress;
                currentX = k1.x + (k2.x - k1.x) * easedProgress;
                currentY = k1.y + (k2.y - k1.y) * easedProgress;
            }

            // 2. Draw Background
            const bgValue = BACKGROUNDS.find(b => b.id === backgroundId)?.value || '#000';
            if (bgValue.startsWith('linear-gradient')) {
                // Approximate gradient parsing for canvas (basic 2-color)
                const colors = bgValue.match(/#[a-fA-F0-9]{6}/g) || ['#000', '#333'];
                const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
                gradient.addColorStop(0, colors[0]);
                gradient.addColorStop(1, colors[1]);
                ctx.fillStyle = gradient;
            } else {
                ctx.fillStyle = bgValue;
            }
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            // 3. Draw Container (Shadow + Rounded Rect)
            const boxWidth = canvas.width * containerScale;
            const boxHeight = canvas.height * containerScale;
            const boxX = (canvas.width - boxWidth) / 2;
            const boxY = (canvas.height - boxHeight) / 2;
            const borderRadius = 20;

            ctx.save();

            // Drop Shadow
            ctx.shadowColor = "rgba(0, 0, 0, 0.5)";
            ctx.shadowBlur = 50;
            ctx.shadowOffsetY = 20;

            // Draw Box Path
            ctx.beginPath();
            ctx.roundRect(boxX, boxY, boxWidth, boxHeight, borderRadius);
            ctx.fillStyle = "#000"; // Background behind video
            ctx.fill();

            // Clip for Video
            ctx.shadowColor = "transparent"; // Reset shadow for content
            ctx.clip();

            // 4. Draw Video with ZOOM (Smart Cropping)
            // Calculate source rectangle (what part of video is visible)
            const srcWidth = video.videoWidth / currentZoom;
            const srcHeight = video.videoHeight / currentZoom;
            const srcX = (currentX / 100 * video.videoWidth) - (srcWidth / 2);
            const srcY = (currentY / 100 * video.videoHeight) - (srcHeight / 2);

            // Draw Source Rect -> Destination Rect (Full Box Size)
            ctx.drawImage(video,
                srcX, srcY, srcWidth, srcHeight, // Source (Cropped)
                boxX, boxY, boxWidth, boxHeight  // Destination (Full Box)
            );

            ctx.restore();

            requestAnimationFrame(renderFrame);
        };

        video.play().then(() => {
            requestAnimationFrame(renderFrame);
        });
    };

    // Manual Region Creation
    const addManualRegion = () => {
        if (!videoRef.current) return;
        const currentTime = videoRef.current.currentTime;
        const DEFAULT_DURATION = 3.0;
        const regionId = Date.now().toString();

        const newRegion: ZoomRegion = {
            id: regionId,
            startTime: currentTime,
            endTime: currentTime + DEFAULT_DURATION,
            targetZoom: zoomLevel > 1.2 ? zoomLevel : 2.0, // Use current zoom if set, else default
            initialX: panX,
            initialY: panY
        };

        setZoomRegions(prev => [...prev, newRegion]);
        setSelectedRegionId(regionId);
    };

    // Stage Dragging Logic (Visual Pan)
    const handleStageMouseDown = (e: React.MouseEvent) => {
        // Only allow dragging if we are paused
        if (isPlaying) {
            togglePlay(); // Pause to edit
        }

        const startX = e.clientX;
        const startY = e.clientY;
        const startPanX = panX;
        const startPanY = panY;

        const handleMouseMove = (moveEvent: MouseEvent) => {
            if (!stageRef.current) return;

            // Calculate delta in %
            // Sensitivity factor: dragging full width = 100% pan? Maybe too fast.
            // Let's say moving 500px moves 50%
            const rect = stageRef.current.getBoundingClientRect();
            const deltaX = (moveEvent.clientX - startX) / rect.width * 100;
            const deltaY = (moveEvent.clientY - startY) / rect.height * 100;

            // Invert delta because dragging "image" left means moving "camera" right?
            // Actually, if I drag the image LEFT, I want to see the right side. 
            // PanX 50 -> 60 moves camera RIGHT, so image moves LEFT.
            // So dragging MOUSE LEFT (-x) should increase PanX (+x).

            const newPanX = Math.max(0, Math.min(100, startPanX - deltaX));
            const newPanY = Math.max(0, Math.min(100, startPanY - deltaY));

            setPanX(newPanX);
            setPanY(newPanY);

            // If a region is selected, update it live
            if (selectedRegionId) {
                setZoomRegions(prev => prev.map(r =>
                    r.id === selectedRegionId ? { ...r, initialX: newPanX, initialY: newPanY } : r
                ));
            }
        };

        const handleMouseUp = () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
    };

    // Stage dimensions (for cursor positioning)
    const stageWidth = 1280;
    const stageHeight = 720;

    return (
        <div className="flex flex-col gap-6 max-w-6xl mx-auto w-full">
            <canvas ref={canvasRef} className="hidden" />

            {/* Event count badge */}
            {mouseEvents.length > 0 && (
                <div className="bg-green-500/20 text-green-400 text-sm px-4 py-2 rounded-lg border border-green-500/30 flex items-center gap-2">
                    <span>✨</span>
                    <span>{mouseEvents.length} mouse events captured - Click "Auto" for precise zooming!</span>
                </div>
            )}

            {/* === THE STAGE (Screen Studio Style) === */}
            <div className="relative aspect-video rounded-2xl overflow-hidden bg-black">
                {/* 1. Wallpaper Background */}
                <div
                    className="absolute inset-0 transition-all duration-500"
                    style={{
                        background: BACKGROUNDS.find(b => b.id === backgroundId)?.value
                    }}
                />

                {/* 2. The Floating Video Window */}
                <div className="absolute inset-0 flex items-center justify-center transition-all duration-300"
                    style={{ padding: `${(1 - containerScale) * 25}%` }} // Approximate padding based on scale
                >
                    <div
                        ref={stageRef}
                        className="relative rounded-xl shadow-2xl overflow-hidden bg-black will-change-transform w-full h-full cursor-move group"
                        onMouseDown={handleStageMouseDown}
                        style={{
                            boxShadow: '0 25px 80px -12px rgba(0, 0, 0, 0.6)',
                            // Transform is applied by the zoom effect
                        }}
                    >
                        {/* The Video */}
                        <video
                            ref={videoRef}
                            src={videoUrl}
                            crossOrigin="anonymous"
                            className="w-full h-full object-contain pointer-events-none"
                            onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
                            onEnded={() => setIsPlaying(false)}
                            onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
                        />

                        {/* Overlay Hint */}
                        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                            <div className="bg-black/50 text-white text-xs px-2 py-1 rounded backdrop-blur-sm">Drag to Pan</div>
                        </div>


                    </div>
                </div>

                {/* Overlays */}
                {isAnalyzing && (
                    <div className="absolute inset-0 z-50 bg-black/50 flex flex-col items-center justify-center text-white backdrop-blur-sm">
                        <ZoomIn className="w-12 h-12 animate-pulse mb-4 text-primary" />
                        <p className="font-semibold text-lg">Generating Zoom Keyframes...</p>
                        <p className="text-sm opacity-70">
                            {mouseEvents.length > 0 ? "Using precise mouse data" : "Using pixel analysis (fallback)"}
                        </p>
                    </div>
                )}

                {isExporting && (
                    <div className="absolute inset-0 z-50 bg-black/50 flex flex-col items-center justify-center text-white backdrop-blur-sm">
                        <Loader2 className="w-12 h-12 animate-spin mb-4 text-primary" />
                        <p className="font-semibold text-lg">Exporting Video...</p>
                        <p className="text-sm opacity-70">This may take a while</p>
                    </div>
                )}

                {/* Playback Controls - Floating at bottom */}
                <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/80 to-transparent flex items-center gap-4">
                    <Button variant="ghost" size="icon" onClick={togglePlay} className="text-white hover:bg-white/20">
                        {isPlaying ? <Pause className="fill-white" /> : <Play className="fill-white" />}
                    </Button>
                    <div className="text-white text-sm font-mono grow">
                        {currentTime.toFixed(1)}s / {duration.toFixed(1)}s
                    </div>
                </div>
            </div>

            {/* Controls Panel */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <Card className="p-6 space-y-6">
                    <div className="flex items-center justify-between">
                        <h3 className="font-semibold flex items-center gap-2">
                            <ZoomIn className="w-4 h-4" /> Transform
                        </h3>
                        <div className="flex gap-2">
                            <Button size="sm" variant="secondary" onClick={generateKeyframesFromEvents} disabled={isAnalyzing} className="gap-2">
                                <Wand2 className="w-4 h-4" /> Auto
                            </Button>
                            <Button size="sm" onClick={addManualRegion} className="gap-2 bg-indigo-600 hover:bg-indigo-700 text-white">
                                <Plus className="w-4 h-4" /> Region
                            </Button>
                            <Button size="sm" onClick={addKeyframe} className="gap-2" variant="outline">
                                <Plus className="w-4 h-4" /> Keyframe
                            </Button>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <div className="space-y-2">
                            <div className="flex justify-between text-xs text-muted-foreground">
                                <label>Zoom</label>
                                <span>{zoomLevel.toFixed(2)}x</span>
                            </div>
                            <Slider value={[zoomLevel]} min={1} max={4} step={0.01} onValueChange={(([val]) => handleValueChange('zoom', val))} />
                        </div>
                        <div className="space-y-2">
                            <div className="flex justify-between text-xs text-muted-foreground">
                                <label>Pan X</label>
                                <span>{panX.toFixed(0)}%</span>
                            </div>
                            <Slider value={[panX]} min={0} max={100} step={1} onValueChange={(([val]) => handleValueChange('x', val))} />
                        </div>
                        <div className="space-y-2">
                            <div className="flex justify-between text-xs text-muted-foreground">
                                <label>Pan Y</label>
                                <span>{panY.toFixed(0)}%</span>
                            </div>
                            <Slider value={[panY]} min={0} max={100} step={1} onValueChange={(([val]) => handleValueChange('y', val))} />
                        </div>
                    </div>
                </Card>

                <Card className="p-6 space-y-4 lg:col-span-2 flex flex-col">
                    {/* Visual Settings */}
                    <div className="grid grid-cols-2 gap-6 p-4 bg-secondary/20 rounded-lg border border-border/50">
                        <div className="space-y-3">
                            <label className="text-xs font-medium text-muted-foreground">Background Style</label>
                            <div className="flex gap-2">
                                {BACKGROUNDS.map(bg => (
                                    <button
                                        key={bg.id}
                                        onClick={() => setBackgroundId(bg.id)}
                                        className={cn(
                                            "w-8 h-8 rounded-full border-2 transition-all hover:scale-110",
                                            backgroundId === bg.id ? "border-white scale-110 shadow-lg" : "border-transparent opacity-70"
                                        )}
                                        style={{ background: bg.value }}
                                        title={bg.name}
                                    />
                                ))}
                            </div>
                        </div>
                        <div className="space-y-3">
                            <div className="flex justify-between text-xs text-muted-foreground">
                                <label className="font-medium">Container Size</label>
                                <span>{Math.round(containerScale * 100)}%</span>
                            </div>
                            <Slider
                                value={[containerScale]}
                                min={0.5}
                                max={1.0}
                                step={0.05}
                                onValueChange={([val]) => setContainerScale(val)}
                            />
                        </div>
                    </div>

                    <div className="flex items-center justify-between mt-4">
                        <h3 className="font-semibold">Timeline ({keyframes.length} keyframes)</h3>
                        <Button variant="outline" size="sm" className="gap-2" onClick={handleExport} disabled={isExporting}>
                            {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                            {isExporting ? "Exporting..." : "Export"}
                        </Button>
                    </div>

                    {/* Dragging Logic */}
                    {(() => {
                        const handleDragStart = (e: React.MouseEvent, regionId: string) => {
                            e.stopPropagation();
                            setSelectedRegionId(regionId);
                            const startX = e.clientX;
                            const region = zoomRegions.find(r => r.id === regionId);
                            if (!region) return;
                            const startDuration = region.endTime - region.startTime;

                            const handleMouseMove = (moveEvent: MouseEvent) => {
                                if (!stageRef.current) return;
                                const deltaPixels = moveEvent.clientX - startX;
                                const timelineWidth = stageRef.current.parentElement?.querySelector('.timeline-track')?.clientWidth || 1000;
                                const deltaSeconds = (deltaPixels / timelineWidth) * duration;

                                const newDuration = Math.max(0.5, startDuration + deltaSeconds);

                                setZoomRegions(prev => prev.map(r =>
                                    r.id === regionId
                                        ? { ...r, endTime: r.startTime + newDuration }
                                        : r
                                ));
                            };

                            const handleMouseUp = () => {
                                document.removeEventListener('mousemove', handleMouseMove);
                                document.removeEventListener('mouseup', handleMouseUp);
                            };

                            document.addEventListener('mousemove', handleMouseMove);
                            document.addEventListener('mouseup', handleMouseUp);
                        };

                        return (
                            <div className="relative h-16 w-full bg-secondary/30 rounded-md cursor-pointer overflow-hidden border border-border timeline-track"
                                onClick={(e) => {
                                    const rect = e.currentTarget.getBoundingClientRect();
                                    const x = e.clientX - rect.left;
                                    const clickedTime = (x / rect.width) * duration;
                                    if (videoRef.current) videoRef.current.currentTime = clickedTime;
                                }}
                            >
                                {/* Playhead */}
                                <div className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-30 pointer-events-none" style={{ left: `${(currentTime / duration) * 100}%` }} />

                                {/* Render Zoom Regions (Bars) */}
                                {zoomRegions.map(region => {
                                    const startPercent = (region.startTime / duration) * 100;
                                    const endPercent = (region.endTime / duration) * 100;
                                    const widthPercent = endPercent - startPercent;
                                    const isSelected = region.id === selectedRegionId;

                                    return (
                                        <div
                                            key={region.id}
                                            className={cn(
                                                "absolute top-2 bottom-2 rounded-md border text-xs flex items-center justify-center overflow-hidden transition-colors select-none z-10",
                                                isSelected ? "bg-primary/40 border-primary" : "bg-primary/20 border-primary/50"
                                            )}
                                            style={{ left: `${startPercent}%`, width: `${widthPercent}%` }}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setSelectedRegionId(region.id);
                                                setSelectedKeyframeId(null);
                                                if (videoRef.current) videoRef.current.currentTime = region.startTime;
                                            }}
                                        >
                                            <span className="text-white/80 pointer-events-none truncate px-1">{region.targetZoom}x</span>

                                            {/* Resize Handle */}
                                            <div
                                                className="absolute right-0 top-0 bottom-0 w-4 cursor-ew-resize hover:bg-white/20 flex items-center justify-center z-20"
                                                onMouseDown={(e) => handleDragStart(e, region.id)}
                                            >
                                                <div className="w-0.5 h-6 bg-white/50" />
                                            </div>
                                        </div>
                                    );
                                })}

                                {/* Render Manual Keyframes (Dots) */}
                                {manualKeyframes.map((kf) => (
                                    <div
                                        key={kf.id}
                                        className={cn(
                                            "absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full border border-white z-20 transition-transform hover:scale-150 cursor-pointer shadow-sm",
                                            kf.id === selectedKeyframeId ? "bg-yellow-400 scale-125" : "bg-white"
                                        )}
                                        style={{ left: `${(kf.time / duration) * 100}%` }}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setSelectedKeyframeId(kf.id);
                                            setSelectedRegionId(null);
                                            if (videoRef.current) videoRef.current.currentTime = kf.time;
                                            setZoomLevel(kf.zoom);
                                            setPanX(kf.x);
                                            setPanY(kf.y);
                                        }}
                                    />
                                ))}
                            </div>
                        );
                    })()}

                    <div className="flex justify-between items-center text-sm text-muted-foreground mt-auto">
                        <div className="flex gap-4">
                            {/* Delete Controls */}
                            {selectedRegionId && (
                                <div className="flex items-center gap-2">
                                    <span className="text-primary font-medium">Region Selected</span>
                                    <Button variant="destructive" size="sm" className="h-6 text-xs" onClick={() => deleteRegion(selectedRegionId)}>
                                        <Trash2 className="w-3 h-3 mr-1" /> Remove Zoom
                                    </Button>
                                </div>
                            )}
                            {selectedKeyframeId && selectedKeyframeId !== 'start' && (
                                <div className="flex items-center gap-2">
                                    <span className="text-yellow-500 font-medium">Keyframe Selected</span>
                                    <Button variant="destructive" size="sm" className="h-6 text-xs" onClick={() => deleteKeyframe(selectedKeyframeId)}>
                                        <Trash2 className="w-3 h-3 mr-1" /> Delete
                                    </Button>
                                </div>
                            )}
                        </div>
                        <div className="text-xs">
                            {/* Hint */}
                            {zoomRegions.length > 0 && "Drag region edge to resize duration"}
                        </div>
                    </div>
                </Card>
            </div>
        </div>
    );
}
