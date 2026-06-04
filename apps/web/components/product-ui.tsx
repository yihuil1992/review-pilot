import type { ReactNode } from "react";
import { AlertCircle, CheckCircle2, Info, TriangleAlert } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function StatusBadge({
  tone = "neutral",
  children
}: {
  tone?: "neutral" | "success" | "warning" | "danger";
  children: ReactNode;
}) {
  return (
    <Badge
      variant={tone === "danger" ? "destructive" : tone === "neutral" ? "outline" : "secondary"}
      className={cn(
        tone === "success" && "border-emerald-200 bg-emerald-50 text-emerald-800",
        tone === "warning" && "border-amber-200 bg-amber-50 text-amber-800"
      )}
    >
      {children}
    </Badge>
  );
}

export function MessageAlert({
  kind = "info",
  title,
  children
}: {
  kind?: "info" | "success" | "warning" | "error";
  title?: string;
  children: ReactNode;
}) {
  const Icon = kind === "success" ? CheckCircle2 : kind === "warning" ? TriangleAlert : kind === "error" ? AlertCircle : Info;

  return (
    <Alert
      variant={kind === "error" ? "destructive" : "default"}
      className={cn(
        "items-start",
        kind === "success" && "border-emerald-200 bg-emerald-50 text-emerald-950",
        kind === "warning" && "border-amber-200 bg-amber-50 text-amber-950"
      )}
    >
      <Icon aria-hidden="true" />
      {title ? <AlertTitle>{title}</AlertTitle> : null}
      <AlertDescription>{children}</AlertDescription>
    </Alert>
  );
}

export function SectionCard({
  title,
  description,
  children,
  className
}: {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">{children}</CardContent>
    </Card>
  );
}
