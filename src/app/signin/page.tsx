import { redirect } from "next/navigation";
import { signIn, isSignedIn } from "@/auth";

export const dynamic = "force-dynamic";

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (await isSignedIn()) redirect("/");
  const { error } = await searchParams;
  return (
    <main className="wrap signin">
      <section className="card" style={{ maxWidth: 380, width: "100%" }}>
        <h1>Batul&rsquo;s Calories</h1>
        <p className="muted">Sign in with your Google account to see your log.</p>
        {error && (
          <p className="notice">
            {error === "AccessDenied"
              ? "That Google account doesn't have access to this app."
              : "Sign-in didn't complete. Try again."}
          </p>
        )}
        <form
          action={async () => {
            "use server";
            await signIn("google", { redirectTo: "/" });
          }}
        >
          <button className="primary" type="submit" style={{ width: "100%" }}>
            Continue with Google
          </button>
        </form>
      </section>
    </main>
  );
}
