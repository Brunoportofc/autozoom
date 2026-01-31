"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { MonitorPlay, MousePointer2, Wand2 } from "lucide-react";
import Link from "next/link";

export default function Home() {
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-8 sm:p-20 font-[family-name:var(--font-geist-sans)]">
      <main className="flex flex-col gap-8 items-center sm:items-start max-w-4xl w-full">

        {/* Hero Section */}
        <section className="w-full text-center sm:text-left space-y-6">
          <div className="space-y-2">
            <h1 className="text-5xl font-extrabold tracking-tight lg:text-6xl bg-gradient-to-r from-white to-gray-500 bg-clip-text text-transparent">
              AutoZoom
            </h1>
            <p className="text-xl text-muted-foreground max-w-[600px]">
              Create studio-quality screen recordings with automatic zoom effects.
              No video editing skills required.
            </p>
          </div>

          <div className="flex gap-4 justify-center sm:justify-start">
            <Link href="/record">
              <Button size="lg" className="rounded-full text-base font-semibold">
                Start Recording
              </Button>
            </Link>
            <Button size="lg" variant="outline" className="rounded-full text-base">
              View Demo
            </Button>
          </div>
        </section>

        {/* Feature Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 w-full mt-12">
          <FeatureCard
            icon={<MonitorPlay className="w-8 h-8 text-primary" />}
            title="Screen Recording"
            description="Capture your screen in high definition directly from your browser."
          />
          <FeatureCard
            icon={<MousePointer2 className="w-8 h-8 text-primary" />}
            title="Smart Tracking"
            description="Automatically zooms in on mouse clicks and typing actions."
          />
          <FeatureCard
            icon={<Wand2 className="w-8 h-8 text-primary" />}
            title="Instant Polish"
            description="Export beautiful videos with smooth backgrounds and effects."
          />
        </div>

      </main>

      <footer className="mt-24 text-sm text-muted-foreground">
        Built with Next.js, Tailwind, and Shadcn UI.
      </footer>
    </div>
  );
}

function FeatureCard({ icon, title, description }: { icon: React.ReactNode, title: string, description: string }) {
  return (
    <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
      <CardHeader>
        <div className="mb-4">{icon}</div>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <CardDescription>{description}</CardDescription>
      </CardContent>
    </Card>
  )
}
