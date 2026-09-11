"use client";
import { useEffect, useState } from 'react';

export default function LocalTime({ iso }: { iso: string }) {
  const [local, setLocal] = useState<string | null>(null);
  useEffect(() => {
    const value = new Date(iso);
    if (!Number.isNaN(value.getTime())) setLocal(new Intl.DateTimeFormat('en', {dateStyle:'medium',timeStyle:'short'}).format(value));
  }, [iso]);
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  // No explicit timeZone passed — in the browser, Intl.DateTimeFormat defaults to the visitor's
  // own local timezone. Rendering this on the server instead (as company/[id]/page.tsx originally
  // did) uses the server's timezone (UTC on Vercel), which is why timestamps looked wrong for
  // anyone not in UTC.
  return <time dateTime={iso}>{local ?? `${date.toISOString().slice(0,16).replace('T',' ')} UTC`}</time>;
}
