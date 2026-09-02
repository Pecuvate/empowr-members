import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isCheckinEmail } from "@/lib/admin";

export default async function CheckinLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login?next=/checkin");
  if (!isCheckinEmail(user.email)) redirect("/account");

  return (
    <div className="flex flex-1 flex-col bg-cream">
      <header className="border-b border-line bg-warm-white">
        <div className="mx-auto flex max-w-3xl items-center px-4 py-4 sm:px-6">
          <Link href="/checkin" className="flex items-center gap-3">
            <Image
              src="/logo.png"
              alt="Empowr CIC"
              width={44}
              height={44}
              className="h-11 w-11"
              priority
            />
            <span className="text-lg font-black tracking-tight text-black">
              Door check-in
            </span>
          </Link>
        </div>
      </header>
      {children}
    </div>
  );
}
