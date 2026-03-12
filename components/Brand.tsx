import Image from "next/image";
import Link from "next/link";

export function Brand() {
  return (
    <Link href="/" className="inline-flex items-center gap-3">
      <Image src="/logo.svg" alt="LoverLink" width={40} height={40} priority />
      <div className="leading-tight">
        <div className="font-[family-name:var(--font-script)] text-2xl text-[color:var(--wine-900)]">
          LoverLink
        </div>
        <div className="text-xs font-semibold tracking-wide text-black/60">
          love • calls • chat
        </div>
      </div>
    </Link>
  );
}

