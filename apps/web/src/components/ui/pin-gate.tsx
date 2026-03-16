import * as React from "react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type PinGateProps = {
  title: string;
  description?: string;
  helperText?: string;
  busy?: boolean;
  error?: string | null;
  buttonLabel?: string;
  onSubmit: (pin: string) => void;
};

export function PinGate({
  title,
  description,
  helperText,
  busy,
  error,
  buttonLabel,
  onSubmit,
}: PinGateProps) {
  const [pin, setPin] = React.useState("");

  const handleSubmit = () => {
    if (!pin.trim() || busy) {
      return;
    }
    onSubmit(pin);
    setPin("");
  };

  return (
    <div className="flex min-h-[60vh] w-full items-center justify-center px-4 py-12">
      <Card className="w-full max-w-md space-y-6">
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          {description ? (
            <CardDescription className="text-sm text-muted-foreground">
              {description}
            </CardDescription>
          ) : null}
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="finance-pin-field">Finance PIN</Label>
            <Input
              id="finance-pin-field"
              type="password"
              autoComplete="one-time-code"
              value={pin}
              onChange={(event) => setPin(event.target.value)}
              placeholder="Enter PIN"
              disabled={busy}
            />
          </div>
          {error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : null}
          <Button
            className="w-full"
            onClick={handleSubmit}
            disabled={busy || !pin.trim()}
          >
            {buttonLabel ?? "Unlock"}
          </Button>
          {helperText ? (
            <p className="text-xs leading-tight text-muted-foreground">
              {helperText}
            </p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
