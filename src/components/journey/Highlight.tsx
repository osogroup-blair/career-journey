import React from 'react';
import { highlightParts } from '../../lib/journeySearch';

/** Renders text with every search-token occurrence marked. */
export function Highlight({ text, query }: { text: string; query: string }) {
  return (
    <>
      {highlightParts(text, query).map((p, i) =>
        p.hit ? (
          <mark key={i} className="bg-amber-100 text-inherit rounded-sm px-0.5">
            {p.text}
          </mark>
        ) : (
          <React.Fragment key={i}>{p.text}</React.Fragment>
        )
      )}
    </>
  );
}
