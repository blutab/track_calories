import { redirect } from "next/navigation";
import { isSignedIn, signOut } from "@/auth";
import { Tabs } from "@/components/Tabs";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  if (!(await isSignedIn())) redirect("/signin");
  return (
    <div className="wrap">
      <header className="top">
        <h1>Calories</h1>
        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/signin" });
          }}
        >
          <button className="link small" type="submit">
            Sign out
          </button>
        </form>
      </header>
      <Tabs />
      <main className="wrap" style={{ width: "100%" }}>
        {children}
      </main>
      <p className="hint">Log meals by chatting with Claude (&ldquo;had my usual egg breakfast&rdquo;).</p>
    </div>
  );
}
