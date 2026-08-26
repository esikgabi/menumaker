import { auth, signOut } from "@/lib/auth"
import { LogOut } from "lucide-react"
import { Button } from "@/components/ui/button"
import Link from "next/link"

export async function Navbar() {
  const session = await auth()
  const mockAuthEnabled = process.env.MOCK_AUTH_ENABLED === "true"

  return (
    <nav className="border-b px-4 py-3 flex items-center justify-between">
      <span className="font-bold text-lg">MenuMaker</span>
      {session ? (
        <form
          action={async () => {
            "use server"
            await signOut({ redirect: true, redirectTo: "/auth/signin" })
          }}
        >
          <Button variant="ghost" size="sm">
            <LogOut className="h-4 w-4" />
          </Button>
        </form>
      ) : (
        <div className="flex gap-2">
          <Link href="/auth/signin">
            <Button variant="ghost" size="sm">
              Sign In
            </Button>
          </Link>
          {mockAuthEnabled && (
            <form
              action={async () => {
                "use server"
                const res = await fetch("/api/auth/mock-signin", { method: "POST" })
                if (res.ok) {
                  window.location.reload()
                }
              }}
            >
              <Button variant="secondary" size="sm">
                Mock Sign In
              </Button>
            </form>
          )}
        </div>
      )}
    </nav>
  )
}
