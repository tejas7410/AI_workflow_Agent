"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { nhost } from "@/lib/nhost";

export default function AppShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();

  const [email, setEmail] =
    useState("");

  const [ready, setReady] =
    useState(false);

  useEffect(() => {
    const session =
      nhost.getUserSession();

    if (!session?.user) {
      if (pathname !== "/login") {
        router.replace("/login");
      }

      return;
    }

    setEmail(
      session.user.email || ""
    );

    setReady(true);
  }, [pathname, router]);

  async function logout() {
  const session =
    nhost.getUserSession();

  try {
    if (session?.refreshToken) {
      await nhost.auth.signOut({
        refreshToken:
          session.refreshToken,
      });
    }
  } finally {
    nhost.clearSession();
    router.push("/login");
    router.refresh();
  }
}

  if (pathname === "/login") {
    return <>{children}</>;
  }

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-white">
        Loading...
      </div>
    );
  }

  const links = [
    {
      href: "/",
      label: "Dashboard",
    },
    {
      href: "/workflows",
      label: "Workflows",
    },
    {
      href: "/workflow-create-test",
      label: "Integration Tests",
    },
  ];

  return (
    <div className="flex min-h-screen bg-slate-950 text-white">
      <aside className="fixed inset-y-0 left-0 w-64 border-r border-slate-800 bg-slate-900">
        <div className="border-b border-slate-800 p-6">
          <p className="text-xs uppercase tracking-widest text-blue-400">
            AI Workflow
          </p>

          <h1 className="mt-2 text-lg font-bold">
            Workflow Builder
          </h1>
        </div>

        <nav className="space-y-1 p-4">
          {links.map((link) => {
            const active =
              pathname === link.href ||
              pathname.startsWith(
                `${link.href}/`
              );

            return (
              <Link
                key={link.href}
                href={link.href}
                className={[
                  "block rounded-lg px-4 py-3 text-sm",
                  active
                    ? "bg-blue-600 text-white"
                    : "text-slate-300 hover:bg-slate-800",
                ].join(" ")}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        <div className="absolute bottom-0 w-full border-t border-slate-800 p-4">
          <p className="truncate text-xs text-slate-500">
            {email}
          </p>

          <button
            onClick={logout}
            className="mt-3 w-full rounded bg-slate-800 px-3 py-2 text-sm hover:bg-slate-700"
          >
            Logout
          </button>
        </div>
      </aside>

      <div className="ml-64 min-h-screen flex-1">
        {children}
      </div>
    </div>
  );
}