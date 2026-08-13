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
  return [person.location, person.phone, person.email, person.website].filter(Boolean).join('  •  ');
}

/** Filename-safe slug for a person's name, e.g. "Jordan Rivera" -> "Jordan_Rivera". Falls back if the name is blank. */
export function nameSlug(name: string | undefined, fallback = 'Candidate'): string {
  const trimmed = (name || '').trim();
  return trimmed ? trimmed.replace(/\s+/g, '_') : fallback;
}
