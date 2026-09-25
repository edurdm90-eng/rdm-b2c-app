import { Button } from "@rdm-b2c/ui/components/button";
import { useState } from "react";
import { toast } from "sonner";

import { authClient } from "@/lib/auth-client";

import Loader from "./loader";

export default function SignInForm() {
  const { isPending } = authClient.useSession();
  const [submitting, setSubmitting] = useState(false);

  async function signInWithGoogle() {
    if (submitting) return;
    setSubmitting(true);
    try {
      const dashboardURL = new URL("/dashboard", window.location.origin).toString();
      const loginURL = new URL("/login", window.location.origin).toString();
      const result = await authClient.signIn.social({
        provider: "google",
        // OAuth completes on the API origin, so the return must explicitly
        // target the separate web origin instead of resolving on the server.
        callbackURL: dashboardURL,
        errorCallbackURL: loginURL,
      });
      if (result.error) {
        toast.error(result.error.message ?? "Google sign-in could not be completed.");
        setSubmitting(false);
      }
    } catch {
      toast.error("Google sign-in could not be reached. Please try again.");
      setSubmitting(false);
    }
  }

  if (isPending) return <Loader />;

  return (
    <main className="mx-auto mt-16 w-full max-w-md px-6">
      <section className="rounded-2xl border bg-card p-7 text-center shadow-sm">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-2xl font-bold text-primary">
          R
        </div>
        <h1 className="text-3xl font-bold tracking-tight">Welcome to RDM</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          Continue with Google to securely access your routines, goals and rewards.
        </p>
        <Button
          className="mt-7 h-12 w-full gap-3 text-base"
          disabled={submitting}
          onClick={() => void signInWithGoogle()}
          type="button"
        >
          <span aria-hidden className="flex h-6 w-6 items-center justify-center rounded-full bg-background font-bold text-primary">
            G
          </span>
          {submitting ? "Opening Google…" : "Continue with Google"}
        </Button>
        <p className="mt-4 text-xs leading-5 text-muted-foreground">
          New accounts are created automatically. RDM never receives your Google password.
        </p>
      </section>
    </main>
  );
}
