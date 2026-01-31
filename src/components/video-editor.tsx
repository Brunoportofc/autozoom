"use client";

import React, { useRef, useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Card } from "@/components/ui/card";
import { Play, Pause, ZoomIn, Download, Plus, Trash2, Wand2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface VideoEditorProps {
    videoBlob: Blob;
}

interface Keyframe {
    id: string;
    time: number;
    zoom: number;
    x: number;
    y: number;
    easing?: 'linear' | 'ease-in-out';
}

export function VideoEditor({ videoBlob }: VideoEditorProps) {
    const videoUrl = React.useMemo(() => URL.createObjectURL(videoBlob), [videoBlob]);
    const videoRef = useRef<HTMLVideoElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

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

    // Interpolation Loop
    useEffect(() => {
        let animationFrameId: number;

        const updateTransform = () => {
            if (!videoRef.current || !containerRef.current) return;

            const time = videoRef.current.currentTime;
            setCurrentTime(time);

            // Find active keyframes
            const sortedKeyframes = [...keyframes].sort((a, b) => a.time - b.time);
            const nextKeyframeIndex = sortedKeyframes.findIndex(k => k.time > time);

            let currentZoom = 1;
            let currentX = 50;
            let currentY = 50;

            if (nextKeyframeIndex === 0) {
                const k = sortedKeyframes[0];
                currentZoom = k.zoom;
                currentX = k.x;
                currentY = k.y;
            } else if (nextKeyframeIndex === -1) {
                const k = sortedKeyframes[sortedKeyframes.length - 1];
                currentZoom = k.zoom;
                currentX = k.x;
                currentY = k.y;
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

            containerRef.current.style.transform = `scale(${currentZoom}) translate(${(50 - currentX) * currentZoom / 5}%, ${(50 - currentY) * currentZoom / 5}%)`;
            containerRef.current.style.transformOrigin = `${currentX}% ${currentY}%`;

            if (isPlaying) {
                animationFrameId = requestAnimationFrame(updateTransform);
            }
        };

        if (isPlaying) {
            animationFrameId = requestAnimationFrame(updateTransform);
        } else {
            updateTransform();
        }

        return () => {
            if (animationFrameId) cancelAnimationFrame(animationFrameId);
        };
    }, [isPlaying, keyframes, currentTime]);


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

        if (containerRef.current) {
            const z = type === 'zoom' ? value : zoomLevel;
            const x = type === 'x' ? value : panX;
            const y = type === 'y' ? value : panY;

            containerRef.current.style.transform = `scale(${z}) translate(${(50 - x) * z / 5}%, ${(50 - y) * z / 5}%)`;
            containerRef.current.style.transformOrigin = `${x}% ${y}%`;
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
        setKeyframes(keyframes.filter(k => k.id !== id));
        if (selectedKeyframeId === id) setSelectedKeyframeId(null);
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

    // Auto-Zoom Algoritm
    const [isAnalyzing, setIsAnalyzing] = useState(false);

    const analyzeMotion = async () => {
        if (!videoRef.current) return;
        setIsAnalyzing(true);
        const video = videoRef.current;
        const originalTime = video.currentTime;

        // Setup canvas for analysis
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) return;

        // Slightly higher res for better cursor detection
        canvas.width = 640;
        canvas.height = 360;

        // Keyframes output
        const generatedKeyframes: Keyframe[] = [];

        const duration = video.duration;
        const interval = 0.5; // Check every 0.5 seconds for finer granularity

        let prevData: Uint8ClampedArray | null = null;
        let lastCursorPos = { x: 50, y: 50 };
        let isZoomed = false;
        let stationaryFrames = 0;

        try {
            // Start with initial keyframe
            generatedKeyframes.push({ id: 'start', time: 0, zoom: 1, x: 50, y: 50 });

            for (let t = 0; t < duration; t += interval) {
                video.currentTime = t;
                // Wait for seek to complete
                await new Promise(r => setTimeout(r, 100)); // Faster seek wait

                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                const frameData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;

                if (prevData) {
                    let minX = canvas.width, maxX = 0, minY = canvas.height, maxY = 0;
                    let diffCount = 0;

                    // Detect changed pixels
                    // Stride of 4 (rgba), step by 16 (4 pixels) to speed up
                    for (let i = 0; i < frameData.length; i += 16) {
                        const diff = Math.abs(frameData[i] - prevData[i]) +
                            Math.abs(frameData[i + 1] - prevData[i + 1]) +
                            Math.abs(frameData[i + 2] - prevData[i + 2]);

                        if (diff > 30) {
                            const pixelIdx = i / 4;
                            const x = pixelIdx % canvas.width;
                            const y = Math.floor(pixelIdx / canvas.width);

                            if (x < minX) minX = x;
                            if (x > maxX) maxX = x;
                            if (y < minY) minY = y;
                            if (y > maxY) maxY = y;
                            diffCount++;
                        }
                    }

                    const width = maxX - minX;
                    const height = maxY - minY;
                    const area = width * height;
                    const screenArea = canvas.width * canvas.height;

                    // Logic:
                    // 1. If change area is HUGE (> 15% of screen) -> SCROLL/TRANSITION -> Ignore or Zoom Out
                    // 2. If change area is SMALL -> CURSOR MOVEMENT -> Track it
                    // 3. If NO change (or very small) -> STATIONARY -> Zoom In if was moving

                    // Thresholds
                    const isSmallMovement = diffCount > 5 && area < (screenArea * 0.15);

                    if (isSmallMovement) {
                        // Small movement - likely cursor
                        const centerX = ((minX + maxX) / 2) / canvas.width * 100;
                        const centerY = ((minY + maxY) / 2) / canvas.height * 100;

                        // Update cursor position
                        lastCursorPos = { x: centerX, y: centerY };
                        stationaryFrames = 0;

                        // Add "Following" keyframe
                        if (isZoomed) {
                            // If we were fully zoomed in and start moving, zoom out slightly to follow
                            isZoomed = false;
                            generatedKeyframes.push({
                                id: `move-${t}`,
                                time: t,
                                zoom: 1.2, // Mild zoom for following
                                x: centerX,
                                y: centerY,
                                easing: 'linear'
                            });
                        } else {
                            // Just update pos
                            generatedKeyframes.push({
                                id: `track-${t}`,
                                time: t,
                                zoom: 1.2,
                                x: centerX,
                                y: centerY,
                                easing: 'linear'
                            });
                        }

                    } else if (diffCount <= 5) {
                        // No movement (Stationary)
                        stationaryFrames++;

                        // If stationary for distinct frames (approx 0.5s - 1s), assume Focus/Click
                        if (stationaryFrames === 2 && !isZoomed) { // ~1 second wait
                            isZoomed = true;
                            generatedKeyframes.push({
                                id: `zoom-${t}`,
                                time: t,
                                zoom: 2.0, // Deep zoom on stop
                                x: lastCursorPos.x,
                                y: lastCursorPos.y,
                                easing: 'ease-in-out'
                            });
                        }
                    } else {
                        // Large movement (Scroll) - Zoom out to show context
                        if (isZoomed) {
                            isZoomed = false;
                            generatedKeyframes.push({
                                id: `scroll-${t}`,
                                time: t,
                                zoom: 1,
                                x: 50,
                                y: 50,
                                easing: 'ease-in-out'
                            });
                        }
                    }
                }

                prevData = frameData;
            }

            // Clean up keyframes (dedupe or smooth out?)
            setKeyframes(generatedKeyframes.sort((a, b) => a.time - b.time));

        } catch (e) {
            console.error("Analysis failed", e);
        } finally {
            setIsAnalyzing(false);
            video.currentTime = originalTime;
        }
    };

    return (
        <div className="flex flex-col gap-6 max-w-6xl mx-auto w-full">
            <div className="relative aspect-video bg-black rounded-lg overflow-hidden border border-border group">
                <div
                    ref={containerRef}
                    className="w-full h-full transition-transform duration-75 will-change-transform ease-linear"
                    style={{
                        transform: `scale(${zoomLevel}) translate(${(50 - panX) * zoomLevel / 5}%, ${(50 - panY) * zoomLevel / 5}%)`,
                        transformOrigin: `${panX}% ${panY}%`
                    }}
                >
                    <video
                        ref={videoRef}
                        src={videoUrl}
                        crossOrigin="anonymous"
                        className="w-full h-full object-contain"
                        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
                        onEnded={() => setIsPlaying(false)}
                        onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
                    />
                </div>

                {isAnalyzing && (
                    <div className="absolute inset-0 z-50 bg-black/50 flex flex-col items-center justify-center text-white backdrop-blur-sm">
                        <ZoomIn className="w-12 h-12 animate-pulse mb-4 text-primary" />
                        <p className="font-semibold text-lg">Analyzing Video Motion...</p>
                        <p className="text-sm opacity-70">Creating magic zoom keyframes</p>
                    </div>
                )}

                <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/80 to-transparent flex items-center gap-4">
                    <Button variant="ghost" size="icon" onClick={togglePlay} className="text-white hover:bg-white/20">
                        {isPlaying ? <Pause className="fill-white" /> : <Play className="fill-white" />}
                    </Button>
                    <div className="text-white text-sm font-mono grow">
                        {currentTime.toFixed(1)}s / {duration.toFixed(1)}s
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <Card className="p-6 space-y-6">
                    <div className="flex items-center justify-between">
                        <h3 className="font-semibold flex items-center gap-2">
                            <ZoomIn className="w-4 h-4" /> Transform
                        </h3>
                        <div className="flex gap-2">
                            <Button size="sm" variant="secondary" onClick={analyzeMotion} disabled={isAnalyzing} className="gap-2">
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
                            <Slider
                                value={[zoomLevel]}
                                min={1}
                                max={4}
                                step={0.01}
                                onValueChange={(([val]) => handleValueChange('zoom', val))}
                            />
                        </div>
                        <div className="space-y-2">
                            <div className="flex justify-between text-xs text-muted-foreground">
                                <label>Pan X</label>
                                <span>{panX.toFixed(0)}%</span>
                            </div>
                            <Slider
                                value={[panX]}
                                min={0}
                                max={100}
                                step={1}
                                onValueChange={(([val]) => handleValueChange('x', val))}
                            />
                        </div>
                        <div className="space-y-2">
                            <div className="flex justify-between text-xs text-muted-foreground">
                                <label>Pan Y</label>
                                <span>{panY.toFixed(0)}%</span>
                            </div>
                            <Slider
                                value={[panY]}
                                min={0}
                                max={100}
                                step={1}
                                onValueChange={(([val]) => handleValueChange('y', val))}
                            />
                        </div>
                    </div>
                </Card>

                <Card className="p-6 space-y-4 lg:col-span-2 flex flex-col">
                    <div className="flex items-center justify-between">
                        <h3 className="font-semibold">Timeline</h3>
                        <Button variant="outline" size="sm" className="gap-2">
                            <Download className="w-4 h-4" /> Export
                        </Button>
                    </div>

                    <div className="relative h-12 w-full bg-secondary/50 rounded-md cursor-pointer overflow-hidden border border-border"
                        onClick={(e) => {
                            const rect = e.currentTarget.getBoundingClientRect();
                            const x = e.clientX - rect.left;
                            const clickedTime = (x / rect.width) * duration;
                            if (videoRef.current) {
                                videoRef.current.currentTime = clickedTime;
                            }
                        }}
                    >
                        <div
                            className="absolute top-0 bottom-0 w-0.5 bg-primary z-20 pointer-events-none"
                            style={{ left: `${(currentTime / duration) * 100}%` }}
                        />

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
                                    <Button variant="destructive" size="sm" className="h-6 text-xs" onClick={() => selectedKeyframeId && deleteKeyframe(selectedKeyframeId)}>
                                        <Trash2 className="w-3 h-3 mr-1" /> Delete
                                    </Button>
                                </div>
                            ) : <span>No keyframe selected</span>}
                        </div>
                    </div>
                </Card>
            </div>
        </div>
    );
}
