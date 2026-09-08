import { type ReactNode } from 'react';
import { useReveal } from '../hooks/useReveal';

interface RevealProps {
  children: ReactNode;
  className?: string;
  delay?: 1 | 2 | 3 | 4;
  as?: 'div' | 'section' | 'article' | 'li' | 'span';
}

export function Reveal({ children, className = '', delay, as = 'div' }: RevealProps) {
  const { ref, visible } = useReveal<HTMLDivElement>();
  const delayClass = delay ? `reveal-delay-${delay}` : '';
  const Tag = as as 'div';

  return (
    <Tag
      ref={ref}
      className={`reveal ${delayClass} ${visible ? 'is-visible' : ''} ${className}`}
    >
      {children}
    </Tag>
  );
}
