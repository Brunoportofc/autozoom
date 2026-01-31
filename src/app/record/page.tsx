"use client";

import { useState } from "react";
import { ScreenRecorder } from "@/components/screen-recorder";
import { VideoEditor } from "@/components/video-editor";

export default function RecordPage() {
    const [videoBlob, setVideoBlob] = useState<Blob | null>(null);

    return (
        <div className="min-h-screen p-8 font-[family-name:var(--font-geist-sans)]">
            <header className="mb-8 flex items-center justify-between">
                <h1 className="text-2xl font-bold bg-gradient-to-r from-white to-gray-500 bg-clip-text text-transparent">
                    {videoBlob ? "Edit Recording" : "New Recording"}
                </h1>
            </header>
            <main>
                {!videoBlob ? (
                    <ScreenRecorder onRecordingComplete={setVideoBlob} />
                ) : (
                    <VideoEditor videoBlob={videoBlob} />
                )}
            </main>
        </div>
    );
}
