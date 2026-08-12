import React, { useRef, useEffect } from 'react';

interface EditableTextProps {
  value: string;
  onChange: (newValue: string) => void;
  className?: string;
  multiline?: boolean;
  tagName?: React.ElementType;
}

export const EditableText: React.FC<EditableTextProps> = ({ 
  value, 
  onChange, 
  className = "", 
  multiline = false,
  tagName: Tag = 'span'
}) => {
  const elRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (elRef.current && elRef.current.innerText !== value) {
      elRef.current.innerText = value;
    }
  }, [value]);

  const handleBlur = () => {
    if (elRef.current) {
      onChange(elRef.current.innerText);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLElement>) => {
    if (!multiline && e.key === 'Enter') {
      e.preventDefault();
      elRef.current?.blur();
    }
  };

  return (
    <Tag
      ref={elRef as any}
      contentEditable
      suppressContentEditableWarning
      className={`outline-none hover:bg-brand-50 focus:bg-brand-50 focus:ring-1 focus:ring-brand-400 rounded transition-colors cursor-text ${className}`}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      style={{ whiteSpace: multiline ? 'pre-wrap' : 'normal' }}
    />
  );
};
