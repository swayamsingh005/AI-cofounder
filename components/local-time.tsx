"use client";
import { useSyncExternalStore } from 'react';

const subscribe = () => () => {};
const clientSnapshot = () => true;
const serverSnapshot = () => false;

export default function LocalTime({ iso }: { iso: string }) {
  const hydrated = useSyncExternalStore(subscribe, clientSnapshot, serverSnapshot);
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  // No explicit timeZone passed — in the browser, Intl.DateTimeFormat defaults to the visitor's
  // own local timezone. Rendering this on the server instead (as company/[id]/page.tsx originally
  // did) uses the server's timezone (UTC on Vercel), which is why timestamps looked wrong for
  // anyone not in UTC.
  return <time dateTime={iso}>{hydrated ? new Intl.DateTimeFormat('en', {dateStyle:'medium',timeStyle:'short'}).format(date) : `${date.toISOString().slice(0,16).replace('T',' ')} UTC`}</time>;
}
