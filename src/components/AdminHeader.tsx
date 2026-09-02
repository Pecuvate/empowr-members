import Image from "next/image";
import Link from "next/link";
import { CollapsibleNav } from "@/components/CollapsibleNav";

const LINKS = [
  { href: "/checkin", label: "Check in" },
  { href: "/admin/offerings", label: "Offerings" },
  { href: "/admin/venues", label: "Venues" },
  { href: "/admin/guides", label: "Guides" },
  { href: "/account", label: "Member site" },
];

export function AdminHeader() {
  return (
    // `relative` anchors the collapsed menu panel, which positions itself
    // at top-full across the full header width.
    <header className="relative border-b border-line bg-warm-white">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4 sm:px-6">
        <Link href="/admin" className="flex items-center gap-3">
          <Image
            src="/logo.png"
            alt="Empowr CIC"
            width={140}
            height={140}
            className="h-auto w-[44px]"
          />
          {/* Visible at every width: collapsing the nav below `sm` freed
              the room that previously forced this to be hidden. */}
          <span className="text-lg font-black tracking-tight whitespace-nowrap text-black">
            Members Admin
          </span>
        </Link>
        <CollapsibleNav links={LINKS} menuId="admin-menu" />
      </div>
    </header>
  );
}
