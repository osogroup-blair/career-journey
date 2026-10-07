import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function generateId(prefix = "ID") {
  return `${prefix}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
}

/** Builds a "City, State  •  phone  •  email  •  website" line from a Career Journey person, skipping empty fields. */
export function formatContactLine(person?: { location?: string; phone?: string; email?: string; website?: string }): string {
  if (!person) return '';
  return [person.location, formatPhone(person.phone), person.email, person.website].filter(Boolean).join('  •  ');
}

/** A bare 10-digit US number ("6165401669", "+1 616 540 1669") reads as 616.540.1669; anything else is left as written. */
export function formatPhone(phone?: string): string {
  const raw = (phone || '').trim();
  const digits = raw.replace(/\D/g, '');
  const national = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
  if (national.length !== 10 || /[a-z]/i.test(raw)) return raw;
  return `${national.slice(0, 3)}.${national.slice(3, 6)}.${national.slice(6)}`;
}

/** Filename-safe slug for a person's name, e.g. "Jordan Rivera" -> "Jordan_Rivera". Falls back if the name is blank. */
export function nameSlug(name: string | undefined, fallback = 'Candidate'): string {
  const trimmed = (name || '').trim();
  return trimmed ? trimmed.replace(/\s+/g, '_') : fallback;
}
