import Link from "next/link";
import { signOut } from "@/lib/auth/actions";

interface NebuHeaderProps {
  userEmail: string;
}

export function NebuHeader({ userEmail }: NebuHeaderProps) {
  return (
    <header className="border-b border-line bg-paper">
      <div className="max-w-page mx-auto px-4 sm:px-8 h-14 flex items-center justify-between gap-3">
        <div className="flex items-center gap-5">
          <Link
            href="/assignments"
            className="flex items-center gap-2 text-ink no-tap-highlight"
          >
            <span className="h-7 w-7 rounded-md bg-ink text-paper grid place-items-center text-[12px] font-semibold">
              N
            </span>
            <span className="font-serif text-[16px] tracking-tightish">
              Nebu.AI
            </span>
          </Link>
          <Link
            href="/assignments"
            className="hidden sm:inline text-[12.5px] font-medium text-ink-muted hover:text-ink transition-colors no-tap-highlight"
          >
            Assignments
          </Link>
        </div>
        <div className="flex items-center gap-3 text-[12.5px] text-ink-muted">
          <span className="hidden sm:inline truncate max-w-[220px]">
            {userEmail}
          </span>
          <form
            action={async () => {
              "use server";
              await signOut();
            }}
          >
            <button
              type="submit"
              className="px-2.5 py-1 rounded-md hover:bg-paper-sunken hover:text-ink transition-colors no-tap-highlight"
            >
              Sign out
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
