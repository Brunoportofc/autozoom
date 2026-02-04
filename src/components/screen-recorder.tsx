"use client";

import React, { useState, useRef, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Monitor, StopCircle } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

declare global {
    interface Window {
        electron?: {
            getDesktopSources: () => Promise<Array<{ id: string; name: string; thumbnail: string }>>;
            onGlobalEvent: (callback: (event: any) => void) => () => void;
        };
    }
}

// Recording data type (Video + Events)
export interface RecordingData {
    videoBlob: Blob;
    events: MouseEvent[];
    screenWidth: number;
    screenHeight: number;
}

export interface MouseEvent {
    type: 'mousemove' | 'mousedown' | 'mouseup' | 'keydown';
    time: number; // Time in seconds since recording start
    x: number; // Percentage (0-100)
    y: number; // Percentage (0-100)
}

interface ScreenRecorderProps {
    onRecordingComplete?: (data: RecordingData) => void;
}

export function ScreenRecorder({ onRecordingComplete }: ScreenRecorderProps) {
    const [stream, setStream] = useState<MediaStream | null>(null);
    const [isRecording, setIsRecording] = useState(false);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const videoRef = useRef<HTMLVideoElement>(null);
    const chunksRef = useRef<Blob[]>([]);

    // Event capture state
    const eventsRef = useRef<MouseEvent[]>([]);
    const startTimeRef = useRef<number>(0);
    const removeListenerRef = useRef<(() => void) | null>(null);
    const screenDimensionsRef = useRef({ width: 1920, height: 1080 }); // Default, will be updated

    // Electron specific state
    const [isElectron, setIsElectron] = useState(false);
    const [showSourceSelector, setShowSourceSelector] = useState(false);
    const [desktopSources, setDesktopSources] = useState<Array<{ id: string; name: string; thumbnail: string }>>([]);

    useEffect(() => {
        setIsElectron(!!window.electron);
        // Try to get screen dimensions
        if (typeof window !== 'undefined') {
            screenDimensionsRef.current = {
                width: window.screen.width,
                height: window.screen.height
            };
        }
    }, []);

    const startRecording = async () => {
        // Refresh dimensions in case window moved
        if (typeof window !== 'undefined') {
            screenDimensionsRef.current = {
                width: window.screen.width,
                height: window.screen.height
            };
        }

        try {
            if (isElectron && window.electron) {
                const sources = await window.electron.getDesktopSources();
                setDesktopSources(sources);
                setShowSourceSelector(true);
            } else {
                // Browser Mode (No event capture)
                const displayStream = await navigator.mediaDevices.getDisplayMedia({
                    video: {
                        width: { ideal: 1920, max: 1920 },
                        height: { ideal: 1080, max: 1080 },
                        frameRate: 60
                    },
                    audio: false
                });
                handleStreamSuccess(displayStream);
            }
        } catch (err) {
            console.error("Error starting screen capture:", err);
        }
    };

    const handleSourceSelection = async (sourceId: string) => {
        setShowSourceSelector(false);
        try {
            const constraints: any = {
                audio: false,
                video: {
                    mandatory: {
                        chromeMediaSource: 'desktop',
                        chromeMediaSourceId: sourceId,
                        minWidth: 1920,
                        maxWidth: 3840,
                        minHeight: 1080,
                        maxHeight: 2160
                    }
                }
            };
            const displayStream = await navigator.mediaDevices.getUserMedia(constraints);
            handleStreamSuccess(displayStream);
        } catch (err) {
            console.error("Failed to get electron stream", err);
        }
    };

    const handleStreamSuccess = (displayStream: MediaStream) => {
        setStream(displayStream);
        if (videoRef.current) {
            videoRef.current.srcObject = displayStream;
        }

        displayStream.getVideoTracks()[0].onended = () => stopRecording();

        const mediaRecorder = new MediaRecorder(displayStream, {
            mimeType: 'video/webm;codecs=vp9'
        });

        mediaRecorderRef.current = mediaRecorder;
        chunksRef.current = [];

        // === EVENT CAPTURE SETUP ===
        eventsRef.current = [];
        startTimeRef.current = Date.now();

        if (window.electron) {
            console.log("🎯 Starting event capture...");
            removeListenerRef.current = window.electron.onGlobalEvent((event) => {
                // Normalize time to seconds since recording start
                const timeInSeconds = (Date.now() - startTimeRef.current) / 1000;

                const dpr = window.devicePixelRatio || 1;
                const screenW = screenDimensionsRef.current.width * dpr;
                const screenH = screenDimensionsRef.current.height * dpr;

                // Normalize coordinates to percentages
                const xPercent = (event.eventData.x / screenW) * 100;
                const yPercent = (event.eventData.y / screenH) * 100;

                const normalizedEvent: MouseEvent = {
                    type: event.type,
                    time: timeInSeconds,
                    x: Math.max(0, Math.min(100, xPercent)),
                    y: Math.max(0, Math.min(100, yPercent)),
                };

                eventsRef.current.push(normalizedEvent);
            });
        }

        mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) chunksRef.current.push(event.data);
        };

        mediaRecorder.onstop = () => {
            // Stop listening to events
            if (removeListenerRef.current) {
                removeListenerRef.current();
                removeListenerRef.current = null;
            }

            const blob = new Blob(chunksRef.current, { type: 'video/webm' });

            console.log(`📊 Captured ${eventsRef.current.length} events`);

            // Pass both video AND events to the editor
            if (onRecordingComplete) {
                onRecordingComplete({
                    videoBlob: blob,
                    events: eventsRef.current,
                    screenWidth: screenDimensionsRef.current.width,
                    screenHeight: screenDimensionsRef.current.height
                });
            }

            setStream(null);
            setIsRecording(false);
        };

        mediaRecorder.start();
        setIsRecording(true);
    };

    const stopRecording = () => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
            mediaRecorderRef.current.stop();
        }
        if (stream) {
            stream.getTracks().forEach(track => track.stop());
        }
    };

    return (
        <div className="flex flex-col items-center gap-4 w-full max-w-4xl mx-auto">
            {/* Source Selector Dialog */}
            <Dialog open={showSourceSelector} onOpenChange={setShowSourceSelector}>
                <DialogContent className="max-w-3xl">
                    <DialogHeader>
                        <DialogTitle>Select Screen to Record</DialogTitle>
                        <DialogDescription>Choose a screen or window to start recording</DialogDescription>
                    </DialogHeader>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4 max-h-[60vh] overflow-y-auto p-2">
                        {desktopSources.map((source) => (
                            <div
                                key={source.id}
                                className="flex flex-col gap-2 p-2 border rounded-lg hover:border-primary cursor-pointer transition-colors group"
                                onClick={() => handleSourceSelection(source.id)}
                            >
                                <div className="aspect-video bg-muted rounded overflow-hidden relative">
                                    <img src={source.thumbnail} alt={source.name} className="w-full h-full object-contain" />
                                    <div className="absolute inset-0 bg-primary/10 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                        <div className="bg-primary text-primary-foreground px-3 py-1 rounded-full text-xs font-bold shadow-lg">Select</div>
                                    </div>
                                </div>
                                <span className="text-xs font-medium truncate px-1" title={source.name}>{source.name}</span>
                            </div>
                        ))}
                    </div>
                </DialogContent>
            </Dialog>

            <div className="w-full aspect-video bg-black/10 rounded-lg overflow-hidden border border-border relative flex items-center justify-center group">
                {stream ? (
                    <video
                        ref={videoRef}
                        autoPlay
                        playsInline
                        muted
                        className="w-full h-full object-contain bg-black"
                    />
                ) : (
                    <div className="text-muted-foreground flex flex-col items-center gap-2">
                        <Monitor className="w-12 h-12 opacity-50" />
                        <p>Preview will appear here</p>
                    </div>
                )}

                {isRecording && (
                    <div className="absolute top-4 right-4 flex items-center gap-2 bg-destructive text-destructive-foreground px-3 py-1 rounded-full text-sm font-medium animate-pulse z-10">
                        <div className="w-2 h-2 rounded-full bg-white" />
                        Recording ({eventsRef.current.length} events)
                    </div>
                )}
            </div>

            <div className="flex gap-4">
                {!isRecording ? (
                    <Button onClick={startRecording} size="lg" className="gap-2 shadow-lg hover:shadow-xl transition-all">
                        <Monitor className="w-4 h-4" />
                        {isElectron ? "Select Native Source" : "Start Browser Recording"}
                    </Button>
                ) : (
                    <Button onClick={stopRecording} variant="destructive" size="lg" className="gap-2 shadow-lg">
                        <StopCircle className="w-4 h-4" />
                        Stop Recording
                    </Button>
                )}
            </div>

            <p className="text-xs text-muted-foreground mt-4 max-w-md text-center">
                {isElectron ? "✨ Electron Mode: Native quality + Mouse tracking enabled" : "⚠️ Browser Mode: Limited capabilities"}
            </p>
        </div>
    );
}
