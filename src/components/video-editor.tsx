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

// LERP helper
const lerp = (current: number, target: number, factor: number) => current + (target - current) * factor;

export function VideoEditor({ videoBlob, mouseEvents = [] }: VideoEditorProps) {
    const videoUrl = React.useMemo(() => URL.createObjectURL(videoBlob), [videoBlob]);
    const videoRef = useRef<HTMLVideoElement>(null);
    const stageRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);

    // Virtual Camera (Physics-based) - for the zoom/pan
    const virtualCamera = useRef({ x: 50, y: 50, zoom: 1 });

    // Virtual Cursor (Smoothed) - for the SVG cursor position
    const virtualCursor = useRef({ x: 50, y: 50 });

    // Cursor state for rendering
    const [cursorX, setCursorX] = useState(50);
    const [cursorY, setCursorY] = useState(50);
    const [isClicking, setIsClicking] = useState(false);

    // Playback state
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);

    // Editor state
    const [zoomLevel, setZoomLevel] = useState(1);
    const [panX, setPanX] = useState(50);
    const [panY, setPanY] = useState(50);
    const [keyframes, setKeyframes] = useState<Keyframe[]>([
        { id: 'start', time: 0, zoom: 1, x: 50, y: 50 }
    ]);
    const [selectedKeyframeId, setSelectedKeyframeId] = useState<string | null>('start');
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

            // === STEP 2: Smooth the CURSOR (removes hand tremor) ===
            const CURSOR_DAMPING = 0.2; // Higher = more responsive
            virtualCursor.current.x = lerp(virtualCursor.current.x, rawCursor.x, CURSOR_DAMPING);
            virtualCursor.current.y = lerp(virtualCursor.current.y, rawCursor.y, CURSOR_DAMPING);

            // Update cursor state for React
            setCursorX(virtualCursor.current.x);
            setCursorY(virtualCursor.current.y);

            // === STEP 3: Calculate CAMERA TARGET from keyframes ===
            const sortedKeyframes = [...keyframes].sort((a, b) => a.time - b.time);
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

        const filtered = keyframes.filter(k => Math.abs(k.time - newKeyframe.time) > 0.1);
        const updated = [...filtered, newKeyframe].sort((a, b) => a.time - b.time);

        setKeyframes(updated);
        setSelectedKeyframeId(newKeyframe.id);
    };

    const deleteKeyframe = (id: string) => {
        if (id === 'start') return;
        const newKeyframes = keyframes.filter(k => k.id !== id);
        setKeyframes(newKeyframes);
        setSelectedKeyframeId(newKeyframes.length > 0 ? newKeyframes[0].id : null);
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
        console.log(`🎯 Generating keyframes from ${mouseEvents.length} events`);

        const generatedKeyframes: Keyframe[] = [];
        const ZOOM_FOCUS = 2.0;
        const ZOOM_FOLLOW = 1.3;

        generatedKeyframes.push({ id: 'start', time: 0, zoom: 1, x: 50, y: 50 });

        const clicks = mouseEvents.filter(e => e.type === 'mousedown');

        clicks.forEach((click, index) => {
            if (click.time > 0.3) {
                generatedKeyframes.push({
                    id: `preclick-${index}`,
                    time: click.time - 0.3,
                    zoom: ZOOM_FOLLOW,
                    x: click.x,
                    y: click.y,
                    easing: 'ease-in-out'
                });
            }

            generatedKeyframes.push({
                id: `click-${index}`,
                time: click.time,
                zoom: ZOOM_FOCUS,
                x: click.x,
                y: click.y,
                easing: 'ease-in-out'
            });

            generatedKeyframes.push({
                id: `hold-${index}`,
                time: click.time + 1.0,
                zoom: ZOOM_FOCUS,
                x: click.x,
                y: click.y,
                easing: 'linear'
            });

            generatedKeyframes.push({
                id: `release-${index}`,
                time: click.time + 1.5,
                zoom: ZOOM_FOLLOW,
                x: click.x,
                y: click.y,
                easing: 'ease-in-out'
            });
        });

        const moveSample = mouseEvents.filter((e, i) =>
            e.type === 'mousemove' && i % 30 === 0
        );

        moveSample.forEach((move, index) => {
            const nearClick = clicks.some(c => Math.abs(c.time - move.time) < 2);
            if (!nearClick) {
                generatedKeyframes.push({
                    id: `follow-${index}`,
                    time: move.time,
                    zoom: ZOOM_FOLLOW,
                    x: move.x,
                    y: move.y,
                    easing: 'linear'
                });
            }
        });

        const sortedKeyframes = generatedKeyframes
            .sort((a, b) => a.time - b.time)
            .filter((kf, i, arr) => i === 0 || Math.abs(kf.time - arr[i - 1].time) > 0.2);

        setKeyframes(sortedKeyframes);
        setIsAnalyzing(false);

        console.log(`✅ Generated ${sortedKeyframes.length} keyframes from ${clicks.length} clicks`);
    };

    // Fallback: Pixel Analysis (for browser mode)
    const analyzeMotionFallback = async () => {
        if (!videoRef.current) return;
        setIsAnalyzing(true);
        const video = videoRef.current;
        const originalTime = video.currentTime;

        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) return;

        canvas.width = 320;
        canvas.height = 180;

        const generatedKeyframes: Keyframe[] = [{ id: 'start', time: 0, zoom: 1, x: 50, y: 50 }];
        const videoDuration = video.duration;
        const interval = 1;

        let prevData: Uint8ClampedArray | null = null;

        try {
            for (let t = 0; t < videoDuration; t += interval) {
                video.currentTime = t;
                await new Promise(r => setTimeout(r, 150));

                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                const frameData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;

                if (prevData) {
                    let totalX = 0, totalY = 0, diffCount = 0;

                    for (let i = 0; i < frameData.length; i += 16) {
                        const diff = Math.abs(frameData[i] - prevData[i]) +
                            Math.abs(frameData[i + 1] - prevData[i + 1]) +
                            Math.abs(frameData[i + 2] - prevData[i + 2]);

                        if (diff > 50) {
                            const pixelIdx = i / 4;
                            totalX += pixelIdx % canvas.width;
                            totalY += Math.floor(pixelIdx / canvas.width);
                            diffCount++;
                        }
                    }

                    if (diffCount > 50) {
                        const centerX = (totalX / diffCount) / canvas.width * 100;
                        const centerY = (totalY / diffCount) / canvas.height * 100;

                        generatedKeyframes.push({
                            id: `auto-${t}`,
                            time: t,
                            zoom: 1.5,
                            x: centerX,
                            y: centerY
                        });
                    }
                }

                prevData = frameData;
            }

            setKeyframes(generatedKeyframes.sort((a, b) => a.time - b.time));

        } catch (e) {
            console.error("Fallback analysis failed", e);
        } finally {
            setIsAnalyzing(false);
            video.currentTime = originalTime;
        }
    };

    // Export Function
    const handleExport = async () => {
        if (!videoRef.current || !canvasRef.current) return;
        setIsExporting(true);

        const video = videoRef.current;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;

        const chunks: Blob[] = [];
        const stream = canvas.captureStream(30);
        const mediaRecorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp9' });

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

        const renderFrame = () => {
            if (video.ended || video.paused) {
                mediaRecorder.stop();
                return;
            }

            const time = video.currentTime;
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

            ctx.save();
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            const originX = (currentX / 100) * canvas.width;
            const originY = (currentY / 100) * canvas.height;

            ctx.translate(originX, originY);
            ctx.scale(currentZoom, currentZoom);
            ctx.translate(-originX, -originY);

            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            ctx.restore();

            requestAnimationFrame(renderFrame);
        };

        video.play().then(() => {
            requestAnimationFrame(renderFrame);
        });
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
            <div className="relative aspect-video rounded-2xl overflow-hidden">
                {/* 1. Wallpaper Background (Gradient) */}
                <div
                    className="absolute inset-0 bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-500"
                    style={{ transform: 'scale(1.1)' }} // Slight parallax
                />

                {/* 2. The Floating Video Window */}
                <div className="absolute inset-0 flex items-center justify-center p-8">
                    <div
                        ref={stageRef}
                        className="relative rounded-xl shadow-2xl overflow-hidden bg-black will-change-transform"
                        style={{
                            width: `${stageWidth}px`,
                            maxWidth: '100%',
                            aspectRatio: '16/9',
                            boxShadow: '0 25px 80px -12px rgba(0, 0, 0, 0.6)',
                            transition: 'transform 0.05s linear'
                        }}
                    >
                        {/* The Video */}
                        <video
                            ref={videoRef}
                            src={videoUrl}
                            crossOrigin="anonymous"
                            className="w-full h-full object-cover"
                            onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
                            onEnded={() => setIsPlaying(false)}
                            onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
                        />

                        {/* 3. The SVG Cursor Overlay */}
                        {mouseEvents.length > 0 && (
                            <CursorOverlay
                                x={(cursorX / 100) * stageWidth}
                                y={(cursorY / 100) * stageHeight}
                                clickActive={isClicking}
                            />
                        )}
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
                            <Button size="sm" onClick={addKeyframe} className="gap-2">
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
                    <div className="flex items-center justify-between">
                        <h3 className="font-semibold">Timeline ({keyframes.length} keyframes)</h3>
                        <Button variant="outline" size="sm" className="gap-2" onClick={handleExport} disabled={isExporting}>
                            {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                            {isExporting ? "Exporting..." : "Export"}
                        </Button>
                    </div>

                    <div className="relative h-12 w-full bg-secondary/50 rounded-md cursor-pointer overflow-hidden border border-border"
                        onClick={(e) => {
                            const rect = e.currentTarget.getBoundingClientRect();
                            const x = e.clientX - rect.left;
                            const clickedTime = (x / rect.width) * duration;
                            if (videoRef.current) videoRef.current.currentTime = clickedTime;
                        }}
                    >
                        <div className="absolute top-0 bottom-0 w-0.5 bg-primary z-20 pointer-events-none" style={{ left: `${(currentTime / duration) * 100}%` }} />

                        {keyframes.map((kf) => (
                            <div
                                key={kf.id}
                                className={cn(
                                    "absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full border border-white z-10 transition-transform hover:scale-150",
                                    kf.id === selectedKeyframeId ? "bg-primary scale-125" : "bg-muted-foreground"
                                )}
                                style={{ left: `${(kf.time / duration) * 100}%` }}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedKeyframeId(kf.id);
                                    if (videoRef.current) videoRef.current.currentTime = kf.time;
                                    setZoomLevel(kf.zoom);
                                    setPanX(kf.x);
                                    setPanY(kf.y);
                                }}
                            />
                        ))}
                    </div>

                    <div className="flex justify-between items-center text-sm text-muted-foreground mt-auto">
                        <div>
                            {selectedKeyframeId ? (
                                <div className="flex items-center gap-4">
                                    <span>Selected: {keyframes.find(k => k.id === selectedKeyframeId)?.time.toFixed(1)}s</span>
                                    {selectedKeyframeId !== 'start' && (
                                        <Button variant="destructive" size="sm" className="h-6 text-xs" onClick={() => deleteKeyframe(selectedKeyframeId)}>
                                            <Trash2 className="w-3 h-3 mr-1" /> Delete
                                        </Button>
                                    )}
                                </div>
                            ) : <span>No keyframe selected</span>}
                        </div>
                    </div>
                </Card>
            </div>
        </div>
    );
}
